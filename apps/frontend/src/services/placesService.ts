import { api } from '@lib/apiClient';

export interface ImageCredit {
  url: string;
  author: string;
  license: string;
  license_url: string | null;
  /** Página del archivo en Wikimedia Commons. */
  source: string;
}

export interface Place {
  id: string;
  name: string;
  description: string;
  category: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  images?: string[];
  /**
   * Autoría de cada foto. Las imágenes son de Wikimedia Commons y casi todas
   * son CC BY o CC BY-SA: atribuir al autor y enlazar la licencia no es
   * opcional, es lo que exige la licencia.
   */
  image_credits?: ImageCredit[];
  locality?: string;
  highlights?: string[];
  rating?: number;
  reviewCount?: number;
  distance?: string;
  phone?: string;
  website?: string;
  schedule?: string | Record<string, string>;
  facilities?: string[];
  activities?: string[];
  tips?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface PlaceFilters {
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export const placesService = {
  /**
   * Get all places with optional filters
   */
  getAll: async (filters?: PlaceFilters): Promise<Place[]> => {
    const params = new URLSearchParams();
    if (filters?.category) params.append('category', filters.category);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.limit) params.append('limit', filters.limit.toString());
    if (filters?.offset) params.append('offset', filters.offset.toString());

    const query = params.toString();
    return api.get<Place[]>(`/places${query ? `?${query}` : ''}`);
  },

  /**
   * Get a single place by ID
   */
  getById: async (id: string): Promise<Place> => {
    return api.get<Place>(`/places/${id}`);
  },

  /**
   * Get nearby places based on coordinates
   */
  getNearby: async (lat: number, lng: number, radius: number = 5000): Promise<Place[]> => {
    return api.get<Place[]>(`/places/nearby?lat=${lat}&lng=${lng}&radius=${radius}`);
  },

  /**
   * Search places by name or description
   */
  search: async (query: string): Promise<Place[]> => {
    return api.get<Place[]>(`/places/search?q=${encodeURIComponent(query)}`);
  },

  /**
   * Get places by category
   */
  getByCategory: async (category: string): Promise<Place[]> => {
    return api.get<Place[]>(`/places/category/${category}`);
  },

  /**
   * Create a new place (admin only)
   */
  create: async (data: Partial<Place>): Promise<Place> => {
    return api.post<Place>('/places', data);
  },

  /**
   * Update a place (admin only)
   */
  update: async (id: string, data: Partial<Place>): Promise<Place> => {
    return api.put<Place>(`/places/${id}`, data);
  },

  /**
   * Delete a place (admin only)
   */
  delete: async (id: string): Promise<void> => {
    return api.delete(`/places/${id}`);
  },
};
