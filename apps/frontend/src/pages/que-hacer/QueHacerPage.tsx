import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarX, MapPinOff, Bus } from 'lucide-react';
import { useEvents } from '@hooks/useEvents';
import { usePlaces } from '@hooks/usePlaces';
import { useGeolocation } from '@hooks/useGeolocation';
import { Thumb } from '@components/ui/Thumb';
import { EmptyState, ErrorState, SkeletonList } from '@components/ui/States';
import { distanceMeters, formatDistance } from '@lib/geo';
import { Event } from '@services/eventsService';
import { Place } from '@services/placesService';

/**
 * Qué hacer.
 *
 * Eventos y lugares en la misma superficie. Antes eran dos secciones
 * separadas, con el resultado absurdo de que un recital en una playa y la
 * playa vivían en pantallas distintas y no se enlazaban entre sí.
 *
 * Los dos usan la misma tarjeta y el mismo cálculo de distancia, y los dos
 * llevan al mismo lugar: cómo llegar en ómnibus.
 */

type Tab = 'eventos' | 'lugares';

/** Filtros temporales: así es como la gente piensa un plan. */
type TimeFilter = 'hoy' | 'manana' | 'finde' | 'todos';

const TIME_FILTERS: Array<{ id: TimeFilter; label: string }> = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'manana', label: 'Mañana' },
  { id: 'finde', label: 'Este finde' },
  { id: 'todos', label: 'Todos' },
];

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function matchesTimeFilter(dateValue: string, filter: TimeFilter): boolean {
  if (filter === 'todos') return true;

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;

  const today = startOfDay(new Date());
  const day = startOfDay(date);
  const diffDays = Math.round((day.getTime() - today.getTime()) / 86400000);

  if (filter === 'hoy') return diffDays === 0;
  if (filter === 'manana') return diffDays === 1;

  // "Este finde": el sábado y domingo que vienen, contando desde hoy.
  const weekday = today.getDay();
  const daysUntilSaturday = (6 - weekday + 7) % 7;
  return diffDays >= daysUntilSaturday && diffDays <= daysUntilSaturday + 1;
}

function coordsOf(item: Event | Place): { lat: number; lng: number } | null {
  const lat = item.lat ?? item.latitude;
  const lng = item.lng ?? item.longitude;
  if (lat === undefined || lng === undefined) return null;
  return { lat: Number(lat), lng: Number(lng) };
}

/** "Gratis" viene escrito de varias formas según quién cargó el evento. */
function isFree(event: Event): boolean {
  const price = (event.price ?? '').toLowerCase();
  return price === '' || price.includes('gratis') || price.includes('libre') || price === '0';
}

function formatEventDate(dateValue: string): string {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('es-UY', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function QueHacerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get('ver') === 'lugares' ? 'lugares' : 'eventos';

  const [timeFilter, setTimeFilter] = useState<TimeFilter>('todos');
  const [freeOnly, setFreeOnly] = useState(false);
  const [category, setCategory] = useState<string | null>(null);

  const { coords, granted } = useGeolocation();
  const { events, loading: loadingEvents, error: errorEvents, refetch: refetchEvents } = useEvents();
  const { places, loading: loadingPlaces, error: errorPlaces, refetch: refetchPlaces } = usePlaces();

  const setTab = (next: Tab) => {
    setSearchParams(next === 'lugares' ? { ver: 'lugares' } : {}, { replace: true });
  };

  const withDistance = <T extends Event | Place>(items: T[]) =>
    items.map((item) => {
      const itemCoords = coordsOf(item);
      return {
        item,
        distanceM:
          granted && itemCoords
            ? distanceMeters(coords.lat, coords.lng, itemCoords.lat, itemCoords.lng)
            : null,
      };
    });

  const visibleEvents = useMemo(() => {
    const filtered = events
      .filter((event) => matchesTimeFilter(event.date, timeFilter))
      .filter((event) => (freeOnly ? isFree(event) : true))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return withDistance(filtered);
  }, [events, timeFilter, freeOnly, granted, coords.lat, coords.lng]);

  const placeCategories = useMemo(
    () => [...new Set(places.map((place) => place.category).filter(Boolean))].sort(),
    [places],
  );

  const visiblePlaces = useMemo(() => {
    const filtered = places.filter((place) => (category ? place.category === category : true));
    const mapped = withDistance(filtered);
    // Con ubicación, lo más cercano primero: es el orden que la gente espera
    // cuando está parada en la calle decidiendo a dónde ir.
    return granted
      ? mapped.sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity))
      : mapped;
  }, [places, category, granted, coords.lat, coords.lng]);

  const loading = tab === 'eventos' ? loadingEvents : loadingPlaces;
  const error = tab === 'eventos' ? errorEvents : errorPlaces;
  const retry = tab === 'eventos' ? refetchEvents : refetchPlaces;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-8 pt-4 md:px-6 md:pt-8">
      <h1 className="text-display text-ink-900">Qué hacer</h1>

      {/* ---------- Eventos / Lugares ---------- */}
      <div
        className="mt-3 flex gap-5 border-b border-sand-200"
        role="tablist"
        aria-label="Tipo de contenido"
      >
        {(['eventos', 'lugares'] as const).map((option) => (
          <button
            key={option}
            role="tab"
            aria-selected={tab === option}
            onClick={() => setTab(option)}
            className={`-mb-px border-b-[2.5px] pb-2 text-sm font-bold capitalize transition-colors duration-200 ease-out ${
              tab === option
                ? 'border-coral-500 text-ink-900'
                : 'border-transparent text-ink-300 hover:text-ink-600'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {/* ---------- Filtros ---------- */}
      <div className="chip-row mt-3">
        {tab === 'eventos' ? (
          <>
            {TIME_FILTERS.map((filter) => (
              <button
                key={filter.id}
                onClick={() => setTimeFilter(filter.id)}
                className={`chip ${timeFilter === filter.id ? 'chip-active' : ''}`}
              >
                {filter.label}
              </button>
            ))}
            <button
              onClick={() => setFreeOnly(!freeOnly)}
              className={`chip ${freeOnly ? 'chip-active' : ''}`}
            >
              Gratis
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setCategory(null)}
              className={`chip ${category === null ? 'chip-active' : ''}`}
            >
              Todos
            </button>
            {placeCategories.map((option) => (
              <button
                key={option}
                onClick={() => setCategory(option)}
                className={`chip ${category === option ? 'chip-active' : ''}`}
              >
                {option}
              </button>
            ))}
          </>
        )}
      </div>

      {/* ---------- Resultados ---------- */}
      <div className="mt-4">
        {error && <ErrorState message={error} onRetry={retry} />}

        {loading && !error && <SkeletonList rows={3} />}

        {!loading && !error && tab === 'eventos' && (
          <>
            {visibleEvents.length === 0 ? (
              <EmptyState
                icon={CalendarX}
                title="No hay eventos con estos filtros"
                description="Probá con otra fecha o mirá todo lo que viene."
                action={{
                  label: 'Ver todos',
                  onClick: () => {
                    setTimeFilter('todos');
                    setFreeOnly(false);
                  },
                }}
              />
            ) : (
              <div className="flex flex-col gap-3">
                {visibleEvents.map(({ item, distanceM }) => (
                  <Link
                    key={item.id}
                    to={`/evento/${item.id}`}
                    className="card block overflow-hidden p-0"
                  >
                    <div className="relative">
                      <Thumb src={item.image} name={item.title} className="h-36 w-full" />
                      <span className="absolute left-2.5 top-2.5 rounded-chip bg-ink-900/85 px-2 py-1 text-[0.625rem] font-extrabold uppercase tracking-wider text-white">
                        {formatEventDate(item.date)}
                        {item.time ? ` · ${item.time}` : ''}
                      </span>
                    </div>
                    <div className="p-3.5">
                      <h3 className="text-sm font-extrabold tracking-tight text-ink-900">
                        {item.title}
                      </h3>
                      <p className="mt-1 text-xs text-ink-400">
                        {item.location}
                        {distanceM !== null && ` · a ${formatDistance(distanceM)}`}
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        {coordsOf(item) && (
                          <span className="inline-flex items-center gap-1 rounded-chip bg-sea-50 px-2 py-1 text-[0.625rem] font-bold text-sea-600">
                            <Bus className="h-3 w-3" strokeWidth={2} />
                            Cómo llegar
                          </span>
                        )}
                        {isFree(item) && (
                          <span className="rounded-chip bg-sand-100 px-2 py-1 text-[0.625rem] font-bold text-ink-600">
                            Gratis
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        {!loading && !error && tab === 'lugares' && (
          <>
            {visiblePlaces.length === 0 ? (
              <EmptyState
                icon={MapPinOff}
                title="No hay lugares en esta categoría"
                action={{ label: 'Ver todos', onClick: () => setCategory(null) }}
              />
            ) : (
              <div className="flex flex-col gap-3">
                {visiblePlaces.map(({ item, distanceM }) => (
                  <Link
                    key={item.id}
                    to={`/place/${item.id}`}
                    className="card flex gap-3.5 overflow-hidden p-0"
                  >
                    <Thumb
                      src={item.images?.[0]}
                      name={item.name}
                      className="h-24 w-24 flex-none"
                    />
                    <div className="min-w-0 flex-1 py-3 pr-3.5">
                      <p className="text-[0.625rem] font-bold uppercase tracking-wider text-ink-300">
                        {item.category}
                      </p>
                      <h3 className="mt-0.5 truncate text-sm font-extrabold tracking-tight text-ink-900">
                        {item.name}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-xs text-ink-400">{item.description}</p>
                      {distanceM !== null && (
                        <p className="mt-1.5 text-xs font-bold text-ink-600">
                          a {formatDistance(distanceM)}
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
