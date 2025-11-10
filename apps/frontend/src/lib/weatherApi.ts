// Simple OpenWeatherMap API client
// Requiere VITE_OPENWEATHER_KEY en .env

const API_KEY = import.meta.env.VITE_OPENWEATHER_KEY;
const BASE_URL = 'https://api.openweathermap.org/data/2.5/weather';

export async function fetchWeather(lat: number, lon: number) {
  if (!API_KEY) throw new Error('Falta la API key de OpenWeather');
  const url = `${BASE_URL}?lat=${lat}&lon=${lon}&units=metric&lang=es&appid=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('No se pudo obtener el clima');
  return res.json();
}
