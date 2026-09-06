import { LucideIcon, AlertCircle, RefreshCw } from 'lucide-react';
import clsx from 'clsx';

/**
 * Estados vacíos y de error.
 *
 * Cada lista vacía dice qué pasó y qué hacer, con una acción. Nunca un ícono
 * gris con "No hay resultados", y nunca un `alert()` del navegador: los
 * errores viven dentro de la interfaz.
 */

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={clsx('flex flex-col items-center px-6 py-12 text-center', className)}>
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sand-100">
        <Icon className="h-6 w-6 text-ink-400" strokeWidth={1.75} />
      </span>
      <h3 className="text-base font-bold text-ink-900">{title}</h3>
      {description && <p className="mt-1.5 max-w-xs text-sm text-ink-400">{description}</p>}
      {action && (
        <button onClick={action.onClick} className="btn btn-secondary mt-5">
          {action.label}
        </button>
      )}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ title = 'No se pudo cargar', message, onRetry, className }: ErrorStateProps) {
  return (
    <div
      className={clsx('rounded-card border border-crit-soft bg-crit-soft p-4', className)}
      role="alert"
    >
      <div className="flex gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 flex-none text-crit" strokeWidth={1.75} />
        <div className="flex-1">
          <h3 className="text-sm font-bold text-ink-900">{title}</h3>
          <p className="mt-1 text-sm text-ink-600">{message}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-crit"
            >
              <RefreshCw className="h-4 w-4" strokeWidth={2} />
              Reintentar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Aviso discreto, para cosas que no rompen la pantalla (permiso denegado). */
export function InlineNotice({
  message,
  action,
  tone = 'warn',
}: {
  message: string;
  action?: { label: string; onClick: () => void };
  tone?: 'warn' | 'info';
}) {
  return (
    <div
      className={clsx(
        'flex items-center gap-3 rounded-card px-3.5 py-3 text-sm',
        tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-sea-50 text-sea-600',
      )}
      role="status"
    >
      <span className="flex-1 font-medium">{message}</span>
      {action && (
        <button onClick={action.onClick} className="flex-none font-bold underline underline-offset-2">
          {action.label}
        </button>
      )}
    </div>
  );
}

/** Placeholder de carga con la forma del contenido que va a venir. */
export function SkeletonList({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={clsx('flex flex-col gap-3', className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="card">
          <div className="skeleton h-4 w-2/5" />
          <div className="skeleton mt-2 h-3 w-1/4" />
          <div className="mt-4 flex items-center justify-between">
            <div className="skeleton h-5 w-16" />
            <div className="skeleton h-5 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}
