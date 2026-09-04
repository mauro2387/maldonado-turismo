import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { itineraryKey, RouteShapesService } from './route-shapes.service';
import { RouteStopSequence, StopSequenceService } from './stop-sequence.service';
import { VehiclePositionsService } from './vehicle-positions.service';
import { cumulativeDistances, distanceAlongPolyline, LngLat } from './geo.util';
import { isElectricVehicle } from './fleet.util';
import { OfficialRoutesService } from './official-routes.service';

/**
 * Próximas llegadas a una parada, calculadas con las posiciones en vivo.
 *
 * Hasta ahora `getStopArrivals()` del frontend devolvía un array vacío con un
 * TODO, así que "Próximos buses" nunca podía mostrar nada — la información
 * número uno que la gente busca en una app de ómnibus.
 *
 * El cálculo, en tres pasos:
 *
 * 1. La parada ya tiene su lugar sobre el recorrido (`StopSequenceService`):
 *    a cuántos metros de trazo está del inicio.
 * 2. Cada ómnibus de esa línea se proyecta sobre el mismo recorrido y se
 *    obtiene su propia distancia acumulada. La resta es la calle que le falta,
 *    siguiendo las curvas reales y no en línea recta.
 * 3. Esa distancia se divide por la velocidad que la línea viene teniendo de
 *    verdad en la última hora, no por una constante.
 *
 * Regla de honestidad: cada llegada informa la antigüedad del último fix. Si
 * pasó más de un minuto, la interfaz la muestra en gris como estimación en vez
 * de en verde como dato en vivo. Una app de transporte se gana la confianza
 * mostrando cuándo no sabe.
 */

/** Más allá de esto el ómnibus no está por llegar: está haciendo otra vuelta. */
const MAX_LOOKAHEAD_M = 12000;

/**
 * Tolerancia hacia atrás. El GPS tiene error y un coche detenido en la parada
 * puede proyectar unos metros después de ella; sin este margen desaparecería
 * justo cuando está llegando.
 */
const PASSED_TOLERANCE_M = 120;

/** Si el coche cae más lejos que esto del trazo, no está haciendo ese recorrido. */
const MAX_VEHICLE_OFFSET_M = 80;

/**
 * Un ómnibus quieto hace más de esto terminó su vuelta o está fuera de
 * servicio: contarlo como próxima llegada sería prometer un viaje que no va a
 * salir.
 */
const MAX_STOPPED_MINUTES = 10;

/** Velocidades comerciales razonables en ciudad, en km/h. */
const MIN_SPEED_KMH = 8;
const MAX_SPEED_KMH = 45;
const DEFAULT_SPEED_KMH = 18;

/** Cuántas llegadas se muestran por línea y sentido. */
const ARRIVALS_PER_LINE = 2;

/** La velocidad por línea se recalcula como mucho una vez por minuto. */
const SPEED_CACHE_MS = 60_000;

export interface Arrival {
  line_code: string;
  /**
   * El número que dice el cartel del ómnibus. Difiere de `line_code` sólo en
   * los refuerzos que el feed publica pegados ("179" es la 17/19).
   */
  line_label: string;
  line_name: string | null;
  operator: string;
  direction: number | null;
  destination: string | null;
  vehicle_id: string;
  /** Minutos estimados hasta la parada. */
  eta_minutes: number;
  /** Metros de recorrido que le faltan al ómnibus. */
  distance_m: number;
  /** Antigüedad del último dato GPS, en segundos. */
  fix_age_seconds: number;
  /** True solo si ese fix tiene menos de un minuto. */
  live: boolean;
  accessible: boolean | null;
  electric: boolean;
  occupancy_pct: number | null;
}

interface ShapeGeometry {
  geometry: LngLat[];
  cumulative: number[];
}

@Injectable()
export class ArrivalsService implements OnModuleInit {
  private readonly logger = new Logger(ArrivalsService.name);

  /** Distancias acumuladas por recorrido, para no recalcularlas por pedido. */
  private geometryCache = new Map<string, ShapeGeometry>();
  private speedCache = new Map<string, number>();
  private speedCacheAt = 0;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly routeShapes: RouteShapesService,
    private readonly stopSequences: StopSequenceService,
    private readonly vehiclePositions: VehiclePositionsService,
    private readonly officialRoutes: OfficialRoutesService,
  ) {}

  onModuleInit() {
    // Las distancias acumuladas se calculan sobre la geometría vieja: si el
    // recorrido se rehace, las ETAs quedarían medidas sobre un trazo que ya no
    // existe.
    this.routeShapes.onRebuilt(() => this.clearGeometryCache());
  }

  /** Próximas llegadas a una parada, ordenadas por cercanía en el tiempo. */
  async getForStop(stopId: number): Promise<Arrival[]> {
    const sequences = this.stopSequences.getForStop(stopId);
    if (sequences.length === 0) return [];

    const [positions, speeds] = await Promise.all([
      this.vehiclePositions.getLatestPositions(),
      this.getLineSpeeds(),
    ]);

    const arrivals: Arrival[] = [];

    for (const sequence of sequences) {
      const stopOnRoute = sequence.stops.find((stop) => stop.stopId === stopId);
      if (!stopOnRoute) continue;

      const shape = this.getGeometry(sequence);
      if (!shape) continue;

      const speedKmh = this.speedFor(speeds, sequence.operator, sequence.lineCode);
      const metersPerMinute = (speedKmh * 1000) / 60;

      // Solo los coches que están haciendo **este** recorrido.
      //
      // Antes se filtraba por `direction`, que las tres empresas publican
      // siempre en 1: el filtro no filtraba nada y a una parada de la 24 le
      // llegaban como candidatos los coches de los cuatro recorridos de la
      // línea, incluidos los que van por otra avenida y no pasan por ahí.
      const candidates = positions.filter(
        (position) =>
          position.operator === sequence.operator &&
          position.line_code === sequence.lineCode &&
          itineraryKey(position.line_name ?? null) === sequence.itineraryKey,
      );

      for (const position of candidates) {
        if (
          typeof position.stopped_minutes === 'number' &&
          position.stopped_minutes >= MAX_STOPPED_MINUTES
        ) {
          continue;
        }

        const latitude = Number(position.latitude);
        const longitude = Number(position.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

        const along = distanceAlongPolyline(
          latitude,
          longitude,
          shape.geometry,
          shape.cumulative,
        );
        if (!along || along.offsetMeters > MAX_VEHICLE_OFFSET_M) continue;

        const remaining = stopOnRoute.alongMeters - along.alongMeters;
        if (remaining < -PASSED_TOLERANCE_M || remaining > MAX_LOOKAHEAD_M) continue;

        const fixAgeSeconds = this.fixAgeSeconds(position);

        arrivals.push({
          line_code: sequence.lineCode,
          line_label: this.officialRoutes.lineLabel(sequence.operator, sequence.lineCode),
          line_name: position.line_name ?? null,
          operator: sequence.operator,
          direction: sequence.direction,
          destination: position.next_stop_name ?? position.line_name ?? null,
          vehicle_id: position.vehicle_id,
          eta_minutes: Math.max(0, Math.round(Math.max(0, remaining) / metersPerMinute)),
          distance_m: Math.round(Math.max(0, remaining)),
          fix_age_seconds: fixAgeSeconds,
          live: fixAgeSeconds < 60,
          accessible: position.accessible ?? null,
          electric: isElectricVehicle(position.vehicle_id),
          occupancy_pct: position.occupancy_pct ?? null,
        });
      }
    }

    return this.limitPerLine(arrivals);
  }

  /**
   * El mismo coche puede aparecer por dos recorridos de la misma línea; y de
   * una línea con buena frecuencia pueden venir cinco unidades. Se deja una
   * entrada por vehículo y las dos primeras de cada línea y sentido, que es lo
   * que se puede leer de un vistazo.
   */
  private limitPerLine(arrivals: Arrival[]): Arrival[] {
    const byVehicle = new Map<string, Arrival>();
    for (const arrival of arrivals) {
      const existing = byVehicle.get(arrival.vehicle_id);
      if (!existing || arrival.eta_minutes < existing.eta_minutes) {
        byVehicle.set(arrival.vehicle_id, arrival);
      }
    }

    const sorted = [...byVehicle.values()].sort((a, b) => a.eta_minutes - b.eta_minutes);

    const counts = new Map<string, number>();
    const result: Arrival[] = [];

    for (const arrival of sorted) {
      const key = `${arrival.line_code}|${arrival.line_name ?? '-'}`;
      const count = counts.get(key) ?? 0;
      if (count >= ARRIVALS_PER_LINE) continue;
      counts.set(key, count + 1);
      result.push(arrival);
    }

    return result;
  }

  private fixAgeSeconds(position: any): number {
    const reference = position.fix_time ?? position.recorded_at;
    const timestamp = reference ? new Date(reference).getTime() : NaN;
    if (Number.isNaN(timestamp)) return Number.POSITIVE_INFINITY;
    return Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  }

  private getGeometry(sequence: RouteStopSequence): ShapeGeometry | null {
    const key = `${sequence.operator}|${sequence.lineCode}|${sequence.itineraryKey}`;
    const cached = this.geometryCache.get(key);
    if (cached) return cached;

    const shape = this.routeShapes
      .getShapes()
      .find(
        (candidate) =>
          candidate.operator === sequence.operator &&
          candidate.lineCode === sequence.lineCode &&
          candidate.itineraryKey === sequence.itineraryKey,
      );

    if (!shape || !shape.geometry || shape.geometry.length < 2) return null;

    const entry: ShapeGeometry = {
      geometry: shape.geometry as LngLat[],
      cumulative: cumulativeDistances(shape.geometry as LngLat[]),
    };
    this.geometryCache.set(key, entry);
    return entry;
  }

  /**
   * Velocidad comercial observada por línea en la última hora. Es lo que
   * reemplaza a la constante que usaba el planificador viejo: en enero, con
   * Gorlero llena, la misma línea anda a menos de la mitad que en junio.
   */
  private async getLineSpeeds(): Promise<Map<string, number>> {
    if (Date.now() - this.speedCacheAt < SPEED_CACHE_MS && this.speedCache.size > 0) {
      return this.speedCache;
    }

    try {
      const rows = await this.dataSource.query(
        `
        SELECT operator,
               line_code,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY speed) AS median_speed
        FROM vehicle_positions
        WHERE operator IS NOT NULL
          AND line_code IS NOT NULL
          AND speed IS NOT NULL
          -- Se excluyen los coches detenidos: promediar los semáforos daría
          -- una velocidad comercial artificialmente baja.
          AND speed > 2
          AND COALESCE(fix_time, recorded_at) > now() - interval '1 hour'
        GROUP BY operator, line_code
      `,
      );

      const speeds = new Map<string, number>();
      for (const row of rows) {
        const median = Number(row.median_speed);
        if (!Number.isFinite(median)) continue;
        speeds.set(
          `${row.operator}|${row.line_code}`,
          Math.min(MAX_SPEED_KMH, Math.max(MIN_SPEED_KMH, median)),
        );
      }

      this.speedCache = speeds;
      this.speedCacheAt = Date.now();
      return speeds;
    } catch (error: any) {
      this.logger.warn(`No se pudo medir la velocidad por línea: ${error?.message ?? error}`);
      return this.speedCache;
    }
  }

  private speedFor(speeds: Map<string, number>, operator: string, lineCode: string): number {
    return speeds.get(`${operator}|${lineCode}`) ?? DEFAULT_SPEED_KMH;
  }

  /** Se limpia cuando se reconstruyen los recorridos y cambia la geometría. */
  clearGeometryCache() {
    this.geometryCache.clear();
  }
}
