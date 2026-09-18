import { create } from 'zustand';
import { Lugar } from '@store/loTuyoStore';

/**
 * Los viajes que se hicieron.
 *
 * No los que se buscaron: para eso están los recientes de lo tuyo. Un viaje
 * entra acá cuando la persona toca "ya me subí", que es el único momento en
 * que la app sabe que el viaje pasó de plan a hecho. Sirve para dos cosas:
 * repetirlo con un toque ("el jueves fui al hospital en la 24 y quiero
 * volver a ir") y para mirar cómo se viaja -qué línea, desde qué parada-,
 * que es lo que uno no recuerda y la app sí.
 *
 * Se guarda lo del viaje y no la persona: no hay origen con coordenada, sólo
 * el nombre de la parada donde se subió. Vive en el teléfono, como lo tuyo.
 */

export interface Viaje {
  /** Único, para las listas. */
  id: string;
  /** Cuándo se subió, en milisegundos de época. */
  cuando: number;
  linea: string;
  operator: string;
  /** Dónde se subió y dónde se baja, como se leen. */
  desde: string;
  hasta: string;
  /** A dónde iba: es lo que permite repetir el viaje. */
  destino: Lugar;
  /** Cuánto iba a durar, de la parada al destino, según el planificador. */
  minutos: number;
}

interface HistorialState {
  viajes: Viaje[];
  anotar: (viaje: Omit<Viaje, 'id' | 'cuando'>) => void;
  borrar: (id: string) => void;
  vaciar: () => void;
}

const STORAGE_KEY = 'historial-de-viajes';

/**
 * Cuántos se guardan. Treinta es un mes de ir y volver al trabajo; más allá
 * de eso ya no es "mis viajes" sino una estadística, que nadie pidió.
 */
const MAX_VIAJES = 30;

function esViaje(valor: unknown): valor is Viaje {
  if (!valor || typeof valor !== 'object') return false;
  const v = valor as Record<string, unknown>;
  const d = v.destino as Record<string, unknown> | undefined;
  return (
    typeof v.id === 'string' &&
    typeof v.cuando === 'number' &&
    typeof v.linea === 'string' &&
    typeof v.operator === 'string' &&
    typeof v.desde === 'string' &&
    typeof v.hasta === 'string' &&
    typeof v.minutos === 'number' &&
    !!d &&
    typeof d.id === 'string' &&
    typeof d.name === 'string' &&
    typeof d.lat === 'number' &&
    typeof d.lng === 'number'
  );
}

function cargar(): Viaje[] {
  try {
    const crudo = localStorage.getItem(STORAGE_KEY);
    if (!crudo) return [];
    const datos: unknown = JSON.parse(crudo);
    return Array.isArray(datos) ? datos.filter(esViaje).slice(0, MAX_VIAJES) : [];
  } catch {
    return [];
  }
}

function guardar(viajes: Viaje[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(viajes));
  } catch {
    // Sin disco el historial dura lo que dure la pestaña.
  }
}

export const useHistorialStore = create<HistorialState>((set) => ({
  viajes: cargar(),

  anotar: (viaje) =>
    set((estado) => ({
      viajes: [
        { ...viaje, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, cuando: Date.now() },
        ...estado.viajes,
      ].slice(0, MAX_VIAJES),
    })),

  borrar: (id) => set((estado) => ({ viajes: estado.viajes.filter((viaje) => viaje.id !== id) })),

  vaciar: () => set({ viajes: [] }),
}));

useHistorialStore.subscribe((estado) => guardar(estado.viajes));

export default useHistorialStore;
