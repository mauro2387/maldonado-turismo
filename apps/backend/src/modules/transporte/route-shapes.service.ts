import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  densifyPolyline,
  LngLat,
  PointCloud,
  samplePoints,
  shapeFidelity,
  shapeSupport,
  snapToPolyline,
  splitOnGaps,
} from './geo.util';
import { OfficialRoutesService } from './official-routes.service';

/**
 * Los recorridos de las líneas y el ajuste de las posiciones sobre la calle.
 *
 * De dónde sale el trazo, en orden:
 *
 * 1. **El que publica la empresa.** CODESA, Maldonado Turismo y Micro
 *    publican sus recorridos dibujados y `OfficialRoutesService` decide cuál
 *    corresponde a cada itinerario del feed. Es la fuente buena: 67 de los 74
 *    itinerarios que circulan hoy quedan cubiertos.
 * 2. **La reconstrucción por GPS**, para los siete que no -líneas que la
 *    empresa no publica, servicios contratados, el coche que va a cargar
 *    combustible-. Es lo que sigue el resto de este archivo.
 *
 * El problema que resuelve la reconstrucción: el GPS de un ómnibus reporta con
 * error de decenas de metros, así que dibujado en crudo el coche aparece
 * arriba de las manzanas y el recorrido queda como una sucesión de rectas que
 * cortan campo traviesa.
 *
 * Cómo lo resuelve, en dos etapas:
 *
 * 1. Cada tanto toma la traza de un ómnibus haciendo un viaje completo (las
 *    posiciones comparten vehículo, línea, sentido y hora de salida) y la pasa
 *    por el map matching de OSRM, que devuelve la polilínea siguiendo las
 *    calles reales, con sus curvas y rotondas.
 * 2. Con esa polilínea ya en memoria, cada posición nueva se proyecta sobre
 *    ella con pura geometría local. No hace falta llamar a OSRM por cada
 *    ómnibus cada 15 segundos, y el coche queda exactamente sobre la línea que
 *    se dibuja en el mapa.
 *
 * Sobre el servidor de OSRM: el público (router.project-osrm.org) sirve para
 * desarrollo, pero su política de uso no contempla producción. Para producción
 * hay que levantar OSRM propio con un extracto de Uruguay y apuntar
 * OSRM_BASE_URL ahí.
 */

/** Por qué cambiaron los recorridos: se leyeron de la base, o se rehicieron. */
export type RebuildReason = 'carga' | 'reconstruccion';

export interface RouteShape {
  operator: string;
  lineCode: string;
  /** Identidad del recorrido dentro de la línea. Ver ITINERARIOS, más abajo. */
  itineraryKey: string;
  itineraryName: string | null;
  direction: number | null;
  geometry: LngLat[];
  distanceM: number | null;
  /** Proporción del trazo que pisa calle con posiciones reales cerca (0..1). */
  confidence: number | null;
  /** Proporción de las posiciones de otros viajes que caen sobre el trazo (0..1). */
  support: number | null;
  /** De dónde salió el trazo: publicado por la empresa o reconstruido con GPS. */
  source: 'oficial' | 'avl';
  /** El recorrido publicado del que salió, cuando es oficial. */
  officialRouteId: number | null;
  builtAt: Date;
}

/** Un recorrido concreto de una línea, con los viajes que lo hicieron. */
interface Itinerary {
  operator: string;
  line_code: string;
  itinerary_key: string;
  itinerary_name: string | null;
  itinerary: number | null;
}

/** Un viaje: un coche haciendo ese recorrido una vez. */
interface Trip {
  vehicle_id: string;
  departure_time: string | null;
  points: LngLat[];
}

/**
 * Coordenadas que se le mandan al motor de ruteo por pedido. El servicio
 * /route de OSRM acepta 100 waypoints y con eso alcanza para cubrir un viaje
 * entero de una sola vez.
 */
const MAX_TRACE_WAYPOINTS = 100;

/**
 * Radio de búsqueda al enganchar cada punto a una calle. Tiene que cubrir el
 * error del GPS urbano sin llegar a agarrar una calle paralela.
 */
const SNAP_RADIUS_M = 30;

/** Debajo de esta cantidad de puntos la traza no cubre un viaje utilizable. */
const MIN_TRIP_POINTS = 12;

/**
 * Salto máximo entre dos posiciones consecutivas para seguir considerándolas
 * el mismo tramo.
 *
 * El feed publica cada 30 s. Un ómnibus urbano a 50 km/h recorre unos 420 m en
 * ese tiempo, así que 700 m deja pasar el tránsito normal y hasta un tramo de
 * ruta, y corta cuando faltan posiciones de verdad. Sobre un hueco el motor de
 * ruteo une los dos extremos por el camino más rápido, o sea inventa calle.
 */
const MAX_TRACE_GAP_M = 700;

/**
 * Cuán cerca del corredor tiene que pasar el trazo para darlo por respaldado.
 *
 * El número es el corazón de la validación. Tiene dos cotas:
 *
 * - Por arriba, **menor que la separación entre dos calles paralelas**. En
 *   Maldonado las manzanas son de 80 a 100 m, así que con 60 m -el valor con
 *   el que se validaba antes- una vuelta por la cuadra de al lado pasaba como
 *   correcta, y de ahí que la medición diera 91-100 % mientras el mapa
 *   mostraba líneas por calles equivocadas.
 * - Por abajo, mayor que lo que la cuerda entre dos posiciones corta en las
 *   curvas. Las posiciones vienen cada 30 s y el corredor que se arma
 *   uniéndolas corta por dentro de cada curva.
 *
 * 40 m es donde los recorridos buenos se despegan de los malos: medido sobre
 * los 74 itinerarios, la mediana da 94 % y los tres que se ven mal en el mapa
 * quedan en 20 %, 37 % y 45 %.
 */
const VALIDATION_TOLERANCE_M = 40;

/** Cada cuánto se rellena el corredor. Bien por debajo de la tolerancia. */
const CORRIDOR_SPACING_M = 15;

/**
 * Cuántos viajes distintos se prueban como candidatos por itinerario.
 *
 * Cada uno es un pedido al motor de ruteo, así que no conviene pasarse: con
 * tres alcanza para que un viaje raro -un desvío por una calle cortada, un
 * coche que se fue a cargar combustible- no sea el único candidato.
 */
const CANDIDATE_TRIPS = 3;

/** Viajes que se usan para validar. Más que esto no cambia el resultado. */
const VALIDATION_TRIPS = 12;

/**
 * Fidelidad mínima para guardar un recorrido.
 *
 * Calibrado sobre la distribución real de los 74 itinerarios, no a ojo: con
 * tolerancia de 40 m la mediana es 94 %, el primer cuartil 88 % y el decil más
 * bajo 78 %. El corte en 0,85 deja pasar los recorridos buenos y voltea once,
 * entre ellos los que el usuario veía mal: "Traslados contratados" de la 500
 * (37 %, que no es una línea regular sino viajes contratados y por eso no
 * tiene recorrido fijo), la 61 a Terminal Maldonado (20 %) y el local de La
 * Capuera de la 60 (45 %).
 *
 * Un recorrido mal dibujado es peor que ninguno: alguien lo sigue.
 */
const MIN_FIDELITY = 0.85;

/**
 * ITINERARIOS
 *
 * Un recorrido se identifica por línea **e itinerario**, no por línea sola.
 * La línea 24 hace cuatro recorridos por calles distintas y la 19 hace cinco;
 * de 31 líneas, 25 tienen más de uno. Con la clave vieja —(empresa, línea,
 * sentido), donde el sentido llegaba siempre en 1— los cuatro recorridos de la
 * 24 compartían un solo trazo, y por eso el mapa dibujaba la línea por calles
 * por las que el ómnibus no pasa.
 *
 * La clave es el `tra` del feed cuando está, que es el identificador propio de
 * la empresa, y si no el destino publicado normalizado. El destino sirve
 * porque ya estaba guardado en `line_name` desde el principio: permite
 * reconstruir con lo que hay sin esperar a que se acumulen posiciones nuevas.
 */
export function itineraryKey(lineName: string | null): string {
  // Sin expresión regular, a propósito. La contraparte de esta normalización
  // vive dentro de una consulta SQL escrita en un template literal, y ahí la
  // secuencia de barra invertida y ese se convierte en una 's' suelta antes de
  // llegar a Postgres: la clave de un lado quedaba sin eses y no emparejaba
  // con la del otro. `btrim` y `upper` hacen lo mismo de los dos lados y no
  // hay nada que escapar.
  return (lineName ?? '').trim().toUpperCase() || '-';
}

function shapeKey(operator: string, lineCode: string, key: string): string {
  return `${operator}|${lineCode}|${key}`;
}

@Injectable()
export class RouteShapesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RouteShapesService.name);

  private shapes = new Map<string, RouteShape>();
  private buildTimer: NodeJS.Timeout | null = null;
  private building = false;

  /**
   * Avisos de que la geometría cambió. Todo lo que se deriva del recorrido
   * -el orden de las paradas, las distancias acumuladas que usan las ETAs-
   * queda viejo cuando se reconstruye, y tiene que recalcularse.
   *
   * Es una lista de callbacks y no una inyección al revés porque quienes
   * escuchan ya dependen de este servicio: inyectarlos acá cerraría el ciclo.
   */
  private rebuildListeners: Array<(reason: RebuildReason) => void | Promise<void>> = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly officialRoutes: OfficialRoutesService,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  private get osrmBaseUrl(): string {
    return this.configService.get('OSRM_BASE_URL', 'https://router.project-osrm.org');
  }

  private get enabled(): boolean {
    return this.configService.get('ROUTE_SHAPES_ENABLED', 'true') !== 'false';
  }

  private get buildIntervalMs(): number {
    return Number(this.configService.get('ROUTE_SHAPES_BUILD_INTERVAL_MS', 6 * 60 * 60 * 1000));
  }

  /** Ventana de posiciones de la que se eligen los viajes a reconstruir. */
  private get lookbackHours(): number {
    return Number(this.configService.get('ROUTE_SHAPES_LOOKBACK_HOURS', 24));
  }

  /**
   * Si la posición cae más lejos que esto del recorrido, no se la ajusta: o el
   * ómnibus se desvió de veras (desvío, corte de calle) o el recorrido
   * reconstruido todavía no cubre esa zona. En ambos casos es preferible
   * mostrar la posición cruda antes que mentir.
   */
  private get maxSnapOffsetMeters(): number {
    return Number(this.configService.get('ROUTE_SHAPES_MAX_SNAP_M', 60));
  }

  async onModuleInit() {
    await this.loadShapes();

    if (!this.enabled) {
      this.logger.log('Reconstrucción de recorridos deshabilitada (ROUTE_SHAPES_ENABLED=false)');
      return;
    }

    this.buildTimer = setInterval(() => void this.buildAll(), this.buildIntervalMs);
  }

  onModuleDestroy() {
    if (this.buildTimer) clearInterval(this.buildTimer);
  }

  /**
   * Trae de la base los recorridos ya reconstruidos y los deja en memoria.
   *
   * Solo los que se sostienen. `confidence` guarda qué proporción del trazo
   * pisa calle que el ómnibus recorrió de verdad, y un recorrido reconstruido
   * por debajo del corte no se sirve ni se dibuja: se usa además para pegar
   * las posiciones a la calle y para ordenar las paradas, así que uno malo no
   * ensucia solo el mapa, también corre las ETAs.
   *
   * El corte no aplica a los recorridos publicados por las empresas. Ahí una
   * fidelidad baja no dice que el trazo esté mal, dice que en las últimas
   * horas los ómnibus no recorrieron toda la línea -el último servicio de la
   * noche, un ramal que sale dos veces por día-, y el trazo sigue siendo el
   * que la empresa publica.
   *
   * Los que quedaron guardados sin medir —`confidence` en null, de antes de
   * que existiera la medida— tampoco se cargan: no hay nada que diga que están
   * bien, y entre ellos estaban justamente los dos que se veían mal.
   */
  async loadShapes(): Promise<number> {
    try {
      const rows = await this.dataSource.query(
        `SELECT operator, line_code, itinerary_key, itinerary_name, direction,
                geometry, distance_m, confidence, support, source,
                official_route_id, built_at
         FROM route_shapes
         WHERE source = 'oficial' OR confidence >= $1`,
        [MIN_FIDELITY],
      );

      this.shapes = new Map(
        rows.map((row: any) => [
          shapeKey(row.operator, row.line_code, row.itinerary_key),
          {
            operator: row.operator,
            lineCode: row.line_code,
            itineraryKey: row.itinerary_key,
            itineraryName: row.itinerary_name,
            direction: row.direction,
            geometry: row.geometry as LngLat[],
            distanceM: row.distance_m,
            confidence: row.confidence,
            support: row.support,
            source: row.source === 'oficial' ? 'oficial' : 'avl',
            officialRouteId: row.official_route_id ?? null,
            builtAt: row.built_at,
          },
        ]),
      );

      const [{ total }] = await this.dataSource.query(
        `SELECT count(*)::int AS total FROM route_shapes`,
      );
      const descartados = total - this.shapes.size;
      this.logger.log(
        `Recorridos cargados: ${this.shapes.size}` +
          (descartados > 0 ? ` (${descartados} sin la calidad suficiente para dibujarse)` : ''),
      );

      // Cargar de la base también cambia los recorridos, y quien depende de
      // ellos tiene que enterarse igual que en una reconstrucción.
      //
      // Sin esto, StopSequenceService quedaba con cero secuencias durante toda
      // la vida del proceso: Nest no garantiza el orden de los onModuleInit
      // dentro de un módulo, así que ordenaba las paradas antes de que este
      // servicio hubiera leído la tabla, veía la lista vacía y no se volvía a
      // llamar hasta la primera reconstrucción, dos horas más tarde. Con las
      // secuencias vacías no hay ETA, y Moverse mostraba "todavía no podemos
      // calcular llegadas" con los recorridos ahí, ya reconstruidos.
      await this.notifyRebuilt('carga');

      return this.shapes.size;
    } catch (error: any) {
      // Si la tabla todavía no existe la app tiene que arrancar igual: sin
      // recorridos el mapa muestra las posiciones crudas.
      this.logger.warn(`No se pudieron cargar los recorridos: ${error?.message ?? error}`);
      return 0;
    }
  }

  getShapes(): RouteShape[] {
    return [...this.shapes.values()];
  }

  /**
   * Se notifica cada vez que cambian los recorridos: al cargarlos de la base y
   * al reconstruirlos.
   *
   * El motivo va en el aviso porque no dan lo mismo. Cargar es leer lo que ya
   * estaba y pasa en cada arranque; reconstruir cambia la geometría, y hay
   * trabajo -volver a apoyar las paradas sobre el trazo- que sólo tiene
   * sentido hacer entonces.
   */
  onRebuilt(listener: (reason: RebuildReason) => void | Promise<void>) {
    this.rebuildListeners.push(listener);
  }

  private async notifyRebuilt(reason: RebuildReason) {
    for (const listener of this.rebuildListeners) {
      try {
        await listener(reason);
      } catch (error: any) {
        this.logger.warn(`Error al propagar la reconstrucción: ${error?.message ?? error}`);
      }
    }
  }

  /**
   * Ajusta una posición al recorrido de su línea. Devuelve null cuando no hay
   * recorrido todavía o cuando la posición queda demasiado lejos de él.
   */
  snap(
    latitude: number,
    longitude: number,
    operator: string | null,
    lineCode: string | null,
    lineName: string | null,
  ): { latitude: number; longitude: number; offsetMeters: number } | null {
    if (!operator || !lineCode) return null;

    // Solo el recorrido de su propio itinerario.
    //
    // Antes, si no había trazo para el sentido pedido se caía a cualquier otro
    // de la misma línea. Con itinerarios que van por avenidas distintas eso
    // pega el coche a una calle por la que no está pasando, que es peor que
    // dejarlo donde el GPS dice: al menos ahí el error se ve.
    const shape = this.shapes.get(shapeKey(operator, lineCode, itineraryKey(lineName)));

    if (!shape) return null;

    const snapped = snapToPolyline(latitude, longitude, shape.geometry);
    if (!snapped || snapped.offsetMeters > this.maxSnapOffsetMeters) return null;

    return {
      latitude: snapped.latitude,
      longitude: snapped.longitude,
      offsetMeters: snapped.offsetMeters,
    };
  }

  /**
   * Reconstruye el recorrido de cada itinerario.
   *
   * El cambio de fondo respecto de la versión anterior: antes se elegía **un**
   * viaje por línea -el que más posiciones tenía- y se lo daba por bueno. Con
   * 428 viajes guardados y 73 itinerarios, eso era descartar casi toda la
   * evidencia disponible y confiar en una sola muestra.
   *
   * Ahora, para cada itinerario:
   *
   * 1. Se arman varios candidatos, uno por viaje, cada uno ruteado sobre su
   *    tramo continuo más largo.
   * 2. Cada candidato se mide contra **los otros** viajes del itinerario: la
   *    fidelidad dice si el trazo pisa calle recorrida de verdad, y el
   *    respaldo dice si representa a los demás viajes o es una rareza de uno
   *    solo -un desvío por una calle cortada, un coche que fue a cargar-.
   * 3. Gana el de mejor puntaje, y si ninguno llega al mínimo no se guarda
   *    ninguno.
   *
   * Validar un trazo contra el mismo viaje del que salió no prueba nada, y es
   * por eso que la medición anterior daba 91-100 % mientras el mapa mostraba
   * calles equivocadas.
   */
  async buildAll(): Promise<{ built: number; skipped: number }> {
    if (this.building) return { built: 0, skipped: 0 };
    this.building = true;

    let built = 0;
    let skipped = 0;

    try {
      // Primero lo publicado por las empresas, que es la fuente buena. Lo que
      // queda sin emparejar -y sólo eso- se reconstruye con el GPS.
      const matched = new Set<string>();
      try {
        for (const report of await this.officialRoutes.matchAll(this.lookbackHours)) {
          if (report.route) {
            matched.add(shapeKey(report.operator, report.lineCode, report.itineraryKey));
            built++;
          }
        }
      } catch (error: any) {
        this.logger.warn(
          `No se pudieron asignar los recorridos oficiales: ${error?.message ?? error}`,
        );
      }

      const itineraries = (await this.findItineraries()).filter(
        (itinerary) =>
          !matched.has(
            shapeKey(itinerary.operator, itinerary.line_code, itinerary.itinerary_key),
          ),
      );
      this.logger.log(
        `Reconstruyendo con GPS los ${itineraries.length} itinerarios sin recorrido publicado`,
      );

      for (const itinerary of itineraries) {
        try {
          const ok = await this.buildItinerary(itinerary);
          if (ok) built++;
          else skipped++;
        } catch (error: any) {
          skipped++;
          this.logger.warn(
            `Línea ${itinerary.line_code} "${itinerary.itinerary_name}" ` +
              `(${itinerary.operator}): ${error?.message ?? error}`,
          );
        }
      }

      await this.loadShapes();
      this.logger.log(`Recorridos reconstruidos: ${built} | descartados: ${skipped}`);
    } finally {
      this.building = false;
    }

    await this.notifyRebuilt('reconstruccion');

    return { built, skipped };
  }

  /**
   * Los recorridos distintos que hace cada línea.
   *
   * Se agrupa por `itinerary` (el `tra` del feed) cuando está, y si no por el
   * destino publicado. El destino es lo que permite reconstruir con las
   * posiciones que ya están guardadas, sin esperar a que se acumulen nuevas:
   * `line_name` se venía guardando desde el principio.
   */
  private async findItineraries(): Promise<Itinerary[]> {
    return await this.dataSource.query(
      `
      SELECT operator,
             line_code,
             upper(btrim(line_name)) AS itinerary_key,
             max(line_name)                 AS itinerary_name,
             max(itinerary)                 AS itinerary
      FROM vehicle_positions
      WHERE line_code IS NOT NULL
        AND operator IS NOT NULL
        AND btrim(coalesce(line_name, '')) <> ''
        AND COALESCE(fix_time, recorded_at) > now() - ($1 || ' hours')::interval
      GROUP BY operator, line_code, itinerary_key
      ORDER BY line_code, itinerary_key
    `,
      [this.lookbackHours],
    );
  }

  /** Los viajes de un itinerario, del que más posiciones tiene al que menos. */
  private async findTrips(itinerary: Itinerary): Promise<Trip[]> {
    const rows = await this.dataSource.query(
      `
      SELECT vehicle_id,
             departure_time,
             array_agg(longitude::float8 ORDER BY at) AS lngs,
             array_agg(latitude::float8  ORDER BY at) AS lats
      FROM (
        SELECT vehicle_id, departure_time, longitude, latitude,
               COALESCE(fix_time, recorded_at) AS at
        FROM vehicle_positions
        WHERE operator = $1
          AND line_code = $2
          AND upper(btrim(line_name)) = $3
          AND COALESCE(fix_time, recorded_at) > now() - ($4 || ' hours')::interval
      ) t
      GROUP BY vehicle_id, departure_time
      HAVING count(*) >= $5
      ORDER BY count(*) DESC
      LIMIT $6
    `,
      [
        itinerary.operator,
        itinerary.line_code,
        itinerary.itinerary_key,
        this.lookbackHours,
        MIN_TRIP_POINTS,
        VALIDATION_TRIPS,
      ],
    );

    return rows.map((row: any) => ({
      vehicle_id: row.vehicle_id,
      departure_time: row.departure_time,
      points: row.lngs.map((lng: number, i: number) => [lng, row.lats[i]] as LngLat),
    }));
  }

  private async buildItinerary(itinerary: Itinerary): Promise<boolean> {
    const trips = await this.findTrips(itinerary);
    if (trips.length === 0) return false;

    const etiqueta =
      `Línea ${itinerary.line_code} ` +
      `"${itinerary.itinerary_name ?? itinerary.itinerary_key}" (${itinerary.operator})`;

    let best: {
      geometry: LngLat[];
      distanceM: number;
      fidelity: number;
      support: number;
      trip: Trip;
    } | null = null;

    for (const trip of trips.slice(0, CANDIDATE_TRIPS)) {
      const runs = splitOnGaps(trip.points, MAX_TRACE_GAP_M);
      const run = runs.reduce((longest, current) =>
        current.length > longest.length ? current : longest,
      );
      if (run.length < MIN_TRIP_POINTS) continue;

      const trace = samplePoints(run, MAX_TRACE_WAYPOINTS);
      const matched = await this.buildGeometryFromTrace(trace);
      if (!matched) continue;

      // El corredor se arma con **los otros** viajes, no con el propio: un
      // trazo construido siguiendo un viaje siempre le da encima, así que
      // medirlo contra él no prueba nada. Cuando el itinerario tiene un solo
      // viaje no queda otra que usarlo, y ahí `trips_total` lo deja anotado.
      const otros = trips.filter((other) => other !== trip);
      const referencia = (otros.length > 0 ? otros : [trip]).flatMap((other) =>
        densifyPolyline(other.points, CORRIDOR_SPACING_M),
      );

      const fidelity = shapeFidelity(
        matched.geometry,
        new PointCloud(referencia),
        VALIDATION_TOLERANCE_M,
      );

      // El respaldo se guarda como diagnóstico, no como filtro. Mide qué
      // proporción de las posiciones de los otros viajes cae sobre el trazo, y
      // baja tanto cuando el trazo va por donde no debe como cuando es
      // correcto pero cubre menos recorrido que el viaje con el que se lo
      // compara -la línea 8 da 93 % de fidelidad con 15 % de respaldo, y está
      // bien dibujada-. Filtrar por esto tiraría recorridos correctos.
      const support =
        otros.length > 0
          ? shapeSupport(
              matched.geometry,
              samplePoints(
                otros.flatMap((other) => other.points),
                600,
              ),
              VALIDATION_TOLERANCE_M,
            )
          : fidelity;

      if (fidelity > (best?.fidelity ?? -1)) {
        best = {
          geometry: matched.geometry,
          distanceM: matched.distanceM,
          fidelity,
          support,
          trip,
        };
      }
    }

    if (!best) {
      this.logger.warn(`${etiqueta}: ningún viaje dio un recorrido ruteable`);
      return false;
    }

    if (best.fidelity < MIN_FIDELITY) {
      this.logger.warn(
        `${etiqueta}: descartado - fidelidad ${Math.round(best.fidelity * 100)}% ` +
          `(sobre ${trips.length} viaje${trips.length === 1 ? '' : 's'})`,
      );
      return false;
    }

    await this.dataSource.query(
      `
      INSERT INTO route_shapes (operator, line_code, itinerary_key, itinerary_name, itinerary,
                                direction, geometry, point_count, distance_m,
                                confidence, support, trips_used, trips_total,
                                source_vehicle_id, source_departure_time, source_points, built_at)
      VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now())
      ON CONFLICT (operator, line_code, itinerary_key)
      DO UPDATE SET itinerary_name        = EXCLUDED.itinerary_name,
                    itinerary             = EXCLUDED.itinerary,
                    geometry              = EXCLUDED.geometry,
                    point_count           = EXCLUDED.point_count,
                    distance_m            = EXCLUDED.distance_m,
                    confidence            = EXCLUDED.confidence,
                    support               = EXCLUDED.support,
                    trips_used            = EXCLUDED.trips_used,
                    trips_total           = EXCLUDED.trips_total,
                    source_vehicle_id     = EXCLUDED.source_vehicle_id,
                    source_departure_time = EXCLUDED.source_departure_time,
                    source_points         = EXCLUDED.source_points,
                    built_at              = now()
    `,
      [
        itinerary.operator,
        itinerary.line_code,
        itinerary.itinerary_key,
        itinerary.itinerary_name,
        itinerary.itinerary,
        JSON.stringify(best.geometry),
        best.geometry.length,
        Math.round(best.distanceM),
        best.fidelity,
        best.support,
        Math.min(CANDIDATE_TRIPS, trips.length),
        trips.length,
        best.trip.vehicle_id,
        best.trip.departure_time,
        best.trip.points.length,
      ],
    );

    this.logger.log(
      `${etiqueta}: ${Math.round(best.distanceM / 100) / 10} km, ` +
        `fidelidad ${Math.round(best.fidelity * 100)}%, ` +
        `respaldo ${Math.round(best.support * 100)}% (${trips.length} viajes)`,
    );

    return true;
  }

  /**
   * Convierte la traza cruda en una polilínea que sigue las calles.
   *
   * Por defecto se usa /route, que enlaza los puntos de la traza pasando por
   * la red vial: como los puntos vienen cada pocas decenas de metros, el
   * camino resultante es el que el ómnibus hizo de verdad, con sus curvas y
   * rotondas, y entra entero en un solo pedido.
   *
   * /match (map matching por modelo oculto de Markov) es más robusto al ruido
   * del GPS, pero el servidor público de OSRM lo limita a unas diez
   * coordenadas, insuficiente para un viaje. Con OSRM propio ese límite se
   * levanta: ahí conviene activar OSRM_USE_MATCH=true.
   */
  private async buildGeometryFromTrace(
    trace: LngLat[],
  ): Promise<{ geometry: LngLat[]; distanceM: number; confidence: number | null } | null> {
    const useMatch = this.configService.get('OSRM_USE_MATCH', 'false') === 'true';
    return useMatch ? await this.matchTrace(trace) : await this.routeThroughTrace(trace);
  }

  private async routeThroughTrace(
    trace: LngLat[],
  ): Promise<{ geometry: LngLat[]; distanceM: number; confidence: number | null } | null> {
    const coordinates = trace.map(([lng, lat]) => `${lng},${lat}`).join(';');
    const radiuses = trace.map(() => String(SNAP_RADIUS_M)).join(';');
    const url =
      `${this.osrmBaseUrl}/route/v1/driving/${coordinates}` +
      // continue_straight=false evita que invente vueltas en U cuando dos
      // puntos consecutivos enganchan en sentidos opuestos de la misma calle.
      `?geometries=geojson&overview=full&continue_straight=false&radiuses=${radiuses}`;

    const body = await this.callOsrm(url);
    if (!body || body.code !== 'Ok' || !body.routes?.length) return null;

    const route = body.routes[0];
    const geometry = route.geometry?.coordinates as LngLat[] | undefined;
    if (!geometry || geometry.length < 2) return null;

    // /route no reporta confianza; la calidad se juzga después comparando la
    // distancia cubierta contra la reconstrucción anterior.
    return { geometry, distanceM: route.distance ?? 0, confidence: null };
  }

  /** Map matching propiamente dicho. Requiere OSRM propio por el límite de puntos. */
  private async matchTrace(
    trace: LngLat[],
  ): Promise<{ geometry: LngLat[]; distanceM: number; confidence: number | null } | null> {
    const coordinates = trace.map(([lng, lat]) => `${lng},${lat}`).join(';');
    const radiuses = trace.map(() => String(SNAP_RADIUS_M)).join(';');
    const url =
      `${this.osrmBaseUrl}/match/v1/driving/${coordinates}` +
      `?geometries=geojson&overview=full&tidy=true&radiuses=${radiuses}`;

    const body = await this.callOsrm(url);
    if (!body || body.code !== 'Ok' || !body.matchings?.length) return null;

    // OSRM puede partir una traza en varios tramos si pierde el rastro entre
    // medio; se toma el más largo, que es el que representa el recorrido.
    const best = body.matchings.reduce((a: any, b: any) => (b.distance > a.distance ? b : a));
    const geometry = best.geometry?.coordinates as LngLat[] | undefined;
    if (!geometry || geometry.length < 2) return null;

    return {
      geometry,
      distanceM: best.distance ?? 0,
      confidence: best.confidence ?? null,
    };
  }

  private async callOsrm(url: string): Promise<any | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`OSRM HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}
