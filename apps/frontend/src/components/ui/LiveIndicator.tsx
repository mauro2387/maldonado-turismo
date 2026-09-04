import clsx from 'clsx';

/**
 * Indicador de dato en vivo.
 *
 * La regla de honestidad del producto: solo se muestra en verde con el punto
 * pulsante si la última posición del ómnibus tiene menos de un minuto. Si no,
 * se cae al horario de tabla en gris. Una app de transporte se gana la
 * confianza mostrando cuándo *no* sabe.
 */

/** Un fix más viejo que esto ya no se considera tiempo real. */
export const LIVE_MAX_AGE_SECONDS = 60;

export function isLive(fixAgeSeconds?: number | null): boolean {
  return typeof fixAgeSeconds === 'number' && fixAgeSeconds >= 0 && fixAgeSeconds < LIVE_MAX_AGE_SECONDS;
}

/** "hace 12 s" / "hace 3 min". */
export function formatAge(seconds: number): string {
  if (seconds < 60) return `hace ${Math.max(0, Math.round(seconds))} s`;
  const minutes = Math.round(seconds / 60);
  return `hace ${minutes} min`;
}

interface LiveIndicatorProps {
  /** Antigüedad del último dato recibido, en segundos. */
  fixAgeSeconds?: number | null;
  /** Texto alternativo cuando no hay dato en vivo. */
  fallbackLabel?: string;
  showAge?: boolean;
  className?: string;
}

export function LiveIndicator({
  fixAgeSeconds,
  fallbackLabel = 'según horario',
  showAge = true,
  className,
}: LiveIndicatorProps) {
  if (!isLive(fixAgeSeconds)) {
    return (
      <span className={clsx('inline-flex items-center text-xs font-medium text-ink-400', className)}>
        {fallbackLabel}
      </span>
    );
  }

  return (
    <span
      className={clsx('inline-flex items-center gap-1.5 text-xs font-bold text-live', className)}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-live-dot animate-pulse-dot" aria-hidden="true" />
      {showAge ? formatAge(fixAgeSeconds as number) : 'en vivo'}
    </span>
  );
}

export default LiveIndicator;
