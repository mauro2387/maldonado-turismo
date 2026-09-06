import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { distanceMeters, LngLat, PolylineIndex } from './geo.util';
import { itineraryKey, RouteShapesService } from './route-shapes.service';

/**
 * Las paradas, puestas sobre el recorrido de la línea que las sirve.
 *
 * `StopCatalogService` deduce del feed **qué paradas existen** —el código y el
 * nombre los publica la empresa en cada posición— y estima dónde están con el
 * punto medio entre las dos posiciones entre las que el coche las cruzó. Eso
 * alcanza para tener catálogo, pero la coordenada queda gruesa: dos posiciones
 * separadas por 300 m de calle curva tienen su punto medio adentro de la
 * manzana. La mitad de las paradas quedaban con más de 147 m de dispersión, y
 * de ahí las paradas dibujadas en calles por las que no pasa el ómnibus.
 *
 * Acá se hace la misma cuenta pero **sobre el recorrido publicado**: se
 * proyectan las dos posiciones sobre el trazo y se promedian sus distancias
 * recorridas, que es promediar dos números en vez de dos puntos. La mediana de
 * todos los cruces devuelve una distancia, y esa distancia es un punto que
 * está sobre la calle por construcción.
 *
 * De paso queda lo otro que faltaba: **qué línea para en qué parada, y en qué
 * orden**. Antes se deducía por cercanía —parada a menos de 40 m del trazo—,
 * que en una avenida con cantero o en el centro reparte paradas equivocadas.
 * El feed lo dice sin ambigüedad: si un coche de la 12 informa que acaba de
 * pasar la 139, la 12 para en la 139.
 */

/** Un cruce: el coche pasó una parada entre estas dos posiciones. */
interface Crossing {
  code: string;
  name: string;
  operator: string;
  lineCode: string;
  itineraryKey: string;
  from: LngLat;
  to: LngLat;
}

/**
 * Lo medido para una parada dentro de un recorrido.
 *
 * Cada cruce no da un punto sino un **intervalo**: el coche informó la parada
 * anterior W estando en la posición A y la parada X estando en B, así que la
 * parada X está en algún lugar del recorrido entre A y B. Se guardan los dos
 * extremos y no su punto medio porque los intervalos se pueden cruzar entre
 * sí, y ahí está la precisión: ver `estimate`.
 */
export interface Placement {
  operator: string;
  lineCode: string;
  itineraryKey: string;
  intervals: Array<[number, number]>;
  /** Ómnibus vistos detenidos en esta parada, proyectados sobre el trazo. */
  halts: Halt[];
}

/**
 * Un ómnibus detenido, ya proyectado sobre el recorrido.
 *
 * `sinceChange` es cuántas muestras pasaron desde que el coche registró esta
 * parada: 1 es la muestra del cambio, 2 y 3 todavía pueden caer dentro de la
 * detención.
 */
export interface Halt {
  alongMeters: number;
  speedKmh: number;
  sinceChange: number;
}

/**
 * Una parada relevada en OpenStreetMap. Es la única fuente independiente que
 * hay para contrastar, y la única que viene de alguien que estuvo ahí.
 */
interface OsmStop {
  osmId: number;
  lat: number;
  lng: number;
  shelter: boolean | null;
  bench: boolean | null;
}

/** De dónde salió la coordenada de una parada, de más a menos firme. */
export type FixSource = 'manual' | 'osm' | 'detenciones' | 'intervalo';

/** Un nodo de OSM que podría ser esta parada, y a cuánto quedó de lo medido. */
interface OsmClaim {
  stop: OsmStop;
  distanceMeters: number;
}

/** Lo medido para una parada, más el nodo de OSM que reclama, si hay. */
interface Candidate {
  medido: Fix;
  osm: OsmClaim | null;
}

/** La coordenada elegida para una parada, con su procedencia y su error. */
interface Fix {
  lng: number;
  lat: number;
  source: FixSource;
  /** Radio en metros dentro del cual está la parada de verdad. */
  accuracyMeters: number;
  /** Cuánta calle queda sin descartar: precisión interna, no exactitud. */
  spreadMeters: number;
  samples: number;
  osmNodeId: number | null;
}

/**
 * Cuán lejos del trazo puede caer una posición y seguir sirviendo para ubicar
 * la parada. Más que esto y el coche estaba desviado, o el trazo no cubre esa
 * zona: en los dos casos su proyección no dice dónde está la parada.
 */
const MAX_OFFSET_M = 60;

/**
 * Salto máximo entre las dos posiciones, medido sobre el recorrido. El feed
 * publica cada 30 s: a velocidad de calle son 300 m y en ruta hasta 700. Por
 * arriba de 900 faltan posiciones en el medio y el punto medio ya no ubica
 * nada.
 */
const MAX_STEP_M = 900;

/** Cruces mínimos para fijar la posición de una parada. */
const MIN_SAMPLES = 2;

/**
 * Detenciones mínimas para preferir el estimador de detenciones al de
 * intervalos. Con dos, un coche que frenó dos veces en el mismo semáforo
 * mueve la parada a la esquina de al lado; con tres ya hay una mediana.
 */
const MIN_HALTS = 3;

/**
 * Cuánto se afloja el filtro de velocidad cuando no hay detenciones francas.
 *
 * Se prueba en este orden y se corta en la primera pasada que junte
 * `MIN_HALTS`: conviene un coche a 5 km/h que tres a 12. Los tres cortes están
 * medidos contra OpenStreetMap el 2026-09-04 y todos ganan por lejos al
 * estimador de intervalos.
 */
const HALT_PASSES: Array<{ speedKmh: number; sinceChange: number }> = [
  { speedKmh: 5, sinceChange: 2 },
  { speedKmh: 8, sinceChange: 3 },
  { speedKmh: 12, sinceChange: 4 },
];

/**
 * Cuánto se sale de la ventana del intervalo para aceptar una detención.
 *
 * La ventana dice dónde **puede** estar la parada; las detenciones dicen dónde
 * **frena** el ómnibus. Cruzarlas es lo que separa la parada del semáforo de
 * la otra cuadra: sin este filtro el error mediano es de 33 m, con él baja a
 * 15 m y el p90 pasa de 273 m a 128 m.
 */
const HALT_WINDOW_MARGIN_M = 100;

/**
 * El coche se detiene **en** la parada y después avanza: la nube de
 * detenciones está sesgada hacia adelante. Tomar el cuantil bajo en vez de la
 * mediana saca ese sesgo. Medido: la mediana deja +6 m de sesgo, el cuantil
 * 0,15 lo deja en 0 y además mejora el p90 (de 122 m a 88 m).
 */
const HALT_QUANTILE = 0.15;

/**
 * Cuánto puede alejarse un nodo de OpenStreetMap de lo que midió el feed para
 * seguir siendo la misma parada.
 *
 * Coincidiendo, el nodo gana: está sobre la vereda y no sobre el eje de la
 * calle, y lo puso alguien que estuvo ahí. Discrepando, gana lo medido: OSM
 * también se equivoca, y un nodo suelto no alcanza para contradecir a veinte
 * ómnibus que frenaron en el mismo lugar.
 */
const OSM_AGREEMENT_M = 60;

/** Cuán lejos del trazo puede estar un nodo de OSM para ser de esta línea. */
const OSM_MAX_OFFSET_M = 35;

/**
 * Hasta qué error se puede decir "esperá **acá**" en vez de "por acá cerca".
 *
 * Una cuadra de Maldonado son 80-100 m, así que con 60 m de error la parada
 * está a lo sumo en la esquina de al lado y se la ve desde donde uno llega. Por
 * arriba de eso el marcador puede caer en otra cuadra, y ahí la app tiene que
 * decir que la ubicación es aproximada en vez de fingir precisión: mandar a
 * alguien a una esquina equivocada con toda seguridad es peor que avisarle que
 * mire alrededor.
 */
export const PRECISE_ENOUGH_M = 60;

/**
 * Cruces mínimos para afirmar que un recorrido para en una parada.
 *
 * Con uno solo puede ser un coche que se desvió, o el cartel mal puesto en un
 * viaje. Con dos ya son dos viajes distintos diciendo lo mismo.
 */
const MIN_SAMPLES_FOR_ROUTE = 2;

/**
 * Los cruces del feed, con el itinerario que los reportó.
 *
 * Es la misma detección que usa StopCatalogService -el campo "parada anterior"
 * cambia de W a X entre dos posiciones consecutivas del mismo coche- con dos
 * agregados: se conservan las dos posiciones (no su punto medio) para poder
 * proyectarlas, y se exige que el cartel del coche no haya cambiado entre las
 * dos, porque si cambió no se sabe a cuál de los dos recorridos atribuir el
 * cruce.
 */
const CROSSINGS_SQL = `
WITH ordenadas AS (
  SELECT operator,
         line_code,
         line_name,
         recorded_at,
         latitude,
         longitude,
         prev_stop_code,
         prev_stop_name,
         LAG(latitude)       OVER w AS lat_anterior,
         LAG(longitude)      OVER w AS lng_anterior,
         LAG(prev_stop_code) OVER w AS codigo_anterior,
         LAG(line_name)      OVER w AS cartel_anterior,
         LAG(recorded_at)    OVER w AS momento_anterior
  FROM vehicle_positions
  WHERE prev_stop_code IS NOT NULL
    AND btrim(coalesce(prev_stop_name, '')) <> ''
    AND line_code IS NOT NULL
    AND btrim(coalesce(line_name, '')) <> ''
  WINDOW w AS (PARTITION BY operator, vehicle_id ORDER BY recorded_at)
)
SELECT operator,
       line_code,
       upper(btrim(line_name))                                        AS itinerary_key,
       btrim(prev_stop_code)                                          AS code,
       upper(btrim(regexp_replace(prev_stop_name, '\\s+', ' ', 'g'))) AS name,
       lat_anterior::float8 AS lat_from,
       lng_anterior::float8 AS lng_from,
       latitude::float8     AS lat_to,
       longitude::float8    AS lng_to
FROM ordenadas
WHERE codigo_anterior IS NOT NULL
  AND codigo_anterior <> prev_stop_code
  AND line_name = cartel_anterior
  AND recorded_at - momento_anterior <= interval '45 seconds'
`;

export interface PlacementResult {
  /** Paradas cuya coordenada quedó apoyada sobre el recorrido. */
  colocadas: number;
  /** Paradas que ningún recorrido publicado explica: quedan como estaban. */
  sinRecorrido: number;
  /** Filas de "esta línea para acá", con su orden. */
  paradasDeRecorrido: number;
  recorridos: number;
  /** Cuántas salieron de cada fuente, que es lo que dice si mejoró o no. */
  porFuente: Record<FixSource, number>;
  /** Paradas con precisión suficiente para nombrar la esquina. */
  precisas: number;
}

@Injectable()
export class StopPlacementService {
  private readonly logger = new Logger(StopPlacementService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly routeShapes: RouteShapesService,
  ) {}

  /**
   * Recalcula la posición de las paradas del feed y el orden de paradas de
   * cada recorrido. Idempotente: se puede correr cuantas veces se quiera y
   * mejora a medida que se acumulan viajes.
   */
  async place(): Promise<PlacementResult> {
    const shapes = this.routeShapes.getShapes();
    if (shapes.length === 0) {
      this.logger.warn('Todavía no hay recorridos: no hay sobre qué apoyar las paradas');
      return {
        colocadas: 0,
        sinRecorrido: 0,
        paradasDeRecorrido: 0,
        recorridos: 0,
        porFuente: { manual: 0, osm: 0, detenciones: 0, intervalo: 0 },
        precisas: 0,
      };
    }

    // Un índice por recorrido, que se reutiliza para todos los cruces.
    const indexes = new Map<string, PolylineIndex>();
    for (const shape of shapes) {
      if (!shape.geometry || shape.geometry.length < 2) continue;
      indexes.set(
        key(shape.operator, shape.lineCode, shape.itineraryKey),
        new PolylineIndex(shape.geometry),
      );
    }

    const crossings: Crossing[] = (await this.dataSource.query(CROSSINGS_SQL)).map((row: any) => ({
      code: row.code,
      name: row.name,
      operator: row.operator,
      lineCode: row.line_code,
      itineraryKey: itineraryKey(row.itinerary_key),
      from: [row.lng_from, row.lat_from] as LngLat,
      to: [row.lng_to, row.lat_to] as LngLat,
    }));

    // Cada parada, con las distancias sobre el trazo en las que la cruzaron,
    // separadas por recorrido.
    const byStop = new Map<string, Map<string, Placement>>();

    for (const crossing of crossings) {
      const index = indexes.get(key(crossing.operator, crossing.lineCode, crossing.itineraryKey));
      if (!index) continue;

      const from = index.locate(crossing.from[1], crossing.from[0]);
      const to = index.locate(crossing.to[1], crossing.to[0]);
      if (!from || !to) continue;
      if (from.offsetMeters > MAX_OFFSET_M || to.offsetMeters > MAX_OFFSET_M) continue;

      const step = to.alongMeters - from.alongMeters;
      // Hacia atrás es el coche empezando otra vuelta, o una proyección que
      // enganchó el tramo equivocado en una calle que el recorrido pisa dos
      // veces. Un salto muy grande es que faltan posiciones en el medio.
      if (step < 0 || step > MAX_STEP_M) continue;

      const stopKey = `${crossing.code}|${crossing.name}`;
      const routeKey = key(crossing.operator, crossing.lineCode, crossing.itineraryKey);

      let routes = byStop.get(stopKey);
      if (!routes) byStop.set(stopKey, (routes = new Map()));

      let placement = routes.get(routeKey);
      if (!placement) {
        routes.set(
          routeKey,
          (placement = {
            operator: crossing.operator,
            lineCode: crossing.lineCode,
            itineraryKey: crossing.itineraryKey,
            intervals: [],
            halts: [],
          }),
        );
      }

      placement.intervals.push([from.alongMeters, to.alongMeters]);
    }

    await this.loadHalts(byStop, indexes);

    return await this.save(byStop, indexes, await this.loadOsmStops());
  }

  /**
   * Los ómnibus vistos detenidos, proyectados sobre el recorrido que hacían.
   *
   * Se proyectan acá y no al guardarlos porque la proyección depende del
   * trazo, y el trazo cambia cuando la empresa republica un recorrido: la
   * tabla guarda la observación cruda -dónde estaba el coche- y la distancia
   * sobre el trazo se recalcula en cada colocación.
   *
   * Sólo se cargan detenciones de paradas que ya tienen cruces: sin cruces no
   * hay ventana contra la cual filtrarlas, y una detención suelta puede ser un
   * semáforo.
   */
  private async loadHalts(
    byStop: Map<string, Map<string, Placement>>,
    indexes: Map<string, PolylineIndex>,
  ): Promise<void> {
    const rows: any[] = await this.dataSource.query(
      `SELECT code, name, operator, line_code, itinerary_key,
              latitude::float8 AS lat, longitude::float8 AS lng,
              speed_kmh::float8 AS speed, since_change
         FROM stop_observations`,
    );

    let usadas = 0;

    for (const row of rows) {
      const routes = byStop.get(`${row.code}|${row.name}`);
      if (!routes) continue;

      const routeKey = key(row.operator, row.line_code, itineraryKey(row.itinerary_key ?? ''));
      const placement = routes.get(routeKey);
      if (!placement) continue;

      const located = indexes.get(routeKey)?.locate(row.lat, row.lng);
      if (!located || located.offsetMeters > MAX_OFFSET_M) continue;

      placement.halts.push({
        alongMeters: located.alongMeters,
        speedKmh: row.speed,
        sinceChange: row.since_change,
      });
      usadas++;
    }

    this.logger.log(
      `Detenciones: ${usadas} de ${rows.length} caen sobre el recorrido que las reportó`,
    );
  }

  /** Las paradas relevadas en OpenStreetMap, si alguien corrió el importador. */
  private async loadOsmStops(): Promise<OsmStop[]> {
    const existe = await this.dataSource.query(
      `SELECT to_regclass('public.osm_bus_stops') IS NOT NULL AS hay`,
    );
    if (!existe?.[0]?.hay) return [];

    const rows: any[] = await this.dataSource.query(
      `SELECT osm_id, latitude::float8 AS lat, longitude::float8 AS lng, shelter, bench
         FROM osm_bus_stops`,
    );

    return rows.map((row) => ({
      osmId: Number(row.osm_id),
      lat: row.lat,
      lng: row.lng,
      shelter: row.shelter,
      bench: row.bench,
    }));
  }

  private async save(
    byStop: Map<string, Map<string, Placement>>,
    indexes: Map<string, PolylineIndex>,
    osmStops: OsmStop[],
  ): Promise<PlacementResult> {
    // Los ids internos de las paradas del feed, por código y nombre. Se traen
    // también las corregidas a mano para no pisarlas.
    const rows = await this.dataSource.query(
      `SELECT id, code, name, fix_source FROM bus_stops WHERE source IN ('avl', 'manual')`,
    );
    const ids = new Map<string, { id: number; fixSource: string | null }>(
      rows.map((row: any) => [
        `${row.code}|${row.name}`,
        { id: Number(row.id), fixSource: row.fix_source },
      ]),
    );

    let sinRecorrido = 0;
    const candidatos: Array<{ id: number; medido: Fix; osm: OsmClaim | null; name: string }> = [];
    const stopsByRoute = new Map<string, Array<{ stopId: number; along: number; samples: number }>>();

    for (const [stopKey, routes] of byStop) {
      const stop = ids.get(stopKey);
      if (!stop) continue;
      const stopId = stop.id;

      // Una parada corregida a mano no se vuelve a mover. Es la única fuente
      // que puede contradecir a la medición, y existe justamente para eso.
      if (stop.fixSource === 'manual') {
        for (const placement of routes.values()) {
          if (placement.intervals.length < MIN_SAMPLES_FOR_ROUTE) continue;
          const routeKey = key(placement.operator, placement.lineCode, placement.itineraryKey);
          const list = stopsByRoute.get(routeKey) ?? [];
          list.push({
            stopId,
            along: estimate(placement.intervals).alongMeters,
            samples: placement.intervals.length,
          });
          stopsByRoute.set(routeKey, list);
        }
        continue;
      }

      const candidate = this.bestFix(routes, indexes, osmStops);
      if (candidate) {
        candidatos.push({ id: stopId, name: stopKey.split('|')[1] ?? '', ...candidate });
      } else {
        sinRecorrido++;
      }

      for (const placement of routes.values()) {
        if (placement.intervals.length < MIN_SAMPLES_FOR_ROUTE) continue;

        const routeKey = key(placement.operator, placement.lineCode, placement.itineraryKey);
        const list = stopsByRoute.get(routeKey) ?? [];
        list.push({
          stopId,
          along: estimate(placement.intervals).alongMeters,
          samples: placement.intervals.length,
        });
        stopsByRoute.set(routeKey, list);
      }
    }

    const moved = this.resolveOsmClaims(candidatos);

    // Las escrituras van en bloque. Son mil paradas y varios miles de filas de
    // orden: de a una, contra una base remota, la reconstrucción tardaría
    // minutos por el ida y vuelta, no por el trabajo.
    await this.updateStops(moved);

    const rowsToInsert: Array<[string, string, string, number, number, number, number]> = [];
    for (const [routeKey, stops] of stopsByRoute) {
      const [operator, lineCode, itinerary] = routeKey.split('|');
      stops.sort((a, b) => a.along - b.along);

      for (const [position, stop] of stops.entries()) {
        rowsToInsert.push([
          operator,
          lineCode,
          itinerary,
          stop.stopId,
          stop.along,
          position + 1,
          stop.samples,
        ]);
      }
    }

    // Se reemplaza entero y no se hace upsert: una parada que dejó de
    // aparecer en el feed de un recorrido tiene que desaparecer del orden,
    // porque si no el planificador la sigue ofreciendo.
    await this.dataSource.query('TRUNCATE itinerary_stops');
    await this.insertItineraryStops(rowsToInsert);

    const colocadas = moved.length;
    const paradasDeRecorrido = rowsToInsert.length;

    const porFuente: Record<FixSource, number> = {
      manual: 0,
      osm: 0,
      detenciones: 0,
      intervalo: 0,
    };
    for (const stop of moved) porFuente[stop.source]++;
    const precisas = moved.filter((stop) => stop.accuracyMeters <= PRECISE_ENOUGH_M).length;

    this.logger.log(
      `Paradas colocadas: ${colocadas} ` +
        `(OSM ${porFuente.osm}, detenciones ${porFuente.detenciones}, ` +
        `intervalo ${porFuente.intervalo}) | ` +
        `${precisas} con la esquina nombrable (±${PRECISE_ENOUGH_M} m) | ` +
        `${sinRecorrido} sin cruces suficientes | ` +
        `${paradasDeRecorrido} paradas asignadas a ${stopsByRoute.size} recorridos`,
    );

    return {
      colocadas,
      sinRecorrido,
      paradasDeRecorrido,
      recorridos: stopsByRoute.size,
      porFuente,
      precisas,
    };
  }

  /**
   * La mejor coordenada entre todos los recorridos que paran acá.
   *
   * Una parada la sirven varios itinerarios, y cada uno la vio distinto: el que
   * más veces la cruzó no es necesariamente aquel en el que algún coche se
   * detuvo. Antes se elegía el recorrido con más cruces y recién ahí se
   * estimaba, con lo cual **se tiraba evidencia**: 85 paradas tenían tres o más
   * ómnibus detenidos y terminaban ubicadas por el intervalo, que es cuatro
   * veces peor.
   *
   * Ahora se estima contra cada recorrido y se ordena por lo que importa: una
   * fuente firme antes que muchas muestras de una floja.
   */
  private bestFix(
    routes: Map<string, Placement>,
    indexes: Map<string, PolylineIndex>,
    osmStops: OsmStop[],
  ): Candidate | null {
    const candidatos: Candidate[] = [];

    for (const placement of routes.values()) {
      if (placement.intervals.length < MIN_SAMPLES) continue;
      const index = indexes.get(key(placement.operator, placement.lineCode, placement.itineraryKey));
      if (!index) continue;
      const fix = this.fix(placement, index, osmStops);
      if (fix) candidatos.push(fix);
    }

    if (candidatos.length === 0) return null;

    // Un nodo de OSM vale más que cualquier medición, y entre mediciones gana
    // la de detenciones sobre la de intervalos. A igual fuente, la más
    // ajustada, y a igual ajuste la que tiene más muestras detrás.
    const rango: Record<FixSource, number> = { manual: 0, osm: 1, detenciones: 2, intervalo: 3 };
    candidatos.sort((a, b) => {
      const pesoA = a.osm ? 1 : rango[a.medido.source];
      const pesoB = b.osm ? 1 : rango[b.medido.source];
      if (pesoA !== pesoB) return pesoA - pesoB;
      if (a.medido.accuracyMeters !== b.medido.accuracyMeters) {
        return a.medido.accuracyMeters - b.medido.accuracyMeters;
      }
      return b.medido.samples - a.medido.samples;
    });

    return candidatos[0];
  }

  /**
   * Dónde queda esta parada, y con qué error se lo puede afirmar.
   *
   * Tres fuentes, de más a menos firme, y la de arriba gana:
   *
   * 1. **El nodo relevado en OpenStreetMap**, si hay uno sobre este recorrido
   *    que coincide con lo medido. Está sobre la vereda y lo puso una persona.
   * 2. **Las detenciones**: dónde frenan los ómnibus dentro de la ventana en
   *    la que sabemos que está la parada. Error mediano medido: 15 m.
   * 3. **El intervalo** entre las dos posiciones que la cruzaron, que es lo
   *    que había antes. Error mediano medido: 57 m.
   *
   * La segunda no reemplaza a la tercera: la usa. La ventana del intervalo es
   * lo que distingue la parada del semáforo de la otra cuadra.
   */
  private fix(placement: Placement, index: PolylineIndex, osmStops: OsmStop[]): Candidate | null {
    const sobreElTrazo = estimateAlong(placement);
    const point = pointAt(index, sobreElTrazo.alongMeters);
    if (!point) return null;

    // El nodo de OSM, si hay uno solo sobre este recorrido cerca de lo medido.
    // Se pide que esté sobre el trazo -si no, es la parada de la vereda de
    // enfrente, que es otra parada con otro código- y que no haya un segundo
    // candidato, porque con dos no se sabe cuál es.
    const candidatos = osmStops.filter((osm) => {
      if (distanceMeters(point[1], point[0], osm.lat, osm.lng) > OSM_AGREEMENT_M) return false;
      const located = index.locate(osm.lat, osm.lng);
      return located != null && located.offsetMeters <= OSM_MAX_OFFSET_M;
    });

    const medido: Fix = {
      lng: point[0],
      lat: point[1],
      source: sobreElTrazo.source,
      accuracyMeters: sobreElTrazo.accuracyMeters,
      spreadMeters: Math.round(sobreElTrazo.spreadMeters),
      samples: sobreElTrazo.samples,
      osmNodeId: null,
    };

    if (candidatos.length !== 1) return { medido, osm: null };

    return {
      medido,
      osm: {
        stop: candidatos[0],
        distanceMeters: distanceMeters(point[1], point[0], candidatos[0].lat, candidatos[0].lng),
      },
    };
  }

  /**
   * Un nodo de OpenStreetMap es **una** parada, no dos.
   *
   * Cada parada busca su nodo por separado, así que dos paradas vecinas pueden
   * quedarse con el mismo y terminar dibujadas una encima de la otra. Pasaba de
   * verdad: "R BERGALLI" y "DODERA", que son dos esquinas distintas, quedaron
   * en la misma coordenada.
   *
   * El nodo se lo lleva la parada que lo tenía más cerca de su propia
   * medición. Las demás se quedan con la suya.
   *
   * **Ni siquiera cuando comparten el nombre**, que fue la primera idea: la
   * misma parada suele estar numerada distinto por cada empresa ("TNAL
   * MALDONADO" es la 40 y la 1093) y ahí compartir el nodo sería correcto. El
   * problema es que las dos veredas de una calle **también** llevan el mismo
   * nombre y códigos distintos —se nombran por la calle que cruza— y con estos
   * datos no se pueden separar de las anteriores: las dos veredas están a diez
   * o veinte metros, que es menos que el error de la medición.
   *
   * Ante la duda, cada parada se queda con lo suyo. La posición medida sale de
   * ómnibus detenidos, y un ómnibus detenido está en **su** mano de la calle,
   * así que la parada cae del lado correcto. Apilarlas sobre un solo nodo
   * ahorra unos metros de error y a cambio manda a alguien a esperar en la
   * vereda de enfrente, que es peor.
   */
  private resolveOsmClaims(
    fixes: Array<{ id: number; medido: Fix; osm: OsmClaim | null; name: string }>,
  ): Array<Fix & { id: number }> {
    const porNodo = new Map<number, typeof fixes>();
    for (const entry of fixes) {
      if (!entry.osm) continue;
      const lista = porNodo.get(entry.osm.stop.osmId) ?? [];
      lista.push(entry);
      porNodo.set(entry.osm.stop.osmId, lista);
    }

    const ganadores = new Set<number>();
    for (const disputa of porNodo.values()) {
      disputa.sort((a, b) => a.osm!.distanceMeters - b.osm!.distanceMeters);
      ganadores.add(disputa[0].id);
    }

    return fixes.map((entry) => {
      if (!entry.osm || !ganadores.has(entry.id)) return { id: entry.id, ...entry.medido };

      return {
        id: entry.id,
        lng: entry.osm.stop.lng,
        lat: entry.osm.stop.lat,
        source: 'osm' as const,
        // No se puede medir el error de una fuente contra sí misma. 25 m es lo
        // que declara OSM como típico de un nodo relevado con GPS de mano, y es
        // coherente con la mediana de 7 m que dan estos nodos contra el eje del
        // trazo dibujado por la empresa.
        accuracyMeters: 25,
        spreadMeters: entry.medido.spreadMeters,
        samples: entry.medido.samples,
        osmNodeId: entry.osm.stop.osmId,
      };
    });
  }

  /** Las coordenadas nuevas, de a tandas y en una sola sentencia por tanda. */
  private async updateStops(stops: Array<Fix & { id: number }>): Promise<void> {
    for (const batch of chunks(stops, 200)) {
      const values = batch
        .map((_, index) => {
          const base = index * 8;
          return (
            `($${base + 1}::int, $${base + 2}::numeric, $${base + 3}::numeric, ` +
            `$${base + 4}::int, $${base + 5}::int, $${base + 6}::varchar, ` +
            `$${base + 7}::int, $${base + 8}::bigint)`
          );
        })
        .join(', ');

      await this.dataSource.query(
        `UPDATE bus_stops AS parada
            SET lat = nueva.lat, lng = nueva.lng,
                samples = nueva.samples, spread_m = nueva.spread_m,
                fix_source = nueva.fix_source, accuracy_m = nueva.accuracy_m,
                osm_node_id = nueva.osm_node_id,
                placement = 'recorrido', fixed_at = now(),
                avl_updated_at = now(), updated_at = now()
           FROM (VALUES ${values})
             AS nueva(id, lat, lng, samples, spread_m, fix_source, accuracy_m, osm_node_id)
          WHERE parada.id = nueva.id AND parada.source = 'avl'`,
        batch.flatMap((stop) => [
          stop.id,
          stop.lat,
          stop.lng,
          stop.samples,
          stop.spreadMeters,
          stop.source,
          stop.accuracyMeters,
          stop.osmNodeId,
        ]),
      );
    }
  }

  private async insertItineraryStops(
    rows: Array<[string, string, string, number, number, number, number]>,
  ): Promise<void> {
    for (const batch of chunks(rows, 200)) {
      const values = batch
        .map((_, index) => {
          const base = index * 7;
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::int, ` +
            `$${base + 5}::float8, $${base + 6}::int, $${base + 7}::int, now())`;
        })
        .join(', ');

      await this.dataSource.query(
        `INSERT INTO itinerary_stops
           (operator, line_code, itinerary_key, stop_id, along_m, sequence, samples, updated_at)
         VALUES ${values}`,
        batch.flat(),
      );
    }
  }
}

function chunks<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function key(operator: string, lineCode: string, itinerary: string): string {
  return `${operator}|${lineCode}|${itinerary}`;
}

/** Cuantil sobre una lista ya ordenada. */
function quantile(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * q)))];
}

/**
 * Dónde está la parada sobre el recorrido, a partir de los intervalos en los
 * que se la cruzó.
 *
 * Cada cruce dice "la parada está entre el metro A y el metro B". La parada
 * está en **todos** los intervalos a la vez, así que lo que hay que hacer no
 * es promediarlos sino cruzarlos: el borde de abajo es el mayor de los A y el
 * de arriba el menor de los B. Con diez cruces de 300 m cada uno, la
 * intersección suele quedar en menos de 100.
 *
 * Se usan cuantiles y no el máximo y el mínimo para que un cruce mal medido
 * -una posición que enganchó el tramo equivocado, un coche que se saltó una
 * parada- no vacíe la intersección. Y si aun así queda vacía, se vuelve a la
 * mediana de los puntos medios, que es el estimador que siempre existe.
 */
function estimate(intervals: Array<[number, number]>): {
  alongMeters: number;
  spreadMeters: number;
} {
  const starts = intervals.map(([from]) => from).sort((a, b) => a - b);
  const ends = intervals.map(([, to]) => to).sort((a, b) => a - b);

  const low = quantile(starts, 0.8);
  const high = quantile(ends, 0.2);

  if (low <= high) {
    return { alongMeters: (low + high) / 2, spreadMeters: high - low };
  }

  const middles = intervals.map(([from, to]) => (from + to) / 2).sort((a, b) => a - b);
  return {
    alongMeters: quantile(middles, 0.5),
    spreadMeters: quantile(middles, 0.9) - quantile(middles, 0.1),
  };
}

/**
 * **El estimador, entero, sin geometría y sin base.**
 *
 * Decide en qué metro del recorrido está la parada y con qué error se lo puede
 * afirmar. Todo lo demás -convertir ese metro en un punto, buscar el nodo de
 * OpenStreetMap, escribir la fila- es plomería alrededor.
 *
 * Está separado a propósito: es la única parte que se puede equivocar de un
 * modo que no se vea, porque un error acá no rompe nada, sólo mueve paradas
 * unas cuadras. Por eso se prueba contra una foto congelada en
 * `stop-placement.service.spec.ts`, con el error medido contra los nodos
 * relevados de OSM. Si alguien toca un umbral y el error sube, el test falla.
 */
export function estimateAlong(placement: Placement): {
  alongMeters: number;
  spreadMeters: number;
  samples: number;
  source: FixSource;
  accuracyMeters: number;
} {
  const interval = estimate(placement.intervals);
  const halt = haltEstimate(placement, interval);

  const chosen = halt ?? {
    alongMeters: interval.alongMeters,
    spreadMeters: interval.spreadMeters,
    samples: placement.intervals.length,
  };
  const source: FixSource = halt ? 'detenciones' : 'intervalo';

  // Los dos estimadores son independientes: uno mira dónde **puede** estar la
  // parada y el otro dónde **frenan** los ómnibus. Cuando dan lo mismo, la
  // respuesta es firme; cuando se contradicen por doscientos metros, alguno de
  // los dos está mal y todavía no sabemos cuál, así que el error no puede
  // declararse menor que la propia contradicción. Medido: con más de 150 m de
  // desacuerdo, dos de cada tres paradas quedan a más de 100 m de la real.
  const disagreement = halt ? Math.abs(halt.alongMeters - interval.alongMeters) : 0;

  return {
    alongMeters: chosen.alongMeters,
    spreadMeters: chosen.spreadMeters,
    samples: chosen.samples,
    source,
    accuracyMeters: Math.min(
      300,
      Math.max(declaredAccuracy(source, chosen.spreadMeters), Math.round(0.8 * disagreement)),
    ),
  };
}

/**
 * Dónde frenan los ómnibus dentro de la ventana en la que está la parada.
 *
 * Se prueban los tres cortes de velocidad en orden y se corta en el primero
 * que junte `MIN_HALTS`: conviene una detención franca a tres frenadas. La
 * ventana sale del intervalo con un margen, y es lo que descarta el semáforo
 * de la otra cuadra —el coche también frena ahí y también informa esta parada
 * como la anterior—.
 *
 * Se toma el cuantil bajo y no la mediana porque el coche frena **en** la
 * parada y después avanza: la nube está sesgada hacia adelante.
 */
function haltEstimate(
  placement: Placement,
  interval: { alongMeters: number; spreadMeters: number },
): { alongMeters: number; spreadMeters: number; samples: number } | null {
  if (placement.halts.length < MIN_HALTS) return null;

  const starts = placement.intervals.map(([from]) => from).sort((a, b) => a - b);
  const ends = placement.intervals.map(([, to]) => to).sort((a, b) => a - b);
  const low = quantile(starts, 0.5) - HALT_WINDOW_MARGIN_M;
  const high = quantile(ends, 0.5) + HALT_WINDOW_MARGIN_M;

  for (const pass of HALT_PASSES) {
    const inside = placement.halts
      .filter(
        (halt) =>
          halt.speedKmh <= pass.speedKmh &&
          halt.sinceChange <= pass.sinceChange &&
          halt.alongMeters >= low &&
          halt.alongMeters <= high,
      )
      .map((halt) => halt.alongMeters)
      .sort((a, b) => a - b);

    if (inside.length < MIN_HALTS) continue;

    return {
      alongMeters: quantile(inside, HALT_QUANTILE),
      spreadMeters: quantile(inside, 1 - HALT_QUANTILE) - quantile(inside, HALT_QUANTILE),
      samples: inside.length,
    };
  }

  return null;
}

/**
 * PROBADO Y DESCARTADO: ubicar la parada en el cruce de calles de su nombre.
 *
 * La idea era buena y hay que dejarla escrita para que nadie la vuelva a
 * intentar a ciegas. Las paradas de Maldonado se llaman como la calle que
 * cruzan -"SARANDI", "ITUZAINGO", "CALLE 30"-, así que la parada tendría que
 * estar donde el recorrido cruza la calle de ese nombre. Eso no es una
 * estimación: es la intersección de dos líneas, y da metros.
 *
 * Se implementó completo el 2026-09-04: 6.121 calles con nombre de OSM,
 * emparejadas por tokens alineados desde el final (así "R P DEL PUERTO" cae en
 * "Rafael Pérez del Puerto" y "P SIERRA" en "Avenida Pedro Sierra"), cruzadas
 * contra el trazo dentro de la ventana del intervalo. Resolvió 208 de 996
 * paradas. Y medido contra los mismos nodos de OSM, **es peor que lo que hay**:
 *
 *     grupo             lo que hay    la esquina
 *     todas (n=58)      p50  30 m     p50  37 m
 *     intervalo (n=11)  p50  93 m     p50 137 m   <- justo el que se quería arreglar
 *
 * Tres razones, y las tres son del problema y no de la implementación:
 *
 * 1. **Una parada no está en la esquina.** Medido contra OSM, el cartel cae
 *    entre 19 m antes y 40 m después del cruce, con mediana +12 m. Y no se
 *    puede corregir con un desplazamiento fijo: sacarle la mediana no mejora
 *    nada (29 m contra 27 m), porque a veces está antes y a veces después.
 *    O sea que una esquina perfecta ya trae 30 m de error irreducible.
 * 2. **La ventana de búsqueda depende del error que se quiere corregir.** Para
 *    una parada que está a 150 m hay que buscar en ±150 m, y en una trama de
 *    manzanas de 80-100 m eso abarca varias calles transversales: se engancha
 *    la equivocada. Se probaron ventanas fijas de 80, 120 y 200 m y en las tres
 *    el grupo `intervalo` empeora.
 * 3. **La cobertura es baja igual.** 670 de 996 nombres no son calles: son
 *    kilómetros de ruta ("KM 174"), paradas numeradas de la rambla ("P37") y
 *    referencias ("REST BARLOVENTO", "CONTROL HORARIOS").
 *
 * Lo que sí quedó medido y sirve: **la esquina sola tiene ~20 m de exactitud**
 * (p50 20 m, p75 31 m sobre las paradas cuya posición es un nodo relevado). Es
 * decir que es un buen dato, pero como **segunda opinión**, no como corrector.
 * Si alguien lo retoma, el camino es usarla para desempatar adentro del
 * estimador de detenciones cuando la nube de frenadas es ambigua -no para
 * reemplazarlo-, y medirlo con `stop-placement.service.spec.ts`.
 */

/**
 * Con qué error se puede afirmar la coordenada, en metros.
 *
 * No es la dispersión: la dispersión dice cuán juntas están las muestras
 * (precisión) y esto dice cuán lejos está la respuesta de la parada de verdad
 * (exactitud). Son cosas distintas y sólo la segunda sirve para decidir si se
 * puede mandar a alguien a esperar ahí.
 *
 * Los números salen de medir las dos fuentes contra los nodos relevados de
 * OpenStreetMap el 2026-09-04, y lo que se declara es el **percentil 75** del
 * error de cada tramo de dispersión: tres de cada cuatro paradas están más
 * cerca que lo que dice el número.
 *
 *   detenciones  dispersión <25 m → error p75 33 m · 25-60 → 47 · 60-120 → 70
 *   intervalo    dispersión <60 m → error p75 110 m · 120-250 → 114 · +250 → 174
 */
function declaredAccuracy(source: FixSource, spreadMeters: number): number {
  const spread = Math.max(0, spreadMeters);

  if (source === 'detenciones') {
    return Math.round(Math.min(200, Math.max(35, 25 + 0.9 * spread)));
  }

  return Math.round(Math.min(300, Math.max(100, 85 + 0.5 * spread)));
}

/** El punto del recorrido que está a `meters` del arranque. */
function pointAt(index: PolylineIndex | undefined, meters: number): LngLat | null {
  if (!index) return null;

  const { polyline, cumulative } = index;
  let segment = 0;
  while (segment < polyline.length - 2 && cumulative[segment + 1] < meters) segment++;

  const span = cumulative[segment + 1] - cumulative[segment];
  const t = span > 0 ? (meters - cumulative[segment]) / span : 0;
  const [aLng, aLat] = polyline[segment];
  const [bLng, bLat] = polyline[segment + 1];

  return [aLng + (bLng - aLng) * t, aLat + (bLat - aLat) * t];
}
