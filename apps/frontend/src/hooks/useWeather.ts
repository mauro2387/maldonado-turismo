import { useEffect, useState } from 'react';
import { fetchWeather, Weather } from '@lib/weatherApi';
import { Coords } from '@lib/geo';

/**
 * Clima del punto donde está el usuario. Si falla, la tarjeta no se muestra:
 * es preferible una portada sin clima que una con un dato inventado.
 */
export function useWeather(coords: Coords | null) {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!coords) return;

    let cancelled = false;
    setLoading(true);

    fetchWeather(coords.lat, coords.lng)
      .then((result) => {
        if (!cancelled) setWeather(result);
      })
      .catch(() => {
        if (!cancelled) setWeather(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Redondeado a ~1 km: mover el teléfono unos metros no cambia el clima ni
    // justifica otro pedido.
  }, [coords && coords.lat.toFixed(2), coords && coords.lng.toFixed(2)]);

  return { weather, loading };
}

export default useWeather;
