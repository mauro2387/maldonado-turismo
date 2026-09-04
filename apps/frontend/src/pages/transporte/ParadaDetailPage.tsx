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
import { transportService, BusStop } from '@services/transportService';
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
        ) : (
          <EmptyState
            icon={Bus}
            title="Ningún ómnibus en camino"
            description="Cuando una unidad de alguna de estas líneas se acerque, va a aparecer acá con los minutos que le faltan."
          />
        )}
      </section>

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
