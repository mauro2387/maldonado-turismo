import { create } from 'zustand';

/**
 * Preferencias que cambian lo que la app muestra en todos lados.
 *
 * Por ahora una sola: **sólo ómnibus con rampa.** Para quien va en silla de
 * ruedas, o con un cochecito, o con una valija, un ómnibus sin rampa no es
 * una opción peor: no es una opción. Y el dato existe -cada coche del feed
 * dice si es accesible- pero hasta ahora era un ícono al lado de cada
 * llegada que había que ir leyendo fila por fila, y el planificador ofrecía
 * el próximo 24 aunque el de atrás fuera el que sirve.
 *
 * Es una preferencia y no un filtro de pantalla porque la misma persona la
 * necesita en el planificador, en las llegadas de Moverse, en la ficha de la
 * parada y en sus paradas guardadas: ponerla cuatro veces es no ponerla. Se
 * cambia desde cualquiera de esas pantallas y desde Vos, y vale en todas.
 *
 * Va en `localStorage` como lo tuyo, con el mismo cuidado: leer y escribir en
 * try/catch, y la app anda igual si no hay disco.
 */

interface PreferenciasState {
  soloAccesibles: boolean;
  setSoloAccesibles: (valor: boolean) => void;
}

const STORAGE_KEY = 'preferencias';

function cargar(): { soloAccesibles: boolean } {
  try {
    const crudo = localStorage.getItem(STORAGE_KEY);
    if (!crudo) return { soloAccesibles: false };
    const datos = JSON.parse(crudo) as Record<string, unknown>;
    return { soloAccesibles: datos?.soloAccesibles === true };
  } catch {
    return { soloAccesibles: false };
  }
}

function guardar(estado: { soloAccesibles: boolean }): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ soloAccesibles: estado.soloAccesibles }));
  } catch {
    // Sin disco la preferencia dura lo que dure la pestaña.
  }
}

export const usePreferenciasStore = create<PreferenciasState>((set) => ({
  ...cargar(),
  setSoloAccesibles: (valor) => set({ soloAccesibles: valor }),
}));

usePreferenciasStore.subscribe(guardar);

export default usePreferenciasStore;
