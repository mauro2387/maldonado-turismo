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

  /**
   * De dónde salió la parada: 'avl' es deducida del feed de las empresas
   * —código y nombre son de ellas, la coordenada es una estimación— y 'manual'
   * es carga de la Intendencia. `spread_m` dice qué tan firme es la posición.
   */
  source?: 'manual' | 'avl' | 'placeholder';
  operators?: string[];
  samples?: number;
  spread_m?: number;

  /**
   * Radio en metros dentro del cual está la parada de verdad.
   *
   * Distinto de `spread_m`, que dice cuán juntas están las muestras: esto dice
   * cuán lejos puede estar la respuesta de la parada de verdad, y está
   * calibrado contra los nodos relevados en OpenStreetMap. Es lo que decide si
   * la app puede decir "esperá acá" o tiene que decir "la parada está por acá".
   */
  accuracy_m?: number | null;

  /** De dónde salió la coordenada: osm, detenciones, intervalo, manual. */
  fix_source?: string | null;
}

export interface NextBus {
  route: string;
  destination: string;
  time: string;
  estimatedMinutes?: number;
}

/**
 * Una llegada calculada por el backend a partir de la posición en vivo del
 * ómnibus sobre el recorrido reconstruido.
 */
export interface Arrival {
  line_code: string;
  /** El número del cartel: "17/19" y no "179". */
  line_label?: string;
  line_name: string | null;
  operator: string;
  direction: number | null;
  destination: string | null;
  vehicle_id: string;
  eta_minutes: number;
  distance_m: number;
  /** Antigüedad del último dato GPS. La interfaz decide con esto si es "en vivo". */
  fix_age_seconds: number;
  live: boolean;
  accessible: boolean | null;
  electric: boolean;
  occupancy_pct: number | null;
}

/** Una parada cercana con sus próximas llegadas, tal como la devuelve la API. */
export interface NearbyDeparture {
  id: number;
  code: string;
  name: string;
  zone: string;
  lat: number;
  lng: number;
  has_shelter: boolean;
  accessibility: boolean;
  distance_m: number;
  lines: string[];
  arrivals: Arrival[];
}

export interface NearbyDeparturesResponse {
  stops: NearbyDeparture[];
  /**
   * False mientras no haya recorridos reconstruidos. Sirve para distinguir "no
   * viene ningún ómnibus ahora" de "todavía no sabemos calcularlo", que para
   * el usuario son dos mensajes muy distintos.
   */
  ready: boolean;
}

export interface VehiclePosition {
  id: string;
  vehicle_id: string;
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
  operator?: string | null;
  line_code?: string | null;
  /** El número del cartel: "17/19" y no "179", que es como llega del feed. */
  line_label?: string | null;
  line_name?: string | null;
  direction?: number | null;
  accessible?: boolean | null;
  electric?: boolean | null;
  occupancy_pct?: number | null;
  stopped_minutes?: number | null;

  /**
   * Por dónde viene, según el propio feed de la empresa. Maldonado Turismo
   * solo publica la anterior, así que `next_stop_*` puede venir vacío aunque
   * la unidad esté en viaje.
   */
  prev_stop_code?: string | null;
  prev_stop_name?: string | null;
  next_stop_code?: string | null;
  next_stop_name?: string | null;

  departure_time?: string | null;
  fix_time?: string | null;
  recorded_at?: string;

  /**
   * False cuando el cartel dice que el coche no está haciendo un servicio
   * -"Carga Combustible", "Traslados contratados"-. Anda por la calle, pero
   * nadie se lo puede tomar, así que no va al mapa ni al filtro de líneas.
   */
  in_service?: boolean;
}

export interface RouteShape {
  operator: string;
  line_code: string;
  /** El número del cartel: "17/19" y no "179". */
  line_label?: string;
  /**
   * Cuál de los recorridos de la línea es.
   *
   * Una línea no tiene un recorrido: la 24 hace cuatro por avenidas distintas
   * y la 19 hace cinco. La clave es el destino publicado, normalizado, y es la
   * misma que el `line_name` de la unidad puesto en mayúsculas.
   */
  itinerary_key: string;
  itinerary_name: string | null;
  direction: number | null;
  /** Orden GeoJSON [lng, lat]; Leaflet necesita [lat, lng]. */
  geometry: [number, number][];
  /** Proporción del trazo que pisa calle recorrida de verdad (0..1). */
  confidence?: number | null;

  /**
   * Ida, vuelta o circular, según lo nombra la empresa. Es lo que permite
   * dibujar los dos sentidos con colores distintos y decir cuál es cuál.
   * Null en los recorridos que la empresa nombra por sus puntas ("La Fortuna
   * - Punta del Este") en vez de por sentido.
   */
  way?: 'ida' | 'vuelta' | 'circular' | null;
  /** La variante tal como la nombra la empresa: "ida-desde-vialidad". */
  variant?: string | null;

  /**
   * De dónde sale el trazo. 'oficial' es el recorrido que publica la empresa
   * en su mapa; 'avl' es la reconstrucción a partir del GPS, que se usa en las
   * pocas líneas que la empresa no publica. La diferencia se le cuenta a quien
   * mira el mapa: no es lo mismo seguir un recorrido oficial que uno deducido.
   */
  source?: 'oficial' | 'avl';

  /** Las paradas del recorrido, en orden. */
  stops?: RouteShapeStop[];

  /** Lo que la empresa publica sobre este recorrido. */
  official?: {
    name: string;
    headsign: string | null;
    /** El recorrido calle por calle, textual, como lo publica la empresa. */
    street_text: string | null;
    /** "Pasadas de interés": terminal, shopping, hospital. */
    highlights: string[];
    source_url: string;
  } | null;
}

/** Una caminata ruteada por calle, para dibujarla en el mapa. */
export interface Walk {
  distance_m: number;
  minutes: number;
  /** Orden GeoJSON [lng, lat]. */
  geometry: [number, number][];
  /** True cuando no se pudo rutear y el camino es la recta. */
  straight: boolean;
}

/**
 * Lo que le queda hoy a una línea en una parada, según el papel.
 *
 * `finished` es el dato que cambia lo que hace la persona: con `false`
 * conviene esperar, con `true` hay que buscar otra cosa. A las 23:40 en San
 * Carlos, esa diferencia es un taxi de treinta kilómetros.
 */
export interface StopLineToday {
  line_label: string;
  operator: string;
  headsign: string | null;
  next_in_minutes: number | null;
  next_at: string | null;
  previous_ago_minutes: number | null;
  previous_at: string | null;
  last_at: string;
  finished: boolean;
  /** El que viene es el último del día: si lo perdés, no hay otro. */
  is_last: boolean;
  services_today: number;
}

export interface StopScheduleToday {
  /** False cuando no hay horarios cargados para la temporada de hoy. */
  available: boolean;
  lines: StopLineToday[];
  last_at: string | null;
  /** Ninguna línea pasa más hoy por esta parada. */
  finished: boolean;
}

/**
 * Si está entrando el GPS de cada empresa.
 *
 * Sirve para no mentir. Con el feed caído la app decía "No hay ómnibus en
 * camino ahora", que suena a dato y es ignorancia: no distingue *ninguno
 * viene* de *no tenemos idea*, y deja a alguien esperando en la parada por una
 * frase dicha con seguridad.
 */
export interface TransportHealth {
  status: 'ok' | 'degradado' | 'caido' | 'arrancando' | 'apagado';
  checked_at: string;
  uptime_seconds: number;
  stale_after_minutes: number;
  feeds: Array<{
    operator: string;
    state: 'ok' | 'caido' | 'arrancando' | 'apagado';
    ok: boolean;
    last_success_at: string | null;
    last_failure_at: string | null;
    last_error: string | null;
    seconds_since_success: number | null;
    vehicles_last_success: number | null;
    consecutive_failures: number;
  }>;
  schedules: {
    season: 'verano' | 'invierno';
    loaded_season: string | null;
    lines: number;
    available: boolean;
    warning: string | null;
  };
}

/**
 * La respuesta de "¿llego a tomar este ómnibus?".
 *
 * `reason` dice por qué no, cuando no: `pasa_antes` es que el coche llega a la
 * parada antes que uno, `lejos` que ninguna parada de lo que le falta está a
 * distancia de caminar, y `ya_paso` que no le queda ninguna por delante.
 */
export interface CatchResult {
  catchable: boolean;
  stop: { id: number; name: string; lat: number; lng: number } | null;
  walk_minutes: number | null;
  walk_distance_m: number | null;
  walk_geometry: [number, number][];
  walk_straight: boolean;
  bus_minutes: number | null;
  /** Minutos de sobra al llegar a la parada. */
  slack_minutes: number | null;
  reason: 'pasa_antes' | 'lejos' | 'sin_recorrido' | 'ya_paso' | null;
  nearest_walk_m: number | null;
}

export interface RouteShapeStop {
  id: number;
  code: string;
  name: string;
  lat: number;
  lng: number;
  sequence: number;
  /**
   * Si la posición de la parada es lo bastante firme como para mandar a
   * alguien a caminar hasta ahí. Las que no lo son se dibujan igual —la parada
   * existe y el ómnibus para— pero no se ofrecen como lugar donde esperar.
   */
  reliable?: boolean;
  /**
   * Radio en metros dentro del cual está la parada de verdad, medido contra
   * los nodos relevados de OpenStreetMap. `null` si todavía no se midió.
   */
  accuracy_m?: number | null;
  /** De dónde salió la coordenada: osm, detenciones, intervalo, manual. */
  fix_source?: string | null;
}

/** El horario publicado de una línea, por sentido. */
export interface LineTimetable {
  /** False cuando la línea no tiene horario cargado para la temporada de hoy. */
  available: boolean;
  line_label?: string;
  /** invierno | verano. */
  season?: string;
  /** El texto de vigencia tal como lo publica la empresa. */
  valid_text?: string | null;
  source_url?: string | null;
  document?: string | null;
  directions?: Array<{
    direction: string;
    /** Los puntos de control, en orden del recorrido. Son las columnas. */
    points: string[];
    services: Array<{
      /** Una hora por columna; null donde el servicio no pasa por ese punto. */
      times: (string | null)[];
      /** Máscara de días: lunes=1 ... domingo=64. */
      days: number;
      refs: string[];
    }>;
  }>;
}

/** Una línea con los recorridos que efectivamente está haciendo hoy. */
export interface TransportLine {
  operator: string;
  line_code: string;
  /** El número del cartel: "17/19" y no "179". */
  line_label?: string;
  /** Paradas distintas de la línea, sumando todos sus recorridos. */
  stops_count: number;
  itineraries: Array<{
    itinerary_key: string;
    /** El cartel del ómnibus: es como la gente la nombra. */
    headsign: string | null;
    /** Cómo la nombra la empresa en su mapa. */
    name: string | null;
    way: 'ida' | 'vuelta' | 'circular' | null;
    distance_m: number | null;
    stops_count: number;
    source: 'oficial' | 'avl';
    highlights: string[];
  }>;
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
    const stops = await api.get<BusStop[]>('/transport/stops');
    // lat y lng son `numeric` en Postgres y el driver los devuelve como texto
    // para no perder precisión. Leaflet los tolera —convierte al construir el
    // punto— pero cualquier cuenta con ellos da NaN, que es lo que rompía la
    // distancia a la parada en la hoja del mapa.
    return stops.map((stop) => ({
      ...stop,
      lat: Number(stop.lat),
      lng: Number(stop.lng),
    }));
  },

  /**
   * Get a single bus stop by ID
   */
  getStopById: async (id: string): Promise<BusStop> => {
    const stop = await api.get<BusStop>(`/transport/stops/${id}`);
    return { ...stop, lat: Number(stop.lat), lng: Number(stop.lng) };
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
   * Próximas llegadas a una parada, calculadas con las posiciones en vivo.
   */
  getStopArrivals: async (stopId: string | number): Promise<Arrival[]> => {
    const response = await api.get<{ arrivals: Arrival[] }>(
      `/transport/stops/${stopId}/arrivals`,
    );
    return response.arrivals ?? [];
  },

  /**
   * Paradas cercanas con sus llegadas, en un solo pedido. Es lo que pinta la
   * pantalla "Cerca tuyo" sin pedirle nada al usuario.
   */
  getNearbyDepartures: async (
    lat: number,
    lng: number,
    radius = 800,
  ): Promise<NearbyDeparturesResponse> => {
    return api.get<NearbyDeparturesResponse>('/transport/departures/nearby', {
      params: { lat, lng, radius },
    });
  },

  /** Posiciones en vivo de la flota, ya pegadas a la calle por el backend. */
  getVehiclePositions: async (): Promise<VehiclePosition[]> => {
    return api.get<VehiclePosition[]>('/transport/vehicles');
  },

  /**
   * Recorridos siguiendo las calles reales.
   *
   * Hay que pedir línea **e itinerario**: pedir solo la línea devuelve todos
   * sus recorridos, que pueden ser seis por avenidas distintas, y dibujarlos
   * juntos es la maraña que había antes. El itinerario es el `line_name` de la
   * unidad; el backend lo normaliza igual de los dos lados.
   */
  getRouteShapes: async (line?: string, itinerary?: string): Promise<RouteShape[]> => {
    const params: Record<string, string> = {};
    if (line) params.line = line;
    if (itinerary) params.itinerary = itinerary;
    return api.get<RouteShape[]>(
      '/transport/shapes',
      Object.keys(params).length > 0 ? { params } : undefined,
    );
  },

  /**
   * Qué le queda hoy a esta parada, según el horario publicado.
   *
   * Es la otra mitad de la respuesta: las llegadas dicen qué está pasando
   * ahora, esto dice qué **debería** pasar. Sin esto, a las 23:40 la app decía
   * "ningún ómnibus en camino" tanto si faltaban veinte minutos como si el
   * servicio se había terminado a las 22 — y son dos cosas que llevan a hacer
   * cosas distintas.
   */
  getStopSchedule: async (stopId: string | number): Promise<StopScheduleToday> => {
    return api.get<StopScheduleToday>(`/transport/stops/${stopId}/schedule`);
  },

  /**
   * ¿Está entrando el GPS de las empresas?
   *
   * Lo pregunta la app para saber si puede decir "no viene ninguno" o tiene
   * que decir "no tenemos el GPS de esta empresa, te muestro el horario".
   */
  getHealth: async (): Promise<TransportHealth> => {
    return api.get<TransportHealth>('/transport/health');
  },

  /**
   * ¿Llego a tomar este ómnibus, y en qué parada?
   *
   * La cuenta la hace el backend, que es el único que tiene los tres datos que
   * hacen falta: la velocidad **medida** de esa línea, el camino a pie por
   * calle y el orden de paradas del recorrido. Hacerla en la pantalla con
   * constantes escritas a mano daba sistemáticamente que no se llegaba.
   */
  getCatch: async (
    vehicleId: string,
    from: { lat: number; lng: number },
  ): Promise<CatchResult> => {
    return api.get<CatchResult>(`/transport/vehicles/${encodeURIComponent(vehicleId)}/catch`, {
      params: {
        // Cinco decimales es un metro: alcanza para esto y no deja la
        // ubicación exacta de nadie en los logs del servidor.
        lat: Number(from.lat.toFixed(5)),
        lng: Number(from.lng.toFixed(5)),
      },
    });
  },

  /**
   * El camino a pie entre dos puntos, por calle y por donde camina una
   * persona: no respeta las manos, que es lo que hacía que la caminata diera
   * vueltas a la manzana.
   */
  getWalk: async (
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
  ): Promise<Walk> => {
    return api.get<Walk>('/transport/walk', {
      params: {
        // Cinco decimales es un metro: lo que necesita un dibujo, sin dejar la
        // ubicación exacta de nadie en los logs del servidor.
        fromLat: Number(from.lat.toFixed(5)),
        fromLng: Number(from.lng.toFixed(5)),
        toLat: Number(to.lat.toFixed(5)),
        toLng: Number(to.lng.toFixed(5)),
      },
    });
  },

  /** Las líneas que circulan, con sus recorridos de ida y de vuelta. */
  getLines: async (): Promise<TransportLine[]> => {
    return api.get<TransportLine[]>('/transport/lines');
  },

  /**
   * El horario publicado de una línea. `available` es false cuando esa línea
   * no tiene horario cargado para la temporada de hoy.
   */
  getLineSchedule: async (label: string): Promise<LineTimetable> => {
    return api.get<LineTimetable>(`/transport/lines/${encodeURIComponent(label)}/schedule`);
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
