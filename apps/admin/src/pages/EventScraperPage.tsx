import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ExternalLink,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../lib/api';

/**
 * Panel de la ingesta automática de la agenda.
 *
 * La tarea corre sola una vez por día. Esta pantalla existe para tres cosas:
 * ver que efectivamente corrió, poder adelantarla a mano, y resolver la cola de
 * eventos que el parser no pudo fechar con confianza.
 */

interface ScraperStatus {
  upcoming: number;
  pending: number;
  scraped: number;
  manual: number;
  last_success: string | null;
  running: boolean;
  scheduledHour: number;
}

interface ScraperSource {
  key: string;
  name: string;
  url: string;
  enabled: boolean;
  max_pages: number;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  total_events: number;
  upcoming_events: number;
}

interface SourceDetail {
  source: string;
  name: string;
  found: number;
  created: number;
  updated: number;
  skipped: number;
  rejections: Record<string, number>;
  error: string | null;
}

interface ScraperRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  triggered_by: string;
  items_found: number;
  items_created: number;
  items_updated: number;
  items_skipped: number;
  detail: SourceDetail[];
  error: string | null;
}

interface PendingEvent {
  id: number;
  title: string;
  start_date: string;
  end_date: string | null;
  time: string | null;
  location: string | null;
  locality: string | null;
  category: string | null;
  price: string | null;
  source: string;
  source_url: string;
  source_confidence: string | null;
  description: string | null;
}

const RUN_STATUS_STYLES: Record<string, string> = {
  ok: 'bg-green-100 text-green-800',
  partial: 'bg-yellow-100 text-yellow-800',
  error: 'bg-red-100 text-red-800',
  running: 'bg-blue-100 text-blue-800',
};

/**
 * Los motivos de descarte se guardan en la base como slug. Acá se traducen
 * para que el equipo de Cultura entienda por qué una nota no entró sin tener
 * que abrir el código.
 */
const REJECTION_LABELS: Record<string, string> = {
  'no-es-evento': 'No es un evento al que se pueda ir',
  'fuera-del-departamento': 'Fuera del departamento',
  'sin-fecha-futura': 'Sin fecha futura reconocible',
  'fecha-implausible': 'Fecha implausible',
  'sin-localidad': 'Sin localidad reconocible',
  duplicado: 'Ya estaba cargado',
};

function formatDate(value: string | null, pattern = "d 'de' MMMM yyyy, HH:mm"): string {
  if (!value) return '—';
  return format(new Date(value), pattern, { locale: es });
}

export default function EventScraperPage() {
  const queryClient = useQueryClient();

  const { data: status } = useQuery<ScraperStatus>({
    queryKey: ['scraper-status'],
    queryFn: async () => (await api.get('/admin/events/scraper/status')).data,
    // Mientras hay una corrida en curso conviene refrescar solo, que puede
    // tardar un par de minutos en recorrer las tres fuentes.
    refetchInterval: (query) => (query.state.data?.running ? 3000 : false),
  });

  const { data: sources = [] } = useQuery<ScraperSource[]>({
    queryKey: ['scraper-sources'],
    queryFn: async () => (await api.get('/admin/events/scraper/sources')).data,
  });

  const { data: runs = [] } = useQuery<ScraperRun[]>({
    queryKey: ['scraper-runs'],
    queryFn: async () => (await api.get('/admin/events/scraper/runs?limit=10')).data,
  });

  const { data: pending = [] } = useQuery<PendingEvent[]>({
    queryKey: ['scraper-pending'],
    queryFn: async () => (await api.get('/admin/events/scraper/pending')).data,
  });

  function refreshAll() {
    ['scraper-status', 'scraper-sources', 'scraper-runs', 'scraper-pending', 'events'].forEach(
      (key) => queryClient.invalidateQueries({ queryKey: [key] }),
    );
  }

  const runNow = useMutation({
    mutationFn: async () => (await api.post('/admin/events/scraper/run')).data,
    onSuccess: (result) => {
      toast.success(
        `Listo: ${result.created} eventos nuevos y ${result.updated} actualizados sobre ${result.found} notas.`,
      );
      refreshAll();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message ?? 'No se pudo ejecutar la búsqueda');
    },
  });

  const toggleSource = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) =>
      (await api.patch(`/admin/events/scraper/sources/${key}`, { enabled })).data,
    onSuccess: (source) => {
      toast.success(`${source.name}: ${source.enabled ? 'activada' : 'desactivada'}`);
      queryClient.invalidateQueries({ queryKey: ['scraper-sources'] });
    },
    onError: () => toast.error('No se pudo cambiar la fuente'),
  });

  const review = useMutation({
    mutationFn: async ({ id, decision }: { id: number; decision: 'approve' | 'reject' }) =>
      (await api.post(`/admin/events/scraper/pending/${id}/${decision}`)).data,
    onSuccess: (_result, variables) => {
      toast.success(variables.decision === 'approve' ? 'Evento publicado' : 'Evento descartado');
      refreshAll();
    },
    onError: () => toast.error('No se pudo guardar la decisión'),
  });

  const running = status?.running || runNow.isPending;

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Búsqueda automática de eventos</h1>
          <p className="text-sm text-gray-600 mt-1">
            Se ejecuta sola todos los días a las {status?.scheduledHour ?? 5}:00 y carga en la agenda
            los eventos de hoy en adelante que encuentra en las fuentes públicas.
          </p>
        </div>

        <button
          onClick={() => runNow.mutate()}
          disabled={running}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {running ? 'Buscando…' : 'Buscar ahora'}
        </button>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Eventos próximos publicados" value={status?.upcoming ?? 0} />
        <StatCard
          label="Esperando revisión"
          value={status?.pending ?? 0}
          highlight={(status?.pending ?? 0) > 0}
        />
        <StatCard label="Cargados automáticamente" value={status?.scraped ?? 0} />
        <div className="bg-white shadow rounded-lg p-4">
          <p className="text-sm text-gray-500">Última corrida exitosa</p>
          <p className="mt-1 text-sm font-medium text-gray-900 flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-gray-400" />
            {formatDate(status?.last_success ?? null)}
          </p>
        </div>
      </div>

      {/* Fuentes */}
      <section className="bg-white shadow rounded-lg mb-6">
        <h2 className="px-6 py-4 text-lg font-semibold text-gray-900 border-b border-gray-200">
          Fuentes
        </h2>
        <ul className="divide-y divide-gray-200">
          {sources.map((source) => (
            <li key={source.key} className="px-6 py-4 flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[240px]">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{source.name}</span>
                  {source.last_status === 'error' && (
                    <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded">
                      <AlertTriangle className="h-3 w-3" />
                      falló
                    </span>
                  )}
                </div>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-gray-500 hover:text-primary-600 inline-flex items-center gap-1"
                >
                  {source.url}
                  <ExternalLink className="h-3 w-3" />
                </a>
                {source.last_error && (
                  <p className="text-xs text-red-600 mt-1">{source.last_error}</p>
                )}
              </div>

              <div className="text-sm text-gray-600 text-right">
                <p>
                  {source.upcoming_events} próximos · {source.total_events} en total
                </p>
                <p className="text-xs text-gray-400">
                  Última consulta: {formatDate(source.last_run_at, "d MMM, HH:mm")}
                </p>
              </div>

              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={source.enabled}
                  onChange={(e) =>
                    toggleSource.mutate({ key: source.key, enabled: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700">Activa</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      {/* Cola de revisión */}
      <section className="bg-white shadow rounded-lg mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            Esperando revisión ({pending.length})
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Eventos cuya fecha el sistema no pudo determinar con seguridad. No se muestran en la app
            hasta que alguien los apruebe.
          </p>
        </div>

        {pending.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-gray-500">
            No hay nada pendiente de revisión.
          </p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {pending.map((event) => (
              <li key={event.id} className="px-6 py-4 flex flex-wrap items-start gap-4">
                <div className="flex-1 min-w-[280px]">
                  <p className="font-medium text-gray-900">{event.title}</p>
                  <p className="text-sm text-gray-600 mt-1">
                    {formatDate(event.start_date, "EEEE d 'de' MMMM yyyy")}
                    {event.time && ` · ${event.time}`}
                    {event.location && ` · ${event.location}`}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Confianza {event.source_confidence ?? '—'} ·{' '}
                    <a
                      href={event.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-primary-600 inline-flex items-center gap-1"
                    >
                      ver la nota original
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => review.mutate({ id: event.id, decision: 'approve' })}
                    disabled={review.isPending}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60"
                  >
                    <Check className="h-4 w-4" />
                    Publicar
                  </button>
                  <button
                    onClick={() => review.mutate({ id: event.id, decision: 'reject' })}
                    disabled={review.isPending}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-60"
                  >
                    <X className="h-4 w-4" />
                    Descartar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Historial */}
      <section className="bg-white shadow rounded-lg">
        <h2 className="px-6 py-4 text-lg font-semibold text-gray-900 border-b border-gray-200">
          Últimas corridas
        </h2>

        {runs.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-gray-500">Todavía no corrió ninguna vez.</p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {runs.map((run) => (
              <li key={run.id} className="px-6 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`px-2 py-0.5 text-xs font-medium rounded ${
                      RUN_STATUS_STYLES[run.status] ?? 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {run.status}
                  </span>
                  <span className="text-sm text-gray-900">{formatDate(run.started_at)}</span>
                  <span className="text-sm text-gray-500">
                    {run.triggered_by === 'schedule' ? 'automática' : run.triggered_by}
                  </span>
                  <span className="text-sm text-gray-600 ml-auto">
                    {run.items_found} notas · {run.items_created} nuevos · {run.items_updated}{' '}
                    actualizados · {run.items_skipped} descartados
                  </span>
                </div>

                {run.error && <p className="text-sm text-red-600 mt-2">{run.error}</p>}

                {run.detail?.length > 0 && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {run.detail.map((detail) => (
                      <div key={detail.source} className="bg-gray-50 rounded p-3 text-xs">
                        <p className="font-medium text-gray-800">{detail.name}</p>
                        <p className="text-gray-600 mt-1">
                          {detail.found} notas · {detail.created} nuevos · {detail.updated}{' '}
                          actualizados
                        </p>
                        {detail.error && <p className="text-red-600 mt-1">{detail.error}</p>}
                        {detail.rejections && Object.keys(detail.rejections).length > 0 && (
                          <ul className="text-gray-500 mt-2 space-y-0.5">
                            {Object.entries(detail.rejections).map(([reason, count]) => (
                              <li key={reason}>
                                {count} · {REJECTION_LABELS[reason] ?? reason}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="bg-white shadow rounded-lg p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${highlight ? 'text-yellow-600' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  );
}
