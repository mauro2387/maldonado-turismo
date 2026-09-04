import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RebuildReason, RouteShapesService } from './route-shapes.service';
import { StopsReaderService } from './stops-reader.service';
import { StopPlacementService } from './stop-placement.service';
import { StopCatalogService } from './stop-catalog.service';
import { cumulativeDistances, distanceAlongPolyline, LngLat } from './geo.util';

/**
 * Orden de paradas de cada recorrido.
 *
 * El problema que resuelve: `route_stops` está vacía y no hay un GTFS público
 * de Maldonado del cual importarla, así que ninguna línea sabe qué parada
 * viene después de cuál. Sin eso no hay ETA, no hay "en qué parada me bajo" y
 * el planificador no puede dar un resultado correcto.
 *
 * De dónde sale el orden, en dos formas:
 *
 * 1. **De lo que informa el feed.** Cada posición trae la parada por la que el
 *    coche acaba de pasar, así que la empresa está diciendo, viaje a viaje,
 *    qué paradas hace cada recorrido. `StopPlacementService` lo pasa a
 *    `itinerary_stops` con la distancia sobre el trazo, que es el orden. Es
 *    dato, no inferencia, y es lo que se usa siempre que esté.
 * 2. **Por cercanía al trazo**, como respaldo: una parada que cae a menos de
 *    40 m del recorrido se da por servida. Es lo que había antes y lo que
 *    sostiene a las líneas de las que todavía no se juntaron cruces. Reparte
 *    mal en avenidas con cantero y en el centro, donde tres líneas comparten
 *    cuadra, así que es el segundo camino, no el primero.
 */

/**
 * Distancia máxima entre una parada y el trazo para considerar que la línea
 * pasa por ella. Tiene que cubrir el ancho de la calle y el error con el que
 * se cargó la parada, sin llegar a agarrar una parada de la calle paralela.
 */
const MAX_STOP_OFFSET_M = 40;

/**
 * Una línea circular pasa dos veces cerca de la misma parada. Si dos
 * proyecciones de la misma parada caen a menos de esta distancia sobre el
 * trazo, son la misma pasada y se conserva una sola.
 */
const MIN_SEPARATION_M = 300;

/**
 * Hasta qué error se puede decir "esperá **acá**" en vez de "por acá cerca".
 *
 * Se mide con `accuracy_m` -cuán lejos está la respuesta de la parada de
 * verdad, calibrado contra OpenStreetMap- y no con `spread_m`, que sólo dice
 * cuán juntas están las muestras. Una cuadra de Maldonado son 80-100 m, así
 * que con 60 m la parada está a lo sumo en la esquina de al lado y se la ve
 * desde donde uno llega.
 */
const MAX_RELIABLE_ACCURACY_M = 60;

export interface StopOnRoute {
  stopId: number;
  code: string;
  name: string;
  lat: number;
  lng: number;
  /** Metros de recorrido desde el inicio del trazo hasta esta parada. */
  alongMeters: number;
  /** 1 = primera parada del recorrido. */
  sequence: number;
  /**
   * Si la posición es lo bastante firme como para mandar a alguien a caminar
   * hasta ahí. La coordenada de una parada del feed es una estimación, y las
   * que todavía tienen mucha incertidumbre se muestran igual —la parada
   * existe— pero no se ofrecen como punto de subida.
   */
  reliable: boolean;

  /**
   * Radio en metros dentro del cual está la parada de verdad, o null si nunca
   * se midió. La app lo usa para decir "esperá acá" o "la parada está por acá".
   */
  accuracyM: number | null;

  /** De dónde salió la coordenada: osm, detenciones, intervalo, manual. */
  fixSource: string | null;
}

export interface RouteStopSequence {
  operator: string;
  lineCode: string;
  /** Qué recorrido de la línea es. Ver ITINERARIOS en route-shapes.service. */
  itineraryKey: string;
  itineraryName: string | null;
  direction: number | null;
  stops: StopOnRoute[];
  distanceM: number;
}

/**
 * El orden de paradas es por itinerario, no por línea.
 *
 * La línea 24 hace cuatro recorridos por avenidas distintas: sus paradas y su
 * orden no son los mismos en los cuatro, así que una sola secuencia por línea
 * daba ETAs calculadas sobre el recorrido equivocado.
 */
export function sequenceKey(operator: string, lineCode: string, itineraryKey: string): string {
  return `${operator}|${lineCode}|${itineraryKey}`;
}

@Injectable()
export class StopSequenceService implements OnModuleInit {
  private readonly logger = new Logger(StopSequenceService.name);

  private sequences = new Map<string, RouteStopSequence>();
  /** Índice inverso: en qué recorridos aparece cada parada. */
  private byStop = new Map<number, RouteStopSequence[]>();

  constructor(
    private readonly routeShapes: RouteShapesService,
    private readonly stopsReader: StopsReaderService,
    private readonly stopPlacement: StopPlacementService,
    private readonly stopCatalog: StopCatalogService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    // Un recorrido nuevo cambia qué paradas caen sobre él y en qué orden.
    this.routeShapes.onRebuilt(async (reason: RebuildReason) => {
      // Las paradas se vuelven a apoyar sobre el trazo sólo cuando el trazo
      // cambió. Al arrancar no: leer los recorridos de la base no los mueve, y
      // recalcular mil paradas contra un día de posiciones en cada arranque es
      // trabajo que no cambia nada.
      if (reason === 'reconstruccion') {
        try {
          await this.stopPlacement.place();
        } catch (error: any) {
          this.logger.warn(`No se pudieron apoyar las paradas: ${error?.message ?? error}`);
        }
      }
      await this.rebuild();
    });

    // La reconstrucción diaria del catálogo pisa las coordenadas con la
    // estimación gruesa: apenas termina hay que volver a apoyarlas sobre el
    // recorrido y rehacer el orden.
    this.stopCatalog.onRebuilt(async () => {
      try {
        await this.stopPlacement.place();
      } catch (error: any) {
        this.logger.warn(`No se pudieron apoyar las paradas: ${error?.message ?? error}`);
      }
      await this.rebuild();
    });

    await this.rebuild();
  }

  /**
   * Recalcula el orden de paradas de todos los recorridos disponibles.
   *
   * Se llama al arrancar y cada vez que cambian los recorridos.
   */
  async rebuild(): Promise<number> {
    const shapes = this.routeShapes.getShapes();
    if (shapes.length === 0) {
      this.logger.warn('Todavía no hay recorridos reconstruidos: no se puede ordenar las paradas');
      return 0;
    }

    const stops = await this.stopsReader.findAll();
    if (stops.length === 0) {
      this.logger.warn('No hay paradas activas cargadas');
      return 0;
    }

    const sequences = new Map<string, RouteStopSequence>();
    const byStop = new Map<number, RouteStopSequence[]>();

    // Lo que informa el feed manda: cada recorrido que tenga sus paradas en
    // `itinerary_stops` se arma con eso y no se lo vuelve a deducir.
    const informadas = await this.loadReported(shapes);
    for (const [key, sequence] of informadas) sequences.set(key, sequence);

    for (const shape of shapes) {
      if (sequences.has(sequenceKey(shape.operator, shape.lineCode, shape.itineraryKey))) {
        continue;
      }
      const geometry = shape.geometry as LngLat[];
      if (!geometry || geometry.length < 2) continue;

      const cumulative = cumulativeDistances(geometry);
      const matched: StopOnRoute[] = [];

      for (const stop of stops) {
        const { lat, lng } = stop;
        const along = distanceAlongPolyline(lat, lng, geometry, cumulative);
        if (!along || along.offsetMeters > MAX_STOP_OFFSET_M) continue;

        matched.push({
          stopId: stop.id,
          code: stop.code ?? String(stop.id),
          name: stop.name,
          lat,
          lng,
          alongMeters: along.alongMeters,
          sequence: 0,
          reliable: esFirme(stop.accuracy_m, stop.placement),
          accuracyM: stop.accuracy_m,
          fixSource: stop.fix_source,
        });
      }

      if (matched.length < 2) continue;

      matched.sort((a, b) => a.alongMeters - b.alongMeters);

      // Se descartan las repeticiones muy cercanas entre sí, que son la misma
      // parada proyectada dos veces sobre un tramo de ida y vuelta.
      const deduped: StopOnRoute[] = [];
      for (const candidate of matched) {
        const previous = deduped[deduped.length - 1];
        if (previous && candidate.alongMeters - previous.alongMeters < MIN_SEPARATION_M) {
          continue;
        }
        deduped.push({ ...candidate, sequence: deduped.length + 1 });
      }

      const sequence: RouteStopSequence = {
        operator: shape.operator,
        lineCode: shape.lineCode,
        itineraryKey: shape.itineraryKey,
        itineraryName: shape.itineraryName,
        direction: shape.direction,
        stops: deduped,
        distanceM: cumulative[cumulative.length - 1],
      };

      sequences.set(sequenceKey(shape.operator, shape.lineCode, shape.itineraryKey), sequence);
    }

    // El índice inverso se arma al final, una sola vez, sobre lo que haya
    // quedado: da igual si la secuencia vino del feed o de la cercanía.
    for (const sequence of sequences.values()) {
      for (const stop of sequence.stops) {
        const list = byStop.get(stop.stopId) ?? [];
        list.push(sequence);
        byStop.set(stop.stopId, list);
      }
    }

    this.sequences = sequences;
    this.byStop = byStop;

    const totalStops = [...sequences.values()].reduce((sum, s) => sum + s.stops.length, 0);
    this.logger.log(
      `Paradas ordenadas: ${sequences.size} recorridos, ${totalStops} paradas asignadas ` +
        `(${informadas.size} recorridos con las paradas que informa el feed)`,
    );

    return sequences.size;
  }

  /**
   * Las paradas que el propio feed atribuye a cada recorrido, con su orden.
   *
   * Las escribe `StopPlacementService` en `itinerary_stops`. Si la tabla
   * todavía no existe o está vacía -base sin migrar, o sin posiciones
   * suficientes- se devuelve vacío y cada recorrido cae a la deducción por
   * cercanía.
   */
  private async loadReported(
    shapes: Array<{ operator: string; lineCode: string; itineraryKey: string; itineraryName: string | null; direction: number | null; geometry: LngLat[] }>,
  ): Promise<Map<string, RouteStopSequence>> {
    const sequences = new Map<string, RouteStopSequence>();

    let rows: any[];
    try {
      rows = await this.dataSource.query(
        `SELECT i.operator, i.line_code, i.itinerary_key, i.along_m, i.sequence,
                p.id, p.code, p.name, p.lat, p.lng, p.placement, p.spread_m,
                p.accuracy_m, p.fix_source
           FROM itinerary_stops i
           JOIN bus_stops p ON p.id = i.stop_id
          WHERE p.is_active
          ORDER BY i.operator, i.line_code, i.itinerary_key, i.sequence`,
      );
    } catch (error: any) {
      this.logger.warn(
        `No se pudieron leer las paradas informadas por el feed: ${error?.message ?? error}`,
      );
      return sequences;
    }

    const distances = new Map(
      shapes.map((shape) => [
        sequenceKey(shape.operator, shape.lineCode, shape.itineraryKey),
        cumulativeDistances(shape.geometry).pop() ?? 0,
      ]),
    );
    const byKey = new Map(
      shapes.map((shape) => [
        sequenceKey(shape.operator, shape.lineCode, shape.itineraryKey),
        shape,
      ]),
    );

    for (const row of rows) {
      const key = sequenceKey(row.operator, row.line_code, row.itinerary_key);
      const shape = byKey.get(key);
      // Una fila de un recorrido que ya no está -la línea dejó de circular, o
      // el trazo no llegó al corte de calidad- no se sirve.
      if (!shape) continue;

      let sequence = sequences.get(key);
      if (!sequence) {
        sequences.set(
          key,
          (sequence = {
            operator: shape.operator,
            lineCode: shape.lineCode,
            itineraryKey: shape.itineraryKey,
            itineraryName: shape.itineraryName,
            direction: shape.direction,
            stops: [],
            distanceM: distances.get(key) ?? 0,
          }),
        );
      }

      sequence.stops.push({
        stopId: Number(row.id),
        code: row.code ?? String(row.id),
        name: row.name,
        lat: Number(row.lat),
        lng: Number(row.lng),
        alongMeters: Number(row.along_m),
        sequence: Number(row.sequence),
        reliable: esFirme(
          row.accuracy_m === null || row.accuracy_m === undefined ? null : Number(row.accuracy_m),
          row.placement,
        ),
        accuracyM:
          row.accuracy_m === null || row.accuracy_m === undefined ? null : Number(row.accuracy_m),
        fixSource: row.fix_source ?? null,
      });
    }

    // Un recorrido con una sola parada informada no sirve para nada: se deja
    // que lo resuelva la deducción por cercanía.
    for (const [key, sequence] of sequences) {
      if (sequence.stops.length < 2) sequences.delete(key);
    }

    return sequences;
  }

  getAll(): RouteStopSequence[] {
    return [...this.sequences.values()];
  }

  get(operator: string, lineCode: string, itineraryKey: string): RouteStopSequence | null {
    return this.sequences.get(sequenceKey(operator, lineCode, itineraryKey)) ?? null;
  }

  /** Recorridos que pasan por una parada. */
  getForStop(stopId: number): RouteStopSequence[] {
    return this.byStop.get(stopId) ?? [];
  }

  /** Códigos de línea que paran en una parada, sin repetir. */
  getLineCodesForStop(stopId: number): string[] {
    const codes = new Set<string>();
    for (const sequence of this.getForStop(stopId)) codes.add(sequence.lineCode);
    return [...codes].sort();
  }

  isReady(): boolean {
    return this.sequences.size > 0;
  }
}

/**
 * Si se puede mandar a alguien a esperar exactamente acá.
 *
 * Una parada sin error declarado todavía no pasó por la colocación nueva: se
 * acepta si está apoyada sobre el recorrido, que es el criterio que había.
 */
function esFirme(accuracyM: number | null, placement: string | null): boolean {
  if (accuracyM === null) return placement === 'recorrido';
  return accuracyM <= MAX_RELIABLE_ACCURACY_M;
}
