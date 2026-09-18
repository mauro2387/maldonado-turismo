import { create } from 'zustand';

/**
 * Lo tuyo: tu casa, tu trabajo, tus lugares, tus paradas, tus líneas y a
 * dónde fuiste últimamente.
 *
 * La app no se acordaba de nada. Cada viaje a casa era escribir "Terminal
 * Maldonado" de nuevo, elegirlo de la lista y esperar; la parada de la esquina
 * había que buscarla entre mil cada mañana; y el corazón de la ficha de un
 * lugar era un `useState(false)` que se olvidaba al cambiar de pantalla. Para
 * quien usa el ómnibus todos los días —que es la mayoría de quien abre esta
 * app— los viajes son siempre los mismos dos o tres, y una app de transporte
 * que no lo sabe hace que el uso más frecuente sea el más caro.
 *
 * ## Dónde vive
 *
 * En el teléfono, en `localStorage`. La app pública no tiene cuentas de
 * usuario —el único login es el del backoffice— y no las va a tener por esto:
 * pedirle un registro a alguien parado en la vereda para acordarse de su
 * parada es perderlo. Lo que se pierde a cambio es la sincronización entre
 * dispositivos y se le dice: "se guarda en este teléfono".
 *
 * `localStorage` puede no estar (Safari en modo privado tiraba `QuotaExceeded`
 * en cada `setItem`; algunas WebViews lo bloquean entero), así que cada lectura
 * y cada escritura van en su `try/catch` y la app funciona igual sin guardar:
 * un favorito que no se pudo persistir dura la sesión, que es mejor que una
 * pantalla rota. Y lo que se lee del disco se valida campo por campo antes de
 * usarlo: es un JSON que pudo escribir una versión anterior de la app, o una
 * extensión, o nadie.
 *
 * ## Qué se guarda de cada cosa
 *
 * Lo mínimo para volver a ir: nombre y coordenada. No se guarda la ficha
 * entera de la parada ni la línea con sus recorridos, porque eso cambia —una
 * parada se reubica, una línea cambia de itinerario— y lo guardado quedaría
 * viejo sin que nadie lo note. Con el id se vuelve a pedir lo fresco.
 */

/** Un lugar al que se va: un destino del buscador, un punto del mapa, una ficha. */
export interface Lugar {
  /**
   * Identifica el lugar para no guardarlo dos veces. Es el id del catálogo
   * cuando lo hay (`Destination.id`, `lugar:<id de ficha>`) y sale de la
   * coordenada cuando no: ver `idDePunto`.
   */
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface ParadaGuardada {
  id: number;
  name: string;
  lat: number;
  lng: number;
}

export interface LineaGuardada {
  /** El código del feed, que es lo que entienden el mapa y el filtro. */
  code: string;
  /** El número del cartel: "17/19" y no "179". */
  label: string;
  operator: string;
}

export interface LoTuyo {
  casa: Lugar | null;
  trabajo: Lugar | null;
  lugares: Lugar[];
  paradas: ParadaGuardada[];
  lineas: LineaGuardada[];
  /** A dónde se planificó últimamente, el más nuevo primero. */
  recientes: Lugar[];
}

interface LoTuyoState extends LoTuyo {
  setCasa: (lugar: Lugar | null) => void;
  setTrabajo: (lugar: Lugar | null) => void;
  toggleLugar: (lugar: Lugar) => void;
  toggleParada: (parada: ParadaGuardada) => void;
  toggleLinea: (linea: LineaGuardada) => void;
  agregarReciente: (lugar: Lugar) => void;
  quitarReciente: (id: string) => void;
}

const STORAGE_KEY = 'lo-tuyo';

/**
 * Cuántos destinos recientes se recuerdan.
 *
 * Ocho porque es lo que entra en dos filas de chips en un teléfono, y porque
 * más allá de eso ya no son "recientes": son un historial, que es otra
 * pantalla. Los viajes de todos los días se guardan con la estrella y no
 * dependen de esta lista.
 */
const MAX_RECIENTES = 8;

/**
 * El id de un punto sin nombre en el catálogo.
 *
 * Cinco decimales son un metro, de sobra para que el mismo punto marcado dos
 * veces en el mapa cuente como el mismo y dos casas vecinas no.
 */
export function idDePunto(lat: number, lng: number): string {
  return `punto:${lat.toFixed(5)},${lng.toFixed(5)}`;
}

const VACIO: LoTuyo = {
  casa: null,
  trabajo: null,
  lugares: [],
  paradas: [],
  lineas: [],
  recientes: [],
};

// --- Validación de lo que se lee del disco ---

function esNumero(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor);
}

function esLugar(valor: unknown): valor is Lugar {
  if (!valor || typeof valor !== 'object') return false;
  const v = valor as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    esNumero(v.lat) &&
    esNumero(v.lng)
  );
}

function esParada(valor: unknown): valor is ParadaGuardada {
  if (!valor || typeof valor !== 'object') return false;
  const v = valor as Record<string, unknown>;
  return esNumero(v.id) && typeof v.name === 'string' && esNumero(v.lat) && esNumero(v.lng);
}

function esLinea(valor: unknown): valor is LineaGuardada {
  if (!valor || typeof valor !== 'object') return false;
  const v = valor as Record<string, unknown>;
  return typeof v.code === 'string' && typeof v.label === 'string' && typeof v.operator === 'string';
}

function lista<T>(valor: unknown, valida: (item: unknown) => item is T): T[] {
  return Array.isArray(valor) ? valor.filter(valida) : [];
}

function cargar(): LoTuyo {
  try {
    const crudo = localStorage.getItem(STORAGE_KEY);
    if (!crudo) return VACIO;

    const datos = JSON.parse(crudo) as Record<string, unknown>;
    if (!datos || typeof datos !== 'object') return VACIO;

    return {
      casa: esLugar(datos.casa) ? datos.casa : null,
      trabajo: esLugar(datos.trabajo) ? datos.trabajo : null,
      lugares: lista(datos.lugares, esLugar),
      paradas: lista(datos.paradas, esParada),
      lineas: lista(datos.lineas, esLinea),
      recientes: lista(datos.recientes, esLugar).slice(0, MAX_RECIENTES),
    };
  } catch {
    return VACIO;
  }
}

function guardar(estado: LoTuyo): void {
  try {
    const { casa, trabajo, lugares, paradas, lineas, recientes } = estado;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: 1, casa, trabajo, lugares, paradas, lineas, recientes }),
    );
  } catch {
    // Sin disco los favoritos duran lo que dure la pestaña. No es un error
    // que mostrarle a nadie.
  }
}

/**
 * Sólo los cuatro campos, venga de donde venga.
 *
 * Lo que llega es muchas veces un `Destination` entero -con `kind`,
 * `locality`, `distanceM`- y guardarlo tal cual mete en el disco una distancia
 * medida desde donde la persona estaba ese día, que mañana es mentira.
 */
function soloLugar({ id, name, lat, lng }: Lugar): Lugar {
  return { id, name, lat, lng };
}

/** Saca el elemento si está, lo agrega al final si no. */
function alternar<T>(items: T[], item: T, mismo: (a: T, b: T) => boolean): T[] {
  return items.some((otro) => mismo(otro, item))
    ? items.filter((otro) => !mismo(otro, item))
    : [...items, item];
}

const mismoLugar = (a: Lugar, b: Lugar) => a.id === b.id;
const mismaParada = (a: ParadaGuardada, b: ParadaGuardada) => a.id === b.id;
const mismaLinea = (a: LineaGuardada, b: LineaGuardada) =>
  a.operator === b.operator && a.code === b.code;

export const useLoTuyoStore = create<LoTuyoState>((set) => ({
  ...cargar(),

  setCasa: (lugar) => set({ casa: lugar && soloLugar(lugar) }),
  setTrabajo: (lugar) => set({ trabajo: lugar && soloLugar(lugar) }),

  toggleLugar: (lugar) =>
    set((estado) => ({ lugares: alternar(estado.lugares, soloLugar(lugar), mismoLugar) })),

  toggleParada: (parada) =>
    set((estado) => ({ paradas: alternar(estado.paradas, parada, mismaParada) })),

  toggleLinea: (linea) =>
    set((estado) => ({ lineas: alternar(estado.lineas, linea, mismaLinea) })),

  /**
   * El más nuevo va primero, y si ya estaba sube: la lista es "a dónde fui
   * últimamente", no "en qué orden descubrí cada lugar".
   */
  agregarReciente: (lugar) =>
    set((estado) => ({
      recientes: [
        soloLugar(lugar),
        ...estado.recientes.filter((otro) => otro.id !== lugar.id),
      ].slice(
        0,
        MAX_RECIENTES,
      ),
    })),

  quitarReciente: (id) =>
    set((estado) => ({ recientes: estado.recientes.filter((otro) => otro.id !== id) })),
}));

// Cada cambio va al disco. Son unos cientos de bytes; no hay nada que
// diferir ni que agrupar.
useLoTuyoStore.subscribe(guardar);

/** Si este lugar está guardado en algún lado: como casa, trabajo o lugar. */
export function estaGuardado(estado: LoTuyo, id: string): boolean {
  return (
    estado.casa?.id === id ||
    estado.trabajo?.id === id ||
    estado.lugares.some((lugar) => lugar.id === id)
  );
}

/**
 * El enlace al planificador con el destino ya puesto.
 *
 * Va con coordenadas y no con el nombre: el nombre se resuelve buscando, y
 * "casa" no se encuentra en ningún catálogo. Es el mismo enlace que se usa
 * para compartir un viaje.
 */
export function enlaceParaIr(lugar: Lugar): string {
  return (
    `/transporte/planificador?lat=${lugar.lat.toFixed(5)}&lng=${lugar.lng.toFixed(5)}` +
    `&nombre=${encodeURIComponent(lugar.name)}&id=${encodeURIComponent(lugar.id)}`
  );
}

export default useLoTuyoStore;
