import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search,
  MapPin,
  Calendar,
  Newspaper,
  X,
  Bus,
  ChevronRight,
  Clock,
  Map as MapIcon,
  ArrowLeft,
} from 'lucide-react';
import { usePlaces } from '@hooks/usePlaces';
import { useEvents } from '@hooks/useEvents';
import { useNews } from '@hooks/useNews';
import { useLines } from '@hooks/useTransport';
import { useGeolocation } from '@hooks/useGeolocation';
import { destinationsService, Destination } from '@services/destinationsService';
import { TransportLine } from '@services/transportService';
import { LineTag } from '@components/ui/LineTag';
import { Thumb } from '@components/ui/Thumb';
import { lineColor } from '@components/transporte/ArrivalRow';
import { LineScheduleSheet } from '@components/transporte/LineScheduleSheet';
import { EmptyState, SkeletonList } from '@components/ui/States';
import { enlaceParaIr } from '@store/loTuyoStore';
import { formatDistance } from '@lib/geo';
import { formatStopName, normalizeStopName } from '@lib/stopNames';

/**
 * Buscar en toda la app.
 *
 * **Le faltaba la mitad de la app: el transporte.** Buscaba lugares, eventos
 * y noticias, y una parada o una línea —que es lo que más se busca en una
 * app de transporte— no aparecía nunca. Alguien que escribía "Roosevelt" o
 * "24" acá recibía "no se encontraron resultados", con la parada y la línea
 * cargadas en la base.
 *
 * Ahora lo primero son las líneas que coinciden (por número, empresa o lugar
 * de paso, el mismo criterio que la lista de líneas) y los destinos que
 * resuelve el backend —paradas, atractivos y lugares de OpenStreetMap—, con
 * lo que se puede hacer con cada uno: ver la parada, ir en ómnibus, ver por
 * dónde va la línea o su horario. Después lo de siempre.
 *
 * El orden no es casual: quien busca "hospital" en esta pantalla casi
 * siempre quiere llegar al hospital, no leer la noticia de la remodelación.
 */

/** Lo que se espera después de la última tecla antes de salir a buscar. */
const SEARCH_DEBOUNCE_MS = 250;

/** Cuántas líneas y destinos se listan antes de cortar. */
const MAX_LINEAS = 4;
const MAX_DESTINOS = 6;

/**
 * Si una línea coincide con lo escrito: por número, por empresa o por los
 * lugares por los que pasa. Es el mismo criterio de la lista de líneas, para
 * que "hospital" encuentre lo mismo en los dos lados.
 */
function lineaCoincide(line: TransportLine, query: string): boolean {
  const term = normalizeStopName(query);
  if (!term) return false;

  const haystack = normalizeStopName(
    [
      line.line_label ?? line.line_code,
      ...line.itineraries.flatMap((itinerary) => [
        itinerary.headsign ?? '',
        ...itinerary.highlights,
      ]),
    ].join(' '),
  );

  return term.split(' ').every((word) => haystack.includes(word));
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const { coords } = useGeolocation(false);

  /** Lo que se está buscando de verdad: la caja, con la espera aplicada. */
  const [term, setTerm] = useState(query.trim());

  useEffect(() => {
    const timer = setTimeout(() => setTerm(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // La URL se actualiza con lo buscado para que el enlace se pueda compartir
  // y para que volver atrás traiga la búsqueda anterior.
  useEffect(() => {
    setSearchParams(term ? { q: term } : {}, { replace: true });
  }, [term, setSearchParams]);

  const { places, loading: loadingPlaces } = usePlaces(term ? { search: term } : undefined);
  const { events, loading: loadingEvents } = useEvents(term ? { search: term } : undefined);
  const { news, loading: loadingNews } = useNews(term ? { search: term } : undefined);
  const { lines } = useLines();

  /** Paradas, atractivos y lugares de OpenStreetMap, resueltos por el backend. */
  const [destinos, setDestinos] = useState<Destination[]>([]);
  const [buscandoDestinos, setBuscandoDestinos] = useState(false);
  /** La línea cuyo horario está abierto. */
  const [horarioDe, setHorarioDe] = useState<string | null>(null);

  useEffect(() => {
    if (term.length < 2) {
      setDestinos([]);
      return;
    }

    let cancelled = false;
    setBuscandoDestinos(true);

    destinationsService
      .search(term, coords, MAX_DESTINOS)
      .then((results) => {
        if (!cancelled) setDestinos(results);
      })
      .catch(() => {
        if (!cancelled) setDestinos([]);
      })
      .finally(() => {
        if (!cancelled) setBuscandoDestinos(false);
      });

    return () => {
      cancelled = true;
    };
  }, [term, coords.lat, coords.lng]);

  const lineasQueCoinciden = useMemo(
    () => (term.length < 1 ? [] : lines.filter((line) => lineaCoincide(line, term)).slice(0, MAX_LINEAS)),
    [lines, term],
  );

  const buscando = term.length >= 2 && (buscandoDestinos || loadingPlaces || loadingEvents || loadingNews);
  const total =
    lineasQueCoinciden.length + destinos.length + places.length + events.length + news.length;

  return (
    <div className="min-h-[calc(100dvh-4.25rem)] bg-sand-100 pb-8">
      <header className="bg-ink-900 px-4 pb-4 pt-4 text-white">
        <Link
          to="/"
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
          Inicio
        </Link>

        <h1 className="text-display">Buscar</h1>
        <p className="mt-0.5 text-data text-ink-300">
          Una parada, una línea, un lugar, un evento o una noticia.
        </p>

        <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2.5">
          <Search className="h-4 w-4 flex-none text-ink-300" strokeWidth={2.5} />
          <label className="sr-only" htmlFor="buscar">
            Buscar
          </label>
          <input
            id="buscar"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Roosevelt, la 24, el hospital…"
            autoFocus
            className="w-full bg-transparent text-sm font-semibold text-white placeholder:font-medium placeholder:text-ink-300 focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Limpiar" className="flex-none p-1">
              <X className="h-4 w-4 text-ink-300" strokeWidth={2.5} />
            </button>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 pt-4">
        {term.length < 2 && (
          <p className="px-1 text-sm text-ink-400">
            Escribí al menos dos letras. Podés buscar por el número de una línea, por el nombre
            de una parada o de un lugar, o por un evento.
          </p>
        )}

        {buscando && total === 0 && <SkeletonList rows={3} />}

        {term.length >= 2 && !buscando && total === 0 && (
          <EmptyState
            icon={Search}
            title="No encontramos nada"
            description={`Nada coincide con "${term}". Probá con el número de la línea, con el nombre de la calle o con menos palabras.`}
          />
        )}

        {/* ---------- Líneas ---------- */}
        {lineasQueCoinciden.length > 0 && (
          <section className="mb-6" aria-labelledby="lineas">
            <h2 id="lineas" className="section-label">
              Líneas
            </h2>
            <div className="mt-2.5 flex flex-col gap-2">
              {lineasQueCoinciden.map((line) => {
                const label = line.line_label ?? line.line_code;
                return (
                  <div
                    key={`${line.operator}-${line.line_code}`}
                    className="card flex items-center gap-3 py-3"
                  >
                    <Link
                      to={`/moverse/bondis?linea=${encodeURIComponent(line.line_code)}`}
                      className="flex min-w-0 flex-1 items-center gap-3"
                    >
                      <LineTag code={label} color={lineColor(line.operator)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-data font-bold text-ink-900">
                          Línea {label} · por dónde va
                        </span>
                        <span className="block truncate text-xs text-ink-400">
                          {line.itineraries
                            .flatMap((itinerary) => itinerary.highlights)
                            .slice(0, 4)
                            .join(' · ') || `${line.stops_count} paradas`}
                        </span>
                      </span>
                      <MapIcon className="h-4 w-4 flex-none text-ink-300" strokeWidth={2} />
                    </Link>
                    <button
                      onClick={() => setHorarioDe(label)}
                      aria-label={`Horarios de la línea ${label}`}
                      className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-sand-100 text-ink-900 active:bg-sand-200"
                    >
                      <Clock className="h-4 w-4" strokeWidth={2} />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ---------- Paradas y lugares para ir ---------- */}
        {destinos.length > 0 && (
          <section className="mb-6" aria-labelledby="destinos">
            <h2 id="destinos" className="section-label">
              Paradas y lugares
            </h2>
            <div className="mt-2.5 flex flex-col gap-2">
              {destinos.map((destino) => {
                const nombre =
                  destino.source === 'parada' ? formatStopName(destino.name) : destino.name;
                return (
                  <div key={destino.id} className="card flex items-center gap-3 py-3">
                    {/* La parada abre su ficha -llegadas, horario, QR-; un
                        lugar no tiene ficha propia en el catálogo, así que
                        para él lo único que se puede hacer es ir. */}
                    {destino.source === 'parada' ? (
                      <Link
                        to={`/transporte/paradas/${destino.id.replace(/^parada:/, '')}`}
                        className="flex min-w-0 flex-1 items-center gap-3"
                      >
                        <Bus className="h-4 w-4 flex-none text-ink-300" strokeWidth={2} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-data font-bold text-ink-900">
                            {nombre}
                          </span>
                          <span className="block truncate text-xs text-ink-400">
                            Parada
                            {destino.lines?.length ? ` · líneas ${destino.lines.join(', ')}` : ''}
                            {destino.distanceM !== undefined
                              ? ` · a ${formatDistance(destino.distanceM)}`
                              : ''}
                          </span>
                        </span>
                        <ChevronRight className="h-4 w-4 flex-none text-ink-300" strokeWidth={2.5} />
                      </Link>
                    ) : (
                      <span className="flex min-w-0 flex-1 items-center gap-3">
                        <MapPin className="h-4 w-4 flex-none text-ink-300" strokeWidth={2} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-data font-bold text-ink-900">
                            {nombre}
                          </span>
                          <span className="block truncate text-xs text-ink-400">
                            <span className="capitalize">{destino.kind}</span>
                            {destino.locality ? ` · ${destino.locality}` : ''}
                            {destino.distanceM !== undefined
                              ? ` · a ${formatDistance(destino.distanceM)}`
                              : ''}
                          </span>
                        </span>
                      </span>
                    )}
                    {/* Ir en ómnibus, con la coordenada: no se vuelve a
                        buscar el lugar por su nombre, que es justo lo que
                        acaba de resolverse acá. */}
                    <Link
                      to={enlaceParaIr({
                        id: destino.id,
                        name: nombre,
                        lat: destino.lat,
                        lng: destino.lng,
                      })}
                      aria-label={`Cómo llegar a ${nombre} en ómnibus`}
                      className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-ink-900 text-white active:bg-ink-800"
                    >
                      <Bus className="h-4 w-4" strokeWidth={2} />
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ---------- Lugares del catálogo de turismo ---------- */}
        {places.length > 0 && (
          <section className="mb-6" aria-labelledby="lugares">
            <h2 id="lugares" className="section-label">
              Lugares
            </h2>
            <div className="mt-2.5 flex flex-col gap-2">
              {places.map((place) => (
                <Link
                  key={place.id}
                  to={`/place/${place.id}`}
                  className="card flex items-center gap-3 py-3"
                >
                  <Thumb
                    src={place.images?.[0] ?? null}
                    name={place.name}
                    className="h-12 w-12 flex-none rounded-xl object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-data font-bold text-ink-900">
                      {place.name}
                    </span>
                    <span className="block truncate text-xs text-ink-400">
                      {place.category}
                      {place.locality ? ` · ${place.locality}` : ''}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 flex-none text-ink-300" strokeWidth={2.5} />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ---------- Eventos ---------- */}
        {events.length > 0 && (
          <section className="mb-6" aria-labelledby="eventos">
            <h2 id="eventos" className="section-label">
              Eventos
            </h2>
            <div className="mt-2.5 flex flex-col gap-2">
              {events.map((event) => (
                <Link
                  key={event.id}
                  to={`/evento/${event.id}`}
                  className="card flex items-center gap-3 py-3"
                >
                  <Thumb
                    src={event.image ?? null}
                    name={event.title}
                    className="h-12 w-12 flex-none rounded-xl object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-data font-bold text-ink-900">
                      {event.title}
                    </span>
                    <span className="block truncate text-xs text-ink-400">
                      <Calendar className="mr-1 inline h-3 w-3 align-text-top" strokeWidth={2} />
                      {event.date}
                      {event.location ? ` · ${event.location}` : ''}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 flex-none text-ink-300" strokeWidth={2.5} />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ---------- Noticias ---------- */}
        {news.length > 0 && (
          <section className="mb-6" aria-labelledby="noticias">
            <h2 id="noticias" className="section-label">
              Noticias
            </h2>
            <div className="mt-2.5 flex flex-col gap-2">
              {news.map((item) => (
                <Link
                  key={item.id}
                  to={`/noticia/${item.id}`}
                  className="card flex items-center gap-3 py-3"
                >
                  <Thumb
                    src={item.image ?? null}
                    name={item.title}
                    className="h-12 w-12 flex-none rounded-xl object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-data font-bold text-ink-900">
                      {item.title}
                    </span>
                    <span className="block truncate text-xs text-ink-400">
                      <Newspaper className="mr-1 inline h-3 w-3 align-text-top" strokeWidth={2} />
                      {item.date}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 flex-none text-ink-300" strokeWidth={2.5} />
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      {horarioDe && <LineScheduleSheet label={horarioDe} onClose={() => setHorarioDe(null)} />}
    </div>
  );
}
