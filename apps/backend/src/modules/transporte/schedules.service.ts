import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RouteShapesService } from './route-shapes.service';
import { OfficialRoutesService } from './official-routes.service';
import { RouteStopSequence, StopOnRoute } from './stop-sequence.service';
import { cumulativeDistances, distanceAlongPolyline, LngLat } from './geo.util';
import { resolveTimepoint } from './schedule-timepoints';
import { LineSpeedService } from './line-speed.service';

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

/**
 * Cómo le va al modelo de velocidad contra el horario publicado, por recorrido.
 *
 * `ratio` es lo que se mira: minutos que calcula la app sobre minutos que
 * publica la empresa, para los mismos tramos. Debajo de 1 la app se cree más
 * rápida que el papel y va a decir "no llegás" de más; encima de 1, al revés.
 */
export interface SpeedCheck {
  operator: string;
  line_label: string;
  itinerary: string | null;
  /** Tramos entre puntos de control que se pudieron comparar. */
  segments: number;
  meters: number;
  published_minutes: number;
  measured_minutes: number;
  ratio: number;
  /**
   * El tramo donde más se apartan.
   *
   * Es el dato que importa y el que el total esconde: el recorrido entero de
   * la 15 coincidía con el papel -treinta kilómetros de ruta tapan cinco de
   * ciudad- y el tramo urbano estaba a un tercio de error. Un promedio que
   * cierra no dice que el modelo esté bien, dice que los errores se
   * compensaron.
   */
  worst_segment: SegmentCheck | null;
}

/** Un tramo entre dos puntos de control, comparado contra el papel. */
export interface SegmentCheck {
  from: string;
  to: string;
  meters: number;
  /** Cuántos servicios del día recorren este tramo. Los minutos son la suma. */
  passes: number;
  published_minutes: number;
  measured_minutes: number;
  ratio: number;
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

/**
 * El tramo más corto que se compara contra el horario publicado.
 *
 * Entre dos puntos de control pegados, el minuto redondeado del papel y el
 * error de proyección pesan más que la velocidad, y el cociente se vuelve
 * ruido. Medio kilómetro es donde el dato empieza a decir algo.
 */
const MIN_SEGMENTO_M = 500;

/**
 * Entre qué horas se acepta que un servicio cruce la medianoche.
 *
 * Los puntos de control de un servicio tienen que ir creciendo. Cuando uno da
 * una hora menor que el anterior hay dos explicaciones posibles: o el servicio
 * pasó la medianoche -la 17/19 sale 23:20 y llega 00:20- o el punto quedó mal
 * ubicado sobre el trazo y el orden que se está leyendo no es el real.
 *
 * Distinguirlas importa: sumarle un día a un punto mal ubicado no arregla
 * nada, corre todas las horas de ese servicio media jornada y la app termina
 * anunciando un ómnibus a las cuatro de la mañana. Pasó: la 52, que el papel
 * cierra a las 23:00, aparecía con "última vuelta 03:53".
 *
 * Un cruce de medianoche de verdad va de tarde-noche a madrugada. Cualquier
 * otro salto hacia atrás es un desorden, y ahí no se inventa una hora: no se
 * contesta.
 */
const MEDIANOCHE_DESDE_MIN = 18 * 60;
const MEDIANOCHE_HASTA_MIN = 6 * 60;

/**
 * Lo que puede durar un servicio de punta a punta.
 *
 * El más largo que publican las empresas es la 100 a Pan de Azúcar, algo más
 * de dos horas. Cinco es una cota holgada que no descarta nada real y sí
 * descarta cualquier resto de un día mal sumado, venga de donde venga.
 */
const MAX_SERVICIO_MIN = 5 * 60;

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
    private readonly lineSpeeds: LineSpeedService,
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
   * ¿La velocidad que mide la app coincide con el horario que publican las
   * empresas?
   *
   * Es la única verificación independiente que hay. La velocidad sale del GPS
   * y el horario sale del papel: si los dos dicen lo mismo, el modelo anda; si
   * uno dice diez minutos donde el otro dice quince, alguien va a recibir un
   * "no llegás" que no corresponde. Fue exactamente el caso de la 15.
   *
   * Se compara tramo por tramo entre puntos de control consecutivos, que es la
   * granularidad a la que publica la empresa, y se agrega por recorrido. El
   * cociente es lo que importa: 1,00 es acuerdo, 0,70 es la app creyéndose un
   * 30% más rápida que el papel.
   *
   * No corrige nada por sí solo. Sirve para saber dónde mirar, y para que el
   * día que entren los horarios de verano se pueda comprobar de una pasada que
   * el modelo sigue de acuerdo con ellos.
   */
  speedCheck(sequences: RouteStopSequence[]): SpeedCheck[] {
    const filas: SpeedCheck[] = [];

    for (const sequence of sequences) {
      const label = this.officialRoutes.lineLabel(sequence.operator, sequence.lineCode);
      const services = this.byLine.get(`${sequence.operator}|${label}`);
      if (!services || services.length === 0) continue;

      const alongByPoint = this.pointAlongs(sequence);
      if (!alongByPoint || alongByPoint.size < 2) continue;

      const shape = this.routeShapes
        .getShapes()
        .find(
          (candidate) =>
            candidate.operator === sequence.operator &&
            candidate.lineCode === sequence.lineCode &&
            candidate.itineraryKey === sequence.itineraryKey,
        );
      const geometry = shape?.geometry as LngLat[] | undefined;
      if (!geometry || geometry.length < 2) continue;
      const cumulative = cumulativeDistances(geometry);

      // Por par de puntos de control. Un mismo tramo lo recorren los dieciséis
      // servicios del día, y lo que se compara es el conjunto: un servicio
      // suelto con un minuto raro no mueve nada, un tramo mal modelado sí.
      const porTramo = new Map<string, SegmentCheck>();

      for (const service of services) {
        const puntos = service.timepoints
          .map((paso) => ({
            point: paso.point,
            along: alongByPoint.get(paso.point),
            min: hhmmToMinutes(paso.time),
          }))
          .filter(
            (p): p is { point: string; along: number; min: number } =>
              p.along !== undefined && p.min !== null,
          )
          .sort((a, b) => a.along - b.along);

        // El mismo criterio que usa la interpolación: si el servicio no se
        // puede poner en hora, tampoco se puede comparar contra él.
        if (!alinearEnElTiempo(puntos)) continue;

        for (let i = 1; i < puntos.length; i++) {
          const distancia = puntos[i].along - puntos[i - 1].along;
          const publicado = puntos[i].min - puntos[i - 1].min;
          // Tramos demasiado cortos o de duración cero no dicen nada y sí
          // hacen ruido en el cociente.
          if (distancia < MIN_SEGMENTO_M || publicado <= 0) continue;

          const clave = `${puntos[i - 1].point}||${puntos[i].point}`;
          const tramo = porTramo.get(clave) ?? {
            from: puntos[i - 1].point,
            to: puntos[i].point,
            meters: Math.round(distancia),
            passes: 0,
            published_minutes: 0,
            measured_minutes: 0,
            ratio: 0,
          };

          tramo.passes += 1;
          tramo.published_minutes += publicado;
          tramo.measured_minutes += this.lineSpeeds.travelMinutes(
            sequence.operator,
            sequence.lineCode,
            sequence.itineraryKey,
            geometry,
            cumulative,
            puntos[i - 1].along,
            puntos[i].along,
          );
          porTramo.set(clave, tramo);
        }
      }

      if (porTramo.size === 0) continue;

      let publicados = 0;
      let medidos = 0;
      let metros = 0;
      let peor: SegmentCheck | null = null;

      for (const tramo of porTramo.values()) {
        tramo.ratio = Number((tramo.measured_minutes / tramo.published_minutes).toFixed(3));
        tramo.published_minutes = Math.round(tramo.published_minutes);
        tramo.measured_minutes = Math.round(tramo.measured_minutes);

        publicados += tramo.published_minutes;
        medidos += tramo.measured_minutes;
        metros += tramo.meters;
        if (!peor || Math.abs(tramo.ratio - 1) > Math.abs(peor.ratio - 1)) peor = tramo;
      }

      if (publicados === 0) continue;

      filas.push({
        operator: sequence.operator,
        line_label: label,
        itinerary: sequence.itineraryName,
        segments: porTramo.size,
        meters: Math.round(metros),
        published_minutes: publicados,
        measured_minutes: medidos,
        ratio: Number((medidos / publicados).toFixed(3)),
        worst_segment: peor,
      });
    }

    // Se ordena por el peor **tramo**, no por el total del recorrido. Si se
    // ordenara por el total, la 15 -que es de donde salió todo esto- quedaría
    // en el medio de la lista con un 1,00 impecable.
    const desvio = (fila: SpeedCheck) => Math.abs((fila.worst_segment?.ratio ?? fila.ratio) - 1);
    return filas.sort((a, b) => desvio(b) - desvio(a));
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

    if (!alinearEnElTiempo(puntos)) return null;

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
 * Pone en hora los puntos de control de un servicio, ya ordenados por trazo.
 *
 * Modifica `puntos` en el lugar y devuelve si quedaron utilizables. Es la
 * regla que decide **cuándo se contesta y cuándo se calla**, y por eso está
 * separada y probada aparte.
 *
 * Un servicio recorre su trazo hacia adelante, así que sus horas tienen que ir
 * creciendo. Cuando una cae hacia atrás hay dos causas posibles y una sola
 * respuesta correcta para cada una:
 *
 * - **Cruzó la medianoche.** La 17/19 sale 23:20 y llega 00:20. Se le suma un
 *   día al resto y la interpolación sigue funcionando.
 * - **El punto quedó mal ubicado sobre el trazo.** Entonces el orden que se
 *   está leyendo no es el que hizo el ómnibus, y sumar un día no arregla nada:
 *   corre las horas de ese servicio media jornada. Acá se devuelve `false`, y
 *   esa parada se queda sin horario en vez de con uno inventado.
 *
 * La segunda pasaba y se veía: la 52, que el papel cierra a las 23:00,
 * anunciaba "última vuelta 03:53".
 */
export function alinearEnElTiempo(puntos: Array<{ along: number; min: number }>): boolean {
  if (puntos.length < 2) return false;

  for (let i = 1; i < puntos.length; i++) {
    if (puntos[i].min >= puntos[i - 1].min) continue;

    const cruzaMedianoche =
      puntos[i - 1].min % 1440 >= MEDIANOCHE_DESDE_MIN && puntos[i].min <= MEDIANOCHE_HASTA_MIN;
    if (!cruzaMedianoche) return false;

    puntos[i].min += 1440;
    // Un solo día. Si con eso todavía no alcanza, no era una medianoche.
    if (puntos[i].min < puntos[i - 1].min) return false;
  }

  // Y aunque cada paso cierre, el total tiene que durar lo que dura un viaje.
  return puntos[puntos.length - 1].min - puntos[0].min <= MAX_SERVICIO_MIN;
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
