import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ChevronRight, Bus, AlertTriangle, Map as MapIcon } from 'lucide-react';
import { useGeolocation } from '@hooks/useGeolocation';
import { useNearbyDepartures, useVehiclePositions } from '@hooks/useDepartures';
import { useAlerts, useLines } from '@hooks/useTransport';
import { Arrival, NearbyDeparture, TransportLine } from '@services/transportService';
import { LineTag } from '@components/ui/LineTag';
import { ArrivalRow, lineColor } from '@components/transporte/ArrivalRow';
import { LiveIndicator } from '@components/ui/LiveIndicator';
import { EmptyState, ErrorState, InlineNotice, SkeletonList } from '@components/ui/States';
import { formatDistance, walkingMinutes } from '@lib/geo';
import { formatStopName } from '@lib/stopNames';

/**
 * Moverse.
 *
 * La sección abre en los ómnibus, no en las paradas ni en un buscador de
 * destino. Ese es el cambio: la pregunta de alguien parado en la vereda es
 * "¿cuál me sirve y por dónde viene?", y la pantalla contestaba "¿qué paradas
 * hay cerca?" —que es como está organizada la empresa, no como se usa un
 * ómnibus—. Antes de eso eran cuatro pestañas anidadas (Paradas / Líneas /
 * Avisos / Planificar) y un listado alfabético de las mil paradas del
 * departamento.
 *
 * De arriba abajo: cuántos ómnibus están haciendo servicio ahora, el mapa en
 * vivo, los que te pasan cerca, las líneas con su ida y su vuelta, y recién al
 * final el planificador de viaje, que es la herramienta que se usa cuando
 * ninguno de los de arriba alcanza.
 *
 * Cada renglón lleva al mapa con ese coche ya elegido: ahí se ve por dónde
 * viene, en qué parada conviene esperarlo, cuánto hay que caminar hasta ella y
 * hasta dónde te lleva, cada tramo de un color.
 */

/**
 * Destinos que se piden todo el tiempo en Maldonado.
 *
 * Todos existen en el catálogo de paradas de las empresas: antes esta tira
 * ofrecía "Playa Mansa" y "Terminal Maldonado" contra una tabla de ocho
 * paradas de relleno, así que tocar cualquiera de las cinco llevaba a un
 * planificador sin resultados. Se escriben como los escribe la gente y el
 * buscador se encarga de la abreviatura de la empresa ("TNAL MALDONADO").
 */
const QUICK_DESTINATIONS = [
  'Terminal Maldonado',
  'Hospital',
  'Shopping',
  'San Carlos',
  'La Barra',
];

/** Radios sucesivos: si a 800 m no hay nada, se abre la búsqueda. */
const RADIUS_OPTIONS = [800, 1500, 3000];

/** Cuántos ómnibus se listan antes de mandar al mapa, que los tiene todos. */
const MAX_NEXT_BUSES = 8;

/**
 * ¿Se alcanza a tomar?
 *
 * Un ómnibus que llega a la parada en un minuto, con la parada a cuatro
 * cuadras, no es una opción: es una frustración. Se pide que llegue después de
 * la caminata, con un minuto de margen —el mismo criterio que usa el
 * planificador, que es el `boardSlack` de OpenTripPlanner—.
 */
function catchable(arrival: Arrival, stop: NearbyDeparture): boolean {
  return arrival.eta_minutes >= walkingMinutes(stop.distance_m) + 1;
}

export default function MoversePage() {
  const navigate = useNavigate();
  const { coords, granted, status, message, request } = useGeolocation();
  const [radiusIndex, setRadiusIndex] = useState(0);
  const [query, setQuery] = useState('');

  const { stops, ready, loading, error, refetch } = useNearbyDepartures(
    coords,
    RADIUS_OPTIONS[radiusIndex],
  );
  const { alerts } = useAlerts();
  const { lines } = useLines();
  const { vehicles } = useVehiclePositions(true);
  const [showAllLines, setShowAllLines] = useState(false);

  /**
   * Cuántos ómnibus están haciendo un servicio.
   *
   * El feed publica también los que van a cargar combustible o hacen un
   * traslado contratado: andan por la calle, pero nadie se los puede tomar y
   * contarlos infla el número que dice esta pantalla.
   */
  const onStreet = useMemo(
    () => vehicles.filter((vehicle) => vehicle.in_service !== false).length,
    [vehicles],
  );

  /**
   * Los que te pasan ahora y llegás a tomar, uno por coche.
   *
   * El mismo ómnibus llega a varias paradas de la misma cuadra y sin agrupar
   * por coche aparece tres veces con tres minutos distintos. Se queda con la
   * parada donde llega antes **de las que se alcanzan**: si a una parada llega
   * en un minuto y está a cuatro cuadras, esa no cuenta, y capaz que a la
   * parada de la otra cuadra llega en seis y esa sí.
   */
  const nextBuses = useMemo(() => {
    const byVehicle = new Map<string, { arrival: Arrival; stop: NearbyDeparture }>();

    for (const stop of stops) {
      for (const arrival of stop.arrivals) {
        if (!catchable(arrival, stop)) continue;
        const known = byVehicle.get(arrival.vehicle_id);
        if (!known || arrival.eta_minutes < known.arrival.eta_minutes) {
          byVehicle.set(arrival.vehicle_id, { arrival, stop });
        }
      }
    }

    return [...byVehicle.values()].sort((a, b) => a.arrival.eta_minutes - b.arrival.eta_minutes);
  }, [stops]);

  const canWidenSearch = radiusIndex < RADIUS_OPTIONS.length - 1;

  const submitSearch = (destination: string) => {
    const value = destination.trim();
    if (!value) return;
    navigate(`/transporte/planificador?destino=${encodeURIComponent(value)}`);
  };

  /**
   * El enlace de un ómnibus lleva su coche y su línea. El coche es lo que se
   * quiere ver; la línea queda de respaldo para cuando ese coche ya terminó su
   * viaje y el mapa, en vez de quedarse mudo, muestra los que sí andan.
   */
  const busLink = (arrival: Arrival) =>
    `/moverse/bondis?coche=${encodeURIComponent(arrival.vehicle_id)}` +
    `&linea=${encodeURIComponent(arrival.line_code)}`;

  return (
    <div className="mx-auto max-w-3xl px-4 pb-8 pt-4 md:px-6 md:pt-8">
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-display text-ink-900">Moverse</h1>
          <p className="mt-0.5 text-data text-ink-400">
            {onStreet > 0
              ? `${onStreet} ómnibus haciendo servicio ahora`
              : 'Los ómnibus de Maldonado, en vivo'}
          </p>
        </div>
        {onStreet > 0 && <LiveIndicator fixAgeSeconds={0} showAge={false} className="mb-1.5" />}
      </header>

      {/* ---------- Avisos del servicio ---------- */}
      {alerts.length > 0 && (
        <div className="mt-4 flex items-start gap-3 rounded-card bg-warn-soft px-3.5 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-warn" strokeWidth={2} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-warn">{alerts[0].title}</p>
            {alerts[0].message && (
              <p className="mt-0.5 text-xs text-warn/80">{alerts[0].message}</p>
            )}
          </div>
          {alerts.length > 1 && (
            <span className="flex-none text-xs font-bold text-warn">+{alerts.length - 1}</span>
          )}
        </div>
      )}

      {/* ---------- El mapa en vivo, primero ----------
          Es la puerta a lo único que contesta la pregunta entera: por dónde
          viene, dónde tomarlo, cuánto caminás y hasta dónde te lleva. */}
      <Link
        to="/moverse/bondis"
        className="mt-4 flex items-center gap-3 rounded-card border border-ink-900 bg-white px-3.5 py-3.5 shadow-card"
      >
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-ink-900">
          <MapIcon className="h-5 w-5 text-white" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-data font-extrabold text-ink-900">
            Ver los bondis en el mapa
          </span>
          <span className="block text-xs text-ink-400">
            Tocá uno y te muestra por dónde viene, en qué parada tomarlo y hasta dónde te lleva
          </span>
        </span>
        <ChevronRight className="h-4 w-4 flex-none text-ink-300" strokeWidth={2.5} />
      </Link>

      {!granted && status !== 'locating' && (
        <div className="mt-4">
          <InlineNotice
            message={message ?? 'Activá tu ubicación para ver los ómnibus que te pasan cerca.'}
            action={{ label: 'Activar', onClick: request }}
          />
        </div>
      )}

      {/* ---------- Los que te pasan ahora ---------- */}
      <section className="mt-6" aria-labelledby="te-pasan">
        <div className="flex items-center justify-between">
          <h2 id="te-pasan" className="section-label">
            Los que te pasan ahora
          </h2>
          {nextBuses.length > 0 && <LiveIndicator fixAgeSeconds={0} showAge={false} />}
        </div>

        {error && <ErrorState message={error} onRetry={refetch} className="mt-3" />}

        {loading && !error && <SkeletonList rows={3} className="mt-3" />}

        {!loading && !error && nextBuses.length === 0 && (
          <EmptyState
            icon={Bus}
            title={
              stops.length === 0
                ? 'No hay paradas a esta distancia'
                : ready
                  ? 'Ningún ómnibus que llegues a tomar'
                  : 'Todavía no podemos calcular llegadas'
            }
            description={
              stops.length === 0
                ? `Buscamos en ${formatDistance(RADIUS_OPTIONS[radiusIndex])} a la redonda.`
                : ready
                  ? 'O no viene ninguno, o el que viene pasa antes de que llegues caminando. En el mapa podés ver dónde anda cada línea.'
                  : 'Estamos cargando los recorridos de las empresas.'
            }
            action={
              canWidenSearch
                ? {
                    label: `Buscar hasta ${formatDistance(RADIUS_OPTIONS[radiusIndex + 1])}`,
                    onClick: () => setRadiusIndex(radiusIndex + 1),
                  }
                : undefined
            }
          />
        )}

        <div className="mt-3 flex flex-col gap-2">
          {nextBuses.slice(0, MAX_NEXT_BUSES).map(({ arrival, stop }) => (
            <div key={arrival.vehicle_id} className="card py-3">
              {/* El ómnibus: es el renglón principal y abre el mapa en vivo. */}
              <Link to={busLink(arrival)} className="block">
                <ArrivalRow arrival={arrival} />
              </Link>

              {/* La parada, como contexto y como atajo a todo lo que viene ahí.
                  Va en su propio enlace: uno adentro de otro no es válido. */}
              <Link
                to={`/transporte/paradas/${stop.id}`}
                className="mt-1.5 flex items-center gap-1 text-xs text-ink-400"
              >
                <span className="min-w-0 truncate">
                  Pasa por {formatStopName(stop.name)} · a {formatDistance(stop.distance_m)},{' '}
                  {walkingMinutes(stop.distance_m)} min caminando
                </span>
                <ChevronRight className="h-3 w-3 flex-none" strokeWidth={2.5} />
              </Link>
            </div>
          ))}
        </div>

        {nextBuses.length > MAX_NEXT_BUSES && (
          <Link to="/moverse/bondis" className="btn btn-secondary mt-3 w-full">
            Ver los {nextBuses.length} en el mapa
          </Link>
        )}

        {canWidenSearch && nextBuses.length > 0 && (
          <button
            onClick={() => setRadiusIndex(radiusIndex + 1)}
            className="btn btn-secondary mt-3 w-full"
          >
            Buscar hasta {formatDistance(RADIUS_OPTIONS[radiusIndex + 1])}
          </button>
        )}
      </section>

      {/* ---------- Las líneas ----------
          La pregunta que la gente hace no es "¿qué paradas hay?" sino "¿por
          dónde va la 24?". Cada línea abre el mapa con sus recorridos
          dibujados, ida y vuelta con colores distintos. */}
      {lines.length > 0 && (
        <section className="mt-7" aria-labelledby="lineas">
          <div className="flex items-baseline justify-between">
            <h2 id="lineas" className="section-label">
              Líneas
            </h2>
            <span className="text-xs text-ink-400">{lines.length} circulando hoy</span>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            {(showAllLines ? lines : lines.slice(0, 8)).map((line) => (
              <Link
                key={`${line.operator}-${line.line_code}`}
                to={`/moverse/bondis?linea=${encodeURIComponent(line.line_code)}`}
                className="card flex items-center gap-3 py-3"
              >
                <LineTag code={line.line_label ?? line.line_code} color={lineColor(line.operator)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-data font-bold text-ink-900">
                    {lineEndpoints(line)}
                  </span>
                  <span className="block truncate text-xs text-ink-400">
                    {line.itineraries.length}{' '}
                    {line.itineraries.length === 1 ? 'recorrido' : 'recorridos'} ·{' '}
                    {line.stops_count} paradas
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 flex-none text-ink-300" strokeWidth={2.5} />
              </Link>
            ))}
          </div>

          {lines.length > 8 && (
            <button
              onClick={() => setShowAllLines(!showAllLines)}
              className="btn btn-secondary mt-3 w-full"
            >
              {showAllLines ? 'Ver menos' : `Ver las ${lines.length} líneas`}
            </button>
          )}
        </section>
      )}

      {/* ---------- Ir a un lugar ----------
          Baja al final a propósito. Escribir un destino es lo que se hace
          cuando no alcanza con mirar lo que pasa: para ir a un lugar al que no
          se sabe cómo llegar, no para tomarse el que ya viene. */}
      <section className="mt-7" aria-labelledby="planificar">
        <h2 id="planificar" className="section-label">
          Ir a un lugar
        </h2>

        <form
          className="mt-3"
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch(query);
          }}
        >
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
              strokeWidth={2}
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="¿A dónde vas?"
              aria-label="Destino"
              className="input pl-10 font-semibold"
            />
          </div>

          <div className="chip-row mt-2">
            {QUICK_DESTINATIONS.map((destination) => (
              <button
                key={destination}
                type="button"
                onClick={() => submitSearch(destination)}
                className="chip"
              >
                {destination}
              </button>
            ))}
          </div>
        </form>
      </section>
    </div>
  );
}

/**
 * Las puntas de la línea: "San Carlos ⇄ Punta del Este".
 *
 * Sale de los carteles que publica la empresa en cada sentido, que es como la
 * gente la nombra ("me tomo la que va a Punta"). Si sólo hay un recorrido se
 * muestra ese destino solo.
 */
function lineEndpoints(line: TransportLine): string {
  const ida = line.itineraries.find((itinerary) => itinerary.way === 'ida');
  const vuelta = line.itineraries.find((itinerary) => itinerary.way === 'vuelta');

  const nombres = [ida?.headsign, vuelta?.headsign]
    .filter((nombre): nombre is string => Boolean(nombre))
    .map((nombre) => formatStopName(nombre));

  if (nombres.length === 2) return `${nombres[1]} ⇄ ${nombres[0]}`;
  if (nombres.length === 1) return nombres[0];

  return line.itineraries
    .map((itinerary) => formatStopName(itinerary.headsign ?? ''))
    .filter(Boolean)
    .slice(0, 2)
    .join(' ⇄ ');
}
