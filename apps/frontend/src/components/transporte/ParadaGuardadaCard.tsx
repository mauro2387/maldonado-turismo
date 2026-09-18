import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useStopArrivals } from '@hooks/useDepartures';
import { Arrival, StopScheduleToday, transportService } from '@services/transportService';
import { ArrivalRow } from '@components/transporte/ArrivalRow';
import { LiveIndicator } from '@components/ui/LiveIndicator';
import { Estrella } from '@components/ui/Estrella';
import { ParadaGuardada, useLoTuyoStore } from '@store/loTuyoStore';
import { usePreferenciasStore } from '@store/preferenciasStore';
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
 *
 * Cuando no viene ninguno se mira el horario publicado, porque "ninguno
 * reportando" no distingue *falta un rato* de *ya no hay más*, y a la noche
 * esa diferencia es la que decide si ir a la parada. Se pide una vez y se
 * vuelve a pedir cada cinco minutos: el papel no cambia, lo que cambia es la
 * hora.
 */

/** Cada cuánto se vuelve a mirar el horario mientras no viene ninguno. */
const HORARIO_CADA_MS = 5 * 60_000;

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
  const { arrivals: todas, loading, error } = useStopArrivals(parada.id);
  const toggleParada = useLoTuyoStore((estado) => estado.toggleParada);
  const soloAccesibles = usePreferenciasStore((estado) => estado.soloAccesibles);

  /** Con "sólo con rampa", las que no la tienen o no se sabe quedan afuera. */
  const arrivals = soloAccesibles ? todas.filter((arrival) => arrival.accessible === true) : todas;
  const ocultas = todas.length - arrivals.length;

  const [schedule, setSchedule] = useState<StopScheduleToday | null>(null);
  const sinLlegadas = !loading && arrivals.length === 0;

  useEffect(() => {
    if (!sinLlegadas) return;
    let cancelled = false;

    const pedir = () =>
      transportService
        .getStopSchedule(parada.id)
        .then((data) => {
          if (!cancelled) setSchedule(data);
        })
        .catch(() => {
          if (!cancelled) setSchedule(null);
        });

    pedir();
    const timer = setInterval(pedir, HORARIO_CADA_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [parada.id, sinLlegadas]);

  /** La próxima por horario: la primera línea que todavía no terminó por hoy. */
  const proxima = schedule?.lines.find((linea) => !linea.finished && linea.next_at) ?? null;

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
      ) : error && arrivals.length === 0 ? (
        // No es "no viene ninguno": no se pudo preguntar. Decir lo otro con
        // la red caída es convertir ignorancia en dato.
        <p className="mt-2.5 text-xs text-warn">
          No pudimos traer las llegadas. Seguimos intentando.
        </p>
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
      ) : ocultas > 0 ? (
        // Vienen, pero ninguno con rampa. No es lo mismo que "no viene
        // ninguno" y no se mezcla con el horario.
        <p className="mt-2.5 text-xs text-ink-400">
          {ocultas === 1 ? 'Viene uno sin rampa' : `Vienen ${ocultas} sin rampa`}, ninguno con.
        </p>
      ) : schedule?.finished ? (
        // Se terminó por hoy. Es lo que hay que saber antes de salir a la
        // parada, y no se sabe con la lista vacía.
        <p className="mt-2.5 text-xs text-ink-500">
          <span className="font-bold text-ink-900">Hoy ya no pasa más por acá.</span> El último
          salió a las {schedule.last_at}.
        </p>
      ) : proxima ? (
        // Ninguno reportando, pero el papel dice que viene. Se dice de dónde
        // sale el dato: no es el GPS.
        <p className="mt-2.5 text-xs text-ink-500">
          Ninguno reportando. Por horario, el próximo es la{' '}
          <span className="font-bold text-ink-900">{proxima.line_label}</span> a las{' '}
          <span className="font-bold text-ink-900">{proxima.next_at}</span>
          {proxima.is_last ? ', y es el último' : ''}.
        </p>
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
