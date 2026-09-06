import { useState } from 'react';
import clsx from 'clsx';

/**
 * Imagen con respaldo propio.
 *
 * Antes las fotos que faltaban apuntaban a `via.placeholder.com`: un dominio
 * de terceros que hoy no responde —así que dejaba el hueco roto— y que además
 * recibía una visita de cada usuario de la app. El respaldo ahora es local: un
 * bloque de color del sistema con la inicial del lugar.
 *
 * El color sale del nombre, así que el mismo lugar siempre se ve igual y una
 * lista sin fotos igual se distingue de un vistazo.
 */

const FALLBACK_COLORS = [
  ['#0B1F33', '#2A3E52'],
  ['#0E7C86', '#09515A'],
  ['#DC4227', '#A32D17'],
  ['#3D5063', '#1A2D3F'],
  ['#B8A88F', '#7A6B52'],
] as const;

function paletteFor(seed: string): readonly [string, string] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

interface ThumbProps {
  src?: string | null;
  name: string;
  className?: string;
  /** Las fotos que no son el contenido principal no bloquean el primer render. */
  eager?: boolean;
}

export function Thumb({ src, name, className, eager = false }: ThumbProps) {
  const [failed, setFailed] = useState(false);
  const initial = name.trim().charAt(0).toUpperCase() || 'M';

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
