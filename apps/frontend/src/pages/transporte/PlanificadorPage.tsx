import { useEffect, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpDown,
  Clock,
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
import { BondiSprite } from '@components/transporte/BondiSprite';
import { LineTag } from '@components/ui/LineTag';
import { EmptyState, ErrorState, SkeletonList } from '@components/ui/States';
import { prepararAvisos } from '@lib/avisos';
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
 *
 * **Y el viaje puede ser más tarde.** "Quiero ir al Hospital mañana a las
 * 18:30" no se podía preguntar: el planificador siempre contestaba sobre este
 * momento. Con una hora elegida cambia lo que la pantalla puede decir, y no
 * por prolijidad: a esa hora no hay ningún coche en la calle del que hablar,
 * así que no hay punto verde de "en vivo", no hay ómnibus dibujado y no hay
 * "ya me subí". Y deja de hablarse en relativo: "salí en 13 min" no significa
 * nada para un viaje de mañana. Ver `clockIn`.
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
  /**
   * Cuándo se sale. `null` es ahora, que es el 95% de los viajes.
   *
   * No hay "llegar a las", que sería la otra mitad de la pregunta. Es otro
   * problema y no un tercer botón: hay que buscar hacia atrás desde la hora de
   * llegada probando salidas, no alcanza con mover el reloj. Ofrecer el
   * control sin poder cumplirlo es peor que no tenerlo.
   */
  const [departAt, setDepartAt] = useState<Date | null>(null);
  /**
   * Desde qué momento cuenta los minutos la respuesta que está en pantalla.
   *
   * Sale del backend y no de `departAt`: son los minutos de **esta**
   * respuesta, y mientras se está buscando la nueva la pantalla sigue
   * mostrando la anterior. Tomándolo del selector, las horas de la lista
   * saltarían a la hora nueva antes de que llegaran los viajes nuevos.
   */
  const [plannedFor, setPlannedFor] = useState<number | null>(null);
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
        departAt ?? undefined,
      )
      .then((result) => {
        if (cancelled) return;
        setOptions(result.options);
        setReady(result.ready);
        setReturnTrip(result.return_trip ?? null);
        setPlannedFor(result.planned_for ? new Date(result.planned_for).getTime() : null);
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
  }, [destination, coords.lat, coords.lng, granted, departAt]);

  const current = options[selected];

  /**
   * El viaje que se está mostrando es de más tarde.
   *
   * Sale de la respuesta y no del selector por lo mismo que `plannedFor`:
   * mientras se busca el viaje nuevo, en pantalla sigue el anterior.
   */
  const futuro = plannedFor !== null;

  /**
   * El tramo en ómnibus que se puede seguir en vivo.
   *
   * Es el primero con un coche concreto: sin `vehicle_id` la espera salió del
   * horario publicado o de la frecuencia de la línea, y no hay ninguna unidad
   * a la que seguirle el rastro. En un viaje con transbordo alcanza con el
   * primero —el segundo todavía no existe cuando uno se sube al primero—.
   *
   * Y nunca en un viaje planificado para más tarde. El backend ya no manda
   * coche en esos, así que la condición de arriba alcanzaría; está escrito
   * igual porque lo que no se puede ofrecer es seguir en vivo un ómnibus que
   * todavía no salió, y eso no puede depender de que el backend siga
   * comportándose como hoy.
   */
  const boardable =
    (!futuro && current?.legs.find((leg) => leg.type === 'bus' && leg.vehicle_id)) || null;
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

      {/*
        ---------- Cuándo ----------

        Va debajo del bloque de origen y destino y no entre los dos: son un par
        y separarlos rompe la lectura "de acá a allá" que se entiende sin leer.
        Acá abajo queda igual antes que los resultados, que es lo que importa —
        se elige la hora y recién después se miran los viajes.

        Por defecto "ahora": es el 95% de los usos y no tiene que costar un
        toque más.
      */}
      <div className="flex flex-wrap items-center gap-2 border-b border-sand-200 bg-white px-4 py-2.5">
        <button
          onClick={() => setDepartAt(null)}
          aria-pressed={departAt === null}
          className={`chip ${departAt === null ? 'chip-active' : ''}`}
        >
          <Clock className="h-3.5 w-3.5" strokeWidth={2.5} />
          Ahora
        </button>
        <button
          onClick={() => setDepartAt((actual) => actual ?? proximaHoraRedonda())}
          aria-pressed={departAt !== null}
          className={`chip ${departAt !== null ? 'chip-active' : ''}`}
        >
          Salir a las
        </button>

        {departAt !== null && (
          <input
            type="datetime-local"
            aria-label="Hora de salida"
            value={paraElInput(departAt)}
            min={paraElInput(new Date())}
            onChange={(event) => {
              // Vacío es lo que deja el input mientras se está editando: no se
              // vuelve a "ahora" por eso, se conserva la hora que había.
              const elegida = new Date(event.target.value);
              if (Number.isFinite(elegida.getTime())) setDepartAt(elegida);
            }}
            className="tabular rounded-chip border border-sand-300 bg-white px-2 py-1.5 text-xs font-bold text-ink-900 focus:border-ink-900 focus:outline-none"
          />
        )}
      </div>

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
              onClick={() => {
                // El permiso de notificaciones se pide **acá** y no al abrir
                // la pantalla de a bordo. Un permiso pedido sin contexto es un
                // permiso negado, y negado no se vuelve a pedir nunca: queda
                // así para siempre en este dominio y con él se pierde el único
                // aviso que llega con la app en segundo plano. Pedido justo
                // después de "ya me subí", la pregunta se explica sola. Este
                // toque es además el gesto que habilita el sonido, que sin
                // gesto de la persona no arranca.
                prepararAvisos();
                setBoarded(true);
              }}
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
          // Con una hora futura, "no hay línea" sería mentira: la línea puede
          // existir y estar pasando todos los días. Lo que no hay es horario
          // publicado que podamos ubicar en esa parada, que es lo único con lo
          // que se puede contestar sobre una hora que todavía no llegó.
          <EmptyState
            icon={RouteOff}
            title={
              !ready
                ? 'Todavía no podemos planificar'
                : futuro
                  ? 'No tenemos horario para esa hora'
                  : 'No encontramos un viaje en ómnibus'
            }
            description={
              !ready
                ? 'Estamos cargando los recorridos de las empresas. Mientras tanto podés ver las paradas y sus llegadas.'
                : futuro
                  ? 'Para un viaje más tarde sólo podemos usar el horario publicado por las empresas, y no tenemos ninguna salida cargada que te sirva a esa hora. Probá con "ahora", que además mira los ómnibus que están en la calle.'
                  : 'No hay una línea que conecte estos dos puntos con una caminata razonable. Probá con una parada cercana.'
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
                    {/* La vuelta se mira desde la hora de salida pedida, así
                        que con un viaje de más tarde esto no es "hoy ya no":
                        es que **a esa hora** ya no va a haber con qué volver,
                        que es justo lo que hay que saber antes de ir. */}
                    <span className="font-bold">
                      {futuro
                        ? 'Si salís a esa hora, después no vas a poder volver en ómnibus.'
                        : 'Hoy ya no podés volver en ómnibus.'}
                    </span>{' '}
                    La última vuelta {futuro ? 'sale' : 'salió'} {returnTrip.last_at}
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
              {/* Para cuándo son. Con hora futura toda la lista habla en horas
                  de reloj y ninguna dice de qué día: sin esto, el viaje de
                  mañana y el de hoy se ven exactamente iguales. */}
              {futuro && plannedFor !== null ? ` · ${etiquetaDeSalida(plannedFor)}` : ''}
            </p>
            <div className="flex flex-col gap-3">
              {options.map((option, index) => (
                <TripCard
                  key={option.id}
                  option={option}
                  desde={plannedFor}
                  futuro={futuro}
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
 * La hora que va a ser tantos minutos después de arrancado el viaje.
 *
 * "Pasa en 31 minutos" obliga a hacer la cuenta y a rehacerla cada vez que uno
 * mira el teléfono; "pasa 23:58" se compara con el reloj de la pantalla. Las
 * dos cosas se muestran juntas: la cuenta para decidir y la hora para
 * organizarse.
 *
 * `desde` es el momento desde el que el backend contó esos minutos, y es
 * obligatorio pasarlo: para un viaje pedido para mañana a las 18:30, sumarlos
 * al reloj del teléfono daría horas corridas un día entero. `null` es ahora.
 */
function clockIn(minutes: number, desde: number | null): string {
  // En Uruguay el reloj es de 24 horas: 'es-UY' por defecto devuelve
  // "12:41 a. m.", que además de largo se lee mal de un vistazo.
  return new Date((desde ?? Date.now()) + minutes * 60_000).toLocaleTimeString('es-UY', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * La hora que propone el selector al elegir "salir a las".
 *
 * El próximo cuarto de hora, con quince minutos de aire. No es "ahora mismo":
 * el backend rechaza una hora que ya pasó, y entre que se abre el selector y
 * se toca buscar pasan segundos. Y no es una hora redonda lejana porque lo que
 * más se pide es un rato más tarde el mismo día.
 */
function proximaHoraRedonda(): Date {
  const cuarto = 15 * 60_000;
  return new Date(Math.ceil((Date.now() + cuarto) / cuarto) * cuarto);
}

/**
 * La fecha como la quiere un `<input type="datetime-local">`.
 *
 * A mano y no con `toISOString()`, que devuelve UTC: en Uruguay eso pondría el
 * selector tres horas adelante de lo que la persona eligió.
 */
function paraElInput(date: Date): string {
  const dosDigitos = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${dosDigitos(date.getMonth() + 1)}-${dosDigitos(date.getDate())}` +
    `T${dosDigitos(date.getHours())}:${dosDigitos(date.getMinutes())}`
  );
}

/**
 * Para cuándo son los viajes que se están mostrando: "mañana 18:30".
 *
 * Con una hora futura, la lista entera habla en horas de reloj y ninguna de
 * ellas dice de qué día es. Sin este renglón, un viaje de mañana y uno de hoy
 * se ven exactamente iguales.
 */
function etiquetaDeSalida(desde: number): string {
  const salida = new Date(desde);
  const hora = salida.toLocaleTimeString('es-UY', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const dia = new Date(salida.getFullYear(), salida.getMonth(), salida.getDate());
  const hoy = new Date();
  const diasDeDiferencia = Math.round(
    (dia.getTime() - new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime()) /
      86_400_000,
  );

  if (diasDeDiferencia === 0) return `hoy ${hora}`;
  if (diasDeDiferencia === 1) return `mañana ${hora}`;

  return `${salida.toLocaleDateString('es-UY', { weekday: 'short', day: 'numeric' })} ${hora}`;
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
  desde,
  futuro,
}: {
  option: TripOption;
  selected: boolean;
  onSelect: () => void;
  /** Desde qué momento contó el backend los minutos de esta opción. */
  desde: number | null;
  /** El viaje es de más tarde: nada se dice en relativo. Ver `clockIn`. */
  futuro: boolean;
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
              llegás {clockIn(option.total_minutes, desde)}
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
              {/* El ómnibus que hay que tomarse, dibujado. Sólo cuando hay una
                  unidad concreta en la calle: si la espera salió del horario
                  publicado todavía no hay coche asignado, y dibujar uno sería
                  prometer una empresa que puede no ser la que venga. */}
              {busLegs[0]?.vehicle_id && (
                <BondiSprite vehicle={busLegs[0]} width={28} className="-my-1" />
              )}
              {/* Lo que se dice es cuándo hay que salir, no cuánto falta para
                  que pase el ómnibus: el ómnibus pasa por la parada, y a la
                  parada hay que llegar caminando. */}
              {/* Con una hora futura no se puede hablar en relativo: "salí en
                  13 min" no significa nada para un viaje de mañana, y el
                  minuto cero de esa cuenta es una hora que todavía no llegó.
                  Pasa a ser la hora de reloj a la que hay que salir. */}
              <span className="truncate">
                {futuro
                  ? `Salí ${clockIn(option.leave_in_minutes, desde)}`
                  : option.leave_in_minutes <= 0
                    ? 'Salí ahora'
                    : `Salí en ${option.leave_in_minutes} min`}
                {firstWait.departs_in_minutes != null
                  ? ` · pasa ${clockIn(firstWait.departs_in_minutes, desde)}`
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
                      {leg.departs_in_minutes != null
                        ? ` (pasa ${clockIn(leg.departs_in_minutes, desde)})`
                        : ''}
                    </span>
                    <span className="text-ink-400">
                      {' '}
                      la línea {legLine(leg)} en {formatStopName(leg.from)}
                      {/* De dónde salió esa hora. Se lee de `source`, que lo
                          dice en un campo, y no combinando dos banderas. */}
                      {leg.source === 'vivo'
                        ? ` · viene el coche ${leg.vehicle_id?.split('-').pop() ?? ''}`
                        : leg.source === 'horario'
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
