import clsx from 'clsx';
import { busSprite, BusSpriteInput, SPRITE_NATURAL_HEIGHT, SPRITE_NATURAL_WIDTH } from '@components/map/busSprites';

/**
 * El dibujo del ómnibus, fuera del mapa.
 *
 * Los doce diseños —tres empresas por cuatro estados— existían y se usaban
 * sólo como marcadores: al alejar el mapa quedan de quince píxeles y no se
 * distingue una empresa de otra. Acá se ven al tamaño en que se reconocen, y
 * en los momentos en que reconocerlo sirve para algo:
 *
 * - en la lista de llegadas, para saber de qué empresa es el que viene;
 * - en el viaje planificado, para saber cuál hay que hacerle señas;
 * - arriba del ómnibus, para confirmar que la app está siguiendo **éste** y no
 *   el que va adelante.
 *
 * El diseño ya dice si es accesible, si es eléctrico o si está parado: la
 * variante la elige `busVariant()` con los datos del feed. No hace falta
 * agregarle una leyenda.
 */

/**
 * Los PNG están dibujados desde arriba y apuntando al norte, porque así se
 * rotan con el rumbo sin corregir nada. Fuera del mapa no hay rumbo, y un
 * ómnibus vertical en un renglón de lista se lee como una mancha: se lo gira
 * un cuarto de vuelta para que vaya hacia la derecha, que es como se dibuja un
 * vehículo cuando no está sobre un mapa.
 */
const QUARTER_TURN = 'rotate(90deg)';

export function BondiSprite({
  vehicle,
  width = 34,
  className,
}: {
  vehicle: BusSpriteInput;
  /** Lo que mide de largo, ya girado. */
  width?: number;
  className?: string;
}) {
  const sprite = busSprite(vehicle);
  // Sin diseño para esa empresa no se dibuja el de otra: mejor nada que un
  // ómnibus que no es el que viene.
  if (!sprite) return null;

  const height = Math.round((width * SPRITE_NATURAL_WIDTH) / SPRITE_NATURAL_HEIGHT);

  return (
    <span
      className={clsx('relative flex-none', className)}
      style={{ width, height }}
      aria-hidden="true"
    >
      <img
        src={sprite}
        alt=""
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: height,
          height: width,
          transform: `translate(-50%,-50%) ${QUARTER_TURN}`,
          filter: 'drop-shadow(0 1px 1.5px rgba(11,31,51,.25))',
        }}
      />
    </span>
  );
}

export default BondiSprite;
