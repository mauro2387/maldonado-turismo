/**
 * Distancias y formato de distancia.
 *
 * A la escala de Maldonado alcanza con la fórmula de haversine: el error es de
 * centímetros y evita arrastrar una librería geoespacial al bundle del
 * teléfono.
 */

const EARTH_RADIUS_M = 6371000;
const DEG_TO_RAD = Math.PI / 180;

/** Distancia en metros entre dos coordenadas. */
export function distanceMeters(latA: number, lngA: number, latB: number, lngB: number): number {
  const dLat = (latB - latA) * DEG_TO_RAD;
  const dLng = (lngB - lngA) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(latA * DEG_TO_RAD) * Math.cos(latB * DEG_TO_RAD) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** "120 m" hasta el kilómetro, "1,4 km" de ahí en más. */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '';
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toLocaleString('es-UY', { maximumFractionDigits: 1 })} km`;
}

/**
 * Minutos caminando. 4,8 km/h es el paso al que camina la mayoría de la gente
 * en ciudad, que es el valor que usan las apps de transporte para no prometer
 * de menos.
 */
const WALKING_SPEED_M_PER_MIN = 80;

export function walkingMinutes(meters: number): number {
  return Math.max(1, Math.round(meters / WALKING_SPEED_M_PER_MIN));
}

export interface Coords {
  lat: number;
  lng: number;
}

/** Ordena por cercanía a un punto y devuelve la distancia ya calculada. */
export function sortByDistance<T>(
  items: T[],
  origin: Coords,
  getCoords: (item: T) => Coords | null,
): Array<T & { distanceM: number }> {
  return items
    .map((item) => {
      const coords = getCoords(item);
      if (!coords) return null;
      return {
        ...item,
        distanceM: distanceMeters(origin.lat, origin.lng, coords.lat, coords.lng),
      };
    })
    .filter((item): item is T & { distanceM: number } => item !== null)
    .sort((a, b) => a.distanceM - b.distanceM);
}
