import { useEffect, useState } from 'react';
import { X, Clock, ArrowRight, ExternalLink } from 'lucide-react';
import { transportService, LineTimetable } from '@services/transportService';
import { formatStopName } from '@lib/stopNames';

/**
 * El horario publicado de una línea.
 *
 * Es la tabla del papel de la empresa, reconstruida: una por sentido, con los
 * puntos de control como columnas y cada servicio como una fila. Se cita de
 * dónde salió y de qué temporada es -verano e invierno no se mezclan-, porque
 * un horario sin fuente no se puede verificar y uno de la temporada equivocada
 * es peor que ninguno.
 *
 * La tabla es ancha; se desplaza sola de costado sin arrastrar la pantalla.
 */

/** La máscara de días a una frase corta. Lunes=1 ... domingo=64. */
function daysLabel(days: number): string {
  const LUN_VIE = 1 | 2 | 4 | 8 | 16;
  const FINDE = 32 | 64;
  const TODOS = LUN_VIE | FINDE;

  if (days === TODOS) return 'Todos los días';
  if (days === LUN_VIE) return 'Lunes a viernes';
  if (days === FINDE) return 'Sábados y domingos';
  if (days === (LUN_VIE | 32)) return 'Lunes a sábado';
  if (days === 64) return 'Domingos';
  if (days === 32) return 'Sábados';

  const nombres = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  return nombres.filter((_, i) => days & (1 << i)).join(' · ') || 'Sin datos';
}

const SENTIDO: Record<string, string> = { ida: 'Ida', vuelta: 'Vuelta', circular: 'Circular' };

export function LineScheduleSheet({ label, onClose }: { label: string; onClose: () => void }) {
  const [schedule, setSchedule] = useState<LineTimetable | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    transportService
      .getLineSchedule(label)
      .then((result) => {
        if (!cancelled) setSchedule(result);
      })
      .catch(() => {
        if (!cancelled) setSchedule({ available: false });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [label]);

  return (
    <div className="sheet absolute inset-x-0 bottom-0 z-[560] max-h-[80%] animate-sheet-up overflow-y-auto px-4 pb-6 pt-2">
      <div className="sheet-grab" />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-extrabold tracking-tight text-ink-900">
            <Clock className="h-4 w-4 flex-none text-ink-400" strokeWidth={2} />
            Horarios de la línea {label}
          </h2>
          {schedule?.available && (
            <p className="mt-0.5 truncate text-xs text-ink-400">
              {schedule.season === 'verano' ? 'Temporada de verano' : 'Temporada de invierno'}
              {schedule.valid_text ? ` · ${schedule.valid_text}` : ''}
            </p>
          )}
        </div>
        <button onClick={onClose} aria-label="Cerrar" className="flex-none p-1">
          <X className="h-4 w-4 text-ink-400" strokeWidth={2} />
        </button>
      </div>

      {loading && <p className="mt-6 text-sm text-ink-400">Cargando el horario…</p>}

      {!loading && !schedule?.available && (
        <div className="mt-5 rounded-card bg-sand-100 px-3.5 py-4">
          <p className="text-sm font-bold text-ink-900">Todavía no cargamos el horario de esta línea</p>
          <p className="mt-1 text-xs text-ink-400">
            Mientras tanto, el mapa te muestra por dónde viene cada ómnibus en vivo y en qué parada
            tomarlo.
          </p>
        </div>
      )}

      {!loading &&
        schedule?.available &&
        schedule.directions?.map((dir) => (
          <section key={dir.direction} className="mt-5">
            <h3 className="mb-2 flex items-center gap-1.5 text-data font-extrabold text-ink-900">
              {SENTIDO[dir.direction] ?? dir.direction}
              {dir.points.length >= 2 && (
                <span className="flex items-center gap-1 text-xs font-semibold text-ink-400">
                  {formatStopName(dir.points[0])}
                  <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
                  {formatStopName(dir.points[dir.points.length - 1])}
                </span>
              )}
            </h3>

            <div className="-mx-4 overflow-x-auto px-4">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-white py-1.5 pr-3 text-left font-bold text-ink-400">
                      Días
                    </th>
                    {dir.points.map((point) => (
                      <th
                        key={point}
                        className="whitespace-nowrap px-2 py-1.5 text-left font-bold text-ink-600"
                      >
                        {formatStopName(point)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dir.services.map((service, i) => (
                    <tr key={i} className="border-t border-sand-200">
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-white py-1.5 pr-3 text-[0.6875rem] font-semibold text-ink-400">
                        {daysLabel(service.days)}
                      </td>
                      {service.times.map((time, j) => (
                        <td
                          key={j}
                          className={`tabular whitespace-nowrap px-2 py-1.5 ${
                            time ? 'font-semibold text-ink-900' : 'text-ink-200'
                          }`}
                        >
                          {time ?? '·'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

      {schedule?.available && schedule.source_url && (
        <a
          href={schedule.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 flex items-center gap-1.5 text-xs font-bold text-coral-500"
        >
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.5} />
          Horario publicado por la empresa
        </a>
      )}
    </div>
  );
}

export default LineScheduleSheet;
