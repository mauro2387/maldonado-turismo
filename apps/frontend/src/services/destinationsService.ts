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

  /**
   * De qué está cerca este punto del mapa.
   *
   * Para cuando el destino se marca tocando el mapa y no escribiendo: la
   * pantalla tiene una coordenada y ningún nombre, y "-34.90812, -54.95003" no
   * le sirve a nadie para confirmar que marcó bien. El backend contesta el
   * lugar de al lado, o nada si no hay nada lo bastante cerca —no se le pone
   * un nombre a un punto que no lo tiene—.
   */
  nearest: async (
    point: { lat: number; lng: number },
  ): Promise<{ near: Destination | null; distanceM: number | null }> => {
    const response = await api.get<{ near: Destination | null; distance_m: number | null }>(
      '/transport/destinations/cercano',
      {
        // Cinco decimales es un metro: de sobra para nombrar una esquina.
        params: { lat: Number(point.lat.toFixed(5)), lng: Number(point.lng.toFixed(5)) },
      },
    );

    return { near: response.near ?? null, distanceM: response.distance_m ?? null };
  },
};

export default destinationsService;
