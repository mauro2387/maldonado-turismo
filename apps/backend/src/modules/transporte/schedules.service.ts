import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RouteShapesService } from './route-shapes.service';
import { OfficialRoutesService } from './official-routes.service';
import { RouteStopSequence, StopOnRoute } from './stop-sequence.service';
import { cumulativeDistances, distanceAlongPolyline, LngLat } from './geo.util';
import { resolveTimepoint } from './schedule-timepoints';

/**
 * Los horarios publicados por las empresas.
 *
 * Las tres publican sus horarios (ver tools/horarios/LEEME.md), y hasta ahora
 * la app no los usaba: la espera salía de las posiciones en vivo y, sin
 * unidades en la calle, de la frecuencia estimada. Eso no contesta "¿a qué
 * hora pasa el último?" ni sirve de madrugada, cuando no hay ningún coche
 * reportando.
 *
 * Este servicio contesta una sola pregunta, la que le hace el planificador:
 * **¿a qué hora sale de esta parada el próximo ómnibus de este recorrido,
 * según el papel?** Y la contesta o devuelve null; nunca inventa. Si no hay
 * horario cargado para la temporada de hoy, o el punto de control que hace
 * falta no está mapeado, el planificador sigue usando la frecuencia en vivo,
 * igual que antes. Es infraestructura inerte hasta que se le cargan datos
 * verificados.
 *
 * Cómo pasa del papel a una hora de parada:
 *
 * 1. El horario viene por **punto de control** (Terminal, Centro, Hospital,
 *    Punta Shopping), no parada por parada. Cada punto tiene una ubicación
 *    (schedule-timepoints.ts).
 * 2. Esa ubicación se proyecta sobre el recorrido de la línea y da a qué altura
 *    del trazo cae -su distancia acumulada-. La parada donde uno espera también
 *    tiene su distancia acumulada.
 * 3. Entre los dos puntos de control que rodean a la parada, la hora se
 *    interpola por distancia. Es lo mismo que hace GTFS con timepoint=0.
 */

interface ScheduleRow {
  operator: string;
  lineLabel: string;
  direction: string;
  days: number;
  timepoints: Array<{ point: string; time: string }>;
}

/** El horario de un servicio publicado, alineado a las columnas de su sentido. */
export interface TimetableService {
  /** Una hora por columna, con null donde el servicio no pasa por ese punto. */
  times: (string | null)[];
  /** Máscara de días: lunes=1 ... domingo=64. */
  days: number;
  refs: string[];
}

/** La tabla de un sentido: sus columnas y sus filas. */
export interface TimetableDirection {
  direction: string;
  points: string[];
  services: TimetableService[];
}

/** El horario publicado de una línea, listo para su ficha. */
/**
 * Lo que le queda hoy a una línea en una parada, según el papel.
 *
 * `finished` es el dato que hoy falta y que cambia lo que hace la persona: con
 * `false` conviene esperar, con `true` hay que buscar otra cosa.
 */
export interface StopServiceToday {
  line_label: string;
  operator: string;
  headsign: string | null;
  next_in_minutes: number | null;
  next_at: string | null;
  previous_ago_minutes: number | null;
  previous_at: string | null;
  /** La hora del último servicio del día en esta parada. */
  last_at: string;
  /** Ya no pasa más hoy. */
  finished: boolean;
  /** El que viene es el último del día. */
  is_last: boolean;
  services_today: number;
}

export interface LineTimetable {
  line_label: string;
  season: string;
  valid_text: string | null;
  source_url: string | null;
  document: string | null;
  directions: TimetableDirection[];
}

/** La salida encontrada, en minutos desde ahora. */
export interface ScheduledDeparture {
  atMinute: number;
  /** El horario publicado no es un dato en vivo: la interfaz lo dice distinto. */
  live: false;
  scheduled: true;
  /** El horario no sabe de coches concretos; va para encajar con Departure del planner. */
  vehicleId?: string;
}

/**
 * Cuánto puede caer una parada antes del primer punto de control o después del
 * último y todavía interpolarse contra su hora. Más que esto, no se arriesga.
 */
const EXTRAPOLATE_MARGIN_M = 1200;

/** Cuánto puede apartarse del trazo la ubicación de un punto para darla por buena. */
const MAX_TIMEPOINT_OFFSET_M = 250;

/** Sólo se ofrecen salidas dentro de esta ventana hacia adelante. */
const HORIZON_MIN = 180;

/** Margen para llegar a la parada antes que el ómnibus (mismo criterio que el planner). */
const BOARD_SLACK_MIN = 1;

@Injectable()
export class SchedulesService implements OnModuleInit {
  private readonly logger = new Logger(SchedulesService.name);

  /** Servicios vigentes hoy, agrupados por operador|línea|sentido. */
  private byLine = new Map<string, ScheduleRow[]>();
  private loadedSeason: string | null = null;

  /** along de cada punto de control ya proyectado sobre un itinerario. */
  private alongCache = new Map<string, Map<string, number>>();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly routeShapes: RouteShapesService,
    private readonly officialRoutes: OfficialRoutesService,
  ) {}

  async onModuleInit() {
    await this.reload();
  }

  /**
   * Trae de la base los horarios de la temporada de hoy. Lo llama el importador
   * después de cargar, y se rehace solo si cambió la temporada.
   *
   * Verano e invierno no se mezclan: se cargan sólo las filas de la temporada
   * vigente, y con vigencia que cubra la fecha de hoy si la traen. En verano,
   * con datos sólo de invierno, no se carga nada y el planificador cae a la
   * frecuencia; es lo correcto: mostrar el horario de invierno en enero sería
   * mandar gente a esperar un ómnibus que en esa época no pasa.
   */
  async reload(now = new Date()): Promise<void> {
    const season = currentSeason(now);
    this.loadedSeason = season;
    this.byLine.clear();
    this.alongCache.clear();

    let rows: any[] = [];
    try {
      const today = now.toISOString().slice(0, 10);
      rows = await this.dataSource.query(
        `SELECT operator, line_label, direction, days, timepoints
           FROM line_schedules
          WHERE season = $1
            AND (valid_from IS NULL OR valid_from <= $2)
            AND (valid_to IS NULL OR valid_to >= $2)`,
        [season, today],
      );
    } catch (error: any) {
      // Sin la tabla la app arranca igual: no hay horarios, se usa la frecuencia.
      this.logger.warn(`No se pudieron leer los horarios: ${error?.message ?? error}`);
      return;
    }

    for (const row of rows) {
      const entry: ScheduleRow = {
        operator: row.operator,
        lineLabel: row.line_label,
        direction: row.direction,
        days: Number(row.days),
        timepoints: Array.isArray(row.timepoints) ? row.timepoints : [],
      };
      const key = `${entry.operator}|${entry.lineLabel}`;
      this.byLine.set(key, [...(this.byLine.get(key) ?? []), entry]);
    }

    if (rows.length > 0) {
      this.logger.log(`Horarios de ${season}: ${rows.length} servicios en ${this.byLine.size} líneas`);
    }
  }

  /** True si hay algún horario cargado. Deja al planificador saltear el intento. */
  hasSchedules(): boolean {
    return this.byLine.size > 0;
  }

  /**
   * Qué horarios hay cargados hoy, para poder **decirlo** en vez de callarlo.
   *
   * Que en verano no se carguen los horarios de invierno está bien y es
   * deliberado. Lo que está mal es que eso sea invisible: el 1 de diciembre la
   * app perdería de golpe la mitad de sus respuestas y nadie se enteraría
   * hasta que alguien note que ya no aparece el último ómnibus. Con esto, el
   * informe de salud puede avisar "faltan los horarios de verano" el mismo día
   * que empieza la temporada.
   */
  estado(now = new Date()): {
    season: 'verano' | 'invierno';
    loaded_season: string | null;
    lines: number;
    available: boolean;
  } {
    return {
      season: currentSeason(now),
      loaded_season: this.loadedSeason,
      lines: this.byLine.size,
      available: this.byLine.size > 0,
    };
  }

  /**
   * El horario publicado de una línea, tal como para mostrarlo en su ficha:
   * una tabla por sentido, con los puntos de control como columnas y cada
   * servicio como una fila. Devuelve null si esa línea no tiene horario
   * cargado para la temporada de hoy.
   *
   * Las columnas salen de unir los puntos de todos los servicios respetando el
   * orden del recorrido -no todos los servicios pasan por todos los puntos-, y
   * cada fila se alinea a esas columnas dejando el hueco donde no pasa. Es la
   * misma tabla del papel, reconstruida.
   */
  async getLineSchedule(label: string, now = new Date()): Promise<LineTimetable | null> {
    const season = currentSeason(now);
    let rows: any[] = [];
    try {
      const today = now.toISOString().slice(0, 10);
      rows = await this.dataSource.query(
        `SELECT direction, days, refs, timepoints, valid_text, source_url, document
           FROM line_schedules
          WHERE line_label = $1 AND season = $2
            AND (valid_from IS NULL OR valid_from <= $3)
            AND (valid_to IS NULL OR valid_to >= $3)`,
        [label, season, today],
      );
    } catch {
      return null;
    }
    if (rows.length === 0) return null;

    const byDirection = new Map<string, any[]>();
    for (const row of rows) {
      byDirection.set(row.direction, [...(byDirection.get(row.direction) ?? []), row]);
    }

    const directions: TimetableDirection[] = [];
    for (const [direction, servicios] of byDirection) {
      // Columnas: unión de los puntos, en el orden en que aparecen.
      const points: string[] = [];
      for (const s of servicios) {
        for (const tp of s.timepoints as Array<{ point: string }>) {
          if (!points.includes(tp.point)) points.push(tp.point);
        }
      }

      const services = servicios
        .map((s: any) => {
          const times = new Map<string, string>();
          for (const tp of s.timepoints as Array<{ point: string; time: string }>) {
            times.set(tp.point, tp.time);
          }
          return {
            times: points.map((p) => times.get(p) ?? null),
            days: Number(s.days),
            refs: (s.refs ?? []) as string[],
          };
        })
        // Ordenadas por la primera hora, que es como se leen en el papel.
        .sort((a: TimetableService, b: TimetableService) => firstTime(a) - firstTime(b));

      directions.push({ direction, points, services });
    }

    return {
      line_label: label,
      season,
      valid_text: rows[0].valid_text ?? null,
      source_url: rows[0].source_url ?? null,
      document: rows[0].document ?? null,
      directions,
    };
  }

  /**
   * La próxima salida publicada desde una parada de un recorrido, en minutos
   * desde ahora, o null si no hay horario que aplique.
   */
  /**
   * ¿Esta línea tiene horario cargado para la temporada de hoy?
   *
   * Es la pregunta barata, para cuando todavía no se sabe en qué parada se
   * sube -el caso del segundo tramo de un transbordo- y hace falta decidir si
   * la línea puede llegar a ofrecerse. No dice que haya una salida alcanzable:
   * eso lo contesta `nextDeparture`, y el planificador lo vuelve a verificar
   * antes de mostrar el viaje.
   */
  hasScheduleFor(sequence: RouteStopSequence): boolean {
    const label = this.officialRoutes.lineLabel(sequence.operator, sequence.lineCode);
    return (this.byLine.get(`${sequence.operator}|${label}`)?.length ?? 0) > 0;
  }

  nextDeparture(
    sequence: RouteStopSequence,
    boarding: StopOnRoute,
    readyAtMinute: number,
    now = new Date(),
  ): ScheduledDeparture | null {
    if (this.loadedSeason && this.loadedSeason !== currentSeason(now)) {
      // Cambió la temporada desde que se cargó: se rehace en segundo plano y por
      // ahora se contesta sin horario, que cae a la frecuencia.
      void this.reload(now);
      return null;
    }

    const label = this.officialRoutes.lineLabel(sequence.operator, sequence.lineCode);
    const services = this.byLine.get(`${sequence.operator}|${label}`);
    if (!services || services.length === 0) return null;

    const alongByPoint = this.pointAlongs(sequence);
    if (!alongByPoint || alongByPoint.size < 2) return null;

    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const todayBit = weekdayBit(now);

    let best: number | null = null;

    for (const service of services) {
      if ((service.days & todayBit) === 0) continue;

      const atStop = this.interpolate(service, alongByPoint, boarding.alongMeters);
      if (atStop === null) continue;

      // Minutos desde ahora hasta esa salida, sólo hacia adelante y dentro del
      // horizonte. La madrugada -servicios después de medianoche- la maneja el
      // feed en vivo, no el horario.
      const rel = atStop - nowMinutes;
      if (rel < readyAtMinute + BOARD_SLACK_MIN || rel > HORIZON_MIN) continue;

      if (best === null || rel < best) best = rel;
    }

    return best === null ? null : { atMinute: best, live: false, scheduled: true };
  }

  /**
   * Qué le queda hoy a esta línea en esta parada.
   *
   * Contesta las dos preguntas que se hace alguien parado en la parada de
   * noche, y que la app no sabía contestar:
   *
   * - **"¿A qué hora pasa el último?"** En San Carlos perderlo cuesta un taxi
   *   de treinta kilómetros. Es la diferencia entre esperar tranquilo y
   *   quedarse a pie.
   * - **"¿Ya pasó o está atrasado?"** Hasta ahora la app decía "no viene
   *   ninguno", que no distingue *viene en veinte minutos* de *se terminó el
   *   servicio*. La respuesta honesta es "el último pasó hace 8 min · el
   *   próximo, por horario, 21:40".
   *
   * Es el horario publicado, no el GPS: dice lo que **debería** pasar. Que un
   * coche esté atrasado lo sabe el feed en vivo; que ya no haya más, sólo el
   * papel.
   */
  serviceAtStop(
    sequence: RouteStopSequence,
    boarding: StopOnRoute,
    now = new Date(),
  ): StopServiceToday | null {
    const label = this.officialRoutes.lineLabel(sequence.operator, sequence.lineCode);
    const services = this.byLine.get(`${sequence.operator}|${label}`);
    if (!services || services.length === 0) return null;

    const alongByPoint = this.pointAlongs(sequence);
    if (!alongByPoint || alongByPoint.size < 2) return null;

    const todayBit = weekdayBit(now);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    // Todas las pasadas de hoy por esta parada, en orden.
    const pasadas: number[] = [];
    for (const service of services) {
      if ((service.days & todayBit) === 0) continue;
      const atStop = this.interpolate(service, alongByPoint, boarding.alongMeters);
      if (atStop !== null) pasadas.push(atStop);
    }

    if (pasadas.length === 0) return null;
    pasadas.sort((a, b) => a - b);

    const siguiente = pasadas.find((minuto) => minuto >= nowMinutes) ?? null;
    const anteriores = pasadas.filter((minuto) => minuto < nowMinutes);
    const anterior = anteriores.length ? anteriores[anteriores.length - 1] : null;
    const ultima = pasadas[pasadas.length - 1];

    return {
      line_label: label,
      operator: sequence.operator,
      headsign: sequence.itineraryName,
      // Redondeados: la interpolación entre dos puntos de control da fracciones
      // de minuto, y "en 15,89 minutos" no es una respuesta que nadie lea.
      next_in_minutes: siguiente === null ? null : Math.round(siguiente - nowMinutes),
      next_at: siguiente === null ? null : minutesToHHMM(siguiente),
      previous_ago_minutes: anterior === null ? null : Math.round(nowMinutes - anterior),
      previous_at: anterior === null ? null : minutesToHHMM(anterior),
      last_at: minutesToHHMM(ultima),
      // Se terminó por hoy: la última del día ya pasó.
      finished: siguiente === null,
      /** True cuando la que viene es la última del día. */
      is_last: siguiente !== null && siguiente === ultima,
      services_today: pasadas.length,
    };
  }

  // ---------------------------------------------------------------- internos

  /**
   * A qué altura del recorrido cae cada punto de control de esta línea.
   *
   * Se proyecta la ubicación de cada punto sobre el trazo del itinerario. Los
   * que no están mapeados, o que caen demasiado lejos del trazo -porque ese
   * itinerario no pasa por ahí-, quedan afuera: es lo que hace que el horario
   * de la ida no se aplique por error al recorrido de la vuelta.
   */
  private pointAlongs(sequence: RouteStopSequence): Map<string, number> | null {
    const cacheKey = `${sequence.operator}|${sequence.lineCode}|${sequence.itineraryKey}`;
    const cached = this.alongCache.get(cacheKey);
    if (cached) return cached;

    const shape = this.routeShapes
      .getShapes()
      .find(
        (candidate) =>
          candidate.operator === sequence.operator &&
          candidate.lineCode === sequence.lineCode &&
          candidate.itineraryKey === sequence.itineraryKey,
      );

    const geometry = shape?.geometry as LngLat[] | undefined;
    if (!geometry || geometry.length < 2) return null;

    const cumulative = cumulativeDistances(geometry);
    const label = this.officialRoutes.lineLabel(sequence.operator, sequence.lineCode);
    const services = this.byLine.get(`${sequence.operator}|${label}`) ?? [];

    const nombres = new Set<string>();
    for (const service of services) {
      for (const paso of service.timepoints) nombres.add(paso.point);
    }

    const alongByPoint = new Map<string, number>();
    for (const nombre of nombres) {
      const punto = resolveTimepoint(nombre);
      if (!punto) continue;
      const along = distanceAlongPolyline(punto.lat, punto.lng, geometry, cumulative);
      if (!along || along.offsetMeters > MAX_TIMEPOINT_OFFSET_M) continue;
      alongByPoint.set(nombre, along.alongMeters);
    }

    this.alongCache.set(cacheKey, alongByPoint);
    return alongByPoint;
  }

  /**
   * La hora a la que este servicio pasa por una parada, interpolada entre los
   * dos puntos de control que la rodean. Devuelve minutos del día, o null si la
   * parada queda fuera del tramo que cubren los puntos de control conocidos.
   */
  private interpolate(
    service: ScheduleRow,
    alongByPoint: Map<string, number>,
    stopAlong: number,
  ): number | null {
    // Los puntos por los que este servicio pasa, ubicados y en orden de trazo.
    const puntos = service.timepoints
      .map((paso) => ({ along: alongByPoint.get(paso.point), min: hhmmToMinutes(paso.time) }))
      .filter((p): p is { along: number; min: number } => p.along !== undefined && p.min !== null)
      .sort((a, b) => a.along - b.along);

    if (puntos.length < 2) return null;

    // Las horas tienen que crecer con el trazo; si una cae después de
    // medianoche, se le suma un día para que la interpolación no dé negativo.
    for (let i = 1; i < puntos.length; i++) {
      while (puntos[i].min < puntos[i - 1].min) puntos[i].min += 1440;
    }

    const primero = puntos[0];
    const ultimo = puntos[puntos.length - 1];

    if (stopAlong <= primero.along) {
      return primero.along - stopAlong <= EXTRAPOLATE_MARGIN_M ? primero.min : null;
    }
    if (stopAlong >= ultimo.along) {
      return stopAlong - ultimo.along <= EXTRAPOLATE_MARGIN_M ? ultimo.min : null;
    }

    for (let i = 0; i < puntos.length - 1; i++) {
      const a = puntos[i];
      const b = puntos[i + 1];
      if (stopAlong >= a.along && stopAlong <= b.along && b.along > a.along) {
        const fraccion = (stopAlong - a.along) / (b.along - a.along);
        return a.min + (b.min - a.min) * fraccion;
      }
    }

    return null;
  }
}

/**
 * La temporada de una fecha. Verano de diciembre a febrero, invierno el resto:
 * es el criterio grueso, y la vigencia exacta de cada documento -cuando la
 * trae- lo afina en la consulta.
 */
export function currentSeason(now: Date): 'verano' | 'invierno' {
  const mes = now.getMonth() + 1;
  return mes === 12 || mes === 1 || mes === 2 ? 'verano' : 'invierno';
}

/** El bit del día de hoy. Lunes=1, martes=2, ... domingo=64. */
function weekdayBit(now: Date): number {
  const jsDay = now.getDay(); // 0=domingo ... 6=sábado
  const indice = jsDay === 0 ? 6 : jsDay - 1; // lunes=0 ... domingo=6
  return 1 << indice;
}

/** La primera hora de un servicio, para ordenarlos como en el papel. */
function firstTime(service: TimetableService): number {
  for (const t of service.times) {
    if (t) return hhmmToMinutes(t) ?? Number.POSITIVE_INFINITY;
  }
  return Number.POSITIVE_INFINITY;
}

/** "06:40" -> 400 minutos. null si no es una hora. */
/**
 * Minutos desde medianoche a "HH:MM".
 *
 * Los servicios de madrugada vienen como minutos pasados de 1440 -la 16 sale
 * 23:10 y llega 01:10 del día siguiente-, así que se dobla el reloj en vez de
 * mostrar "25:10", que no es una hora que nadie lea.
 */
function minutesToHHMM(minutos: number): string {
  const total = ((Math.round(minutos) % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function hhmmToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  if (!m) return null;
  const horas = Number(m[1]);
  const minutos = Number(m[2]);
  if (horas > 27 || minutos > 59) return null;
  return horas * 60 + minutos;
}
