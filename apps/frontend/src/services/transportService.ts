import { api } from '@lib/apiClient';

export interface BusStop {
  id: number;
  code: string;
  name: string;
  description?: string;
  lat: number;
  lng: number;
  zone: string;
  address?: string;
  has_shelter: boolean;
  has_bench: boolean;
  has_lighting: boolean;
  accessibility: boolean;
  is_active: boolean;
  routes?: string[];
  nextBuses?: NextBus[];
  distance?: string;
}

export interface NextBus {
  route: string;
  destination: string;
  time: string;
  estimatedMinutes?: number;
}

export interface BusRoute {
  id: number;
  code: string;
  name: string;
  description?: string;
  route_type: number;
  color?: string;
  text_color?: string;
  frequency_minutes?: number;
  fare_price?: number;
  is_active: boolean;
  // Aliases para compatibilidad con UI
  route_color?: string;
}

export interface TransportAlert {
  id: number;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'danger';
  alert_type: 'detour' | 'delay' | 'construction' | 'accident' | 'other';
  route_id?: number;
  stop_id?: number;
  effective_from: string;
  effective_to?: string;
  type?: 'info' | 'warning' | 'danger'; // Alias for compatibility
  affectedRoutes?: string[];
  startDate?: string; // Alias for compatibility
  endDate?: string;
}

export const transportService = {
  /**
   * Get all bus stops
   */
  getAllStops: async (): Promise<BusStop[]> => {
    return api.get<BusStop[]>('/transport/stops');
  },

  /**
   * Get a single bus stop by ID
   */
  getStopById: async (id: string): Promise<BusStop> => {
    return api.get<BusStop>(`/transport/stops/${id}`);
  },

  /**
   * Get nearby stops based on coordinates
   */
  getNearbyStops: async (lat: number, lng: number, radius: number = 500): Promise<BusStop[]> => {
    return api.get<BusStop[]>('/transport/stops/nearby', {
      params: { lat, lng, radius },
    });
  },

  /**
   * Get real-time arrivals for a stop (mock for now)
   */
  getStopArrivals: async (_stopId: string): Promise<NextBus[]> => {
    // TODO: Implementar cuando esté ETA service
    return [];
  },

  /**
   * Get all bus routes
   */
  getAllRoutes: async (): Promise<BusRoute[]> => {
    const routes = await api.get<BusRoute[]>('/transport/routes');
    // Add compatibility alias
    return routes.map(route => ({
      ...route,
      route_color: route.color ? `#${route.color}` : '#1976D2',
    }));
  },

  /**
   * Get a single route by ID
   */
  getRouteById: async (id: string): Promise<BusRoute> => {
    return api.get<BusRoute>(`/transport/routes/${id}`);
  },

  /**
   * Get active transport alerts
   */
  getAlerts: async (): Promise<TransportAlert[]> => {
    const alerts = await api.get<TransportAlert[]>('/transport/alerts/active');
    // Add compatibility aliases
    return alerts.map((alert: TransportAlert) => ({
      ...alert,
      type: alert.severity,
      startDate: alert.effective_from,
      endDate: alert.effective_to,
    }));
  },

  /**
   * Search stops by name
   */
  searchStops: async (query: string): Promise<BusStop[]> => {
    return api.get<BusStop[]>('/transport/stops', {
      params: { search: query },
    });
  },
};
