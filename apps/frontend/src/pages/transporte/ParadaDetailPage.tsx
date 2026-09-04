import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Bus,
  MapPin,
  QrCode,
  Share2,
  Map as MapIcon,
  Accessibility,
  Home as HomeIcon,
  Lightbulb,
  Armchair,
} from 'lucide-react';
import { transportService, BusStop, StopScheduleToday } from '@services/transportService';
import { useStopArrivals } from '@hooks/useDepartures';
import { useGeolocation } from '@hooks/useGeolocation';
import { ArrivalRow } from '@components/transporte/ArrivalRow';
import { LiveIndicator } from '@components/ui/LiveIndicator';
import { EmptyState, ErrorState, SkeletonList, InlineNotice } from '@components/ui/States';
import { formatStopName } from '@lib/stopNames';
import { distanceMeters, formatDistance, walkingMinutes } from '@lib/geo';

/**
 * Ficha de parada.
 *
 * Lo primero y más grande son los próximos ómnibus, que es a lo que viene
 * quien abre esta pantalla —muchas veces parado en la vereda, escaneando el QR
 * del refugio—. Los servicios de la parada y las acciones van después.
 */

const SERVICES = [
  { key: 'has_shelter' as const, icon: HomeIcon, label: 'Refugio' },
  { key: 'has_bench' as const, icon: Armchair, label: 'Asiento' },
  { key: 'has_lighting' as const, icon: Lightbulb, label: 'Iluminación' },
  { key: 'accessibility' as const, icon: Accessibility, label: 'Accesible' },
];

/** Los identificadores del feed, escritos como se conoce a cada empresa. */
const OPERATOR_LABELS: Record<string, string> = {
  codesa: 'CODESA',
  'maldonado-turismo': 'Maldonado Turismo',
  micro: 'Micro',
};

function operatorNames(operators: string[]): string {
  return operators.map((operator) => OPERATOR_LABELS[operator] ?? operator).join(' · ');
}

export default function ParadaDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { coords, granted } = useGeolocation();

  const [stop, setStop] = useState<BusStop | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareNotice, setShareNotice] = useState<string | null>(null);

  const { arrivals, loading: loadingArrivals } = useStopArrivals(id);

  /**
   * El horario publicado de esta parada.
   *
   * Es la otra mitad de la respuesta: las llegadas dicen qué está pasando
   * ahora; esto, qué debería pasar. Sin esto, a las 23:40 la pantalla decía
   * "ningún ómnibus en camino" tanto si faltaban veinte minutos como si el
   * servicio se había terminado a las 22.
   */
  const [schedule, setSchedule] = useState<StopScheduleToday | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    transportService
      .getStopSchedule(id)
      .then((data) => {
        if (!cancelled) setSchedule(data);
      })
      .catch(() => {
        if (!cancelled) setSchedule(null);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    setLoading(true);

    transportService
      .getStopById(id)
      .then((data) => {
        if (!cancelled) {
          setStop(data);
          setError(null);
        }
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || 'No se pudo cargar la parada');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleShare = async () => {
    const url = window.location.href;

    if (navigator.share) {
      try {
        await navigator.share({ title: `Parada ${formatStopName(stop?.name)}`, url });
        return;
      } catch {
        // El usuario canceló el diálogo: no es un error que haya que avisar.
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setShareNotice('Enlace copiado');
      setTimeout(() => setShareNotice(null), 2500);
    } catch {
      setShareNotice('No pudimos copiar el enlace');
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-6">
        <div className="skeleton h-7 w-2/3" />
        <div className="skeleton mt-2 h-4 w-1/3" />
        <SkeletonList rows={2} className="mt-6" />
      </div>
    );
  }

  if (error || !stop) {
    return (
      <div className="mx-auto max-w-2xl px-4 pt-6">
        <ErrorState
          title="No encontramos esta parada"
          message={error ?? 'Puede que el código del QR ya no esté en servicio.'}
          onRetry={() => navigate('/moverse')}
        />
      </div>
    );
  }

  const distance = granted
    ? distanceMeters(coords.lat, coords.lng, Number(stop.lat), Number(stop.lng))
    : null;

  const services = SERVICES.filter((service) => stop[service.key]);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-8 pt-4 md:px-6 md:pt-8">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-400"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
        Volver
      </button>

      <header>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-display text-ink-900">{formatStopName(stop.name)}</h1>
          {stop.code && (
            <span className="mt-1 flex-none rounded-chip bg-sand-100 px-2 py-1 text-xs font-bold text-ink-600">
              {stop.code}
            </span>
          )}
        </div>
        <p className="mt-1 flex items-center gap-1.5 text-data text-ink-400">
          <MapPin className="h-3.5 w-3.5" strokeWidth={1.9} />
          {/* Las paradas del feed no traen zona: en su lugar va quién pasa por
              ahí, que es el dato que sirve para saber si es la parada buscada. */}
          {stop.zone ?? (stop.operators?.length ? operatorNames(stop.operators) : 'Parada')}
          {distance !== null &&
            ` · a ${formatDistance(distance)} · ${walkingMinutes(distance)} min caminando`}
        </p>
      </header>

      {/* ---------- Parada dada de baja ----------
          Los identificadores de las paradas de relleno que tenía la base
          pueden estar en un QR impreso o en un enlace compartido. La ficha se
          sigue sirviendo, pero diciendo lo que pasó en vez de mostrar una
          parada sin ómnibus y dejar a alguien esperando. */}
      {stop.is_active === false && (
        <div className="mt-4">
          <InlineNotice
            message="Esta parada ya no está en servicio. El listado de paradas se rehízo con el catálogo de las empresas de ómnibus."
            action={{ label: 'Ver paradas cerca', onClick: () => navigate('/moverse') }}
          />
        </div>
      )}

      {/* ---------- Qué tan firme es la ubicación ----------
          La coordenada de una parada del feed es una estimación, y `accuracy_m`
          dice dentro de qué radio está el cartel de verdad. Con más de una
          cuadra de error, mandar a alguien a "esperá acá" es mandarlo a un
          punto donde no hay ningún cartel. Decirlo es la contraparte del
          marcador punteado del mapa: la parada existe y el ómnibus para, lo que
          no sabemos con precisión es dónde está el cartel.
          El corte son 60 m porque una cuadra de Maldonado son 80-100. */}
      {typeof stop.accuracy_m === 'number' && stop.accuracy_m > 60 && (
        <div className="mt-4 rounded-card bg-sand-100 px-3 py-2.5 text-data text-ink-500">
          El ómnibus para acá, pero el cartel todavía no está ubicado con
          precisión: puede estar hasta {Math.round(stop.accuracy_m)} m de este
          punto. Mirá alrededor cuando llegues.
        </div>
      )}

      {/* ---------- Próximos ómnibus ---------- */}
      <section className="mt-6" aria-labelledby="proximos">
        <div className="flex items-center justify-between">
          <h2 id="proximos" className="section-label">
            Próximos ómnibus
          </h2>
          {arrivals.length > 0 && <LiveIndicator fixAgeSeconds={arrivals[0].fix_age_seconds} />}
        </div>

        {loadingArrivals ? (
          <SkeletonList rows={2} className="mt-3" />
        ) : arrivals.length > 0 ? (
          <div className="card mt-3 flex flex-col gap-3.5">
            {arrivals.map((arrival) => (
              <ArrivalRow key={arrival.vehicle_id} arrival={arrival} />
            ))}
          </div>
        ) : schedule?.finished ? (
          /* Se terminó el servicio por hoy. Es la respuesta que faltaba: hasta
             ahora esto decía "ningún ómnibus en camino", que no distingue
             *falta un rato* de *ya no hay más*. En San Carlos esa diferencia
             es un taxi de treinta kilómetros. */
          <EmptyState
            icon={Bus}
            title="Hoy ya no pasa más por acá"
            description={`El último salió a las ${schedule.last_at}. Mirá los horarios de mañana o buscá otra parada.`}
          />
        ) : schedule?.lines.length ? (
          /* No hay ninguno reportando, pero el papel dice que viene. Se muestra
             el horario y se dice de dónde sale, que no es lo mismo que el GPS. */
          <EmptyState
            icon={Bus}
            title="Ninguno reportando ahora"
            description={`Por horario, el próximo es la línea ${schedule.lines[0].line_label} a las ${schedule.lines[0].next_at}.`}
          />
        ) : (
          <EmptyState
            icon={Bus}
            title="Ningún ómnibus en camino"
            description="Cuando una unidad de alguna de estas líneas se acerque, va a aparecer acá con los minutos que le faltan."
          />
        )}
      </section>

      {/* ---------- Lo que queda hoy, por horario ----------
          Contesta las dos preguntas de la noche: a qué hora pasa el último, y
          si el que uno espera ya pasó. Es el papel, no el GPS: dice lo que
          debería pasar, y por eso sigue sirviendo cuando el feed se cae. */}
      {schedule?.available && schedule.lines.length > 0 && (
        <section className="mt-6" aria-labelledby="horario-hoy">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="horario-hoy" className="section-label">
              Hoy por horario
            </h2>
            {schedule.last_at && (
              <span className="text-xs text-ink-400">
                último de la parada {schedule.last_at}
              </span>
            )}
          </div>

          <div className="card mt-3 flex flex-col gap-3">
            {schedule.lines.map((linea) => (
              <div
                key={`${linea.operator}-${linea.line_label}-${linea.headsign ?? ''}`}
                className="flex items-baseline gap-2.5"
              >
                <span className="flex h-6 min-w-6 flex-none items-center justify-center rounded-chip bg-sand-100 px-1.5 text-xs font-extrabold text-ink-900">
                  {linea.line_label}
                </span>

                <p className="min-w-0 flex-1 text-data">
                  {linea.finished ? (
                    <span className="text-ink-400">
                      Hoy ya no pasa. El último fue a las{' '}
                      <span className="font-bold text-ink-600">{linea.last_at}</span>.
                    </span>
                  ) : (
                    <>
                      <span className="font-bold text-ink-900">
                        {linea.next_at}
                        {linea.next_in_minutes !== null && linea.next_in_minutes <= 60
                          ? ` · en ${linea.next_in_minutes} min`
                          : ''}
                      </span>
                      {/* Que sea el último del día cambia la decisión: no es
                          "esperá al que viene", es "si lo perdés, no hay otro". */}
                      {linea.is_last ? (
                        <span className="ml-1.5 font-bold text-warn">es el último</span>
                      ) : (
                        <span className="text-ink-400"> · último {linea.last_at}</span>
                      )}
                      {linea.previous_ago_minutes !== null && (
                        <span className="block text-ink-400">
                          El anterior pasó hace {linea.previous_ago_minutes} min.
                        </span>
                      )}
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-2 px-1 text-xs text-ink-400">
            Horario publicado por las empresas. Los minutos reales dependen del
            tránsito.
          </p>
        </section>
      )}

      {/* ---------- Servicios ---------- */}
      {services.length > 0 && (
        <section className="mt-6" aria-labelledby="servicios">
          <h2 id="servicios" className="section-label">
            La parada tiene
          </h2>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {services.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-chip bg-sand-100 px-2.5 py-1.5 text-xs font-semibold text-ink-600"
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.9} />
                {label}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ---------- Acciones ---------- */}
      <div className="mt-7 flex flex-col gap-2">
        <Link to={`/mapa?stop=${stop.id}`} className="btn btn-primary w-full">
          <MapIcon className="h-4 w-4" strokeWidth={2} />
          Ver en el mapa
        </Link>

        <div className="flex gap-2">
          <button onClick={handleShare} className="btn btn-secondary flex-1">
            <Share2 className="h-4 w-4" strokeWidth={2} />
            Compartir
          </button>
          <Link to={`/transporte/paradas/${stop.id}/qr`} className="btn btn-secondary flex-1">
            <QrCode className="h-4 w-4" strokeWidth={2} />
            Código QR
          </Link>
        </div>
      </div>

      {shareNotice && (
        <div className="mt-3">
          <InlineNotice tone="info" message={shareNotice} />
        </div>
      )}
    </div>
  );
}
