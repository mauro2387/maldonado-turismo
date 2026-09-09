/**
 * Utilidades geométricas para trabajar con recorridos.
 *
 * A la escala de Maldonado (unos 40 km de punta a punta) alcanza con proyectar
 * las coordenadas a un plano local: el error de la aproximación es de
 * centímetros, muy por debajo del ruido del GPS, y evita arrastrar una
 * librería geoespacial entera para hacer una proyección sobre una polilínea.
 */

/** Coordenada en orden GeoJSON: [lng, lat]. */
export type LngLat = [number, number];

const EARTH_RADIUS_M = 6371000;
const DEG_TO_RAD = Math.PI / 180;

/** Metros por grado de longitud a una latitud dada (los de latitud son fijos). */
function metersPerDegreeLng(latitude: number): number {
  return EARTH_RADIUS_M * DEG_TO_RAD * Math.cos(latitude * DEG_TO_RAD);
}

const METERS_PER_DEGREE_LAT = EARTH_RADIUS_M * DEG_TO_RAD;

export function distanceMeters(
  latA: number,
  lngA: number,
  latB: number,
  lngB: number,
): number {
  const scaleLng = metersPerDegreeLng((latA + latB) / 2);
  const dx = (lngB - lngA) * scaleLng;
  const dy = (latB - latA) * METERS_PER_DEGREE_LAT;
  return Math.hypot(dx, dy);
}

export interface SnapResult {
  latitude: number;
  longitude: number;
  /** Distancia entre la posición original y el punto proyectado. */
  offsetMeters: number;
  /** Índice del segmento de la polilínea sobre el que cayó. */
  segmentIndex: number;
}

/**
 * Proyecta una posición sobre la polilínea del recorrido y devuelve el punto
 * más cercano que efectivamente está sobre la calle.
 *
 * Se recorren todos los segmentos porque una línea de Maldonado tiene a lo
 * sumo unos pocos miles de puntos: el barrido completo se mide en
 * microsegundos y evita la complejidad de un índice espacial.
 */
export function snapToPolyline(
  latitude: number,
  longitude: number,
  polyline: LngLat[],
): SnapResult | null {
  if (polyline.length < 2) return null;

  const scaleLng = metersPerDegreeLng(latitude);
  // Se trabaja en metros relativos al punto consultado para que la proyección
  // sea una operación plana común y corriente.
  const toLocal = ([lng, lat]: LngLat) => ({
    x: (lng - longitude) * scaleLng,
    y: (lat - latitude) * METERS_PER_DEGREE_LAT,
  });

  let best: SnapResult | null = null;

  for (let i = 0; i < polyline.length - 1; i++) {
    const start = toLocal(polyline[i]);
    const end = toLocal(polyline[i + 1]);

    const segmentX = end.x - start.x;
    const segmentY = end.y - start.y;
    const segmentLengthSq = segmentX * segmentX + segmentY * segmentY;

    // Posición relativa del pie de la perpendicular, recortada al segmento
    // para no proyectar fuera de sus extremos.
    let t = 0;
    if (segmentLengthSq > 0) {
      t = -(start.x * segmentX + start.y * segmentY) / segmentLengthSq;
      t = Math.max(0, Math.min(1, t));
    }

    const projectedX = start.x + t * segmentX;
    const projectedY = start.y + t * segmentY;
    const offsetMeters = Math.hypot(projectedX, projectedY);

    if (!best || offsetMeters < best.offsetMeters) {
      best = {
        latitude: latitude + projectedY / METERS_PER_DEGREE_LAT,
        longitude: longitude + projectedX / scaleLng,
        offsetMeters,
        segmentIndex: i,
      };
    }
  }

  return best;
}

/**
 * Reduce una traza a como mucho `maxPoints` conservando el primero y el
 * último. El map matching de OSRM acepta un número acotado de coordenadas por
 * pedido, así que las trazas largas hay que ralearlas antes de enviarlas.
 */
export function samplePoints<T>(points: T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) return points;

  const sampled: T[] = [];
  const step = (points.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    sampled.push(points[Math.round(i * step)]);
  }
  return sampled;
}

/**
 * Distancia acumulada desde el inicio de la polilínea hasta cada uno de sus
 * puntos. Se calcula una vez por recorrido y se reutiliza: convierte cualquier
 * proyección sobre el trazo en un número de metros "de acá al principio", que
 * es lo que permite saber si un ómnibus viene antes o después de una parada y
 * cuánta calle le falta.
 */
export function cumulativeDistances(polyline: LngLat[]): number[] {
  const cumulative: number[] = new Array(polyline.length);
  cumulative[0] = 0;

  for (let i = 1; i < polyline.length; i++) {
    const [prevLng, prevLat] = polyline[i - 1];
    const [lng, lat] = polyline[i];
    cumulative[i] = cumulative[i - 1] + distanceMeters(prevLat, prevLng, lat, lng);
  }

  return cumulative;
}

export interface AlongResult {
  /** Metros recorridos sobre el trazo hasta el punto proyectado. */
  alongMeters: number;
  /** Cuánto se apartaba el punto original del trazo. */
  offsetMeters: number;
}

/**
 * Ubica una posición sobre el recorrido: devuelve cuántos metros de trazo
 * quedan por detrás de ella. Es la operación que ordena las paradas de una
 * línea y la que dice cuánta calle le falta a un ómnibus para llegar a una.
 */
export function distanceAlongPolyline(
  latitude: number,
  longitude: number,
  polyline: LngLat[],
  cumulative: number[],
): AlongResult | null {
  const snapped = snapToPolyline(latitude, longitude, polyline);
  if (!snapped) return null;

  const [segmentLng, segmentLat] = polyline[snapped.segmentIndex];
  const withinSegment = distanceMeters(
    segmentLat,
    segmentLng,
    snapped.latitude,
    snapped.longitude,
  );

  return {
    alongMeters: cumulative[snapped.segmentIndex] + withinSegment,
    offsetMeters: snapped.offsetMeters,
  };
}

/**
 * El punto del trazo que queda a `meters` del inicio.
 *
 * Es la operación inversa de `distanceAlongPolyline`: aquella pregunta "¿en
 * qué metro del recorrido estoy?" y ésta "¿qué lugar es el metro 20.500?".
 * Sirve para recorrer un tramo de a pasos y preguntar algo en cada paso —por
 * ejemplo a qué velocidad se anda por ahí—, que es lo que hace falta cuando el
 * recorrido no es homogéneo: la 15 son treinta kilómetros de ruta y cinco de
 * ciudad, y no se viaja igual por los dos.
 *
 * Fuera de los extremos devuelve la punta correspondiente, no null: pedir el
 * metro -3 o el 40.000 de un recorrido de 34 km es preguntar por el principio
 * y por el final.
 */
export function pointAtDistance(
  polyline: LngLat[],
  cumulative: number[],
  meters: number,
): LngLat | null {
  if (polyline.length === 0) return null;
  if (polyline.length === 1) return polyline[0];

  const total = cumulative[cumulative.length - 1];
  if (!(meters > 0)) return polyline[0];
  if (meters >= total) return polyline[polyline.length - 1];

  // Búsqueda binaria: `cumulative` viene ordenado por construcción y estos
  // trazos tienen decenas de miles de puntos.
  let low = 0;
  let high = cumulative.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (cumulative[middle] <= meters) low = middle;
    else high = middle;
  }

  const segmentMeters = cumulative[high] - cumulative[low];
  if (segmentMeters <= 0) return polyline[low];

  const fraction = (meters - cumulative[low]) / segmentMeters;
  const [lngA, latA] = polyline[low];
  const [lngB, latB] = polyline[high];

  return [lngA + (lngB - lngA) * fraction, latA + (latB - latA) * fraction];
}

/**
 * Parte una traza GPS en tramos continuos, cortando donde hay un hueco.
 *
 * Un hueco es un salto que el ómnibus no pudo haber hecho entre dos
 * posiciones consecutivas: el coche perdió señal, se apagó el equipo o el feed
 * se saltó unos minutos. La traza sigue pareciendo una sola, pero entre esos
 * dos puntos no hay información de por dónde fue.
 *
 * Importa porque el motor de ruteo, al que después se le pasa la traza, une
 * dos puntos cualesquiera por el camino más rápido. Sobre un hueco eso
 * significa inventar calle: es de ahí que salen los recorridos con vueltas que
 * la línea no hace. Cortando antes, cada tramo se rutea solo sobre lo que
 * efectivamente se recorrió.
 */
export function splitOnGaps(points: LngLat[], maxGapMeters: number): LngLat[][] {
  if (points.length === 0) return [];

  const runs: LngLat[][] = [];
  let current: LngLat[] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const [prevLng, prevLat] = points[i - 1];
    const [lng, lat] = points[i];

    if (distanceMeters(prevLat, prevLng, lat, lng) > maxGapMeters) {
      runs.push(current);
      current = [points[i]];
    } else {
      current.push(points[i]);
    }
  }

  runs.push(current);
  return runs;
}

/** Distancia de un punto a una polilínea, en metros. */
export function distanceToPolyline(lat: number, lng: number, polyline: LngLat[]): number {
  const snapped = snapToPolyline(lat, lng, polyline);
  return snapped ? snapped.offsetMeters : Number.POSITIVE_INFINITY;
}

/**
 * Nube de posiciones con índice espacial, para preguntar rápido "¿pasó algún
 * ómnibus cerca de acá?".
 *
 * Hace falta porque validar un recorrido contra las posiciones de todos los
 * viajes de su itinerario son millones de comparaciones: mil segmentos de
 * trazo contra varios miles de posiciones, y eso por cada candidato. La grilla
 * lo baja a mirar nueve celdas.
 *
 * La nube es un conjunto de puntos sueltos y no una polilínea. Es la
 * diferencia que importa: unir las posiciones de viajes distintos con una
 * línea inventaría tramos entre el final de un viaje y el principio del otro,
 * y esos tramos falsos son justamente lo que hay que detectar.
 */
export class PointCloud {
  /** Lado de la celda, en grados de latitud. Unos 110 m. */
  private static readonly CELL_DEG = 0.001;

  private readonly cells = new Map<string, LngLat[]>();

  constructor(points: LngLat[]) {
    for (const point of points) {
      const key = PointCloud.cellKey(point[1], point[0]);
      const cell = this.cells.get(key);
      if (cell) cell.push(point);
      else this.cells.set(key, [point]);
    }
  }

  private static cellKey(lat: number, lng: number): string {
    return `${Math.floor(lat / PointCloud.CELL_DEG)}:${Math.floor(lng / PointCloud.CELL_DEG)}`;
  }

  /**
   * Distancia al punto más cercano de la nube, en metros.
   *
   * Solo mira la celda del punto y sus ocho vecinas, así que sirve para
   * responder "¿hay algo a menos de X?" con X por debajo del lado de la celda,
   * que es el único uso que tiene acá. Más lejos devuelve infinito.
   */
  nearest(lat: number, lng: number): number {
    const cellLat = Math.floor(lat / PointCloud.CELL_DEG);
    const cellLng = Math.floor(lng / PointCloud.CELL_DEG);

    let best = Number.POSITIVE_INFINITY;

    for (let dLat = -1; dLat <= 1; dLat++) {
      for (let dLng = -1; dLng <= 1; dLng++) {
        const cell = this.cells.get(`${cellLat + dLat}:${cellLng + dLng}`);
        if (!cell) continue;

        for (const [pointLng, pointLat] of cell) {
          const distance = distanceMeters(lat, lng, pointLat, pointLng);
          if (distance < best) best = distance;
        }
      }
    }

    return best;
  }

  get size(): number {
    let total = 0;
    for (const cell of this.cells.values()) total += cell.length;
    return total;
  }
}

/**
 * Fidelidad: qué proporción del recorrido dibujado pisa calle por la que
 * pasaron ómnibus de verdad.
 *
 * Es la medida que atrapa la calle inventada. Se recorre la geometría segmento
 * a segmento y se pregunta, por el punto medio de cada uno, si el corredor
 * pasa cerca; lo que no lo tiene cerca es calle que el ruteador agregó por su
 * cuenta.
 *
 * **La nube tiene que ser el corredor, no las posiciones sueltas.** El feed
 * publica cada 30 s, así que a velocidad de calle las posiciones quedan a unos
 * 300 m una de otra: medir contra ellas da fidelidades del 30 al 60 % en
 * recorridos perfectos, porque entre dos posiciones no hay nada cerca. Lo que
 * se mediría así es cada cuánto reporta el GPS. Hay que pasar las trazas por
 * `densifyPolyline` antes de armar la nube.
 *
 * La tolerancia tiene que ser **menor que la separación entre dos calles
 * paralelas** -en Maldonado las manzanas son de 80 a 100 m- y mayor que lo que
 * la cuerda entre dos posiciones corta en las curvas. Medido sobre los 74
 * itinerarios, 40 m es el punto donde los recorridos buenos se despegan de los
 * malos.
 */
export function shapeFidelity(
  geometry: LngLat[],
  cloud: PointCloud,
  toleranceMeters: number,
): number {
  if (geometry.length < 2) return 0;

  let covered = 0;
  let total = 0;

  for (let i = 1; i < geometry.length; i++) {
    const [aLng, aLat] = geometry[i - 1];
    const [bLng, bLat] = geometry[i];
    const length = distanceMeters(aLat, aLng, bLat, bLng);
    if (length === 0) continue;

    total += length;

    // Se evalúa el punto medio: los extremos de un segmento pueden estar
    // respaldados y el medio no, que es lo que pasa cuando el ruteador cierra
    // un hueco dando la vuelta a la manzana.
    if (cloud.nearest((aLat + bLat) / 2, (aLng + bLng) / 2) <= toleranceMeters) {
      covered += length;
    }
  }

  return total > 0 ? covered / total : 0;
}

/**
 * Respaldo: qué proporción de las posiciones de otros viajes cae sobre el
 * recorrido dibujado.
 *
 * Es la otra mitad, y la que hace que la validación sea honesta. La fidelidad
 * se puede medir contra el mismo viaje del que salió el trazo, y entonces no
 * prueba nada —el trazo se construyó siguiendo esas posiciones—. El respaldo
 * se mide contra viajes que no participaron: si el candidato es una anomalía
 * (un desvío por una calle cortada, un coche que se fue a cargar combustible),
 * los demás viajes no lo van a acompañar y esto lo delata.
 */
export function shapeSupport(
  geometry: LngLat[],
  points: LngLat[],
  toleranceMeters: number,
): number {
  if (geometry.length < 2 || points.length === 0) return 0;

  let onShape = 0;
  for (const [lng, lat] of points) {
    if (distanceToPolyline(lat, lng, geometry) <= toleranceMeters) onShape++;
  }

  return onShape / points.length;
}

/**
 * Rellena una traza con puntos intermedios cada `spacingMeters`.
 *
 * Resuelve un problema de medición, no de dibujo. El feed publica cada 30 s,
 * así que a velocidad de calle las posiciones quedan a unos 300 m una de otra.
 * Preguntarle a esa nube "¿hay alguna posición a menos de 25 m de este tramo
 * del recorrido?" da que no en casi todo el recorrido, aunque el recorrido
 * esté perfecto: lo que se mide así es cada cuánto reporta el GPS, no si el
 * trazo va por la calle correcta.
 *
 * Uniendo las posiciones en orden y rellenando el segmento se obtiene el
 * corredor por el que pasó el ómnibus, que es contra lo que hay que comparar.
 * El precio es que la cuerda entre dos posiciones corta las curvas por dentro;
 * se compensa juntando varios viajes, porque cada uno cae en puntos distintos
 * de la curva y entre todos la cubren.
 */
export function densifyPolyline(points: LngLat[], spacingMeters: number): LngLat[] {
  if (points.length < 2) return [...points];

  const dense: LngLat[] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const [aLng, aLat] = points[i - 1];
    const [bLng, bLat] = points[i];
    const length = distanceMeters(aLat, aLng, bLat, bLng);

    const steps = Math.floor(length / spacingMeters);
    for (let step = 1; step <= steps; step++) {
      const t = (step * spacingMeters) / length;
      dense.push([aLng + (bLng - aLng) * t, aLat + (bLat - aLat) * t]);
    }

    dense.push(points[i]);
  }

  return dense;
}

/**
 * Polilínea con índice espacial, para proyectar muchos puntos sobre el mismo
 * recorrido.
 *
 * `snapToPolyline` recorre todos los segmentos, que para una consulta suelta
 * está bien: un recorrido tiene menos de mil puntos y el barrido se mide en
 * microsegundos. Deja de estarlo cuando hay que proyectar miles de posiciones
 * contra decenas de recorridos —que es lo que hace el emparejamiento con los
 * recorridos oficiales—: ahí son mil millones de operaciones.
 *
 * El índice es la misma grilla que usa `PointCloud`, pero sobre segmentos: se
 * anota cada segmento en las celdas de sus dos extremos y una consulta mira
 * sólo las nueve celdas de alrededor. La celda es de unos 220 m, bastante más
 * que cualquier tolerancia de las que se usan, así que un punto que cae cerca
 * del recorrido encuentra su segmento sin falta.
 */
export class PolylineIndex {
  /** Lado de la celda, en grados de latitud. Unos 220 m. */
  private static readonly CELL_DEG = 0.002;

  private readonly cells = new Map<string, number[]>();
  readonly cumulative: number[];

  constructor(readonly polyline: LngLat[]) {
    this.cumulative = cumulativeDistances(polyline);

    for (let i = 0; i < polyline.length - 1; i++) {
      for (const [lng, lat] of [polyline[i], polyline[i + 1]]) {
        const key = PolylineIndex.cellKey(lat, lng);
        const cell = this.cells.get(key);
        if (!cell) this.cells.set(key, [i]);
        else if (cell[cell.length - 1] !== i) cell.push(i);
      }
    }
  }

  private static cellKey(lat: number, lng: number): string {
    return `${Math.floor(lat / PolylineIndex.CELL_DEG)}:${Math.floor(lng / PolylineIndex.CELL_DEG)}`;
  }

  /** Largo total del recorrido, en metros. */
  get lengthMeters(): number {
    return this.cumulative[this.cumulative.length - 1] ?? 0;
  }

  /**
   * Ubica un punto sobre el recorrido. Devuelve null si no hay ningún segmento
   * en las celdas vecinas, o sea si el punto está lejos del trazo.
   */
  locate(lat: number, lng: number): AlongResult | null {
    const cellLat = Math.floor(lat / PolylineIndex.CELL_DEG);
    const cellLng = Math.floor(lng / PolylineIndex.CELL_DEG);

    const scaleLng = metersPerDegreeLng(lat);
    let best: AlongResult | null = null;

    for (let dLat = -1; dLat <= 1; dLat++) {
      for (let dLng = -1; dLng <= 1; dLng++) {
        const cell = this.cells.get(`${cellLat + dLat}:${cellLng + dLng}`);
        if (!cell) continue;

        for (const index of cell) {
          const [aLng, aLat] = this.polyline[index];
          const [bLng, bLat] = this.polyline[index + 1];

          const ax = (aLng - lng) * scaleLng;
          const ay = (aLat - lat) * METERS_PER_DEGREE_LAT;
          const bx = (bLng - lng) * scaleLng;
          const by = (bLat - lat) * METERS_PER_DEGREE_LAT;

          const dx = bx - ax;
          const dy = by - ay;
          const lengthSq = dx * dx + dy * dy;

          let t = 0;
          if (lengthSq > 0) {
            t = -(ax * dx + ay * dy) / lengthSq;
            t = Math.max(0, Math.min(1, t));
          }

          const offsetMeters = Math.hypot(ax + t * dx, ay + t * dy);
          if (best && offsetMeters >= best.offsetMeters) continue;

          best = {
            offsetMeters,
            alongMeters: this.cumulative[index] + t * Math.sqrt(lengthSq),
          };
        }
      }
    }

    return best;
  }
}
