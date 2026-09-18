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
  Star,
  Bell,
  BellRing,
  Share2,
  Accessibility,
  Ticket,
  Home,
  Briefcase,
  History,
} from 'lucide-react';
import { useDondeEstoy } from '@hooks/useDondeEstoy';
import { useTransportHealth } from '@hooks/useTransportHealth';
import { routePlannerService, LastReturn, TripOption, TripLeg } from '@services/routePlannerService';
import { destinationsService, Destination } from '@services/destinationsService';
import { TripMap, TripLegend, rideColor, legLine } from '@components/transporte/TripMap';
import { DestinoEnMapa } from '@components/transporte/DestinoEnMapa';
import { ABordo } from '@components/transporte/ABordo';
import { BondiSprite } from '@components/transporte/BondiSprite';
import { LineTag } from '@components/ui/LineTag';
import { EmptyState, ErrorState, InlineNotice, SkeletonList } from '@components/ui/States';
import { GuardarDestinoSheet } from '@components/transporte/GuardarDestinoSheet';
import { ElegirLugarSheet } from '@components/transporte/ElegirLugarSheet';
import { enlaceParaIr, estaGuardado, idDePunto, Lugar, useLoTuyoStore } from '@store/loTuyoStore';
import { compartir, mensajeDeCompartir } from '@lib/compartir';
import { useRecordatorioStore } from '@store/recordatorioStore';
import { usePreferenciasStore } from '@store/preferenciasStore';
import { useHistorialStore } from '@store/historialStore';
import { SoloAccesiblesChip } from '@components/transporte/SoloAccesiblesChip';
import { prepararAvisos } from '@lib/avisos';
import { formatDistance } from '@lib/geo';
import { formatStopName } from '@lib/stopNames';
import { operatorName } from '@lib/operators';

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
 *
 * **Y puede ser "tengo que estar a las".** Es la otra mitad de la pregunta y
 * la contesta el backend buscando hacia atrás (`planArriveBy`). Acá cambia lo
 * que se muestra grande: quien pregunta a qué hora salir quiere ver la hora
 * de salida, no cuánto dura el viaje; y las opciones vienen por salida, la
 * más tarde primero. Ver `TripCard` con `paraLlegar`.
 *
 * **Y el origen se puede elegir.** Siempre fue donde está la persona, y la
 * flecha de intercambiar no hacía nada. "¿Cómo llega mi hijo del liceo a
 * casa?" o "¿cómo vuelvo de ahí?" no se podían preguntar. El origen es un
 * lugar como el destino -se busca, se marca en el mapa, o es casa o trabajo-
 * y la flecha da vuelta el viaje: con el origen en "tu ubicación", da vuelta
 * hacia donde estás, que es la pregunta "¿y cómo vuelvo?". Ver `origen` y
 * `MI_UBICACION`.
 *
 * **Y el destino puede venir ya resuelto.** `?destino=<texto>` se busca y se
 * elige el primer resultado, que sirve desde una ficha con nombre y no sirve
 * para "casa": eso no está en ningún catálogo. `?lat=&lng=&nombre=` va directo
 * con la coordenada; es lo que usan los chips de lo tuyo y lo que usa
 * compartir un viaje, que además lleva `&salir=` o `&llegar=` con la hora.
 * Se comparte el destino y la hora, no el origen: el origen es dónde está la
 * persona que comparte, y quien recibe el enlace quiere llegar desde donde
 * está **él**.
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
  /**
   * El id del catálogo si lo tiene. Es lo que permite reconocer el mismo
   * lugar al guardarlo; sin id se usa la coordenada, ver `idDePunto`.
   */
  id?: string;
  name: string;
  lat: number;
  lng: number;
}

/**
 * Un resultado del buscador, como destino.
 *
 * El nombre de una parada llega como lo escribe la empresa ("TNAL MALDONADO")
 * y así iba a parar al renglón del destino, a la lista de recientes y al chip
 * de Moverse. Se escribe como se lee, igual que en la lista de sugerencias.
 */
function destinoDeSugerencia(suggestion: Destination): Destino {
  return {
    id: suggestion.id,
    name: suggestion.source === 'parada' ? formatStopName(suggestion.name) : suggestion.name,
    lat: suggestion.lat,
    lng: suggestion.lng,
  };
}

/** El id con el que este destino se guarda y se reconoce entre lo tuyo. */
function idDeDestino(destino: Destino): string {
  return destino.id ?? idDePunto(destino.lat, destino.lng);
}

/**
 * "Tu ubicación" como destino, después de dar vuelta el viaje.
 *
 * No es un lugar: no se guarda con la estrella, no entra en recientes y no
 * se comparte, porque mañana la persona va a estar en otro lado. El id
 * fijo es lo que permite reconocerlo para esconder esas tres cosas.
 */
const MI_UBICACION = 'mi-ubicacion';

/**
 * Un destino que llega por la URL con su coordenada.
 *
 * Sólo si los dos números son números y caen en un lugar del mundo: una URL
 * se escribe a mano, se pega cortada, se manda por WhatsApp. Con la coordenada
 * rota se ignora y la pantalla arranca vacía, que es lo que haría sin ella.
 */
function destinoDeLaUrl(params: URLSearchParams): Destino | null {
  const lat = Number(params.get('lat'));
  const lng = Number(params.get('lng'));
  if (!params.has('lat') || !params.has('lng')) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  const nombre = params.get('nombre')?.trim();
  // El id viaja para que la estrella reconozca un lugar guardado desde el
  // buscador: sin él, el mismo hospital llegaría como un punto sin nombre en
  // el catálogo y se vería como no guardado.
  const id = params.get('id')?.trim();
  return { id: id || undefined, name: nombre || 'Punto en el mapa', lat, lng };
}

/** El origen que llega por la URL (`desde_lat`, `desde_lng`, `desde`), si es válido. */
function origenDeLaUrl(params: URLSearchParams): Destino | null {
  const lat = Number(params.get('desde_lat'));
  const lng = Number(params.get('desde_lng'));
  if (!params.has('desde_lat') || !params.has('desde_lng')) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const nombre = params.get('desde')?.trim();
  return { name: nombre || 'Punto en el mapa', lat, lng };
}

/**
 * Una hora que llega por la URL, si es una hora y todavía no pasó.
 *
 * Un enlace compartido se abre cuando se abre: el viaje "para llegar a las
 * 18:30" mandado el lunes, abierto el martes, ya no es ese viaje. Una hora
 * pasada se ignora y se planifica para ahora, que es lo que la pantalla
 * hace sin hora.
 */
function horaDeLaUrl(params: URLSearchParams, clave: string): Date | null {
  const crudo = params.get(clave);
  if (!crudo) return null;
  const hora = new Date(crudo);
  if (!Number.isFinite(hora.getTime()) || hora.getTime() <= Date.now()) return null;
  return hora;
}

export default function PlanificadorPage() {
  const [searchParams] = useSearchParams();
  // El mismo punto que Moverse y la portada: si la persona dijo dónde está
  // -porque el permiso está negado, o porque quiere mirar desde su casa-, el
  // viaje sale de ahí. Ver `useDondeEstoy`.
  const { coords, nombre: nombreDeDondeEstoy } = useDondeEstoy();
  const loTuyo = useLoTuyoStore();
  /**
   * Si alguna empresa no está reportando. Cambia lo que valen las esperas:
   * para sus líneas salen del horario y no de un coche en la calle, y sin
   * decirlo "según el horario" en una opción y "en vivo" en otra parece un
   * capricho y no una empresa caída.
   */
  const { empresasCaidas, horariosCargados, temporada } = useTransportHealth();
  /** Sólo ómnibus con rampa. Es la preferencia de toda la app, ver el store. */
  const soloAccesibles = usePreferenciasStore((estado) => estado.soloAccesibles);
  const agregarReciente = loTuyo.agregarReciente;
  const recordatorio = useRecordatorioStore((estado) => estado.pendiente);
  const anotarViaje = useHistorialStore((estado) => estado.anotar);
  const ponerRecordatorio = useRecordatorioStore((estado) => estado.poner);
  const cancelarRecordatorio = useRecordatorioStore((estado) => estado.cancelar);

  const [query, setQuery] = useState(
    () => destinoDeLaUrl(searchParams)?.name ?? searchParams.get('destino') ?? '',
  );
  const [suggestions, setSuggestions] = useState<Destination[]>([]);
  const [destination, setDestination] = useState<Destino | null>(() =>
    destinoDeLaUrl(searchParams),
  );
  /** Desde dónde. `null` es donde está la persona, que es casi siempre. */
  const [origen, setOrigen] = useState<Destino | null>(() => origenDeLaUrl(searchParams));
  /** El sheet de "desde dónde", abierto. */
  const [eligiendoOrigen, setEligiendoOrigen] = useState(false);
  /** El sheet de "guardar este destino", abierto. */
  const [saving, setSaving] = useState(false);
  /** El selector de punto en el mapa, abierto. */
  const [pickingOnMap, setPickingOnMap] = useState(false);
  /**
   * Cuándo se sale y a qué hora hay que estar. Con las dos en `null` es
   * ahora, que es el 95% de los viajes; nunca están puestas las dos a la vez.
   */
  const [departAt, setDepartAt] = useState<Date | null>(() => horaDeLaUrl(searchParams, 'salir'));
  const [arriveBy, setArriveBy] = useState<Date | null>(() =>
    // Si vinieran las dos, gana llegar: es la más específica de las dos
    // preguntas y la que más cuesta rehacer a mano.
    horaDeLaUrl(searchParams, 'llegar'),
  );
  /** Lo que pasó al compartir, para decirlo adentro de la pantalla. */
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  /**
   * Desde qué momento cuenta los minutos la respuesta que está en pantalla.
   *
   * Sale del backend y no de `departAt`: son los minutos de **esta**
   * respuesta, y mientras se está buscando la nueva la pantalla sigue
   * mostrando la anterior. Tomándolo del selector, las horas de la lista
   * saltarían a la hora nueva antes de que llegaran los viajes nuevos.
   */
  const [plannedFor, setPlannedFor] = useState<number | null>(null);
  /**
   * Para qué hora se pidió llegar en la respuesta que está en pantalla. Sale
   * del backend por lo mismo que `plannedFor`.
   */
  const [arrivePlanned, setArrivePlanned] = useState<number | null>(null);
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
            const elegido = destinoDeSugerencia(results[0]);
            setDestination(elegido);
            setQuery(elegido.name);
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

  /**
   * El origen que se manda: el elegido, o donde está la persona. Sin permiso
   * de ubicación es el centro de Maldonado, y se dice así.
   */
  const origenEfectivo: Destino = origen ?? {
    name: nombreDeDondeEstoy,
    lat: coords.lat,
    lng: coords.lng,
  };

  /** El destino es "tu ubicación" después de dar vuelta el viaje. */
  const destinoEsMiUbicacion = destination?.id === MI_UBICACION;

  /**
   * Lo tuyo, para elegir sin escribir.
   *
   * Con el destino vacío la pantalla decía "escribí a dónde querés ir" y
   * nada más, y el viaje de todos los días es a casa, al trabajo o a uno de
   * los tres lugares de siempre: esos van primero, y después a dónde se fue
   * últimamente. Sin nada guardado sigue el texto de antes.
   */
  const sugerenciasTuyas: Array<{ icon: typeof Home; etiqueta: string; lugar: Lugar }> = [
    ...(loTuyo.casa ? [{ icon: Home, etiqueta: 'Casa', lugar: loTuyo.casa }] : []),
    ...(loTuyo.trabajo ? [{ icon: Briefcase, etiqueta: 'Trabajo', lugar: loTuyo.trabajo }] : []),
    ...loTuyo.lugares.map((lugar) => ({ icon: Star, etiqueta: lugar.name, lugar })),
    ...loTuyo.recientes
      .filter((lugar) => !estaGuardado(loTuyo, lugar.id))
      .map((lugar) => ({ icon: History, etiqueta: lugar.name, lugar })),
  ];

  const elegirLugar = (lugar: Lugar) => {
    setDestination({ id: lugar.id, name: lugar.name, lat: lugar.lat, lng: lugar.lng });
    setQuery(lugar.name);
    setSuggestions([]);
  };

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
        { lat: origenEfectivo.lat, lng: origenEfectivo.lng, label: origenEfectivo.name },
        { lat: destination.lat, lng: destination.lng, label: destination.name },
        departAt ?? undefined,
        arriveBy ?? undefined,
        soloAccesibles,
      )
      .then((result) => {
        if (cancelled) return;
        setOptions(result.options);
        setReady(result.ready);
        setReturnTrip(result.return_trip ?? null);
        setPlannedFor(result.planned_for ? new Date(result.planned_for).getTime() : null);
        setArrivePlanned(result.arrive_by ? new Date(result.arrive_by).getTime() : null);
        // A dónde fuiste últimamente. Se anota cuando el viaje se pudo
        // calcular y no al elegir el destino: un lugar al que no se llega en
        // ómnibus no es un viaje reciente, es una búsqueda fallida.
        if (result.options.length > 0 && destination.id !== MI_UBICACION) {
          agregarReciente({ ...destination, id: idDeDestino(destination) });
        }
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
    // `agregarReciente` no va en las dependencias: zustand no lo recrea, y
    // ponerlo sólo sugeriría que un cambio en él vuelve a planificar.
    // `origenEfectivo` se recompone en cada render; lo que cambia de verdad
    // es el origen elegido o las coordenadas, que son las dependencias.
    // El nombre del punto entra en las dependencias porque también cambia el
    // origen: pasar de "tu ubicación" a "Terminal San Carlos" es otro viaje.
  }, [
    destination,
    origen,
    coords.lat,
    coords.lng,
    nombreDeDondeEstoy,
    departAt,
    arriveBy,
    soloAccesibles,
  ]);

  const current = options[selected];

  /** Si el destino elegido ya está entre lo tuyo, para pintar la estrella. */
  const destinoGuardado = destination ? estaGuardado(loTuyo, idDeDestino(destination)) : false;

  /**
   * Compartir el viaje: un enlace que abre esta pantalla con el mismo destino
   * y la misma hora, y un renglón que se entiende sin abrirlo.
   *
   * El enlace es el de lo tuyo más la hora, así que quien lo recibe planifica
   * desde donde está él. Si hay una opción elegida se nombra la línea en el
   * texto: "en la 24" es lo que uno le diría a alguien por WhatsApp.
   */
  const compartirViaje = async () => {
    if (!destination) return;

    const lugar = { ...destination, id: idDeDestino(destination) };
    const hora = arriveBy ?? departAt;
    // El origen viaja sólo si se eligió a mano: el de la ubicación es dónde
    // está la persona, y eso no se manda.
    const desde = origen
      ? `&desde_lat=${origen.lat.toFixed(5)}&desde_lng=${origen.lng.toFixed(5)}` +
        `&desde=${encodeURIComponent(origen.name)}`
      : '';
    const url =
      `${window.location.origin}${enlaceParaIr(lugar)}${desde}` +
      (arriveBy
        ? `&llegar=${encodeURIComponent(arriveBy.toISOString())}`
        : departAt
          ? `&salir=${encodeURIComponent(departAt.toISOString())}`
          : '');

    const cuando = hora
      ? arriveBy
        ? ` para estar ${etiquetaDeSalida(hora.getTime())}`
        : ` saliendo ${etiquetaDeSalida(hora.getTime())}`
      : '';
    const linea = current?.legs.find((leg) => leg.type === 'bus');
    const enQue = linea ? ` en la línea ${legLine(linea)}` : '';

    const resultado = await compartir({
      titulo: `Cómo llegar a ${destination.name}`,
      texto: `Cómo llegar${origen ? ` desde ${origen.name}` : ''} a ${destination.name} en ómnibus${enQue}${cuando}:`,
      url,
    });

    const mensaje = mensajeDeCompartir(resultado);
    setShareNotice(mensaje);
    if (mensaje) setTimeout(() => setShareNotice(null), 3000);
  };

  /**
   * El viaje que se está mostrando es de más tarde.
   *
   * Sale de la respuesta y no del selector por lo mismo que `plannedFor`:
   * mientras se busca el viaje nuevo, en pantalla sigue el anterior.
   *
   * "Más tarde" es que los minutos se cuenten desde un momento que no es
   * ahora. Con "llegar a las" el backend puede contestar desde ahora mismo
   * -cuando la hora está cerca prueba el presente con el GPS- y entonces el
   * viaje **no** es de más tarde aunque haya hora pedida: hay un coche en la
   * calle y "ya me subí" tiene sentido. Dos minutos es la tolerancia con la
   * que el backend considera que una hora es ahora.
   */
  const futuro = plannedFor !== null && Math.abs(plannedFor - Date.now()) > 2 * 60_000;

  /** La respuesta en pantalla contesta "a qué hora salir para llegar a las". */
  const paraLlegar = arrivePlanned !== null;

  /**
   * "Avisame cuando salir" para una opción.
   *
   * El toque es lo que habilita el sonido y lo que pide el permiso de
   * notificaciones, por lo mismo que en "ya me subí": pedido con contexto,
   * después de tocar una campana, se explica solo. La hora de salir se
   * calcula sobre `desde`, que es el reloj de la respuesta y no el del
   * teléfono: para un viaje planificado a las 18:30 los minutos cuentan
   * desde las 18:30.
   */
  const recordar = (option: TripOption) => {
    const desde = plannedFor ?? Date.now();
    const espera = option.legs.find((leg) => leg.type === 'wait');
    const omnibus = option.legs.find((leg) => leg.type === 'bus');

    prepararAvisos();
    ponerRecordatorio({
      salirA: desde + option.leave_in_minutes * 60_000,
      pasaA: espera?.departs_in_minutes != null ? desde + espera.departs_in_minutes * 60_000 : null,
      linea: omnibus ? legLine(omnibus) : '',
      parada: omnibus ? formatStopName(omnibus.from) : '',
      destino: destination?.name ?? '',
      enlace: `${window.location.pathname}${window.location.search}`,
    });
  };

  /** Si el recordatorio pendiente es de esta opción: misma salida, misma línea. */
  const recordada = (option: TripOption) => {
    if (!recordatorio) return false;
    const desde = plannedFor ?? Date.now();
    const omnibus = option.legs.find((leg) => leg.type === 'bus');
    return (
      Math.abs(recordatorio.salirA - (desde + option.leave_in_minutes * 60_000)) < 60_000 &&
      recordatorio.linea === (omnibus ? legLine(omnibus) : '')
    );
  };

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
          {/* Desde dónde. Es un botón: se cambia tocándolo, como el destino. */}
          <button
            type="button"
            onClick={() => setEligiendoOrigen(true)}
            className={`min-w-0 flex-1 truncate text-left text-sm font-semibold ${
              origen ? 'text-white' : 'text-ink-100'
            }`}
          >
            {origenEfectivo.name}
          </button>
          {/* Dar vuelta el viaje. Con el origen en "tu ubicación" el destino
              pasa a ser donde estás: es la pregunta "¿y cómo vuelvo?". */}
          <button
            type="button"
            onClick={() => {
              if (!destination) return;
              const nuevoOrigen: Destino = destinoEsMiUbicacion ? { ...origenEfectivo } : destination;
              const nuevoDestino: Destino = origen ?? {
                id: MI_UBICACION,
                name: nombreDeDondeEstoy,
                lat: coords.lat,
                lng: coords.lng,
              };
              setOrigen(destinoEsMiUbicacion ? null : nuevoOrigen);
              setDestination(nuevoDestino);
              setQuery(nuevoDestino.name);
              setSuggestions([]);
              setSearched(false);
              setOptions([]);
            }}
            disabled={!destination}
            aria-label="Dar vuelta el viaje"
            className="-my-2 flex h-10 w-10 flex-none items-center justify-center rounded-full text-ink-300 active:bg-white/10 disabled:opacity-40"
          >
            <ArrowUpDown className="h-4 w-4" strokeWidth={2} />
          </button>
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
          {/* Compartir y guardar el destino. Sólo con un destino elegido;
              guardar o mandar lo que se está escribiendo no significa nada. */}
          {destination && !destinoEsMiUbicacion && (
            <button
              type="button"
              onClick={compartirViaje}
              aria-label="Compartir este viaje"
              className="-my-2 flex h-10 w-10 flex-none items-center justify-center rounded-full active:bg-white/10"
            >
              <Share2 className="h-[1.15rem] w-[1.15rem] text-ink-300" strokeWidth={2} />
            </button>
          )}
          {destination && !destinoEsMiUbicacion && (
            <button
              type="button"
              onClick={() => setSaving(true)}
              aria-pressed={destinoGuardado}
              aria-label={destinoGuardado ? 'Destino guardado' : 'Guardar este destino'}
              className="-my-2 -mr-2 flex h-10 w-10 flex-none items-center justify-center rounded-full active:bg-white/10"
            >
              <Star
                className={`h-5 w-5 ${
                  destinoGuardado ? 'fill-coral-500 text-coral-500' : 'text-ink-300'
                }`}
                strokeWidth={2}
              />
            </button>
          )}
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
          onClick={() => {
            setDepartAt(null);
            setArriveBy(null);
          }}
          aria-pressed={departAt === null && arriveBy === null}
          className={`chip ${departAt === null && arriveBy === null ? 'chip-active' : ''}`}
        >
          <Clock className="h-3.5 w-3.5" strokeWidth={2.5} />
          Ahora
        </button>
        <button
          onClick={() => {
            // Si venía de "llegar a las" se conserva la hora: cambiar de
            // pregunta no tiene por qué hacer elegir la hora de nuevo.
            setDepartAt((actual) => actual ?? arriveBy ?? proximaHoraRedonda());
            setArriveBy(null);
          }}
          aria-pressed={departAt !== null}
          className={`chip ${departAt !== null ? 'chip-active' : ''}`}
        >
          Salir a las
        </button>
        <button
          onClick={() => {
            setArriveBy((actual) => actual ?? departAt ?? proximaHoraRedonda());
            setDepartAt(null);
          }}
          aria-pressed={arriveBy !== null}
          className={`chip ${arriveBy !== null ? 'chip-active' : ''}`}
        >
          Llegar a las
        </button>

        {/* Sólo con rampa, al lado de cuándo: son las dos cosas que cambian
            qué ómnibus se ofrece. */}
        <SoloAccesiblesChip />

        {(departAt !== null || arriveBy !== null) && (
          <input
            type="datetime-local"
            aria-label={arriveBy !== null ? 'Hora de llegada' : 'Hora de salida'}
            value={paraElInput(arriveBy ?? departAt!)}
            min={paraElInput(new Date())}
            onChange={(event) => {
              // Vacío es lo que deja el input mientras se está editando: no se
              // vuelve a "ahora" por eso, se conserva la hora que había.
              const elegida = new Date(event.target.value);
              if (!Number.isFinite(elegida.getTime())) return;
              if (arriveBy !== null) setArriveBy(elegida);
              else setDepartAt(elegida);
            }}
            className="tabular rounded-chip border border-sand-300 bg-white px-2 py-1.5 text-xs font-bold text-ink-900 focus:border-ink-900 focus:outline-none"
          />
        )}
      </div>

      {shareNotice && (
        <div className="px-4 pt-3">
          <InlineNotice tone="info" message={shareNotice} />
        </div>
      )}

      {/* ---------- Sin horario de esta temporada no hay futuro ----------
          Un viaje que todavía no empezó sólo se puede contestar con el
          horario publicado. Si no está cargado el de la temporada de hoy, se
          dice **antes** de elegir la hora, y no con un vacío después de
          buscar: el vacío se lee como "no hay ómnibus". */}
      {horariosCargados === false && (departAt !== null || arriveBy !== null) && (
        <div className="px-4 pt-3">
          <InlineNotice
            tone="warn"
            message={`Todavía no tenemos cargado el horario de la temporada de ${
              temporada ?? 'esta temporada'
            }, y es lo único con lo que se puede planificar a una hora futura. Con "ahora" sí podemos: miramos los ómnibus que están en la calle.`}
          />
        </div>
      )}

      {/* ---------- Si el GPS de alguna empresa no está entrando ----------
          Sólo con un viaje de ahora: para uno de más tarde el GPS no se
          usa y el aviso confundiría. */}
      {destination && !futuro && !paraLlegar && empresasCaidas.length > 0 && (
        <div className="px-4 pt-3">
          <InlineNotice
            tone="warn"
            message={`No estamos recibiendo el GPS de ${empresasCaidas
              .map(operatorName)
              .join(' y ')}. Las esperas de sus líneas salen del horario publicado, no de un coche en la calle.`}
          />
        </div>
      )}

      {/* ---------- Desde dónde ---------- */}
      {eligiendoOrigen && (
        <ElegirLugarSheet
          titulo="Desde dónde"
          actual={origen ? { ...origen, id: idDeDestino(origen) } : null}
          conAtajos
          alternativa={{
            label: `Desde ${nombreDeDondeEstoy.toLowerCase()}`,
            onPick: () => {
              setOrigen(null);
              setEligiendoOrigen(false);
            },
          }}
          onPick={(lugar) => {
            setOrigen(lugar);
            setEligiendoOrigen(false);
          }}
          onClose={() => setEligiendoOrigen(false)}
        />
      )}

      {/* ---------- Guardar el destino ---------- */}
      {saving && destination && (
        <GuardarDestinoSheet
          lugar={{ ...destination, id: idDeDestino(destination) }}
          onClose={() => setSaving(false)}
        />
      )}

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
                  const elegido = destinoDeSugerencia(suggestion);
                  setDestination(elegido);
                  setQuery(elegido.name);
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
                // El viaje pasó de plan a hecho: es el único momento en que
                // la app lo sabe, y lo que después permite repetirlo.
                if (destination) {
                  anotarViaje({
                    linea: legLine(boardable),
                    operator: boardable.operator ?? '',
                    desde: formatStopName(boardable.from),
                    hasta: formatStopName(boardable.to),
                    destino: { ...destination, id: idDeDestino(destination) },
                    minutos: current.total_minutes - current.leave_in_minutes,
                  });
                }
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
          <>
            {sugerenciasTuyas.length > 0 && (
              <ul className="-mt-1 mb-4 divide-y divide-sand-200 rounded-card border border-sand-300 bg-white">
                {sugerenciasTuyas.map(({ icon: Icon, etiqueta, lugar }) => (
                  <li key={lugar.id}>
                    <button
                      onClick={() => elegirLugar(lugar)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    >
                      <Icon
                        className={`h-4 w-4 flex-none ${
                          Icon === History ? 'text-ink-300' : 'text-coral-500'
                        }`}
                        strokeWidth={2}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-data font-bold text-ink-900">
                          {etiqueta}
                        </span>
                        {etiqueta !== lugar.name && (
                          <span className="block truncate text-xs text-ink-400">{lugar.name}</span>
                        )}
                      </span>
                      <ChevronRight className="h-4 w-4 flex-none text-ink-300" strokeWidth={2.5} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="px-1 text-sm text-ink-400">
              Escribí a dónde querés ir: una parada, una playa, el shopping, el hospital o el
              liceo. Si no tiene nombre —una casa, una obra, un punto de la ruta— marcalo en el
              mapa.
            </p>
          </>
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
                : paraLlegar
                  ? 'No llegás a esa hora en ómnibus'
                  : futuro
                    ? 'No tenemos horario para esa hora'
                    : 'No encontramos un viaje en ómnibus'
            }
            description={
              !ready
                ? 'Estamos cargando los recorridos de las empresas. Mientras tanto podés ver las paradas y sus llegadas.'
                : paraLlegar
                  ? 'Con el horario publicado por las empresas no encontramos una salida que te deje ahí antes de esa hora. Probá con una hora más tarde, o con "ahora" para ver los ómnibus que están en la calle.'
                  : futuro
                    ? 'Para un viaje más tarde sólo podemos usar el horario publicado por las empresas, y no tenemos ninguna salida cargada que te sirva a esa hora. Probá con "ahora", que además mira los ómnibus que están en la calle.'
                    : 'No hay una línea que conecte estos dos puntos con una caminata razonable. Probá con una parada cercana.'
            }
          />
        )}

        {!searching && options.length > 0 && (
          <>
            {/* Con el filtro puesto se dice qué se puede prometer y qué no:
                de un coche en la calle se sabe si tiene rampa; de un viaje
                por horario no se sabe qué coche va a venir. */}
            {soloAccesibles && (
              <div className="mb-3 flex items-start gap-2 rounded-card bg-sea-50 px-3 py-2.5 text-xs text-sea-600">
                <Accessibility className="mt-0.5 h-3.5 w-3.5 flex-none" strokeWidth={2.25} />
                <span>
                  Sólo ómnibus con rampa. De los viajes que salen del horario publicado no
                  sabemos qué coche va a venir: van marcados como "rampa sin confirmar".
                </span>
              </div>
            )}

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
                      {paraLlegar
                        ? 'Si llegás a esa hora, después no vas a poder volver en ómnibus.'
                        : futuro
                          ? 'Si salís a esa hora, después no vas a poder volver en ómnibus.'
                          : 'Hoy ya no podés volver en ómnibus.'}
                    </span>{' '}
                    La última vuelta {futuro || paraLlegar ? 'sale' : 'salió'} {returnTrip.last_at}
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
              {paraLlegar && arrivePlanned !== null
                ? ` · para estar ${etiquetaDeSalida(arrivePlanned)}`
                : futuro && plannedFor !== null
                  ? ` · ${etiquetaDeSalida(plannedFor)}`
                  : ''}
            </p>
            <div className="flex flex-col gap-3">
              {options.map((option, index) => (
                <TripCard
                  key={option.id}
                  option={option}
                  desde={plannedFor}
                  futuro={futuro}
                  paraLlegar={paraLlegar}
                  selected={index === selected}
                  onSelect={() => {
                    setSelected(index);
                    // Otra opción es otro coche: seguir mostrando el anterior
                    // sería seguirle el rastro a un ómnibus que no se tomó.
                    setBoarded(false);
                  }}
                  recordada={recordada(option)}
                  onRecordar={() => (recordada(option) ? cancelarRecordatorio() : recordar(option))}
                  soloAccesibles={soloAccesibles}
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
  paraLlegar,
  recordada,
  onRecordar,
  soloAccesibles,
}: {
  option: TripOption;
  selected: boolean;
  onSelect: () => void;
  /** Desde qué momento contó el backend los minutos de esta opción. */
  desde: number | null;
  /** El viaje es de más tarde: nada se dice en relativo. Ver `clockIn`. */
  futuro: boolean;
  /**
   * La pregunta fue "a qué hora salgo para llegar a las": lo grande es la
   * hora de salida y no cuánto dura, y la duración es de puerta a puerta.
   */
  paraLlegar: boolean;
  /** Hay un recordatorio puesto para salir a tomar esta opción. */
  recordada: boolean;
  /** Poner o sacar el recordatorio de salida de esta opción. */
  onRecordar: () => void;
  /** Se pidieron sólo coches con rampa: se dice de cuáles no se sabe. */
  soloAccesibles: boolean;
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
            {paraLlegar ? (
              // Lo que se preguntó es a qué hora salir: eso va grande. Los
              // minutos son de puerta a puerta y no desde el reloj de la
              // respuesta, que acá es un momento cualquiera anterior a todas
              // las salidas y no significa nada para la persona.
              <>
                <p className="tabular text-xl font-extrabold leading-none text-ink-900">
                  <span className="text-xs font-semibold">salís </span>
                  {clockIn(option.leave_in_minutes, desde)}
                </p>
                <p className="tabular mt-0.5 text-[0.6875rem] font-semibold text-ink-400">
                  llegás {clockIn(option.total_minutes, desde)} ·{' '}
                  {option.total_minutes - option.leave_in_minutes} min
                </p>
              </>
            ) : (
              <>
                <p className="tabular text-xl font-extrabold leading-none text-ink-900">
                  {option.total_minutes}
                  <span className="text-xs font-semibold"> min</span>
                </p>
                <p className="tabular mt-0.5 text-[0.6875rem] font-semibold text-ink-400">
                  llegás {clockIn(option.total_minutes, desde)}
                </p>
              </>
            )}
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
                {paraLlegar
                  ? // La hora de salida ya está grande a la derecha: acá va
                    // cuándo pasa el ómnibus, que es lo otro que hay que saber.
                    firstWait.departs_in_minutes != null
                    ? `Pasa ${clockIn(firstWait.departs_in_minutes, desde)}`
                    : `Salí ${clockIn(option.leave_in_minutes, desde)}`
                  : futuro
                    ? `Salí ${clockIn(option.leave_in_minutes, desde)}`
                    : option.leave_in_minutes <= 0
                      ? 'Salí ahora'
                      : `Salí en ${option.leave_in_minutes} min`}
                {!paraLlegar && firstWait.departs_in_minutes != null
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

        {/* Qué se sabe de la rampa. Con un coche concreto en la calle se
            sabe; con un viaje por horario, no, y con el filtro puesto eso
            hay que decirlo en la tarjeta y no sólo en el aviso de arriba. */}
        {busLegs.length > 0 && (soloAccesibles || busLegs.every((leg) => leg.accessible === true)) && (
          <p
            className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${
              busLegs.every((leg) => leg.accessible === true) ? 'text-sea-600' : 'text-ink-400'
            }`}
          >
            <Accessibility className="h-3.5 w-3.5" strokeWidth={2.25} />
            {busLegs.every((leg) => leg.accessible === true)
              ? 'Con rampa'
              : 'Rampa sin confirmar: el coche sale del horario'}
          </p>
        )}
      </button>

      {/*
        Avisame cuando salir.

        Sólo en la opción elegida, y sólo si hay algo que esperar: para "salí
        ahora" el aviso sería el toque mismo. Un recordatorio ya puesto se
        muestra y se saca desde acá; el banner de abajo lo repite en todas las
        pantallas.
      */}
      {selected && (option.leave_in_minutes >= 2 || recordada) && (
        <button
          onClick={onRecordar}
          aria-pressed={recordada}
          className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold ${
            recordada ? 'bg-sea-50 text-sea-600' : 'bg-sand-100 text-ink-900 active:bg-sand-200'
          }`}
        >
          {recordada ? (
            <>
              <BellRing className="h-4 w-4" strokeWidth={2.25} />
              Te avisamos {clockIn(option.leave_in_minutes, desde)} · Cancelar
            </>
          ) : (
            <>
              <Bell className="h-4 w-4" strokeWidth={2.25} />
              Avisame cuando salir
            </>
          )}
        </button>
      )}

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
        {/* Cuánto sale no se dice acá: depende del tramo, y qué tramo es un
            viaje sólo lo publica CODESA. Se manda a la tabla oficial en vez
            de poner un número que no se puede citar. */}
        <Link
          to="/moverse/tarifas"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-coral-500"
        >
          <Ticket className="h-3.5 w-3.5" strokeWidth={2.5} />
          Cuánto sale el boleto
        </Link>
      </details>
    </article>
  );
}
