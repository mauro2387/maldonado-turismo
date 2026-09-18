import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search,
  ChevronRight,
  Bus,
  AlertTriangle,
  Clock,
  Map as MapIcon,
  Home,
  Briefcase,
  Star,
  History,
  Plus,
  Ticket,
} from 'lucide-react';
import { useGeolocation } from '@hooks/useGeolocation';
import { useNearbyDepartures, useVehiclePositions } from '@hooks/useDepartures';
import { useAlerts, useLines } from '@hooks/useTransport';
import { useTransportHealth } from '@hooks/useTransportHealth';
import { Arrival, NearbyDeparture, TransportLine } from '@services/transportService';
import { LineTag } from '@components/ui/LineTag';
import { ArrivalRow, lineColor } from '@components/transporte/ArrivalRow';
import { ParadaGuardadaCard } from '@components/transporte/ParadaGuardadaCard';
import { ElegirLugarSheet } from '@components/transporte/ElegirLugarSheet';
import { LineScheduleSheet } from '@components/transporte/LineScheduleSheet';
import { Estrella } from '@components/ui/Estrella';
import {
  cochesPorLinea,
  estadoDeLinea,
  EstadoDeLineaChip,
} from '@components/transporte/EstadoDeLinea';
import { LiveIndicator, freshestFixAge } from '@components/ui/LiveIndicator';
import { EmptyState, ErrorState, InlineNotice, SkeletonList } from '@components/ui/States';
import { distanceMeters, formatDistance, walkingMinutes } from '@lib/geo';
import { operatorName } from '@lib/operators';
import { formatStopName } from '@lib/stopNames';
import { enlaceParaIr, estaGuardado, useLoTuyoStore } from '@store/loTuyoStore';
import { usePreferenciasStore } from '@store/preferenciasStore';
import { SoloAccesiblesChip } from '@components/transporte/SoloAccesiblesChip';

/**
 * Moverse.
 *
 * La sección no se organiza por paradas. Esa fue la primera corrección: la
 * pregunta de alguien parado en la vereda es "¿cuál me sirve y por dónde
 * viene?", y la pantalla contestaba "¿qué paradas hay cerca?" —que es como
 * está organizada la empresa, no como se usa un ómnibus—. Antes de eso eran
 * cuatro pestañas anidadas (Paradas / Líneas / Avisos / Planificar) y un
 * listado alfabético de las mil paradas del departamento.
 *
 * Y la segunda: **primero se pregunta a dónde vas.** El buscador de destino
 * estaba al final, después de un contador de flota, un aviso, una tarjeta que
 * manda a otra pantalla, ocho ómnibus y ocho líneas. Es la acción principal de
 * una app de transporte y estaba a seis pantallazos de scroll.
 *
 * De arriba abajo: a dónde vas, si el GPS de alguna empresa no está entrando,
 * los avisos de servicio, el mapa en vivo, tus paradas, los que te pasan
 * cerca —una fila por línea, no por coche—, tus líneas y las líneas con sus
 * horarios.
 *
 * **Y lo tuyo va antes que lo de todos.** Debajo del buscador están tu casa,
 * tu trabajo, los lugares que guardaste y a dónde fuiste últimamente, antes
 * que los destinos que se piden mucho en general: para quien toma el ómnibus
 * todos los días el viaje es siempre el mismo, y escribirlo cada vez era el
 * costo más alto de la app. Ver `loTuyoStore`.
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

/** Cuántas líneas se muestran acá antes de mandar a la lista completa. */
const MAX_LINES_PREVIEW = 6;

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
  /** Cuál de los dos se está configurando en el sheet, si alguno. */
  const [configurando, setConfigurando] = useState<'casa' | 'trabajo' | null>(null);
  /** La línea cuyo horario se abrió desde el buscador. */
  const [horarioDe, setHorarioDe] = useState<string | null>(null);

  const loTuyo = useLoTuyoStore();
  /** Sólo ómnibus con rampa. Es la preferencia de toda la app, ver el store. */
  const soloAccesibles = usePreferenciasStore((estado) => estado.soloAccesibles);

  const { stops, ready, loading, error, refetch } = useNearbyDepartures(
    coords,
    RADIUS_OPTIONS[radiusIndex],
  );
  const { alerts } = useAlerts();
  const { lines } = useLines();
  const { vehicles, error: vehiclesError } = useVehiclePositions(true);
  // Si el GPS de las empresas está entrando. Decide entre "no viene ninguno"
  // y "no tenemos el dato", que no son lo mismo.
  const { sinGps, gpsParcial, empresasCaidas } = useTransportHealth();

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
   * Qué tan de ahora es "ahora".
   *
   * Esto estaba puesto en cero, que es el único valor que `isLive()` no puede
   * rechazar: la pantalla decía "en vivo" siempre, incluso con los tres feeds
   * caídos hace media hora. El indicador existe justamente para lo contrario
   * —una app de transporte se gana la confianza mostrando cuándo *no* sabe— y
   * el dato para hacerlo bien ya venía en cada coche y en cada llegada.
   */
  const fleetFixAge = useMemo(
    () => freshestFixAge(vehicles.map((vehicle) => vehicle.fix_time ?? vehicle.recorded_at)),
    [vehicles],
  );

  /**
   * Los que te pasan ahora y llegás a tomar, **uno por línea**.
   *
   * Dos agrupaciones, una arriba de la otra.
   *
   * Por coche, porque el mismo ómnibus llega a varias paradas de la misma
   * cuadra y sin eso aparece tres veces con tres minutos distintos. Se queda
   * con la parada donde llega antes **de las que se alcanzan**: si a una
   * parada llega en un minuto y está a cuatro cuadras, esa no cuenta, y capaz
   * que a la parada de la otra cuadra llega en seis y esa sí.
   *
   * Y por línea, que es lo que faltaba. La pregunta de quien mira esta lista
   * es "¿cuál me sirve?", y la 24 puede venir en tres coches distintos: sin
   * agrupar, esos tres ocupaban tres de las ocho filas y tapaban a las otras
   * líneas, que son las que hacen falta para elegir. El segundo coche de la
   * misma línea no se pierde -queda como "y otro en N min"-, que es
   * exactamente el dato que uno quiere cuando ve que al primero no llega.
   */
  const nextBuses = useMemo(() => {
    const byVehicle = new Map<string, { arrival: Arrival; stop: NearbyDeparture }>();

    for (const stop of stops) {
      for (const arrival of stop.arrivals) {
        if (!catchable(arrival, stop)) continue;
        // Con "sólo con rampa", un coche sin rampa o del que no se sabe no
        // es una opción: ni siquiera como "y otro en N min".
        if (soloAccesibles && arrival.accessible !== true) continue;
        const known = byVehicle.get(arrival.vehicle_id);
        if (!known || arrival.eta_minutes < known.arrival.eta_minutes) {
          byVehicle.set(arrival.vehicle_id, { arrival, stop });
        }
      }
    }

    const byLine = new Map<string, { arrival: Arrival; stop: NearbyDeparture; next?: number }>();

    for (const entry of [...byVehicle.values()].sort(
      (a, b) => a.arrival.eta_minutes - b.arrival.eta_minutes,
    )) {
      const known = byLine.get(entry.arrival.line_code);

      if (!known) {
        byLine.set(entry.arrival.line_code, entry);
      } else if (known.next === undefined) {
        // El segundo de la misma línea: se guarda el minuto y se descarta el
        // resto. Un tercero no cambia ninguna decisión.
        known.next = entry.arrival.eta_minutes;
      }
    }

    return [...byLine.values()].sort((a, b) => a.arrival.eta_minutes - b.arrival.eta_minutes);
  }, [stops, soloAccesibles]);

  /**
   * Las mismas líneas, juntadas por la parada donde se las toma.
   *
   * Un renglón de esta lista son dos datos: qué ómnibus viene, y a qué esquina
   * hay que ir. El segundo es de la parada y no del ómnibus -a la misma
   * esquina van cinco líneas- y estaba escrito una vez por fila: "Pasa por A
   * Tamaro · a 340 m, 4 min caminando", seis veces seguidas. Repetido deja de
   * leerse: se vuelve textura y empuja hacia abajo lo único que cambia de fila
   * en fila.
   *
   * Escribirlo sólo cuando cambia tampoco alcanzaba: ordenadas por minuto, las
   * dos esquinas se alternan y la frase volvía a aparecer en todas las filas.
   * Así que se agrupa de verdad, y los grupos van ordenados por el ómnibus que
   * llega antes: la primera esquina de la lista sigue siendo la del próximo.
   */
  const porParada = useMemo(() => {
    const grupos = new Map<number, { stop: NearbyDeparture; buses: typeof nextBuses }>();

    for (const fila of nextBuses.slice(0, MAX_NEXT_BUSES)) {
      const grupo = grupos.get(fila.stop.id);
      if (grupo) grupo.buses.push(fila);
      else grupos.set(fila.stop.id, { stop: fila.stop, buses: [fila] });
    }

    return [...grupos.values()];
  }, [nextBuses]);

  const canWidenSearch = radiusIndex < RADIUS_OPTIONS.length - 1;

  /**
   * A dónde fuiste últimamente, sin lo que ya tiene su propio chip: si el
   * último viaje fue a casa, "A casa" ya está a la izquierda y repetirlo como
   * reciente es ocupar un lugar con nada.
   */
  const recientes = loTuyo.recientes.filter((lugar) => !estaGuardado(loTuyo, lugar.id));

  /** Cuántos coches hace cada línea ahora, para las líneas guardadas. */
  const porLinea = useMemo(() => cochesPorLinea(vehicles), [vehicles]);

  /**
   * Cuánto hay hasta cada parada guardada. Sólo con la ubicación real: desde
   * el centro de Maldonado la distancia a la parada de tu casa es un número
   * que no significa nada.
   */
  const distanciaA = (lat: number, lng: number) =>
    granted ? distanceMeters(coords.lat, coords.lng, lat, lng) : null;

  const submitSearch = (destination: string) => {
    const value = destination.trim();
    if (!value) return;
    navigate(`/transporte/planificador?destino=${encodeURIComponent(value)}`);
  };

  /**
   * Lo que se escribió es un número de línea.
   *
   * "¿A dónde vas?" es la caja más grande de la pantalla, y la gente escribe
   * ahí lo primero que tiene en la cabeza, que muchas veces es "24": antes
   * eso mandaba al planificador a buscar un destino llamado 24 y volvía con
   * "no encontramos ese lugar". Si lo escrito empieza como el número de una
   * línea, se ofrece la línea -por dónde va y sus horarios- arriba del
   * resto, sin sacar el buscador de destinos.
   */
  const lineasQueCoinciden = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term || !/^\d/.test(term)) return [];
    return lines
      .filter((line) => (line.line_label ?? line.line_code).toLowerCase().startsWith(term))
      .slice(0, 3);
  }, [query, lines]);

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
        {onStreet > 0 && (
          <LiveIndicator fixAgeSeconds={fleetFixAge} showAge={false} className="mb-1.5" />
        )}
      </header>

      {/* ---------- ¿A dónde vas? ----------
          Arriba de todo, que es donde tiene que estar.

          Estaba al final de la pantalla, después de un contador de flota, un
          aviso, una tarjeta que manda a otro lado, ocho ómnibus y ocho líneas.
          Ir a un lugar es la acción principal de una app de transporte -es
          para lo que la abre alguien que no sabe cómo llegar- y estaba a seis
          pantallazos de scroll. Mirar lo que pasa cerca sigue estando: abajo,
          que es donde va lo que se mira, no lo que se hace. */}
      <form
        className="mt-4"
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

        {lineasQueCoinciden.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            {lineasQueCoinciden.map((line) => (
              <div
                key={`${line.operator}-${line.line_code}`}
                className="card flex items-center gap-3 py-3"
              >
                {/* La tarjeta entera abre el mapa con la línea, que es lo
                    que se busca al escribir un número; el horario es el
                    botón chico de al lado. Dos botones con texto no
                    entraban en un teléfono sin cortar el nombre. */}
                <Link
                  to={`/moverse/bondis?linea=${encodeURIComponent(line.line_code)}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <LineTag code={line.line_label ?? line.line_code} color={lineColor(line.operator)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-data font-bold text-ink-900">
                      Línea {line.line_label ?? line.line_code} · por dónde va
                    </span>
                    <span className="block truncate text-xs text-ink-400">
                      {lineEndpoints(line)}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 flex-none text-ink-300" strokeWidth={2.5} />
                </Link>
                <button
                  type="button"
                  onClick={() => setHorarioDe(line.line_label ?? line.line_code)}
                  aria-label={`Horarios de la línea ${line.line_label ?? line.line_code}`}
                  className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-sand-100 text-ink-900 active:bg-sand-200"
                >
                  <Clock className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Lo tuyo primero. Casa y trabajo están siempre, configurados o no:
            un chip que dice "Agregá tu casa" es la única forma de que alguien
            descubra que se puede. */}
        <div className="chip-row mt-2">
          <button
            type="button"
            onClick={() =>
              loTuyo.casa ? navigate(enlaceParaIr(loTuyo.casa)) : setConfigurando('casa')
            }
            className={`chip ${loTuyo.casa ? 'chip-active' : 'border-dashed'}`}
          >
            {loTuyo.casa ? (
              <Home className="h-3.5 w-3.5" strokeWidth={2.5} />
            ) : (
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            )}
            {loTuyo.casa ? 'A casa' : 'Agregá tu casa'}
          </button>
          <button
            type="button"
            onClick={() =>
              loTuyo.trabajo
                ? navigate(enlaceParaIr(loTuyo.trabajo))
                : setConfigurando('trabajo')
            }
            className={`chip ${loTuyo.trabajo ? 'chip-active' : 'border-dashed'}`}
          >
            {loTuyo.trabajo ? (
              <Briefcase className="h-3.5 w-3.5" strokeWidth={2.5} />
            ) : (
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            )}
            {loTuyo.trabajo ? 'Al trabajo' : 'Agregá tu trabajo'}
          </button>

          {loTuyo.lugares.map((lugar) => (
            <button
              key={lugar.id}
              type="button"
              onClick={() => navigate(enlaceParaIr(lugar))}
              className="chip"
            >
              <Star className="h-3.5 w-3.5 fill-coral-500 text-coral-500" strokeWidth={2} />
              {lugar.name}
            </button>
          ))}

          {recientes.map((lugar) => (
            <button
              key={lugar.id}
              type="button"
              onClick={() => navigate(enlaceParaIr(lugar))}
              className="chip"
            >
              <History className="h-3.5 w-3.5 text-ink-400" strokeWidth={2} />
              {lugar.name}
            </button>
          ))}
        </div>

        {/* Los de todos, en su propia fila: después de lo tuyo, y sin
            mezclarse con lo tuyo. */}
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

      {horarioDe && <LineScheduleSheet label={horarioDe} onClose={() => setHorarioDe(null)} />}

      {configurando && (
        <ElegirLugarSheet
          titulo={configurando === 'casa' ? 'Tu casa' : 'Tu trabajo'}
          actual={configurando === 'casa' ? loTuyo.casa : loTuyo.trabajo}
          onPick={(lugar) => {
            if (configurando === 'casa') loTuyo.setCasa(lugar);
            else loTuyo.setTrabajo(lugar);
            setConfigurando(null);
          }}
          onClose={() => setConfigurando(null)}
        />
      )}

      {/* ---------- Si el GPS de alguna empresa no está entrando ----------
          El dato existía y sólo lo usaba la portada. Sin esto, cuando un feed
          se cae la pantalla muestra listas vacías sin explicar por qué, y
          "ningún ómnibus que llegues a tomar" suena a dato cuando en realidad
          es ignorancia. Se nombra la empresa: la 24 puede estar andando
          perfecto mientras la 17 es la que no reporta. */}
      {(sinGps || gpsParcial) && (
        <div className="mt-4">
          <InlineNotice
            tone="warn"
            message={
              sinGps
                ? 'Ninguna empresa está reportando la posición de sus ómnibus. Los horarios siguen sirviendo; las llegadas en vivo, no.'
                : `No estamos recibiendo el GPS de ${empresasCaidas
                    .map(operatorName)
                    .join(' y ')}. Sus ómnibus no aparecen en esta lista.`
            }
          />
        </div>
      )}

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

      {/* ---------- Tus paradas ----------
          Las que guardaste con la estrella, con sus llegadas en vivo. Van
          antes que "los que te pasan ahora" porque son una respuesta a una
          pregunta que la persona ya hizo; lo que hay cerca es una respuesta a
          una que capaz no hizo. */}
      {loTuyo.paradas.length > 0 && (
        <section className="mt-6" aria-labelledby="tus-paradas">
          <h2 id="tus-paradas" className="section-label">
            Tus paradas
          </h2>
          <div className="mt-3 flex flex-col gap-3">
            {loTuyo.paradas.map((parada) => (
              <ParadaGuardadaCard
                key={parada.id}
                parada={parada}
                distanceM={distanciaA(parada.lat, parada.lng)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ---------- Los que te pasan ahora ---------- */}
      <section className="mt-6" aria-labelledby="te-pasan">
        <div className="flex items-center justify-between">
          <h2 id="te-pasan" className="section-label">
            Los que te pasan ahora
          </h2>
          {nextBuses.length > 0 && (
            // El más fresco de los que se están listando: alcanza con que uno
            // reporte de ahora para que la lista tenga algo en vivo.
            <LiveIndicator
              fixAgeSeconds={Math.min(...nextBuses.map(({ arrival }) => arrival.fix_age_seconds))}
              showAge={false}
            />
          )}
        </div>

        <div className="mt-2.5">
          <SoloAccesiblesChip />
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
                  ? soloAccesibles
                    ? 'Ningún ómnibus con rampa que llegues a tomar'
                    : 'Ningún ómnibus que llegues a tomar'
                  : 'Todavía no podemos calcular llegadas'
            }
            description={
              stops.length === 0
                ? `Buscamos en ${formatDistance(RADIUS_OPTIONS[radiusIndex])} a la redonda.`
                : ready
                  ? soloAccesibles
                    ? 'De los que vienen, ninguno reporta tener rampa. Sacá el filtro para verlos igual.'
                    : 'O no viene ninguno, o el que viene pasa antes de que llegues caminando. En el mapa podés ver dónde anda cada línea.'
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

        <div className="mt-3 flex flex-col gap-3">
          {porParada.map(({ stop, buses }) => (
            <div key={stop.id} className="card py-3">
              {/* La esquina, una sola vez y arriba: es el encabezado de las
                  líneas que la usan, no una nota al pie de cada una. */}
              <Link
                to={`/transporte/paradas/${stop.id}`}
                className="flex items-center gap-1 border-b border-sand-200 pb-2.5 text-xs"
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-bold text-ink-900">{formatStopName(stop.name)}</span>
                  <span className="text-ink-400">
                    {' '}
                    · a {formatDistance(stop.distance_m)}, {walkingMinutes(stop.distance_m)} min
                    caminando
                  </span>
                </span>
                <ChevronRight className="h-3 w-3 flex-none text-ink-300" strokeWidth={2.5} />
              </Link>

              <div className="flex flex-col divide-y divide-sand-200">
                {buses.map(({ arrival, next }) => (
                  <div key={arrival.line_code} className="py-2.5 last:pb-0">
                    {/* El ómnibus: abre el mapa en vivo con ese coche. */}
                    <Link to={busLink(arrival)} className="block">
                      <ArrivalRow arrival={arrival} />
                    </Link>

                    {/* El siguiente de la misma línea. Es lo que uno pregunta
                        apenas ve que al primero no llega. */}
                    {next !== undefined && (
                      <p className="mt-1 pl-[2.6rem] text-xs text-ink-400">y otro en {next} min</p>
                    )}
                  </div>
                ))}
              </div>
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

      {/* ---------- Tus líneas ----------
          Las que guardaste. Cada una abre el mapa con sus recorridos, como
          las de abajo; si el catálogo la tiene se muestra con sus puntas, y si
          hoy no figura se dice, que es distinto de esconderla. */}
      {loTuyo.lineas.length > 0 && (
        <section className="mt-7" aria-labelledby="tus-lineas">
          <h2 id="tus-lineas" className="section-label">
            Tus líneas
          </h2>
          <div className="mt-3 flex flex-col gap-2">
            {loTuyo.lineas.map((guardada) => {
              const line = lines.find(
                (candidate) =>
                  candidate.operator === guardada.operator &&
                  candidate.line_code === guardada.code,
              );

              return (
                <Link
                  key={`${guardada.operator}-${guardada.code}`}
                  to={`/moverse/bondis?linea=${encodeURIComponent(guardada.code)}`}
                  className="card flex items-center gap-3 py-3"
                >
                  <LineTag code={guardada.label} color={lineColor(guardada.operator)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-data font-bold text-ink-900">
                      {line ? lineEndpoints(line) : operatorName(guardada.operator)}
                    </span>
                    <span className="block truncate text-xs text-ink-400">
                      {line
                        ? `${line.itineraries.length} ${
                            line.itineraries.length === 1 ? 'recorrido' : 'recorridos'
                          } · ${line.stops_count} paradas`
                        : lines.length > 0
                          ? 'Hoy no figura en el catálogo de recorridos'
                          : operatorName(guardada.operator)}
                    </span>
                    {/* Lo que decide si ir a la parada: si hay coches, o si
                        la empresa no está reportando. */}
                    <span className="mt-1 block">
                      <EstadoDeLineaChip
                        estado={estadoDeLinea(
                          porLinea,
                          empresasCaidas,
                          guardada.operator,
                          guardada.code,
                          vehiclesError !== null,
                        )}
                      />
                    </span>
                  </span>
                  <Estrella
                    activa
                    que={`la línea ${guardada.label}`}
                    onToggle={() => loTuyo.toggleLinea(guardada)}
                    className="-my-2 -mr-2"
                  />
                </Link>
              );
            })}
          </div>
        </section>
      )}

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
            {lines.slice(0, MAX_LINES_PREVIEW).map((line) => (
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

          {/* La lista completa vive en su propia pantalla, con buscador y con
              el horario publicado de cada línea. Desplegar treinta tarjetas
              acá dejaba el planificador -que está más abajo- fuera de alcance,
              y no daba forma de encontrar una línea por el lugar al que va. */}
          <Link to="/moverse/lineas" className="btn btn-secondary mt-3 w-full gap-1.5">
            <Clock className="h-4 w-4" strokeWidth={2} />
            Ver las {lines.length} líneas y sus horarios
          </Link>

          {/* Cuánto sale: la tabla oficial de la Intendencia. Está acá y no
              en cada opción del planificador porque qué tramo es un viaje
              sólo lo publica CODESA, y decir un precio sin saber el tramo
              sería inventarlo. */}
          <Link to="/moverse/tarifas" className="btn btn-secondary mt-2 w-full gap-1.5">
            <Ticket className="h-4 w-4" strokeWidth={2} />
            Cuánto sale el boleto
          </Link>
        </section>
      )}

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
