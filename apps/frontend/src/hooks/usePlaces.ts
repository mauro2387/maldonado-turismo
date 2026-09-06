import { useState, useEffect } from 'react';
import { placesService, Place, PlaceFilters } from '@services/placesService';

interface UsePlacesResult {
  places: Place[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch all places with optional filters
 */
export function usePlaces(filters?: PlaceFilters): UsePlacesResult {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlaces = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await placesService.getAll(filters);
      setPlaces(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar lugares');
      console.error('Error fetching places:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlaces();
  }, [filters?.category, filters?.search, filters?.limit, filters?.offset]);

  return { places, loading, error, refetch: fetchPlaces };
}

interface UsePlaceResult {
  place: Place | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch a single place by ID
 */
export function usePlace(id: string | undefined): UsePlaceResult {
  const [place, setPlace] = useState<Place | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlace = async () => {
    if (!id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await placesService.getById(id);
      setPlace(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar el lugar');
      console.error('Error fetching place:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlace();
  }, [id]);

  return { place, loading, error, refetch: fetchPlace };
}

interface UseNearbyPlacesResult {
  places: Place[];
  loading: boolean;
  error: string | null;
  refetch: (lat: number, lng: number, radius?: number) => Promise<void>;
}

/**
 * Hook to fetch nearby places
 */
export function useNearbyPlaces(): UseNearbyPlacesResult {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNearbyPlaces = async (lat: number, lng: number, radius: number = 5000) => {
    try {
      setLoading(true);
      setError(null);
      const data = await placesService.getNearby(lat, lng, radius);
      setPlaces(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar lugares cercanos');
      console.error('Error fetching nearby places:', err);
    } finally {
      setLoading(false);
    }
  };

  return { places, loading, error, refetch: fetchNearbyPlaces };
}
