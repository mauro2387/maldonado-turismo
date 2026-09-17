import { api } from '@lib/apiClient';

/**
 * Planificación de viajes.
 *
 * El grafo que se armaba en el navegador se fue: conectaba cualquier par de
 * paradas que compartiera una línea, en línea recta y sin orden de recorrido,
 * así que devolvía viajes que no existen con tiempos inventados. Además
 * obligaba a bajar todas las paradas y todas las líneas al teléfono para
 * calcular.
 *
 * Ahora el cálculo vive en el backend, que sí conoce el orden real de paradas
 * de cada línea y los tiempos que esa línea viene teniendo.
 */

export interface TripLeg {
  type: 'walk' | 'wait' | 'bus';
  duration_minutes: number;
  distance_m?: number;
  from: string;
  to: string;
  line_code?: string;
  /** El número del cartel: "17/19" y no "179", que es como llega del feed. */
  line_label?: string;
  operator?: string;
  /** Hacia dónde va el ómnibus, tal como lo publica la empresa. */
  headsign?: string | null;
  /** True si la espera sale de una unidad en camino y no de una estimación. */
  live?: boolean;
  /** True si la hora sale del horario publicado por la empresa. */
  scheduled?: boolean;
  /**
   * De dónde salió la hora de este tramo.
   *
   * Cambia lo que la pantalla puede prometer: con `vivo` hay un coche concreto
   * al que se le puede seguir el rastro —y recién ahí tiene sentido ofrecer
   * "ya me subí"—; con `horario` hay un papel de la empresa; con `frecuencia`,
   * una estimación hecha con los coches que están dando la vuelta.
   *
   * Para un viaje planificado a una hora futura es siempre `horario`: a esa
   * hora todavía no hay ningún coche del que hablar.
   */
  source?: 'vivo' | 'horario' | 'frecuencia';
  /** Minutos desde ahora en que ese ómnibus pasa por la parada. */
  departs_in_minutes?: number;
  /** El coche concreto que hay que tomarse, cuando la espera es en vivo. */
  vehicle_id?: string;
  /**
   * Cómo es el coche que hay que tomarse, para poder dibujarlo con el diseño
   * de su empresa. Es null mientras la espera salga del horario publicado y no
   * de una unidad concreta en la calle.
   */
  accessible?: boolean | null;
  electric?: boolean;
  stops_count?: number;
  /**
   * Dónde se sube y dónde se baja, por identificador.
   *
   * `from` y `to` son nombres para mostrar y no identifican una parada: hay
   * tres "HOSPITAL" y cada empresa las numera aparte. Estos dos son los que la
   * pantalla de a bordo le pasa al backend para **fijar** la bajada, y fijarla
   * es lo que evita que la app prometa una parada antes de salir y otra
   * distinta con la persona ya arriba del ómnibus.
   */
  boarding_stop_id?: number;
  alighting_stop_id?: number;
  /**
   * El tramo dibujado, en orden GeoJSON [lng, lat]. En el ómnibus es el
   * pedazo del recorrido publicado que va de una parada a la otra; en la
   * caminata, el camino por la calle.
   */
  geometry?: [number, number][];
  /** True cuando la caminata se dibuja derecha porque no se pudo rutear. */
  straight?: boolean;
  /** Las paradas del tramo en ómnibus, para marcarlas en el mapa. */
  stops?: Array<{ id: number; name: string; lat: number; lng: number }>;
}

export interface TripOption {
  id: string;
  /** Minutos desde ahora hasta llegar al destino. */
  total_minutes: number;
  walk_minutes: number;
  transfers: number;
  /**
   * Dentro de cuántos minutos conviene salir. Cero es "salí ahora": si el
   * ómnibus pasa dentro de veinte minutos y la parada está a tres, no hay
   * ningún motivo para ir a esperarlo parado en la vereda.
   */
  leave_in_minutes: number;
  /** "Más rápido", "Menos caminata", "Sin transbordo". */
  label?: string;
  legs: TripLeg[];
}

/**
 * La última vuelta desde el destino.
 *
 * `finished` en true es la señal fuerte: hoy ya no se puede volver en ómnibus
 * desde ahí. Es lo que evita que alguien quede a pie en la Ruta 10.
 */
export interface LastReturn {
  available: boolean;
  last_at: string | null;
  line_label: string | null;
  stop_name: string | null;
  finished: boolean;
}

export interface PlanResult {
  options: TripOption[];
  /** La vuelta, para saberlo antes de ir. */
  return_trip?: LastReturn;
  /** False mientras el backend no tenga recorridos con los que calcular. */
  ready: boolean;
  /**
   * Desde qué momento están contados los minutos de la respuesta. Null es
   * ahora.
   *
   * No es informativo: **todos** los minutos que devuelve el planificador
   * -`leave_in_minutes`, `departs_in_minutes`, `total_minutes`- se cuentan
   * desde este instante. Sumándolos al reloj del teléfono, un viaje pedido
   * para mañana a las 18:30 mostraría horas corridas veinticuatro horas.
   */
  planned_for?: string | null;
  /**
   * La hora a la que se pidió llegar, cuando la pregunta fue esa. Con esto
   * puesto las opciones vienen por hora de salida -la más tarde primero- y
   * `planned_for` es la salida más temprana de las que quedaron.
   */
  arrive_by?: string | null;
}

export interface PlannerPoint {
  lat: number;
  lng: number;
  label?: string;
}

export const routePlannerService = {
  /**
   * Va por POST: el cuerpo lleva las coordenadas exactas de la persona, y esos
   * datos no tienen por qué quedar en la barra del navegador ni en los logs.
   *
   * `departAt` es cuándo se sale, si no es ahora. El backend contesta esas con
   * el horario publicado y nada más: a una hora que todavía no llegó no hay
   * ningún coche en la calle del que hablar.
   *
   * `arriveBy` es a qué hora hay que estar: el backend busca hacia atrás. Van
   * una o la otra, nunca las dos.
   */
  plan: async (
    origin: PlannerPoint,
    destination: PlannerPoint,
    departAt?: Date,
    arriveBy?: Date,
  ): Promise<PlanResult> => {
    return api.post<PlanResult>('/transport/plan', {
      origin,
      destination,
      depart_at: departAt ? departAt.toISOString() : undefined,
      arrive_by: arriveBy ? arriveBy.toISOString() : undefined,
    });
  },
};

export default routePlannerService;
