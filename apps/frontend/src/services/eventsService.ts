import { api } from '@lib/apiClient';

export interface Event {
  id: string;
  title: string;
  description: string;
  longDescription?: string;
  category: string;
  date: string;
  time: string;
  endTime?: string;
  location: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  // La API devuelve las columnas lat/lng de la base; se declaran los dos pares
  // igual que en Place, porque hay código que lee uno u otro.
  lat?: number;
  lng?: number;
  image?: string;
  gallery?: string[];
  price?: string;
  organizer?: string;
  contact?: {
    phone?: string;
    email?: string;
    website?: string;
  };
  attendees?: number;
  capacity?: number;
  tags?: string[];
  weatherDependent?: boolean;
  accessibility?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface EventFilters {
  category?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export const eventsService = {
  /**
   * Get all events with optional filters
   */
  getAll: async (filters?: EventFilters): Promise<Event[]> => {
    const params = new URLSearchParams();
    if (filters?.category) params.append('category', filters.category);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());

    const query = params.toString();
    return api.get<Event[]>(`/events${query ? `?${query}` : ''}`);
  },

  /**
   * Get a single event by ID
   */
  getById: async (id: string): Promise<Event> => {
    return api.get<Event>(`/events/${id}`);
  },

  /**
   * Get upcoming events
   */
  getUpcoming: async (limit: number = 10): Promise<Event[]> => {
    return api.get<Event[]>(`/events/upcoming?limit=${limit}`);
  },

  /**
   * Get events by date range
   */
  getByDateRange: async (startDate: string, endDate: string): Promise<Event[]> => {
    return api.get<Event[]>(`/events/range?startDate=${startDate}&endDate=${endDate}`);
  },

  /**
   * Search events by title or description
   */
  search: async (query: string): Promise<Event[]> => {
    return api.get<Event[]>(`/events/search?q=${encodeURIComponent(query)}`);
  },

  /**
   * Register interest in an event
   */
  registerInterest: async (eventId: string): Promise<void> => {
    return api.post(`/events/${eventId}/interest`);
  },

  /**
   * Create a new event (admin only)
   */
  create: async (data: Partial<Event>): Promise<Event> => {
    return api.post<Event>('/events', data);
  },

  /**
   * Update an event (admin only)
   */
  update: async (id: string, data: Partial<Event>): Promise<Event> => {
    return api.put<Event>(`/events/${id}`, data);
  },

  /**
   * Delete an event (admin only)
   */
  delete: async (id: string): Promise<void> => {
    return api.delete(`/events/${id}`);
  },
};
