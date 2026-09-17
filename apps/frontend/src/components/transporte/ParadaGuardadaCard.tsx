import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useStopArrivals } from '@hooks/useDepartures';
import { Arrival } from '@services/transportService';
import { ArrivalRow } from '@components/transporte/ArrivalRow';
import { LiveIndicator } from '@components/ui/LiveIndicator';
import { Estrella } from '@components/ui/Estrella';
import { ParadaGuardada, useLoTuyoStore } from '@store/loTuyoStore';
import { formatDistance, walkingMinutes } from '@lib/geo';

/**
 * Una parada guardada, con sus próximos ómnibus.
 *
 * Es la tarjeta de "los que te pasan ahora" pero para una parada que la
 * persona eligió y no para la que le quedó cerca: la de la esquina de casa,
 * la de la puerta del trabajo. La diferencia importa a la mañana, cuando uno
 * mira el teléfono desde la cama y todavía no está cerca de ninguna parada:
 * "los que te pasan ahora" no puede contestar y esta sí.
 *
 * Cada tarjeta pide sus llegadas por su cuenta, con el mismo hook que la
 * ficha de la parada. Son un pedido cada quince segundos por parada guardada;
 * con las dos o tres que guarda cualquiera es nada.
 */

/** Cuántas llegadas se muestran antes de mandar a la ficha, que las tiene todas. */
const MAX_LLEGADAS = 3;

export function ParadaGuardadaCard({
  parada,
  distanceM,
}: {
  parada: ParadaGuardada;
  /** Cuánto hay hasta ahí desde donde está la persona, si se sabe. */
  distanceM: number | null;
}) {
  const { arrivals, loading } = useStopArrivals(parada.id);
  const toggleParada = useLoTuyoStore((estado) => estado.toggleParada);

  const busLink = (arrival: Arrival) =>
    `/moverse/bondis?coche=${encodeURIComponent(arrival.vehicle_id)}` +
    `&linea=${encodeURIComponent(arrival.line_code)}`;

  return (
    <div className="card py-3">
      <div className="flex items-center gap-1 border-b border-sand-200 pb-2.5 text-xs">
        <Link to={`/transporte/paradas/${parada.id}`} className="flex min-w-0 flex-1 items-center gap-1">
          <span className="min-w-0 flex-1 truncate">
            <span className="font-bold text-ink-900">{parada.name}</span>
            {distanceM !== null && (
              <span className="text-ink-400">
                {' '}
                · a {formatDistance(distanceM)}, {walkingMinutes(distanceM)} min caminando
              </span>
            )}
          </span>
          <ChevronRight className="h-3 w-3 flex-none text-ink-300" strokeWidth={2.5} />
        </Link>
        {arrivals.length > 0 && (
          <LiveIndicator fixAgeSeconds={arrivals[0].fix_age_seconds} showAge={false} />
        )}
        <Estrella
          activa
          que="esta parada"
          onToggle={() => toggleParada(parada)}
          className="-my-2 -mr-2"
        />
      </div>

      {loading ? (
        <div className="mt-2.5 flex flex-col gap-2" aria-hidden="true">
          <div className="skeleton h-4 w-3/5" />
          <div className="skeleton h-4 w-2/5" />
        </div>
      ) : arrivals.length > 0 ? (
        <div className="flex flex-col divide-y divide-sand-200">
          {arrivals.slice(0, MAX_LLEGADAS).map((arrival) => (
            <Link
              key={arrival.vehicle_id}
              to={busLink(arrival)}
              className="block py-2.5 last:pb-0"
            >
              <ArrivalRow arrival={arrival} />
            </Link>
          ))}
        </div>
      ) : (
        // No es "no viene ninguno": es que ninguno está reportando cerca. La
        // ficha de la parada tiene el horario publicado para lo demás.
        <p className="mt-2.5 text-xs text-ink-400">
          Ningún ómnibus reportando en camino. En la ficha está el horario de hoy.
        </p>
      )}
    </div>
  );
}

export default ParadaGuardadaCard;
