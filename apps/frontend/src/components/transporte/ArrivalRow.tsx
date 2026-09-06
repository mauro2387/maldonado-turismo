import { Accessibility, Zap } from 'lucide-react';
import { Arrival } from '@services/transportService';
import { LineTag } from '@components/ui/LineTag';

/**
 * Una llegada: línea, destino y minutos.
 *
 * Los minutos van en verde solo cuando el dato es realmente de ahora. Si el
 * último fix del ómnibus tiene más de un minuto, el mismo número se muestra en
 * gris como estimación. Prometer tiempo real sobre un dato viejo es la forma
 * más rápida de perder la confianza de quien está esperando en la parada.
 */

/** Colores de línea provisorios hasta que el catálogo real tenga los suyos. */
const OPERATOR_COLORS: Record<string, string> = {
  codesa: '#0E7C86',
  'maldonado-turismo': '#DC4227',
  micro: '#3D5063',
};

export function lineColor(operator?: string | null): string {
  return OPERATOR_COLORS[operator ?? ''] ?? '#0E7C86';
}

/** "ahora" pega mucho mejor que "0 min" para alguien parado en la vereda. */
function formatEta(minutes: number): string {
  if (minutes <= 0) return 'ahora';
  return `${minutes} min`;
}

/**
 * El número que se muestra.
 *
 * El feed publica los refuerzos con los dos números pegados —"179" por la
 * 17/19— y esa línea no existe: no está en ningún cartel. El backend traduce y
 * manda las dos cosas; acá se muestra la que la gente reconoce.
 */
export function arrivalLine(arrival: Arrival): string {
  return arrival.line_label ?? arrival.line_code;
}

export function ArrivalRow({ arrival }: { arrival: Arrival }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <LineTag code={arrivalLine(arrival)} color={lineColor(arrival.operator)} size="sm" />
        <span className="truncate text-data text-ink-600">
          {arrival.destination ?? arrival.line_name ?? 'En recorrido'}
        </span>
        {arrival.accessible && (
          <Accessibility
            className="h-3.5 w-3.5 flex-none text-sea-500"
            strokeWidth={2}
            aria-label="Unidad accesible"
          />
        )}
        {arrival.electric && (
          <Zap
            className="h-3.5 w-3.5 flex-none text-warn"
            strokeWidth={2}
            aria-label="Unidad eléctrica"
          />
        )}
      </div>

      <div className="flex flex-none items-center gap-1.5">
        <span
          className={`tabular text-sm font-extrabold ${arrival.live ? 'text-live' : 'text-ink-400'}`}
        >
          {formatEta(arrival.eta_minutes)}
        </span>
        {arrival.live && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-live-dot animate-pulse-dot"
            aria-label="Dato en vivo"
          />
        )}
      </div>
    </div>
  );
}

export default ArrivalRow;
