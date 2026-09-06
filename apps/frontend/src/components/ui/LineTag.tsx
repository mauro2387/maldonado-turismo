import clsx from 'clsx';

/**
 * Ficha con el número de línea.
 *
 * El color lo pone la empresa y se respeta tal cual: es su identidad y la
 * gente ya la reconoce en la calle. Por eso el resto de la interfaz se
 * mantiene en neutros — si el fondo también fuera de color, las líneas
 * dejarían de leerse.
 */

const FALLBACK_COLOR = '#0E7C86';

/** Acepta `1976D2` y `#1976D2`: la base guarda el hex sin numeral. */
export function normalizeLineColor(color?: string | null): string {
  if (!color) return FALLBACK_COLOR;
  const value = color.trim();
  if (!value) return FALLBACK_COLOR;
  return value.startsWith('#') ? value : `#${value}`;
}

interface LineTagProps {
  code: string;
  color?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function LineTag({ code, color, size = 'md', className }: LineTagProps) {
  return (
    <span
      className={clsx(
        'line-tag',
        size === 'sm' && 'h-5 min-w-[1.5rem] text-[0.625rem]',
        size === 'lg' && 'h-7 min-w-[2rem] text-sm',
        className,
      )}
      style={{ backgroundColor: normalizeLineColor(color) }}
    >
      {code}
    </span>
  );
}

export default LineTag;
