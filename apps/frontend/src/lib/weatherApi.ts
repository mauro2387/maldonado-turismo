/**
 * Clima real, sin clave de API.
 *
 * Antes la portada mostraba "22°C soleado" escrito a mano. Se usa Open-Meteo
 * en vez de OpenWeather porque no pide registro ni clave — una clave en el
 * bundle del frontend es una clave pública — y porque tiene la temperatura del
 * agua, que en una ciudad balnearia se consulta tanto como la del aire.
 */

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';
const TIMEZONE = 'America/Montevideo';

export interface Weather {
  temperature: number;
  description: string;
  windSpeed: number;
  windDirection: string;
  isDay: boolean;
  /** Temperatura del agua. null si la grilla marina no cubre el punto. */
  seaTemperature: number | null;
}

/** Códigos WMO agrupados: la gente no necesita 28 estados distintos. */
function describeWeatherCode(code: number): string {
  if (code === 0) return 'Despejado';
  if (code <= 2) return 'Parcialmente nublado';
  if (code === 3) return 'Nublado';
  if (code <= 48) return 'Neblina';
  if (code <= 57) return 'Llovizna';
  if (code <= 67) return 'Lluvia';
  if (code <= 77) return 'Nieve';
  if (code <= 82) return 'Chaparrones';
  if (code <= 86) return 'Chaparrones de nieve';
  return 'Tormenta';
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

function describeWindDirection(degrees: number): string {
  return COMPASS[Math.round(degrees / 45) % 8];
}

/**
 * La temperatura del agua se pide aparte y su falla no rompe la tarjeta: si la
 * grilla marina no cubre el punto, se muestra solo el aire.
 */
async function fetchSeaTemperature(lat: number, lon: number): Promise<number | null> {
  try {
    const url = `${MARINE_URL}?latitude=${lat}&longitude=${lon}&current=sea_surface_temperature&timezone=${TIMEZONE}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const value = data?.current?.sea_surface_temperature;
    return typeof value === 'number' ? Math.round(value) : null;
  } catch {
    return null;
  }
}

export async function fetchWeather(lat: number, lon: number): Promise<Weather> {
  const url =
    `${FORECAST_URL}?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day` +
    `&timezone=${TIMEZONE}`;

  const response = await fetch(url);
  if (!response.ok) throw new Error('No se pudo obtener el clima');

  const data = await response.json();
  const current = data?.current;
  if (!current) throw new Error('Respuesta de clima incompleta');

  const seaTemperature = await fetchSeaTemperature(lat, lon);

  return {
    temperature: Math.round(current.temperature_2m),
    description: describeWeatherCode(current.weather_code),
    windSpeed: Math.round(current.wind_speed_10m),
    windDirection: describeWindDirection(current.wind_direction_10m),
    isDay: current.is_day === 1,
    seaTemperature,
  };
}
