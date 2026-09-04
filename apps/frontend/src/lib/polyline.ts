/**
 * Geometría sobre el recorrido, del lado del teléfono.
 *
 * Sirve para partir el trazo de una línea en los pedazos que contestan la
 * pregunta de quien mira el mapa: por dónde **viene** el ómnibus hasta la
 * parada donde uno lo va a tomar, y por dónde **sigue** después. Se hace acá y
 * no en el servidor porque el ómnibus se mueve cada quince segundos: pedirle
 * el corte al backend en cada actualización sería un viaje de ida y vuelta por
 * una cuenta de microsegundos.
 *
 * Es la misma proyección que hace el backend en `geo.util.ts`, en chico: a la
 * escala de Maldonado alcanza con llevar las coordenadas a un plano local.
 */

/** Coordenada en orden GeoJSON: [lng, lat]. Es como viene de la API. */
export type LngLat = [number, number];

/** Coordenada en el orden que quiere Leaflet: [lat, lng]. */
export type LatLng = [number, number];

const EARTH_RADIUS_M = 6371000;
const DEG_TO_RAD = Math.PI / 180;
const METERS_PER_DEGREE_LAT = EARTH_RADIUS_M * DEG_TO_RAD;

function metersPerDegreeLng(latitude: number): number {
  return EARTH_RADIUS_M * DEG_TO_RAD * Math.cos(latitude * DEG_TO_RAD);
}

export function distanceMeters(
  latA: number,
  lngA: number,
  latB: number,
  lngB: number,
): number {
  const scaleLng = metersPerDegreeLng((latA + latB) / 2);
  return Math.hypot((lngB - lngA) * scaleLng, (latB - latA) * METERS_PER_DEGREE_LAT);
}

/** Distancia acumulada hasta cada punto del trazo. Se calcula una vez. */
export function cumulativeDistances(polyline: LngLat[]): number[] {
  const cumulative = new Array<number>(polyline.length);
  cumulative[0] = 0;

  for (let i = 1; i < polyline.length; i++) {
    const [prevLng, prevLat] = polyline[i - 1];
    const [lng, lat] = polyline[i];
    cumulative[i] = cumulative[i - 1] + distanceMeters(prevLat, prevLng, lat, lng);
  }

  return cumulative;
}

export interface Projection {
  /** Metros de recorrido desde el arranque hasta el punto proyectado. */
  alongMeters: number;
  /** Cuánto se apartaba el punto original del trazo. */
  offsetMeters: number;
}

/**
 * Ubica un punto sobre el trazo: cuántos metros de recorrido quedan por detrás
 * de él. Recorre todos los segmentos, que para un recorrido de menos de mil
 * puntos son unos pocos microsegundos.
 */
export function projectOnPolyline(
  lat: number,
  lng: number,
  polyline: LngLat[],
  cumulative: number[],
): Projection | null {
  if (polyline.length < 2) return null;

  const scaleLng = metersPerDegreeLng(lat);
  let best: Projection | null = null;

  for (let i = 0; i < polyline.length - 1; i++) {
    const [aLng, aLat] = polyline[i];
    const [bLng, bLat] = polyline[i + 1];

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

    best = { offsetMeters, alongMeters: cumulative[i] + t * Math.sqrt(lengthSq) };
  }

  return best;
}

/** El punto del trazo que está a `meters` del arranque. */
export function pointAt(polyline: LngLat[], cumulative: number[], meters: number): LngLat {
  let segment = 0;
  while (segment < polyline.length - 2 && cumulative[segment + 1] < meters) segment++;

  const span = cumulative[segment + 1] - cumulative[segment];
  const t = span > 0 ? (meters - cumulative[segment]) / span : 0;
  const [aLng, aLat] = polyline[segment];
  const [bLng, bLat] = polyline[segment + 1];

  return [aLng + (bLng - aLng) * t, aLat + (bLat - aLat) * t];
}

/**
 * El pedazo del trazo entre dos distancias, ya en el orden de Leaflet.
 *
 * Devuelve un arreglo vacío cuando el tramo no existe -el ómnibus ya pasó la
 * parada, por ejemplo-, y quien dibuja simplemente no dibuja nada.
 */
export function sliceForLeaflet(
  polyline: LngLat[],
  cumulative: number[],
  fromMeters: number,
  toMeters: number,
): LatLng[] {
  if (polyline.length < 2 || toMeters - fromMeters < 1) return [];

  const from = Math.max(0, fromMeters);
  const to = Math.min(cumulative[cumulative.length - 1], toMeters);
  if (to <= from) return [];

  const sliced: LatLng[] = [];
  const start = pointAt(polyline, cumulative, from);
  sliced.push([start[1], start[0]]);

  for (let i = 0; i < polyline.length; i++) {
    if (cumulative[i] > from && cumulative[i] < to) {
      sliced.push([polyline[i][1], polyline[i][0]]);
    }
  }

  const end = pointAt(polyline, cumulative, to);
  sliced.push([end[1], end[0]]);

  return sliced;
}

/** Todo el trazo, en el orden de Leaflet. */
export function toLeaflet(polyline: LngLat[]): LatLng[] {
  return polyline.map(([lng, lat]) => [lat, lng] as LatLng);
}
