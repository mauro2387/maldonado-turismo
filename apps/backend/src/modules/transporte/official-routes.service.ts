import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { distanceMeters, LngLat } from './geo.util';
import {
  coveredSpan,
  endpointFit,
  MatchTrip,
  nameAffinity,
  scoreGeometry,
  slicePolyline,
  tripCorridor,
} from './route-match.util';

/**
 * Los recorridos que publican las empresas, y a qué ómnibus corresponde cada
 * uno.
 *
 * La tabla `official_routes` la escribe el importador
 * (src/scripts/import-official-routes.ts) con lo que publican CODESA,
 * Maldonado Turismo y Micro: 75 recorridos dibujados sobre las calles, con su
 * nombre, su recorrido calle por calle y sus pasadas de interés.
 *
 * Este servicio hace lo que falta para que eso sirva: decidir **cuál de esos
 * recorridos está haciendo cada itinerario del feed GPS**. El feed publica el
 * cartel del coche ("PUNTA DEL ESTE", "SAN CARLOS A VIAL.") y los mapas se
 * llaman de otra manera ("Línea 24 (ida desde vialidad)"), sin identificador
 * en común, así que el emparejamiento se mide contra las posiciones reales:
 * ver route-match.util.ts.
 *
 * Emparejado, el recorrido oficial pasa a `route_shapes` con `source =
 * 'oficial'` y ahí lo lee todo lo demás -el mapa, el orden de las paradas, las
 * ETAs y el planificador-, que no tienen que enterarse de si el trazo se
 * reconstruyó o se descargó.
 */

export interface OfficialRoute {
  id: number;
  operator: string;
  lineCode: string;
  variant: string;
  name: string;
  headsign: string | null;
  geometry: LngLat[] | null;
  distanceM: number | null;
  streetText: string | null;
  highlights: string[];
  sourceUrl: string;
}

/** Un itinerario del feed: la línea con un cartel puesto. */
interface FeedItinerary {
  operator: string;
  line_code: string;
  itinerary_key: string;
  itinerary_name: string | null;
  itinerary: number | null;
}

/** Lo que se decidió para un itinerario, para poder revisarlo. */
export interface MatchReport {
  operator: string;
  lineCode: string;
  itineraryKey: string;
  route: string | null;
  routeId: number | null;
  coverage: number;
  progress: number;
  fidelity: number;
  endpointMeters: number;
  score: number;
  trips: number;
  reason?: string;
}

/** Un recorrido publicado, ya medido contra las posiciones del itinerario. */
interface Candidate {
  routeId: number | null;
  label: string;
  geometry: LngLat[];
  score: number;
  coverage: number;
  progress: number;
  fidelity: number;
  endpointMeters: number;
}

/** Cuántos viajes de cada itinerario se miden. Más no cambia el resultado. */
const TRIPS_PER_ITINERARY = 8;

/** Debajo de esto la traza no cubre un viaje utilizable. */
const MIN_TRIP_POINTS = 12;

/**
 * Cobertura mínima para dar un recorrido por emparejado.
 *
 * Medido sobre los 74 itinerarios que publica el feed: los emparejamientos
 * correctos dan de 0,71 para arriba y la mediana es 0,94. Por debajo de 0,65 lo
 * que hay es un itinerario del que no tenemos casi datos -un solo viaje
 * cortado- o uno que la empresa no publicó, y en los dos casos es mejor caer a
 * la reconstrucción por GPS que dibujar un recorrido que no es.
 */
const MIN_COVERAGE = 0.65;

/**
 * Sentido mínimo. Un recorrido y su inverso cubren las mismas calles, así que
 * esto es lo único que los separa: el correcto da 0,95 o más y el invertido
 * queda por debajo de 0,35. El corte al medio no toca ningún caso real.
 */
const MIN_PROGRESS = 0.55;

/**
 * Cuánto se castiga elegir un recorrido que ya se le asignó a otro itinerario.
 *
 * No se prohíbe, porque hay itinerarios que legítimamente comparten trazo: la
 * 17 "C Pelado - Terminal Mldo" es la ida de la 17 cortada por la mitad, y la
 * empresa no publica esa versión corta. Pero cuando hay una variante libre que
 * explica casi igual de bien las posiciones, gana la libre: es lo que separa
 * la 19 que termina en Cerro Pelado de la que termina en La Fortuna, dos
 * recorridos casi iguales que sólo se distinguen por el final.
 */
const REUSE_PENALTY = 0.75;

/**
 * Cuándo se prueba el recorrido de ida y el de vuelta pegados.
 *
 * Hay itinerarios que la empresa publica partidos en dos y el feed nombra de
 * una sola manera: el "Local Maldonado" de la 51 es el circuito entero, y
 * cualquiera de las dos mitades por separado deja fuera un cuarto de las
 * posiciones. Sólo se prueba cuando ninguna variante sola las explica.
 */
const PAIR_TRIGGER_COVERAGE = 0.8;

/** Y sólo se elige si mejora de verdad, no por decimales. */
const PAIR_MIN_GAIN = 0.1;

/** Dos mitades se pegan si la punta de una está cerca del arranque de la otra. */
const PAIR_JOIN_TOLERANCE_M = 1200;

/**
 * Por debajo de esta fidelidad el recorrido publicado tiene calle de más para
 * este servicio, y se lo recorta a la parte que se recorre. Los
 * emparejamientos sanos dan de 0,80 para arriba; los servicios cortados dan
 * 0,43 a 0,55.
 */
const TRIM_FIDELITY = 0.75;

/** Con menos viajes que esto, medio recorrido puede ser un coche que arrancó tarde. */
const TRIM_MIN_TRIPS = 3;

/** No se recorta por menos de esto: es ruido de las puntas. */
const TRIM_MIN_GAIN_M = 1500;

/** Ni se deja un recorrido en un pedazo demasiado corto para ser un servicio. */
const TRIM_MIN_LENGTH_M = 1500;

@Injectable()
export class OfficialRoutesService implements OnModuleInit {
  private readonly logger = new Logger(OfficialRoutesService.name);

  private routes: OfficialRoute[] = [];

  /** Código del feed -> número real de la línea. Ver `lineLabel`. */
  private labels = new Map<string, string>();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onModuleInit() {
    await this.load();
  }

  async load(): Promise<number> {
    try {
      const rows = await this.dataSource.query(
        `SELECT id, operator, line_code, variant, name, headsign, geometry,
                distance_m, street_text, highlights, source_url
         FROM official_routes
         ORDER BY operator, line_code, variant`,
      );

      this.routes = rows.map((row: any) => ({
        id: row.id,
        operator: row.operator,
        lineCode: row.line_code,
        variant: row.variant,
        name: row.name,
        headsign: row.headsign,
        geometry: row.geometry as LngLat[] | null,
        distanceM: row.distance_m,
        streetText: row.street_text,
        highlights: row.highlights ?? [],
        sourceUrl: row.source_url,
      }));

      this.buildLabels();
      this.logger.log(`Recorridos publicados por las empresas: ${this.routes.length}`);
      return this.routes.length;
    } catch (error: any) {
      // Sin la tabla la app arranca igual: los recorridos se reconstruyen.
      this.logger.warn(`No se pudieron leer los recorridos oficiales: ${error?.message ?? error}`);
      this.routes = [];
      return 0;
    }
  }

  getAll(): OfficialRoute[] {
    return this.routes;
  }

  /**
   * El número con el que la gente conoce la línea.
   *
   * Los refuerzos que hacen dos líneas llegan en el feed con los dos números
   * pegados: la 17/19 de Maldonado Turismo como "179", la 9/12 de CODESA como
   * "912", la 7/24 como "247". Eso terminaba impreso en la pantalla como si
   * existiera una línea 179 —no existe: no está en ningún cartel, nadie la
   * puede preguntar en la parada y quien la lee piensa que la app se
   * equivocó—. Acá se traduce al código con el que la empresa publica el
   * recorrido, que es el que dice el ómnibus por delante.
   *
   * Las líneas normales pasan derecho: sólo se traducen los códigos que no
   * corresponden a ninguna línea publicada.
   */
  lineLabel(operator: string | null | undefined, feedCode: string | null | undefined): string {
    const code = normalizeLineCode(feedCode ?? '');
    if (!code) return '';
    return this.labels.get(`${operator ?? ''}|${code}`) ?? code;
  }

  /**
   * Arma la traducción a partir de los recorridos publicados: las únicas
   * líneas dobles son las que la empresa publica con barra, y las variantes
   * pegadas se generan con la misma regla con la que se emparejan.
   */
  private buildLabels(): void {
    this.labels.clear();

    for (const route of this.routes) {
      if (!route.lineCode.includes('/')) continue;

      const parts = route.lineCode.split('/').map((part) => normalizeLineCode(part));

      for (const alias of lineCodeTokens(route.lineCode)) {
        // "17" y "19" existen por su cuenta: traducirlas a "17/19" sería el
        // error opuesto, y más confuso todavía.
        if (parts.includes(alias)) continue;
        this.labels.set(`${route.operator}|${alias}`, route.lineCode);
      }
    }
  }

  getById(id: number): OfficialRoute | null {
    return this.routes.find((route) => route.id === id) ?? null;
  }

  /**
   * Los recorridos publicados de una línea. La 24 tiene cuatro y la 16 tiene
   * cuatro: es lo que se muestra en la ficha de la línea.
   */
  getForLine(lineCode: string, operator?: string): OfficialRoute[] {
    const wanted = normalizeLineCode(lineCode);
    return this.routes.filter(
      (route) =>
        (!operator || route.operator === operator) &&
        lineCodeTokens(route.lineCode).includes(wanted),
    );
  }

  /**
   * Empareja cada itinerario del feed con el recorrido publicado que mejor
   * explica sus posiciones, y lo guarda en `route_shapes`.
   *
   * Devuelve el detalle de cada decisión: es lo que permite revisar el
   * resultado sin abrir la base (ver src/scripts/match-official-routes.ts).
   */
  async matchAll(lookbackHours = 72): Promise<MatchReport[]> {
    if (this.routes.length === 0) await this.load();

    const withGeometry = this.routes.filter((route) => route.geometry?.length >= 2);
    if (withGeometry.length === 0) {
      this.logger.warn('No hay recorridos publicados con trazo: no hay nada que emparejar');
      return [];
    }

    const itineraries = await this.findItineraries(lookbackHours);
    const reports: MatchReport[] = [];

    // Primera pasada: medir. Cada itinerario se mide contra los recorridos
    // publicados de su línea, sin mirar lo que se decidió para los demás.
    const measured: Array<{
      itinerary: FeedItinerary;
      trips: MatchTrip[];
      corridor: ReturnType<typeof tripCorridor>;
      candidates: Candidate[];
    }> = [];

    for (const itinerary of itineraries) {
      const trips = await this.findTrips(itinerary, lookbackHours);
      const line = withGeometry.filter(
        (route) =>
          route.operator === itinerary.operator &&
          lineCodeTokens(route.lineCode).includes(normalizeLineCode(itinerary.line_code)),
      );

      if (trips.length === 0 || line.length === 0) {
        reports.push({
          operator: itinerary.operator,
          lineCode: itinerary.line_code,
          itineraryKey: itinerary.itinerary_key,
          route: null,
          routeId: null,
          coverage: 0,
          progress: 0,
          fidelity: 0,
          endpointMeters: Number.POSITIVE_INFINITY,
          score: 0,
          trips: trips.length,
          reason: line.length === 0 ? 'la empresa no publica esta línea' : 'sin viajes medibles',
        });
        continue;
      }

      const corridor = tripCorridor(trips);
      const candidates = line.map((route) =>
        this.evaluate(route.id, route.name, route.geometry, itinerary, trips, corridor),
      );

      const bestSingle = candidates.reduce((best, candidate) =>
        candidate.coverage > best.coverage ? candidate : best,
      );

      // Ida y vuelta pegadas, sólo si ninguna mitad sola alcanza.
      if (bestSingle.coverage < PAIR_TRIGGER_COVERAGE) {
        for (const pair of pairedRoutes(line)) {
          const evaluated = this.evaluate(
            null,
            pair.label,
            pair.geometry,
            itinerary,
            trips,
            corridor,
          );
          if (evaluated.coverage >= bestSingle.coverage + PAIR_MIN_GAIN) {
            candidates.push(evaluated);
          }
        }
      }

      measured.push({ itinerary, trips, corridor, candidates });
    }

    // Segunda pasada: asignar. Se empieza por los itinerarios que tienen una
    // elección más clara, para que los dudosos elijan entre lo que queda.
    measured.sort((a, b) => topScore(b.candidates) - topScore(a.candidates));

    const used = new Set<number>();

    for (const { itinerary, trips, corridor, candidates } of measured) {
      const viable = candidates
        .filter(
          (candidate) =>
            candidate.coverage >= MIN_COVERAGE && candidate.progress >= MIN_PROGRESS,
        )
        .map((candidate) => ({
          ...candidate,
          adjusted:
            candidate.routeId !== null && used.has(candidate.routeId)
              ? candidate.score * REUSE_PENALTY
              : candidate.score,
        }))
        .sort((a, b) => b.adjusted - a.adjusted);

      const best = viable[0];

      if (!best) {
        reports.push({
          operator: itinerary.operator,
          lineCode: itinerary.line_code,
          itineraryKey: itinerary.itinerary_key,
          route: null,
          routeId: null,
          coverage: topCoverage(candidates),
          progress: 0,
          fidelity: 0,
          endpointMeters: Number.POSITIVE_INFINITY,
          score: 0,
          trips: trips.length,
          reason: 'ningún recorrido publicado explica estas posiciones',
        });
        continue;
      }

      if (best.routeId !== null) used.add(best.routeId);

      const chosen = this.trimToService(best, trips, corridor);
      await this.saveShape(itinerary, chosen, trips.length);

      reports.push({
        operator: itinerary.operator,
        lineCode: itinerary.line_code,
        itineraryKey: itinerary.itinerary_key,
        route: chosen.label,
        routeId: chosen.routeId,
        coverage: chosen.coverage,
        progress: chosen.progress,
        fidelity: chosen.fidelity,
        endpointMeters: chosen.endpointMeters,
        score: chosen.score,
        trips: trips.length,
        reason: chosen.trimmed ? 'recortado a la parte que se recorre' : undefined,
      });
    }

    const emparejados = reports.filter((report) => report.route).length;
    this.logger.log(
      `Recorridos oficiales asignados: ${emparejados} de ${reports.length} itinerarios`,
    );

    return reports;
  }

  /**
   * Recorta el recorrido elegido a la parte que este servicio hace de verdad.
   *
   * Hay itinerarios que son media línea: la 17 y la 19 tienen servicios "C
   * Pelado - Terminal Mldo" que son la ida cortada en la terminal, y la
   * empresa publica la línea entera, no la versión corta. Sin recortar, el
   * mapa dibuja el ómnibus siguiendo hasta Punta del Este y el planificador
   * cree que ese coche llega hasta allá: manda gente a esperarlo a una parada
   * a la que no va a llegar.
   *
   * Se recorta sólo cuando el trazo entero queda largo -menos de tres cuartos
   * recorrido- y hay viajes suficientes para afirmarlo. Con uno o dos viajes
   * medio recorrido puede ser el coche que arrancó tarde, no el servicio.
   */
  private trimToService(
    best: Candidate,
    trips: MatchTrip[],
    corridor: ReturnType<typeof tripCorridor>,
  ): Candidate & { trimmed: boolean } {
    if (best.fidelity >= TRIM_FIDELITY || trips.length < TRIM_MIN_TRIPS) {
      return { ...best, trimmed: false };
    }

    const span = coveredSpan(best.geometry, trips);
    if (!span) return { ...best, trimmed: false };

    const length = polylineLength(best.geometry);
    const kept = span.toMeters - span.fromMeters;
    // Ni recortes de nada ni recorridos que quedan en un pedazo.
    if (kept < TRIM_MIN_LENGTH_M || length - kept < TRIM_MIN_GAIN_M) {
      return { ...best, trimmed: false };
    }

    const geometry = slicePolyline(best.geometry, span.fromMeters, span.toMeters);
    if (geometry.length < 2) return { ...best, trimmed: false };

    const measure = scoreGeometry(geometry, trips, corridor);
    this.logger.log(
      `${best.label}: recortado a ${Math.round(kept / 100) / 10} km de ${
        Math.round(length / 100) / 10
      } km, la parte que este servicio recorre`,
    );

    return {
      ...best,
      geometry,
      trimmed: true,
      ...measure,
    };
  }

  /**
   * Qué tan bien un recorrido publicado explica las posiciones del itinerario.
   *
   * El puntaje multiplica cobertura por fidelidad -las posiciones tienen que
   * estar sobre el trazo *y* el trazo tiene que estar recorrido- y lo ajusta
   * por los extremos y por el parecido de los nombres, que son los dos
   * desempates entre variantes que comparten calle.
   */
  private evaluate(
    routeId: number | null,
    label: string,
    geometry: LngLat[],
    itinerary: FeedItinerary,
    trips: MatchTrip[],
    corridor: ReturnType<typeof tripCorridor>,
  ): Candidate {
    const measure = scoreGeometry(geometry, trips, corridor);
    const affinity = nameAffinity(itinerary.itinerary_name, label);

    const score =
      measure.coverage *
      measure.fidelity *
      // Los extremos pesan, pero no deciden solos: un itinerario del que sólo
      // hay medio viaje guardado tiene las puntas donde se cortó la traza.
      (0.4 + 0.6 * endpointFit(measure.endpointMeters)) *
      // El nombre inclina la balanza cuando lo demás empata.
      (0.85 + 0.15 * affinity);

    return { routeId, label, geometry, score, ...measure };
  }

  /** Los itinerarios que publica el feed: una línea con un cartel puesto. */
  private async findItineraries(lookbackHours: number): Promise<FeedItinerary[]> {
    return await this.dataSource.query(
      `
      SELECT operator,
             line_code,
             upper(btrim(line_name)) AS itinerary_key,
             max(line_name)          AS itinerary_name,
             max(itinerary)          AS itinerary
      FROM vehicle_positions
      WHERE line_code IS NOT NULL
        AND operator IS NOT NULL
        AND btrim(coalesce(line_name, '')) <> ''
        AND COALESCE(fix_time, recorded_at) > now() - ($1 || ' hours')::interval
      GROUP BY operator, line_code, itinerary_key
      ORDER BY line_code, itinerary_key
      `,
      [lookbackHours],
    );
  }

  private async findTrips(
    itinerary: FeedItinerary,
    lookbackHours: number,
  ): Promise<MatchTrip[]> {
    const rows = await this.dataSource.query(
      `
      SELECT array_agg(longitude::float8 ORDER BY at) AS lngs,
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
        lookbackHours,
        MIN_TRIP_POINTS,
        TRIPS_PER_ITINERARY,
      ],
    );

    return rows.map((row: any) => ({
      points: row.lngs.map((lng: number, index: number) => [lng, row.lats[index]] as LngLat),
    }));
  }

  /**
   * Guarda el recorrido elegido en `route_shapes`, que es de donde lee la app.
   *
   * `confidence` y `support` guardan lo mismo que en un recorrido
   * reconstruido -cuánto del trazo se recorrió y cuántas posiciones caen sobre
   * él-, así que las dos clases de fila se leen igual. Lo que cambia es
   * `source`: un trazo oficial no se descarta por quedar por debajo del corte
   * de calidad, porque no es una estimación que pueda salir mal, es lo que la
   * empresa publica.
   */
  private async saveShape(
    itinerary: FeedItinerary,
    best: Candidate,
    trips: number,
  ): Promise<void> {
    const distanceM = Math.round(polylineLength(best.geometry));

    await this.dataSource.query(
      `
      INSERT INTO route_shapes (operator, line_code, itinerary_key, itinerary_name, itinerary,
                                direction, geometry, point_count, distance_m,
                                confidence, support, trips_used, trips_total,
                                source, official_route_id, match_score, built_at)
      VALUES ($1, $2, $3, $4, $5, NULL, $6, $7, $8, $9, $10, $11, $11,
              'oficial', $12, $13, now())
      ON CONFLICT (operator, line_code, itinerary_key)
      DO UPDATE SET itinerary_name    = EXCLUDED.itinerary_name,
                    itinerary         = EXCLUDED.itinerary,
                    geometry          = EXCLUDED.geometry,
                    point_count       = EXCLUDED.point_count,
                    distance_m        = EXCLUDED.distance_m,
                    confidence        = EXCLUDED.confidence,
                    support           = EXCLUDED.support,
                    trips_used        = EXCLUDED.trips_used,
                    trips_total       = EXCLUDED.trips_total,
                    source            = 'oficial',
                    official_route_id = EXCLUDED.official_route_id,
                    match_score       = EXCLUDED.match_score,
                    built_at          = now()
      `,
      [
        itinerary.operator,
        itinerary.line_code,
        itinerary.itinerary_key,
        itinerary.itinerary_name,
        itinerary.itinerary,
        JSON.stringify(best.geometry),
        best.geometry.length,
        distanceM,
        best.fidelity,
        best.coverage,
        trips,
        best.routeId,
        best.score,
      ],
    );
  }
}

/** "L48" y "48" son la misma línea: el feed la publica sin la L. */
function normalizeLineCode(code: string): string {
  return String(code ?? '')
    .replace(/^L/i, '')
    .trim();
}

/**
 * Con qué códigos del feed puede corresponderse un recorrido publicado.
 *
 * "7/24" es un refuerzo que hace de 7 y de 24, así que cuenta para las dos. Y
 * además las empresas escriben esos refuerzos pegados en el feed, cada una a
 * su manera: la 9/12 de CODESA llega como "912", la 7/24 como "247" y la 17/19
 * de Maldonado Turismo como "179" -el 17 con el 9 del 19 pegado atrás-. No hay
 * una regla; se generan las combinaciones posibles y se acepta la que aparezca.
 *
 * El riesgo de aceptar de más es bajo: los candidatos ya están filtrados por
 * empresa, y ninguna tiene una línea 179 ni una 912 de verdad.
 */
function lineCodeTokens(code: string): string[] {
  const parts = normalizeLineCode(code)
    .split('/')
    .map((token) => token.trim())
    .filter(Boolean);

  if (parts.length < 2) return parts;

  const aliases = new Set(parts);
  for (const [a, b] of [
    [parts[0], parts[1]],
    [parts[1], parts[0]],
  ]) {
    aliases.add(a + b);
    // Sin el arranque que comparten: "17" + "19" sin el "1" = "179".
    let shared = 0;
    while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++;
    if (shared > 0) aliases.add(a + b.slice(shared));
  }

  return [...aliases];
}

/**
 * Ida, vuelta o circular, a partir del nombre que le puso la empresa.
 *
 * Sale de la variante, que ya viene normalizada del importador ("regreso" se
 * unifica en "vuelta"). Hay recorridos que la empresa no nombra por sentido
 * sino por sus puntas -"La Fortuna - Punta del Este"-: esos quedan sin
 * sentido, y el mapa los dibuja con su propio color y su nombre completo en
 * vez de inventarles uno.
 */
export function directionOf(variant: string | null): 'ida' | 'vuelta' | 'circular' | null {
  if (!variant) return null;
  if (variant.includes('circular')) return 'circular';
  if (variant.includes('vuelta')) return 'vuelta';
  if (variant.includes('ida')) return 'ida';
  return null;
}

function topScore(candidates: Array<{ score: number }>): number {
  return candidates.reduce((best, candidate) => Math.max(best, candidate.score), 0);
}

function topCoverage(candidates: Array<{ coverage: number }>): number {
  return candidates.reduce((best, candidate) => Math.max(best, candidate.coverage), 0);
}

function polylineLength(points: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distanceMeters(points[i - 1][1], points[i - 1][0], points[i][1], points[i][0]);
  }
  return total;
}

/**
 * Los pares ida + vuelta de una línea, pegados en un solo trazo.
 *
 * Sólo se arma el par cuando las dos mitades son la misma variante con el
 * sentido cambiado -"ida-hora-par-invierno" con "vuelta-hora-par-invierno"- y
 * cuando una termina donde la otra empieza. Mezclar la ida de verano con la
 * vuelta de invierno daría un recorrido que no existe.
 */
function pairedRoutes(
  routes: OfficialRoute[],
): Array<{ label: string; geometry: LngLat[] }> {
  const pairs: Array<{ label: string; geometry: LngLat[] }> = [];

  for (const route of routes) {
    if (!route.variant.includes('ida')) continue;

    const back = routes.find(
      (other) =>
        other.lineCode === route.lineCode &&
        other.variant === route.variant.replace('ida', 'vuelta'),
    );
    if (!back?.geometry || !route.geometry) continue;

    const end = route.geometry[route.geometry.length - 1];
    const start = back.geometry[0];
    if (distanceMeters(end[1], end[0], start[1], start[0]) > PAIR_JOIN_TOLERANCE_M) continue;

    pairs.push({
      label: `${route.name} + vuelta`,
      geometry: [...route.geometry, ...back.geometry.slice(1)],
    });
  }

  return pairs;
}
