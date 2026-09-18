import { create } from 'zustand';

/**
 * "Avisame cuando venga la 24."
 *
 * Es la otra mitad del recordatorio de salida. Aquel sirve cuando ya se
 * eligió un viaje; éste, cuando lo único que se sabe es que hay que tomar la
 * 24 en la parada de la esquina y no se quiere ir a esperarla parado en la
 * vereda. La app mira las llegadas de esa parada y avisa cuando un coche de
 * esa línea está a cinco minutos, que es lo que se tarda en bajar y llegar a
 * la esquina.
 *
 * Es una línea en una parada, no un coche: cualquier coche de la 24 que
 * llegue sirve, y el que se está mirando puede dejar de reportar y venir
 * otro atrás.
 *
 * Hay una sola, como el recordatorio: es **el** ómnibus que se está
 * esperando. Vive en el teléfono y sobrevive a recargar la app; una que
 * lleva más de dos horas puesta se descarta, porque para entonces el ómnibus
 * ya pasó o la persona ya se fue.
 *
 * Lo que esto no puede es lo mismo que el recordatorio: avisar con la app
 * cerrada. Ver `AlarmaDeLlegada` y `RecordatorioDeSalida`.
 */

export interface Alarma {
  stopId: number;
  stopName: string;
  /** El número del cartel de la línea que se espera. */
  linea: string;
  /** A cuántos minutos avisar. */
  umbralMin: number;
  /** Cuándo se puso, en milisegundos de época. */
  creadaEl: number;
  /** Ya sonó. Se guarda para no repetirlo si la app se recarga. */
  avisada: boolean;
}

interface AlarmaState {
  pendiente: Alarma | null;
  poner: (alarma: Omit<Alarma, 'creadaEl' | 'avisada' | 'umbralMin'>) => void;
  marcarAvisada: () => void;
  cancelar: () => void;
}

const STORAGE_KEY = 'alarma-de-llegada';

/**
 * A cuántos minutos se avisa. Cinco es lo que se tarda en bajar y caminar
 * una cuadra y media; con menos no se llega, con más se espera en la vereda.
 * No es configurable todavía: primero hay que ver si alguien pide otra cosa.
 */
export const UMBRAL_MIN = 5;

/** Más de esto y la alarma es de otro momento: se descarta al cargar. */
const VIDA_MS = 2 * 60 * 60_000;

function esAlarma(valor: unknown): valor is Alarma {
  if (!valor || typeof valor !== 'object') return false;
  const v = valor as Record<string, unknown>;
  return (
    typeof v.stopId === 'number' &&
    typeof v.stopName === 'string' &&
    typeof v.linea === 'string' &&
    typeof v.umbralMin === 'number' &&
    typeof v.creadaEl === 'number' &&
    typeof v.avisada === 'boolean'
  );
}

function cargar(): Alarma | null {
  try {
    const crudo = localStorage.getItem(STORAGE_KEY);
    if (!crudo) return null;
    const datos: unknown = JSON.parse(crudo);
    if (!esAlarma(datos)) return null;
    if (datos.creadaEl + VIDA_MS < Date.now()) return null;
    return datos;
  } catch {
    return null;
  }
}

function guardar(pendiente: Alarma | null): void {
  try {
    if (pendiente) localStorage.setItem(STORAGE_KEY, JSON.stringify(pendiente));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sin disco la alarma dura lo que dure la pestaña.
  }
}

export const useAlarmaStore = create<AlarmaState>((set) => ({
  pendiente: cargar(),

  poner: (alarma) =>
    set({
      pendiente: { ...alarma, umbralMin: UMBRAL_MIN, creadaEl: Date.now(), avisada: false },
    }),

  marcarAvisada: () =>
    set((estado) => (estado.pendiente ? { pendiente: { ...estado.pendiente, avisada: true } } : {})),

  cancelar: () => set({ pendiente: null }),
}));

useAlarmaStore.subscribe((estado) => guardar(estado.pendiente));

export default useAlarmaStore;
