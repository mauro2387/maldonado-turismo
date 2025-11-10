import { useState, useEffect } from 'react';
import { eventsService, Event, EventFilters } from '@services/eventsService';

interface UseEventsResult {
  events: Event[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch all events with optional filters
 */
export function useEvents(filters?: EventFilters): UseEventsResult {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await eventsService.getAll(filters);
      setEvents(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar eventos');
      console.error('Error fetching events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [filters?.category, filters?.startDate, filters?.endDate, filters?.search]);

  return { events, loading, error, refetch: fetchEvents };
}

interface UseEventResult {
  event: Event | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch a single event by ID
 */
export function useEvent(id: string | undefined): UseEventResult {
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvent = async () => {
    if (!id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await eventsService.getById(id);
      setEvent(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar el evento');
      console.error('Error fetching event:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvent();
  }, [id]);

  return { event, loading, error, refetch: fetchEvent };
}

interface UseUpcomingEventsResult {
  events: Event[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch upcoming events
 */
export function useUpcomingEvents(limit: number = 10): UseUpcomingEventsResult {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await eventsService.getUpcoming(limit);
      setEvents(data);
    } catch (err: any) {
      setError(err.message || 'Error al cargar eventos próximos');
      console.error('Error fetching upcoming events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [limit]);

  return { events, loading, error, refetch: fetchEvents };
}
