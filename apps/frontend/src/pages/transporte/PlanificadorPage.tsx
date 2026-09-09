import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpDown,
  Footprints,
  ChevronRight,
  Bus,
  MapPin,
  MapPinned,
  RouteOff,
} from 'lucide-react';
import { useGeolocation } from '@hooks/useGeolocation';
import { routePlannerService, LastReturn, TripOption, TripLeg } from '@services/routePlannerService';
import { destinationsService, Destination } from '@services/destinationsService';
import { TripMap, TripLegend, rideColor, legLine } from '@components/transporte/TripMap';
import { DestinoEnMapa } from '@components/transporte/DestinoEnMapa';
import { ABordo } from '@components/transporte/ABordo';
import { LineTag } from '@components/ui/LineTag';
import { EmptyState, ErrorState, SkeletonList } from '@components/ui/States';
import { formatDistance } from '@lib/geo';
import { formatStopName } from '@lib/stopNames';

/**
 * Elegí tu viaje.
 *
 * Dos cosas la hacen usable, y las dos faltaban.
 *
 * **El destino se encuentra.** Antes se buscaba en el teléfono contra lo que
 * ya estuviera descargado —las fichas de atractivos y los nombres de parada—,
 * así que "punta shopping", "el hospital" o "liceo 3" no daban ningún
 * resultado. Ahora la búsqueda la resuelve el backend contra los lugares de
 * OpenStreetMap además de las paradas y los atractivos.
 *
 * **El viaje se ve.** Antes la respuesta era una lista de pasos en texto con
 * los nombres abreviados de la empresa ("hasta R P DEL PUERTO"). Ahora cada
 * opción se dibuja: la caminata por la calle y el tramo en ómnibus siguiendo
 * el recorrido publicado, con las paradas marcadas.
 *
 * Las opciones se comparan de un vistazo, como en Uber y en Moovit: la tira
 * visual del recorrido, cuándo sale, cuánto dura. El nombre de la línea es una
 * ficha de color, no un título — la gente decide con dos números, no leyendo.
 */

/** Lo que se espera después de la última tecla antes de salir a buscar. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * A dónde vas.
 *
 * No es `Destination` a secas porque un destino ya no es sólo un lugar del
 * catálogo: también puede ser un punto marcado en el mapa, que no tiene id ni
 * categoría ni figura en ninguna tabla. Al planificador le da igual —recibe
 * dos coordenadas— y esta pantalla no tiene por qué inventarle una ficha a un
 * punto para poder mandarlo. Ver `DestinoEnMapa`.
 */
interface Destino {
  name: string;
  lat: number;
  lng: number;
}

export default function PlanificadorPage() {
  const [searchParams] = useSearchParams();
  const { coords, granted } = useGeolocation();

  const [query, setQuery] = useState(searchParams.get('destino') ?? '');
  const [suggestions, setSuggestions] = useState<Destination[]>([]);
  const [destination, setDestination] = useState<Destino | null>(null);
  /** El selector de punto en el mapa, abierto. */
  const [pickingOnMap, setPickingOnMap] = useState(false);
  /** Ya se subió: la pantalla pasa a seguir el coche. */
  const [boarded, setBoarded] = useState(false);
  const [options, setOptions] = useState<TripOption[]>([]);
  /**
   * La última vuelta desde el destino.
   *
   * Se muestra junto con la ida y no en otra pantalla: la pregunta
   * "¿y cómo vuelvo?" hay que contestarla **antes** de salir. Nadie se la
   * hace hasta que ya es tarde, y para entonces está parado en la Ruta 10.
   */
  const [returnTrip, setReturnTrip] = useState<LastReturn | null>(null);
  const [selected, setSelected] = useState(0);
  const [ready, setReady] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Un destino que llega por la URL se resuelve una sola vez.
  const resolvedFromUrl = useRef(false);

  // --- Sugerencias, mientras se escribe ---
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2 || destination) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      destinationsService
        .search(term, coords)
        .then((results) => {
          if (cancelled) return;
          setSuggestions(results);

          // El destino que vino en la URL se elige solo: quien tocó "cómo
          // llegar" en una ficha ya dijo a dónde va.
          if (!resolvedFromUrl.current && searchParams.get('destino') && results.length > 0) {
            resolvedFromUrl.current = true;
            setDestination(results[0]);
            setQuery(results[0].name);
          }
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, destination, coords.lat, coords.lng, searchParams]);

  // --- El viaje ---
  useEffect(() => {
    if (!destination) return;

    let cancelled = false;
    setSearching(true);
    setError(null);
    setSelected(0);
    // Cambiar de destino termina el viaje a bordo: el coche que se estaba
    // siguiendo no lleva al destino nuevo.
    setBoarded(false);

    routePlannerService
      .plan(
        { ...coords, label: granted ? 'Tu ubicación' : 'Centro de Maldonado' },
        { lat: destination.lat, lng: destination.lng, label: destination.name },
      )
      .then((result) => {
        if (cancelled) return;
        setOptions(result.options);
        setReady(result.ready);
        setReturnTrip(result.return_trip ?? null);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || 'No pudimos calcular el viaje');
      })
      .finally(() => {
        if (cancelled) return;
        setSearching(false);
        setSearched(true);
      });

    return () => {
      cancelled = true;
    };
  }, [destination, coords.lat, coords.lng, granted]);

  const current = options[selected];

  /**
   * El tramo en ómnibus que se puede seguir en vivo.
   *
   * Es el primero con un coche concreto: sin `vehicle_id` la espera salió del
   * horario publicado o de la frecuencia de la línea, y no hay ninguna unidad
   * a la que seguirle el rastro. En un viaje con transbordo alcanza con el
   * primero —el segundo todavía no existe cuando uno se sube al primero—.
   */
  const boardable = current?.legs.find((leg) => leg.type === 'bus' && leg.vehicle_id) ?? null;
  const onBoard = boarded ? boardable : null;

  return (
    <div className="min-h-[calc(100dvh-4.25rem)] bg-sand-100">
      {/* ---------- Origen y destino ---------- */}
      <header className="bg-ink-900 px-4 pb-4 pt-4 text-white">
        <Link
          to="/moverse"
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
          Moverse
        </Link>

        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 flex-none rounded-full border-[2.5px] border-sea-200" />
          <span className="flex-1 truncate text-sm font-semibold">
            {granted ? 'Tu ubicación' : 'Centro de Maldonado'}
          </span>
          <ArrowUpDown className="h-4 w-4 flex-none text-ink-300" strokeWidth={2} />
        </div>

        <div className="ml-[0.3rem] h-px bg-white/15" />

        <div className="mt-2 flex items-center gap-2.5">
          <span className="h-2 w-2 flex-none rounded-sm bg-coral-500" />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setDestination(null);
              setSearched(false);
              setOptions([]);
            }}
            placeholder="¿A dónde vas?"
            aria-label="Destino"
            className="w-full bg-transparent text-sm font-bold text-white placeholder:font-semibold placeholder:text-ink-300 focus:outline-none"
          />
        </div>

        {/*
          Marcar en el mapa, al lado de escribir y no escondido en un menú.

          Buena parte de los viajes de Maldonado no van a un lugar con nombre:
          van a una casa, a una obra, a un punto de la Ruta 10. Escribiendo,
          para todos esos la app contestaba "no encontramos ese lugar" —y el
          lugar existe, sólo que no se llama de ninguna manera—.
        */}
        <button
          onClick={() => setPickingOnMap(true)}
          className="ml-[1.05rem] mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-200 active:text-white"
        >
          <MapPinned className="h-3.5 w-3.5" strokeWidth={2.5} />
          Marcalo en el mapa
        </button>
      </header>

      {/* ---------- El destino, marcado con el dedo ---------- */}
      {pickingOnMap && (
        <DestinoEnMapa
          center={coords}
          onCancel={() => setPickingOnMap(false)}
          onConfirm={(point) => {
            setPickingOnMap(false);
            setQuery(point.label);
            setSuggestions([]);
            setSearched(false);
            setOptions([]);
            setDestination({ name: point.label, lat: point.lat, lng: point.lng });
          }}
        />
      )}

      {/* ---------- Sugerencias ---------- */}
      {!destination && suggestions.length > 0 && (
        <ul className="divide-y divide-sand-200 bg-white">
          {suggestions.map((suggestion) => (
            <li key={suggestion.id}>
              <button
                onClick={() => {
                  setDestination(suggestion);
                  setQuery(suggestion.name);
                  setSuggestions([]);
                }}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                {suggestion.source === 'parada' ? (
                  <Bus className="h-4 w-4 flex-none text-ink-300" strokeWidth={2} />
                ) : (
                  <MapPin className="h-4 w-4 flex-none text-ink-300" strokeWidth={2} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-data font-bold text-ink-900">
                    {suggestion.source === 'parada'
                      ? formatStopName(suggestion.name)
                      : suggestion.name}
                  </span>
                  <span className="block truncate text-xs text-ink-400">
                    <span className="capitalize">{suggestion.kind}</span>
                    {suggestion.locality ? ` · ${suggestion.locality}` : ''}
                    {suggestion.distanceM !== undefined
                      ? ` · a ${formatDistance(suggestion.distanceM)}`
                      : ''}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 flex-none text-ink-300" strokeWidth={2.5} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ---------- Ya me subí ----------
          Sólo cuando el viaje tiene un coche concreto en la calle: sin
          `vehicle_id` la espera salió del horario o de la frecuencia, y no hay
          nada que seguir. Ofrecerlo igual sería prometer un seguimiento en
          vivo de un ómnibus que no está reportando. */}
      {onBoard && destination && (
        <ABordo
          vehicleId={onBoard.vehicle_id!}
          destination={{ ...destination, label: destination.name }}
          stopId={onBoard.alighting_stop_id}
          onClose={() => setBoarded(false)}
        />
      )}

      {/* ---------- El viaje elegido, dibujado ---------- */}
      {current && !searching && (
        <div className="border-b border-sand-200">
          {boardable && (
            <button
              onClick={() => setBoarded(true)}
              className="flex w-full items-center justify-center gap-2 bg-ink-900 py-2.5 text-sm font-bold text-white active:bg-ink-800"
            >
              <Bus className="h-4 w-4" strokeWidth={2.5} />
              Ya me subí
            </button>
          )}
          <div className="h-64 w-full">
            <TripMap option={current} />
          </div>
          <TripLegend option={current} />
        </div>
      )}

      {/* ---------- Opciones ---------- */}
      <div className="px-4 pb-8 pt-4">
        {!destination && suggestions.length === 0 && query.trim().length < 2 && (
          <p className="px-1 text-sm text-ink-400">
            Escribí a dónde querés ir: una parada, una playa, el shopping, el hospital o el
            liceo. Si no tiene nombre —una casa, una obra, un punto de la ruta— marcalo en el
            mapa.
          </p>
        )}

        {error && <ErrorState message={error} onRetry={() => setDestination({ ...destination! })} />}

        {searching && <SkeletonList rows={3} />}

        {!searching && !error && searched && options.length === 0 && (
          <EmptyState
            icon={RouteOff}
            title={ready ? 'No encontramos un viaje en ómnibus' : 'Todavía no podemos planificar'}
            description={
              ready
                ? 'No hay una línea que conecte estos dos puntos con una caminata razonable. Probá con una parada cercana.'
                : 'Estamos cargando los recorridos de las empresas. Mientras tanto podés ver las paradas y sus llegadas.'
            }
          />
        )}

        {!searching && options.length > 0 && (
          <>
            {/* La vuelta, antes que las opciones de ida: es lo que decide si
                el viaje se hace o no, y verlo después de elegir cómo ir es
                verlo tarde. */}
            {returnTrip?.available && (
              <div
                className={`mb-3 rounded-card px-3 py-2.5 text-data ${
                  returnTrip.finished ? 'bg-warn-soft text-warn' : 'bg-sand-100 text-ink-500'
                }`}
              >
                {returnTrip.finished ? (
                  <>
                    <span className="font-bold">Hoy ya no podés volver en ómnibus.</span>{' '}
                    La última vuelta salió {returnTrip.last_at}
                    {returnTrip.line_label ? ` (línea ${returnTrip.line_label})` : ''}.
                  </>
                ) : (
                  <>
                    <span className="font-bold text-ink-900">
                      Última vuelta {returnTrip.last_at}
                    </span>
                    {returnTrip.line_label ? ` · línea ${returnTrip.line_label}` : ''}
                    {returnTrip.stop_name ? ` desde ${returnTrip.stop_name}` : ''}
                  </>
                )}
              </div>
            )}

            <p className="mb-3 section-label">
              {options.length} {options.length === 1 ? 'forma de llegar' : 'formas de llegar'}
            </p>
            <div className="flex flex-col gap-3">
              {options.map((option, index) => (
                <TripCard
                  key={option.id}
                  option={option}
                  selected={index === selected}
                  onSelect={() => {
                    setSelected(index);
                    // Otra opción es otro coche: seguir mostrando el anterior
                    // sería seguirle el rastro a un ómnibus que no se tomó.
                    setBoarded(false);
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * La hora que va a ser dentro de tantos minutos.
 *
 * "Pasa en 31 minutos" obliga a hacer la cuenta y a rehacerla cada vez que uno
 * mira el teléfono; "pasa 23:58" se compara con el reloj de la pantalla. Las
 * dos cosas se muestran juntas: la cuenta para decidir y la hora para
 * organizarse.
 */
function clockIn(minutes: number): string {
  // En Uruguay el reloj es de 24 horas: 'es-UY' por defecto devuelve
  // "12:41 a. m.", que además de largo se lee mal de un vistazo.
  return new Date(Date.now() + minutes * 60_000).toLocaleTimeString('es-UY', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Qué número de tramo en ómnibus es este, para pintarlo del mismo color que
 * en el mapa. El primero va en verde mar, el segundo en coral.
 */
function rideIndexOf(option: TripOption, leg: TripLeg): number {
  return option.legs.filter((candidate) => candidate.type === 'bus').indexOf(leg);
}

/** "ahora" pega mucho mejor que "0 min" para alguien parado en la vereda. */
function waitText(leg: TripLeg): string {
  return leg.duration_minutes <= 0 ? 'ahora' : `${leg.duration_minutes} min`;
}

/** Una opción de viaje. La tira visual se lee sin leer. */
function TripCard({
  option,
  selected,
  onSelect,
}: {
  option: TripOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const busLegs = option.legs.filter((leg) => leg.type === 'bus');
  const firstWait = option.legs.find((leg) => leg.type === 'wait');
  const boardingStop = busLegs[0]?.from;

  return (
    <article className={`card ${selected ? 'card-selected' : ''}`}>
      <button onClick={onSelect} className="w-full text-left" aria-pressed={selected}>
        <div className="mb-2.5 flex items-center justify-between">
          {option.label ? (
            <span
              className={`rounded-chip px-2 py-1 text-[0.625rem] font-extrabold uppercase tracking-wider ${
                selected ? 'bg-ink-900 text-white' : 'bg-sea-50 text-sea-600'
              }`}
            >
              {option.label}
            </span>
          ) : (
            <span />
          )}
          <span className="text-xs font-semibold text-ink-400">
            {option.transfers === 0
              ? 'Directo'
              : `${option.transfers} ${option.transfers === 1 ? 'transbordo' : 'transbordos'}`}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {option.legs
              .filter((leg) => leg.type !== 'wait')
              .map((leg, index, array) => (
                <span key={index} className="flex items-center gap-1.5">
                  {leg.type === 'walk' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-ink-600">
                      <Footprints className="h-3.5 w-3.5" strokeWidth={2} />
                      {leg.duration_minutes}
                    </span>
                  ) : (
                    // El color es el del tramo en el mapa, no el de la
                    // empresa: es lo que permite mirar la tira, mirar el
                    // dibujo y saber cuál es cuál sin leer nada.
                    <LineTag
                      code={legLine(leg) || '?'}
                      color={rideColor(rideIndexOf(option, leg))}
                      size="sm"
                    />
                  )}
                  {index < array.length - 1 && <span className="text-[0.625rem] text-ink-200">›</span>}
                </span>
              ))}
          </div>

          <div className="flex-none text-right">
            <p className="tabular text-xl font-extrabold leading-none text-ink-900">
              {option.total_minutes}
              <span className="text-xs font-semibold"> min</span>
            </p>
            <p className="tabular mt-0.5 text-[0.6875rem] font-semibold text-ink-400">
              llegás {clockIn(option.total_minutes)}
            </p>
          </div>
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2 text-xs">
          {firstWait && boardingStop ? (
            <span
              className={`flex min-w-0 items-center gap-1.5 font-bold ${
                firstWait.live ? 'text-live' : 'text-ink-400'
              }`}
            >
              {firstWait.live && (
                <span className="h-1.5 w-1.5 flex-none rounded-full bg-live-dot animate-pulse-dot" />
              )}
              {/* Lo que se dice es cuándo hay que salir, no cuánto falta para
                  que pase el ómnibus: el ómnibus pasa por la parada, y a la
                  parada hay que llegar caminando. */}
              <span className="truncate">
                {option.leave_in_minutes <= 0 ? 'Salí ahora' : `Salí en ${option.leave_in_minutes} min`}
                {firstWait.departs_in_minutes != null
                  ? ` · pasa ${clockIn(firstWait.departs_in_minutes)}`
                  : ''}
              </span>
            </span>
          ) : (
            <span className="text-ink-400">A pie todo el camino</span>
          )}

          <span className="flex-none font-semibold text-ink-400">
            {option.walk_minutes} min caminando
          </span>
        </div>
      </button>

      {/* Detalle paso a paso: se lee solo si a alguien le interesa el detalle. */}
      <details className="mt-3 border-t border-sand-200 pt-3">
        <summary className="cursor-pointer text-xs font-bold text-coral-500">
          Ver paso a paso
        </summary>
        <ol className="mt-3 flex flex-col gap-2.5">
          {option.legs.map((leg, index) => (
            <li key={index} className="flex items-start gap-2.5">
              <span className="mt-1 h-2 w-2 flex-none rounded-full bg-sand-400" />
              <span className="min-w-0 flex-1 text-xs">
                {leg.type === 'walk' && (
                  <>
                    <span className="font-bold text-ink-900">
                      Caminá {leg.duration_minutes} min
                    </span>
                    <span className="text-ink-400">
                      {leg.distance_m ? ` (${formatDistance(leg.distance_m)})` : ''} hasta{' '}
                      {formatStopName(leg.to)}
                    </span>
                  </>
                )}
                {leg.type === 'wait' && (
                  <>
                    <span className="font-bold text-ink-900">
                      Esperá {waitText(leg)}
                      {leg.departs_in_minutes != null ? ` (pasa ${clockIn(leg.departs_in_minutes)})` : ''}
                    </span>
                    <span className="text-ink-400">
                      {' '}
                      la línea {legLine(leg)} en {formatStopName(leg.from)}
                      {leg.live
                        ? ` · viene el coche ${leg.vehicle_id?.split('-').pop() ?? ''}`
                        : leg.scheduled
                          ? ' · según el horario de la empresa'
                          : ' · estimado por la frecuencia de la línea'}
                    </span>
                  </>
                )}
                {leg.type === 'bus' && (
                  <>
                    <span className="font-bold text-ink-900">
                      Línea {legLine(leg)}, {leg.duration_minutes} min
                    </span>
                    <span className="text-ink-400">
                      {' '}
                      hasta {formatStopName(leg.to)}
                      {leg.stops_count ? ` · ${leg.stops_count} paradas` : ''}
                    </span>
                  </>
                )}
              </span>
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}
