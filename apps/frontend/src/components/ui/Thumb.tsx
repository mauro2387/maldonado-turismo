import { useState } from 'react';
import clsx from 'clsx';
import { initialFor, paletteFor } from '@lib/fallbackPalette';

/**
 * Imagen con respaldo propio.
 *
 * Antes las fotos que faltaban apuntaban a `via.placeholder.com`: un dominio
 * de terceros que hoy no responde —así que dejaba el hueco roto— y que además
 * recibía una visita de cada usuario de la app. El respaldo ahora es local: un
 * bloque de color del sistema con la inicial del lugar.
 *
 * El color sale del nombre —ver `@lib/fallbackPalette`—, así que el mismo
 * lugar siempre se ve igual, acá y en el marcador del mapa.
 */

interface ThumbProps {
  src?: string | null;
  name: string;
  className?: string;
  /** Las fotos que no son el contenido principal no bloquean el primer render. */
  eager?: boolean;
}

export function Thumb({ src, name, className, eager = false }: ThumbProps) {
  const [failed, setFailed] = useState(false);
  const initial = initialFor(name);

  if (!src || failed) {
    const [from, to] = paletteFor(name);
    return (
      <div
        className={clsx('flex items-center justify-center', className)}
        style={{ background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)` }}
        role="img"
        aria-label={name}
      >
        <span className="text-2xl font-extrabold text-white/80">{initial}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFailed(true)}
      className={clsx('object-cover', className)}
    />
  );
}

export default Thumb;
