import { useState, useEffect } from 'react';
import {
  transportService,
  BusStop,
  BusRoute,
  TransportAlert,
  TransportLine,
} from '@services/transportService';

interface UseStopsResult {
  stops: BusStop[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch all bus stops
 */
export function useStops(): UseStopsResult {
  const [stops, setStops] = useState<BusStop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStops = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await transportService.getAllStops();
      setStops(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar paradas');
      console.error('Error fetching stops:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStops();
  }, []);

  return { stops, loading, error, refetch: fetchStops };
}

interface UseRoutesResult {
  routes: BusRoute[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch all bus routes
 */
export function useRoutes(): UseRoutesResult {
  const [routes, setRoutes] = useState<BusRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRoutes = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await transportService.getAllRoutes();
      setRoutes(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar líneas');
      console.error('Error fetching routes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutes();
  }, []);

  return { routes, loading, error, refetch: fetchRoutes };
}

interface UseAlertsResult {
  alerts: TransportAlert[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch transport alerts
 */
export function useAlerts(): UseAlertsResult {
  const [alerts, setAlerts] = useState<TransportAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await transportService.getAlerts();
      setAlerts(data);
    } catch (err: any) {
      // No mostrar error crítico, solo loguear y continuar con array vacío
      console.error('Error fetching alerts:', err);
      setError(null); // No establecer error para no romper la UI
      setAlerts([]); // Continuar con array vacío
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  return { alerts, loading, error, refetch: fetchAlerts };
}

/**
 * Las líneas que están circulando, con sus recorridos de ida y de vuelta.
 *
 * El catálogo `bus_routes` de la base son dos filas de ejemplo que no se
 * corresponden con ninguna línea real, así que esto no sale de ahí: sale de
 * los recorridos que las empresas publican y que el GPS confirma que están en
 * la calle hoy (ver el controlador `transport/lines`).
 */
export function useLines() {
  const [lines, setLines] = useState<TransportLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    transportService
      .getLines()
      .then((data) => {
        if (!cancelled) setLines(data);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message ?? 'No pudimos traer las líneas');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { lines, loading, error };
}
