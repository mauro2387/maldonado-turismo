import { useCallback, useEffect, useRef, useState } from 'react';
import {
  transportService,
  Arrival,
  NearbyDeparture,
  VehiclePosition,
} from '@services/transportService';
import { Coords } from '@lib/geo';

/**
 * Datos en vivo del transporte.
 *
 * Todo lo que se refresca solo pasa por acá, con un intervalo único: cada
 * pantalla montando su propio `setInterval` terminaba pidiendo lo mismo tres
 * veces por segundo desde vistas distintas.
 */

/** El feed de las empresas publica cada ~15 s; pedir más seguido no trae nada nuevo. */
const REFRESH_MS = 15000;

interface UseNearbyDeparturesResult {
  stops: NearbyDeparture[];
  /** False mientras el backend no tenga recorridos con los que calcular. */
  ready: boolean;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useNearbyDepartures(
  coords: Coords | null,
  radius = 800,
): UseNearbyDeparturesResult {
  const [stops, setStops] = useState<NearbyDeparture[]>([]);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // La primera carga muestra esqueletos; las siguientes actualizan en silencio
  // para que la lista no parpadee cada quince segundos.
  const loadedOnce = useRef(false);

  const fetchDepartures = useCallback(async () => {
    if (!coords) return;

    try {
      if (!loadedOnce.current) setLoading(true);
      const response = await transportService.getNearbyDepartures(coords.lat, coords.lng, radius);
      setStops(response.stops ?? []);
      setReady(response.ready !== false);
      setError(null);
      loadedOnce.current = true;
    } catch (err: any) {
      setError(err?.message || 'No pudimos traer los próximos ómnibus');
    } finally {
      setLoading(false);
    }
  }, [coords?.lat, coords?.lng, radius]);

  useEffect(() => {
    fetchDepartures();
    const timer = setInterval(fetchDepartures, REFRESH_MS);
    return () => clearInterval(timer);
  }, [fetchDepartures]);

  return { stops, ready, loading, error, refetch: fetchDepartures };
}

/** Llegadas de una sola parada, para su ficha. */
export function useStopArrivals(stopId: string | number | undefined) {
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchArrivals = useCallback(async () => {
    if (stopId === undefined) return;

    try {
      const data = await transportService.getStopArrivals(stopId);
      setArrivals(data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'No pudimos traer los próximos ómnibus');
    } finally {
      setLoading(false);
    }
  }, [stopId]);

  useEffect(() => {
    fetchArrivals();
    const timer = setInterval(fetchArrivals, REFRESH_MS);
    return () => clearInterval(timer);
  }, [fetchArrivals]);

  return { arrivals, loading, error, refetch: fetchArrivals };
}

/** Flota en vivo para el mapa. */
export function useVehiclePositions(enabled = true) {
  const [vehicles, setVehicles] = useState<VehiclePosition[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setVehicles([]);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const data = await transportService.getVehiclePositions();
        if (!cancelled) {
          setVehicles(data);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'No pudimos traer los ómnibus en vivo');
      }
    };

    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled]);

  return { vehicles, error };
}
