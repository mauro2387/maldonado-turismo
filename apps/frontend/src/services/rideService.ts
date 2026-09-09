import { api } from '@lib/apiClient';

/**
 * Ya te subiste. ¿Dónde te bajás?
 *
 * La otra mitad de "¿llego a tomar ese bondi?". Aquélla se contesta en la
 * vereda y ésta arriba del coche, que es donde la pregunta cambia por
 * completo: ya no hay nada que elegir, sólo hay que saber cuándo tocar el
 * timbre.
 *
 * Toda la cuenta la hace el backend, y no por comodidad: para saber cuánto
 * falta hay que proyectar el coche sobre el recorrido reconstruido, conocer el
 * orden de paradas de **ese** itinerario y cobrar el tramo que falta a la
 * velocidad medida de la línea. Nada de eso está en el teléfono. Es el mismo
 * error que se arregló en el catch: con constantes en la pantalla, los números
 * salían sistemáticamente para el mismo lado.
 */

export interface RideStop {
  id: number;
  code: string;
  name: string;
  lat: number;
  lng: number;
}

export interface RideStatus {
  /** El coche está reportando y todavía le falta para tu bajada. */
  active: boolean;
  /** Dónde bajarse. */
  stop: RideStop | null;
  /** La próxima parada del recorrido, que puede ser la tuya. */
  next_stop: RideStop | null;
  /** Cuántas paradas hace el coche **antes** de la tuya. Cero es "la próxima". */
  stops_away: number | null;
  meters_away: number | null;
  /** Los metros en cuadras, que es como se piensa el viaje. */
  blocks_away: number | null;
  minutes_away: number | null;
  /** `viaja` | `preparate` | `bajate` | `te_pasaste`. */
  alert: 'viaja' | 'preparate' | 'bajate' | 'te_pasaste' | null;
  /** La caminata desde la bajada hasta el destino. */
  walk_minutes: number | null;
  walk_distance_m: number | null;
  walk_geometry: [number, number][];
  walk_straight: boolean;
  /** Lo que le falta al coche hasta tu bajada, sobre el recorrido. */
  ride_geometry: [number, number][];
  line_label: string | null;
  headsign: string | null;
  /** `sin_coche` | `sin_senal` | `sin_recorrido` | `no_te_deja`. */
  reason: 'sin_coche' | 'sin_senal' | 'sin_recorrido' | 'no_te_deja' | null;
}

export const rideService = {
  /**
   * Va por POST: el cuerpo lleva la coordenada exacta del destino, y esos
   * datos no tienen por qué quedar en la barra del navegador ni en los logs.
   *
   * `stopId` fija la bajada cuando el viaje viene del planificador. Sin él, el
   * backend elige la que deja llegando antes.
   */
  follow: async (
    vehicleId: string,
    destination: { lat: number; lng: number },
    stopId?: number,
  ): Promise<RideStatus> => {
    return api.post<RideStatus>('/transport/ride', {
      vehicle_id: vehicleId,
      destination,
      stop_id: stopId,
    });
  },
};

export default rideService;
