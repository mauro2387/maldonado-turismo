import { Star } from 'lucide-react';
import clsx from 'clsx';

/**
 * La estrella de guardar.
 *
 * Es el mismo gesto en todos lados —una parada, una línea, un destino— y por
 * eso es un solo componente: la ficha de lugar tenía un corazón que no
 * guardaba nada, y si cada pantalla dibujara el suyo, en una sería un
 * corazón, en otra una estrella y en otra un marcador, y nadie sabría que son
 * la misma cosa.
 *
 * Estrella y no corazón porque guardar una parada no es quererla: es "esta
 * es la mía". Y en coral, que es el único acento de la app, porque guardado
 * tiene que verse de un vistazo entre veinte filas grises.
 *
 * El área tocable son 44 px aunque el dibujo mida 20: una estrella al lado de
 * un título se toca con el pulgar, sin mirar.
 */
export function Estrella({
  activa,
  onToggle,
  que,
  className,
}: {
  activa: boolean;
  onToggle: () => void;
  /** Qué se guarda, para el lector de pantalla: "esta parada", "la línea 24". */
  que: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        // La estrella suele vivir adentro de una tarjeta que también es un
        // enlace: guardar no tiene que navegar.
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      aria-pressed={activa}
      aria-label={activa ? `Quitar ${que} de lo tuyo` : `Guardar ${que}`}
      className={clsx(
        'touch-target flex flex-none items-center justify-center rounded-full',
        'transition-colors duration-200 ease-out active:bg-sand-100',
        className,
      )}
    >
      <Star
        className={clsx(
          'h-5 w-5 transition-colors',
          activa ? 'fill-coral-500 text-coral-500' : 'text-ink-300',
        )}
        strokeWidth={2}
      />
    </button>
  );
}

export default Estrella;
