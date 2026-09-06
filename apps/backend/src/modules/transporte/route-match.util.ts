/**
 * Cuál de los recorridos publicados está haciendo cada itinerario del feed.
 *
 * El problema: las empresas publican sus recorridos dibujados (`official_routes`,
 * ver import-official-routes.ts) y el feed AVL publica, por cada ómnibus, el
 * cartel que lleva puesto —"PUNTA DEL ESTE", "SAN CARLOS A VIAL."—. Son dos
 * catálogos distintos hechos por la misma empresa, sin un identificador en
 * común: el cartel no dice "ida" ni nombra la variante.
 *
 * Emparejarlos a mano sería una tabla de 74 filas que se rompe la próxima vez
 * que alguien cambie un cartel. Se emparejan midiendo: las posiciones reales
 * de cada itinerario dicen por dónde va, y el recorrido publicado que mejor
 * las explica es el suyo.
 *
 * Cuatro medidas, porque ninguna alcanza sola:
 *
 * - **Cobertura**: qué proporción de las posiciones cae sobre el trazo. Es la
 *   principal, pero no distingue ida de vuelta -las dos van por las mismas
 *   calles- ni un recorrido de otro que lo contenga.
 * - **Sentido**: si las posiciones avanzan sobre el trazo o lo recorren al
 *   revés. Es lo que separa la ida de la vuelta, y sin esto el 24 aparecía
 *   yendo a San Carlos cuando volvía.
 * - **Fidelidad**: qué proporción del trazo pisan de verdad los ómnibus. Es lo
 *   que separa la variante de verano de la de invierno: las dos cubren las
 *   posiciones, pero la que no se está usando tiene calle de más.
 * - **Extremos**: a qué distancia arrancan y terminan los viajes de las puntas
 *   del recorrido. Es lo que separa dos variantes que comparten casi todo el
 *   camino y difieren en dónde terminan.
 */
import {
  LngLat,
  PointCloud,
  PolylineIndex,
  densifyPolyline,
  distanceMeters,
  shapeFidelity,
  splitOnGaps,
} from './geo.util';

/** Un viaje: las posiciones de un ómnibus, en orden. */
export interface MatchTrip {
  points: LngLat[];
}

export interface MatchScore {
  /** Posiciones que caen sobre el trazo (0..1). */
  coverage: number;
  /** Pasos que avanzan sobre el trazo en vez de retroceder (0..1). */
  progress: number;
  /** Trazo que pisan las posiciones (0..1). */
  fidelity: number;
  /** Distancia media entre las puntas de los viajes y las del trazo. */
  endpointMeters: number;
}

/**
 * Cuán lejos puede estar una posición del trazo y seguir contando como "va por
 * ahí". Igual que en la validación de los recorridos reconstruidos: por debajo
 * de la separación entre dos calles paralelas (80-100 m en Maldonado) y por
 * encima de lo que la cuerda entre dos posiciones corta en las curvas.
 */
export const MATCH_TOLERANCE_M = 45;

/** Cada cuánto se rellena el corredor de posiciones para medir fidelidad. */
const CORRIDOR_SPACING_M = 15;

/** Salto entre posiciones que corta el corredor: ahí no hay dato de por dónde fue. */
const CORRIDOR_GAP_M = 700;

/**
 * Un retroceso menor que esto sobre el trazo es ruido del GPS, no marcha
 * atrás. A 30 s por posición, un ómnibus detenido oscila unos metros.
 */
const BACKWARD_NOISE_M = 20;

/**
 * El corredor por el que pasaron los ómnibus de un itinerario.
 *
 * Se unen las posiciones en orden y se rellena el segmento, porque el feed
 * publica cada 30 s y las posiciones sueltas quedan a 300 m una de otra:
 * preguntarle a esa nube si el trazo pasa cerca da que no aunque el trazo esté
 * perfecto. Los huecos grandes se cortan: sobre un hueco no hay información de
 * por dónde fue y unirlo inventaría corredor.
 */
export function tripCorridor(trips: MatchTrip[]): PointCloud {
  const points: LngLat[] = [];

  for (const trip of trips) {
    for (const run of splitOnGaps(trip.points, CORRIDOR_GAP_M)) {
      if (run.length < 2) continue;
      points.push(...densifyPolyline(run, CORRIDOR_SPACING_M));
    }
  }

  return new PointCloud(points);
}

/** Mediana, para que un viaje raro no corra el resultado. */
function median(values: number[]): number {
  if (values.length === 0) return Number.POSITIVE_INFINITY;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Mide un recorrido publicado contra las posiciones reales de un itinerario.
 */
export function scoreGeometry(
  geometry: LngLat[],
  trips: MatchTrip[],
  corridor: PointCloud,
  toleranceMeters = MATCH_TOLERANCE_M,
): MatchScore {
  const index = new PolylineIndex(geometry);
  const total = index.lengthMeters;

  let onShape = 0;
  let positions = 0;
  let forward = 0;
  let steps = 0;

  for (const trip of trips) {
    let previous: number | null = null;

    for (const [lng, lat] of trip.points) {
      positions++;

      const located = index.locate(lat, lng);
      if (!located || located.offsetMeters > toleranceMeters) continue;
      onShape++;

      if (previous !== null) {
        const delta = located.alongMeters - previous;
        // Un salto grande hacia atrás es el coche empezando otra vuelta -o dos
        // viajes distintos pegados-, no un ómnibus andando al revés: no cuenta
        // ni a favor ni en contra.
        if (delta > -0.4 * total) {
          steps++;
          if (delta > -BACKWARD_NOISE_M) forward++;
        }
      }
      previous = located.alongMeters;
    }
  }

  const first = geometry[0];
  const last = geometry[geometry.length - 1];
  const startGaps: number[] = [];
  const endGaps: number[] = [];
  for (const trip of trips) {
    if (trip.points.length < 2) continue;
    const tripStart = trip.points[0];
    const tripEnd = trip.points[trip.points.length - 1];
    startGaps.push(distanceMeters(tripStart[1], tripStart[0], first[1], first[0]));
    endGaps.push(distanceMeters(tripEnd[1], tripEnd[0], last[1], last[0]));
  }

  return {
    coverage: positions > 0 ? onShape / positions : 0,
    progress: steps > 0 ? forward / steps : 0,
    fidelity: shapeFidelity(geometry, corridor, toleranceMeters),
    endpointMeters: (median(startGaps) + median(endGaps)) / 2,
  };
}

/**
 * Los extremos, llevados a un número entre 0 y 1.
 *
 * Hasta 600 m es la misma punta: una terminal ocupa una manzana y el coche
 * apaga el equipo donde estaciona. De ahí en adelante baja, y a 3 km ya es
 * otro destino -Cerro Pelado y La Fortuna, los dos finales de la 19, están a
 * esa distancia-.
 */
export function endpointFit(endpointMeters: number): number {
  return Math.max(0, Math.min(1, (3000 - endpointMeters) / 2400));
}

// ---------------------------------------------------------------------------
// Afinidad de nombres
//
// El cartel del ómnibus y el nombre del mapa los escribió la misma empresa, y
// muchas veces dicen lo mismo con distintas abreviaturas: "SAN CARLOS A VIAL."
// y "vuelta hasta vialidad", "P. DEL ESTE DE AG X LAV" y "ida desde agencia
// por Lavagna". Cuando dos recorridos se parecen en el mapa, el nombre decide.
// ---------------------------------------------------------------------------

/** Abreviaturas que usan las empresas en los carteles. */
const ABBREVIATIONS: Record<string, string> = {
  ag: 'agencia',
  agcia: 'agencia',
  lav: 'lavagna',
  vial: 'vialidad',
  mldo: 'maldonado',
  mdeo: 'montevideo',
  tnal: 'terminal',
  pde: 'punta',
  piria: 'piriapolis',
  bal: 'balneario',
  baln: 'balneario',
  bs: 'buenos',
  as: 'aires',
  az: 'azucar',
  c: 'cerro',
  urb: 'urbanizacion',
  cont: 'continuacion',
  rbla: 'rambla',
};

/** Palabras que no distinguen nada y sólo agrandan la unión. */
const STOPWORDS = new Set([
  'de',
  'del',
  'la',
  'el',
  'los',
  'las',
  'a',
  'x',
  'por',
  'desde',
  'hasta',
  'y',
  'linea',
  'recorrido',
  'codesa',
  'micro',
  'ltda',
  'turismo',
]);

function nameTokens(value: string): Set<string> {
  const tokens = (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((token) => ABBREVIATIONS[token] ?? token)
    .filter((token) => !STOPWORDS.has(token));

  return new Set(tokens);
}

/**
 * Cuánto se parecen dos nombres, entre 0 y 1: palabras en común sobre palabras
 * distintas (Jaccard). Es una señal de desempate, no un criterio: los carteles
 * dicen el destino y los mapas dicen el sentido, así que muchas veces no se
 * parecen aunque sean el mismo recorrido.
 */
export function nameAffinity(a: string | null, b: string | null): number {
  const first = nameTokens(a ?? '');
  const second = nameTokens(b ?? '');
  if (first.size === 0 || second.size === 0) return 0;

  let shared = 0;
  for (const token of first) if (second.has(token)) shared++;

  return shared / (first.size + second.size - shared);
}

/**
 * Recorta un recorrido publicado a la parte que los ómnibus recorren de
 * verdad.
 *
 * Hace falta porque hay servicios que hacen media línea: la 17 y la 19 tienen
 * itinerarios "C Pelado - Terminal Mldo" que son la ida cortada en la
 * terminal, y la empresa no publica esa versión corta -publica la entera-.
 * Sin recortar, el mapa dibuja la línea siguiendo hasta Punta del Este y el
 * planificador cree que ese coche llega hasta allá.
 *
 * El recorte se hace sobre lo medido: se proyectan todas las posiciones del
 * itinerario sobre el trazo y se conserva el tramo entre el percentil 2 y el
 * 98 de esas proyecciones. Los percentiles y no el mínimo y el máximo, porque
 * una sola posición perdida en la punta alcanzaría para no recortar nada.
 */
export function coveredSpan(
  geometry: LngLat[],
  trips: MatchTrip[],
  toleranceMeters = MATCH_TOLERANCE_M,
): { fromMeters: number; toMeters: number } | null {
  const index = new PolylineIndex(geometry);
  const along: number[] = [];

  for (const trip of trips) {
    for (const [lng, lat] of trip.points) {
      const located = index.locate(lat, lng);
      if (located && located.offsetMeters <= toleranceMeters) along.push(located.alongMeters);
    }
  }

  if (along.length < 20) return null;

  along.sort((a, b) => a - b);
  return {
    fromMeters: along[Math.floor(along.length * 0.02)],
    toMeters: along[Math.floor(along.length * 0.98)],
  };
}

/** El tramo de una polilínea entre dos distancias acumuladas. */
export function slicePolyline(
  geometry: LngLat[],
  fromMeters: number,
  toMeters: number,
): LngLat[] {
  const index = new PolylineIndex(geometry);
  const cumulative = index.cumulative;

  const at = (meters: number): LngLat => {
    let segment = 0;
    while (segment < cumulative.length - 2 && cumulative[segment + 1] < meters) segment++;

    const span = cumulative[segment + 1] - cumulative[segment];
    const t = span > 0 ? (meters - cumulative[segment]) / span : 0;
    const [aLng, aLat] = geometry[segment];
    const [bLng, bLat] = geometry[segment + 1];

    return [aLng + (bLng - aLng) * t, aLat + (bLat - aLat) * t];
  };

  const sliced: LngLat[] = [at(fromMeters)];
  for (let i = 0; i < geometry.length; i++) {
    if (cumulative[i] > fromMeters && cumulative[i] < toMeters) sliced.push(geometry[i]);
  }
  sliced.push(at(toMeters));

  return sliced;
}
