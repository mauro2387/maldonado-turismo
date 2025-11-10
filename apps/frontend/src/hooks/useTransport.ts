import { useState, useEffect } from 'react';
import { 
  transportService, 
  BusStop, 
  BusRoute, 
  TransportAlert, 
  NextBus 
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

interface UseStopArrivalsResult {
  arrivals: NextBus[];
  loading: boolean;
  error: string | null;
  refetch: (stopId: string) => Promise<void>;
}

/**
 * Hook to fetch real-time arrivals for a stop
 */
export function useStopArrivals(): UseStopArrivalsResult {
  const [arrivals, setArrivals] = useState<NextBus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchArrivals = async (stopId: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await transportService.getStopArrivals(stopId);
      setArrivals(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar llegadas');
      console.error('Error fetching arrivals:', err);
    } finally {
      setLoading(false);
    }
  };

  return { arrivals, loading, error, refetch: fetchArrivals };
}
