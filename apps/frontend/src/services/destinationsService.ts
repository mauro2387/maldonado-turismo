import { api } from '@lib/apiClient';

/**
 * "¿A dónde vas?"
 *
 * La búsqueda de destinos se hacía en el teléfono, contra lo que ya estuviera
 * descargado: las 28 fichas de atractivos y los nombres de las paradas. Con
 * eso "punta shopping", "el hospital" o "liceo 3" no encontraban nada, y son
 * los destinos que más se buscan.
 *
 * Ahora la resuelve el backend contra tres catálogos: los atractivos, las
 * paradas y 2.800 lugares con nombre de OpenStreetMap —comercios, hospitales,
 * liceos, plazas, barrios—. Se le pasa además dónde está la persona, para que
 * lo cercano venga primero: hay una "Farmacia San Roque" en cada ciudad.
 */

export interface Destination {
  id: string;
  name: string;
  /** Qué es, en castellano: "hospital", "barrio", "parada de ómnibus". */
  kind: string;
  source: 'turismo' | 'lugar' | 'parada';
  lat: number;
  lng: number;
  locality: string | null;
  distanceM?: number;
  /** Las líneas que paran ahí. Sólo en las paradas. */
  lines?: string[];
}

export const destinationsService = {
  search: async (
    query: string,
    reference?: { lat: number; lng: number },
    limit = 8,
  ): Promise<Destination[]> => {
    const params: Record<string, string | number> = { q: query, limit };
    if (reference) {
      // Tres decimales son unos cien metros: alcanza de sobra para ordenar por
      // cercanía y evita mandar la ubicación exacta en la URL.
      params.lat = Number(reference.lat.toFixed(3));
      params.lng = Number(reference.lng.toFixed(3));
    }

    const response = await api.get<{ results: Destination[] }>('/transport/destinations', {
      params,
    });

    return response.results ?? [];
  },
};

export default destinationsService;
