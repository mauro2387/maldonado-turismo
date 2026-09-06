import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Bus, Waves, Wind } from 'lucide-react';
import { useGeolocation } from '@hooks/useGeolocation';
import { useTransportHealth } from '@hooks/useTransportHealth';
import { useWeather } from '@hooks/useWeather';
import { useNearbyDepartures } from '@hooks/useDepartures';
import { useEvents } from '@hooks/useEvents';
import { LineTag } from '@components/ui/LineTag';
import { Thumb } from '@components/ui/Thumb';
import { LiveIndicator } from '@components/ui/LiveIndicator';
import { InlineNotice } from '@components/ui/States';
import { arrivalLine, lineColor } from '@components/transporte/ArrivalRow';
import { formatDistance, walkingMinutes } from '@lib/geo';
import { formatStopName } from '@lib/stopNames';
import type { Arrival, NearbyDeparture } from '@services/transportService';

/**
 * Portada.
 *
 * Lo primero que ve alguien que abre la app es cuándo pasa su próximo ómnibus,
 * no cuatro botones que repiten la barra de navegación de abajo. Después, el
 * clima real y qué hay para hacer hoy.
 *
 * El transporte de la portada apunta al mapa en vivo, no a la ficha de la
 * parada. Antes la portada terminaba en una lista de paradas cercanas -la
 * misma que ya está entera en Moverse- y esa lista es la forma vieja de mirar
 * el transporte: la parada como destino. Ahora la pregunta se contesta con el
 * ómnibus: cuál viene, por dónde viene y dónde tomarlo. Tocar la tarjeta abre
 * el mapa con ese coche ya elegido y su recorrido dibujado.
 *
 * Todo lo que se muestra acá sale de una fuente: si el clima falla, la tarjeta
 * no aparece; si no hay eventos hoy, la sección no aparece. Ningún dato de
 * relleno.
 */

function greeting(hour: number): string {
  if (hour < 6) return 'Buenas noches';
  if (hour < 13) return 'Buen día';
  if (hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

function todayLabel(): string {
  const formatted = new Date().toLocaleDateString('es-UY', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function isToday(dateValue: string): boolean {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return (
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  );
}

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

export default function HomePage() {
  // Si el GPS de las empresas está entrando. Decide entre "no viene
  // ninguno" y "no tenemos el dato", que no son lo mismo.
  const { sinGps, empresasCaidas } = useTransportHealth();
  const { coords, granted, status, message, request } = useGeolocation();
  const { weather } = useWeather(coords);
  const { stops, ready } = useNearbyDepartures(coords);
  const { events } = useEvents();

  // La parada más cercana con un ómnibus que se alcance a tomar: una parada a
  // 80 m sin nada que venga no le sirve a nadie, y una con un coche que pasa
  // antes de que llegues caminando, tampoco.
  const nextStop = stops.find((stop) => stop.arrivals.some((arrival) => catchable(arrival, stop)));
  const nextArrival = nextStop?.arrivals.find((arrival) => catchable(arrival, nextStop));
  const laterArrivals =
    nextStop?.arrivals.filter((arrival) => catchable(arrival, nextStop) && arrival !== nextArrival)
      .slice(0, 2) ?? [];

  /**
   * Los ómnibus que vienen a las paradas de alrededor, una sola vez cada uno.
   *
   * El mismo coche aparece en varias paradas cercanas -pasa por todas- y sin
   * agrupar por coche "vienen ocho" cuenta cuatro dos veces.
   */
  const incoming = useMemo(() => {
    const byVehicle = new Map<string, Arrival>();
    for (const stop of stops) {
      for (const arrival of stop.arrivals) {
        if (!catchable(arrival, stop)) continue;
        const known = byVehicle.get(arrival.vehicle_id);
        if (!known || arrival.eta_minutes < known.eta_minutes) {
          byVehicle.set(arrival.vehicle_id, arrival);
        }
      }
    }
    return [...byVehicle.values()].sort((a, b) => a.eta_minutes - b.eta_minutes);
  }, [stops]);

  /** Una ficha por línea: la 24 puede venir en tres coches distintos. */
  const incomingLines = useMemo(() => {
    const byLine = new Map<string, Arrival>();
    for (const arrival of incoming) {
      if (!byLine.has(arrival.line_code)) byLine.set(arrival.line_code, arrival);
    }
    return [...byLine.values()].slice(0, 8);
  }, [incoming]);

  const todayEvents = events.filter((event) => isToday(event.date));
  const featuredEvent = todayEvents[0] ?? events[0];

  return (
    <div className="mx-auto max-w-3xl px-4 pb-8 pt-4 md:px-6 md:pt-8">
      <header>
        <p className="text-data text-ink-400">{todayLabel()} · Maldonado</p>
        <h1 className="mt-0.5 text-display text-ink-900">{greeting(new Date().getHours())}</h1>
      </header>

      {/* ---------- Tu próximo ómnibus ---------- */}
      <section className="mt-4" aria-labelledby="proximo-omnibus">
        <h2 id="proximo-omnibus" className="sr-only">
          Tu próximo ómnibus
        </h2>

        {nextStop && nextArrival ? (
          <Link
            // Con el coche en la mano, el mapa abre encima de él. Si la
            // llegada es una estimación por horario no hay coche que mostrar,
            // así que se cae a la ficha de la parada.
            to={
              nextArrival.live
                ? `/moverse/bondis?coche=${encodeURIComponent(nextArrival.vehicle_id)}` +
                  `&linea=${encodeURIComponent(nextArrival.line_code)}`
                : `/transporte/paradas/${nextStop.id}`
            }
            className="card card-selected block transition-shadow duration-200 ease-out"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <LineTag
                  code={arrivalLine(nextArrival)}
                  color={lineColor(nextArrival.operator)}
                  size="lg"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink-900">
                    {nextArrival.destination ?? nextArrival.line_name ?? 'En recorrido'}
                  </p>
                  <p className="truncate text-xs text-ink-400">
                    {formatStopName(nextStop.name)} · a {formatDistance(nextStop.distance_m)} tuyo
                  </p>
                </div>
              </div>

              <div className="flex-none text-right">
                <p
                  className={`tabular text-xl font-extrabold leading-none ${
                    nextArrival.live ? 'text-live' : 'text-ink-400'
                  }`}
                >
                  {nextArrival.eta_minutes <= 0 ? 'ahora' : `${nextArrival.eta_minutes} min`}
                </p>
                <LiveIndicator
                  fixAgeSeconds={nextArrival.fix_age_seconds}
                  className="mt-1 justify-end"
                />
              </div>
            </div>

            <div className="-mx-4 my-3 h-px bg-sand-200" />

            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-400">
                {laterArrivals.length > 0 ? (
                  <>
                    Después:{' '}
                    {laterArrivals.map((arrival, index) => (
                      <span key={arrival.vehicle_id} className="tabular font-semibold text-ink-900">
                        {index > 0 && ' · '}
                        {arrival.eta_minutes} min
                      </span>
                    ))}
                  </>
                ) : (
                  `${walkingMinutes(nextStop.distance_m)} min caminando hasta la parada`
                )}
              </span>
              <span className="flex items-center gap-0.5 font-bold text-coral-500">
                {nextArrival.live ? 'Ver por dónde viene' : 'Ver parada'}
                <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
            </div>
          </Link>
        ) : (
          <Link to="/moverse" className="card block">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-sand-100">
                <Bus className="h-5 w-5 text-ink-400" strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                {/* Tres estados distintos, y confundirlos deja a alguien
                    esperando: no viene ninguno, todavía no calculamos, o el
                    GPS de la empresa no está respondiendo. */}
                <p className="text-sm font-bold text-ink-900">
                  {sinGps
                    ? 'No estamos recibiendo el GPS'
                    : ready
                      ? 'No hay ómnibus en camino ahora'
                      : 'Calculando los recorridos'}
                </p>
                <p className="text-xs text-ink-400">
                  {sinGps
                    ? `No podemos ver dónde están los ómnibus${
                        empresasCaidas.length ? ` de ${empresasCaidas.join(' y ')}` : ''
                      }. Mirá los horarios publicados.`
                    : ready
                      ? 'Mirá los horarios y las paradas cercanas'
                      : 'Estamos reconstruyendo las líneas con las posiciones en vivo'}
                </p>
              </div>
              <ChevronRight className="ml-auto h-4 w-4 flex-none text-ink-300" strokeWidth={2.5} />
            </div>
          </Link>
        )}

        {!granted && status !== 'locating' && (
          <InlineNotice
            message={message ?? 'Activá tu ubicación para ver las paradas que tenés cerca.'}
            action={{ label: 'Activar', onClick: request }}
          />
        )}
      </section>

      {/* ---------- Clima ---------- */}
      {weather && (
        <section className="mt-3 grid grid-cols-2 gap-3" aria-label="Clima">
          <div className="card">
            <p className="section-label">Ahora</p>
            <p className="tabular mt-1 text-2xl font-extrabold leading-none text-ink-900">
              {weather.temperature}°
            </p>
            <p className="mt-1 text-xs text-ink-400">{weather.description}</p>
          </div>

          <div className="card">
            <p className="section-label">
              {weather.seaTemperature !== null ? 'Agua' : 'Viento'}
            </p>
            {weather.seaTemperature !== null ? (
              <>
                <p className="tabular mt-1 text-2xl font-extrabold leading-none text-ink-900">
                  {weather.seaTemperature}°
                </p>
                <p className="mt-1 flex items-center gap-1 text-xs text-ink-400">
                  <Waves className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Viento {weather.windDirection} {weather.windSpeed} km/h
                </p>
              </>
            ) : (
              <>
                <p className="tabular mt-1 text-2xl font-extrabold leading-none text-ink-900">
                  {weather.windSpeed}
                  <span className="text-sm font-semibold"> km/h</span>
                </p>
                <p className="mt-1 flex items-center gap-1 text-xs text-ink-400">
                  <Wind className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Del {weather.windDirection}
                </p>
              </>
            )}
          </div>
        </section>
      )}

      {/* ---------- Qué hay hoy ---------- */}
      {featuredEvent && (
        <section className="mt-7" aria-labelledby="hoy">
          <div className="flex items-baseline justify-between">
            <h2 id="hoy" className="text-lg font-extrabold tracking-tight text-ink-900">
              {todayEvents.length > 0 ? 'Hoy en Maldonado' : 'Lo que se viene'}
            </h2>
            <Link to="/que-hacer" className="text-xs font-bold text-coral-500">
              Ver todo
            </Link>
          </div>

          <Link
            to={`/evento/${featuredEvent.id}`}
            className="card mt-2.5 block overflow-hidden p-0"
          >
            <Thumb
              src={featuredEvent.image}
              name={featuredEvent.title}
              className="h-32 w-full"
              eager
            />
            <div className="p-3.5">
              <p className="text-sm font-extrabold tracking-tight text-ink-900">
                {featuredEvent.title}
              </p>
              <p className="mt-1 text-xs text-ink-400">
                {featuredEvent.time ? `${featuredEvent.time} · ` : ''}
                {featuredEvent.location}
              </p>
            </div>
          </Link>
        </section>
      )}

      {/* ---------- Los bondis en la calle ----------
          Reemplaza a "Más paradas cerca", que era la misma lista que Moverse
          muestra completa una pantalla más allá. Acá lo que falta no es otra
          lista: es la puerta al mapa en vivo, que es donde se ve por dónde
          viene cada uno. */}
      {incomingLines.length > 0 && (
        <section className="mt-7" aria-labelledby="bondis-en-vivo">
          <div className="flex items-baseline justify-between">
            <h2 id="bondis-en-vivo" className="text-lg font-extrabold tracking-tight text-ink-900">
              Bondis en vivo
            </h2>
            <Link to="/moverse/bondis" className="text-xs font-bold text-coral-500">
              Ver el mapa
            </Link>
          </div>

          <Link to="/moverse/bondis" className="card mt-2.5 flex items-center gap-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-ink-900">
              <Bus className="h-5 w-5 text-white" strokeWidth={1.9} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-ink-900">
                {incoming.length === 1
                  ? 'Un bondi en camino a tus paradas'
                  : `${incoming.length} bondis en camino a tus paradas`}
              </span>
              <span className="block text-xs text-ink-400">
                Tocá uno y te muestra por dónde viene, en qué parada tomarlo y hasta dónde te
                lleva
              </span>
            </span>
            <ChevronRight className="h-4 w-4 flex-none text-ink-300" strokeWidth={2.5} />
          </Link>

          {/* Las líneas que efectivamente vienen ahora, con lo que falta para
              que lleguen. Cada una abre el mapa con su ida y su vuelta
              dibujadas, cada sentido de un color. */}
          <div className="chip-row mt-2.5">
            {incomingLines.map((arrival) => (
              <Link
                key={arrival.line_code}
                to={`/moverse/bondis?linea=${encodeURIComponent(arrival.line_code)}`}
                className="chip gap-2 py-1"
              >
                <LineTag code={arrivalLine(arrival)} color={lineColor(arrival.operator)} size="sm" />
                <span className={`tabular ${arrival.live ? 'text-ink-900' : 'text-ink-400'}`}>
                  {arrival.eta_minutes <= 0 ? 'ahora' : `${arrival.eta_minutes} min`}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
