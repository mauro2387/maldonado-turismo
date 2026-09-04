import codesaNormal from '@assets/bondis/codesa-normal.png';
import codesaAccesible from '@assets/bondis/codesa-accesible.png';
import codesaElectrico from '@assets/bondis/codesa-electrico.png';
import codesaParado from '@assets/bondis/codesa-parado.png';
import microNormal from '@assets/bondis/micro-normal.png';
import microAccesible from '@assets/bondis/micro-accesible.png';
import microElectrico from '@assets/bondis/micro-electrico.png';
import microParado from '@assets/bondis/micro-parado.png';
import turismoNormal from '@assets/bondis/turismo-normal.png';
import turismoAccesible from '@assets/bondis/turismo-accesible.png';
import turismoElectrico from '@assets/bondis/turismo-electrico.png';
import turismoParado from '@assets/bondis/turismo-parado.png';

/** Familias de diseño disponibles en apps/bondis. */
export type BusFamily = 'codesa' | 'micro' | 'turismo';

export type BusVariant = 'normal' | 'accesible' | 'electrico' | 'parado';

/**
 * Los PNG son de 40x90 y están dibujados a vista cenital con el morro hacia
 * arriba, o sea apuntando al norte sin rotar. Eso permite usar el rumbo del
 * feed (grados, 0 = norte, sentido horario) tal cual en un `rotate()`.
 */
export const SPRITE_NATURAL_WIDTH = 40;
export const SPRITE_NATURAL_HEIGHT = 90;

const SPRITES: Record<BusFamily, Record<BusVariant, string>> = {
  codesa: {
    normal: codesaNormal,
    accesible: codesaAccesible,
    electrico: codesaElectrico,
    parado: codesaParado,
  },
  micro: {
    normal: microNormal,
    accesible: microAccesible,
    electrico: microElectrico,
    parado: microParado,
  },
  turismo: {
    normal: turismoNormal,
    accesible: turismoAccesible,
    electrico: turismoElectrico,
    parado: turismoParado,
  },
};

/** Qué familia de diseño le corresponde a cada empresa del feed AVL. */
export const OPERATOR_FAMILY: Record<string, BusFamily> = {
  codesa: 'codesa',
  'maldonado-turismo': 'turismo',
  micro: 'micro',
};

/** Color de carrocería de cada familia, muestreado del PNG correspondiente. */
export const FAMILY_COLORS: Record<BusFamily, string> = {
  codesa: '#3E638D',
  micro: '#71533B',
  turismo: '#3D8054',
};

/**
 * Minutos detenido a partir de los cuales el ómnibus se dibuja como parado.
 *
 * "Parado" acá quiere decir que terminó su recorrido y está estacionado -en la
 * agencia, o en la terminal de Punta del Este, Piriápolis o el balneario-, no
 * que esté frenado en una parada o en un semáforo. La velocidad sola no
 * distingue las dos cosas; la duración sí.
 *
 * El corte sale de medir el histórico: de 994 detenciones registradas, 957
 * duraron menos de un minuto (semáforos y paradas) y solo 9 pasaron los 10
 * minutos. La separación entre un caso y el otro es tan marcada que el umbral
 * exacto no es delicado, pero 10 deja afuera hasta las esperas largas de
 * regulación.
 */
const OUT_OF_SERVICE_MINUTES = 10;

export type BusSpriteInput = {
  operator?: string | null;
  /**
   * Hace cuántos minutos que la unidad no se mueve, calculado por el backend
   * sobre el histórico de posiciones. Es null mientras el coche circula.
   */
  stopped_minutes?: number | null;
  accessible?: boolean | null;
  /**
   * Unidad 100% eléctrica. No viene del feed AVL -que no publica propulsión-
   * sino que lo resuelve la API por número de coche; ver fleet.util.ts en el
   * backend.
   */
  electric?: boolean | null;
};

/**
 * Elige la variante a dibujar. Los diseños son excluyentes -un PNG por unidad-
 * así que cuando una unidad cumple más de una condición hay que ordenarlas:
 *
 * 1. 'parado' primero, porque una unidad fuera de servicio no le sirve a nadie
 *    que esté esperando: es el dato que más cambia lo que hace el usuario.
 * 2. 'electrico' antes que 'accesible', aunque parezca al revés de lo que
 *    conviene. Toda la flota eléctrica de CODESA viaja además marcada como
 *    accesible (los coches 322, 323 y 324 en circulación traen los tres
 *    bac=1), así que poner accesible primero dejaría el diseño eléctrico como
 *    código muerto: no se dibujaría nunca.
 *
 * Lo que queda tapado por esta prioridad se sigue viendo en el popup, que
 * muestra las dos condiciones por separado.
 */
export function busVariant(vehicle: BusSpriteInput): BusVariant {
  if (vehicle.stopped_minutes != null && vehicle.stopped_minutes >= OUT_OF_SERVICE_MINUTES) {
    return 'parado';
  }
  if (vehicle.electric) return 'electrico';
  if (vehicle.accessible) return 'accesible';
  return 'normal';
}

/**
 * URL del sprite para una unidad, o null si la empresa no tiene diseño
 * asignado todavía; en ese caso el mapa cae al marcador genérico en vez de
 * dibujar el ómnibus de otra empresa.
 */
export function busSprite(vehicle: BusSpriteInput): string | null {
  const family = vehicle.operator ? OPERATOR_FAMILY[vehicle.operator] : undefined;
  if (!family) return null;
  return SPRITES[family][busVariant(vehicle)];
}

/** Color de la empresa, tomado del diseño de su ómnibus. */
export function operatorColor(operator?: string | null): string {
  const family = operator ? OPERATOR_FAMILY[operator] : undefined;
  return family ? FAMILY_COLORS[family] : '#546E7A';
}
