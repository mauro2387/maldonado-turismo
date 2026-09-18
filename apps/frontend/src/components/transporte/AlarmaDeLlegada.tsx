import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, Radar, X } from 'lucide-react';
import { transportService, Arrival } from '@services/transportService';
import { arrivalLine } from '@components/transporte/ArrivalRow';
import { useAlarmaStore } from '@store/alarmaStore';
import { useWakeLock } from '@hooks/useWakeLock';
import { avisar } from '@lib/avisos';

/**
 * La alarma de llegada, viva.
 *
 * Mientras hay una puesta, se piden las llegadas de esa parada cada quince
 * segundos -lo mismo que refresca cualquier lista de la app- y se mira si
 * algún coche de esa línea está a `umbralMin` o menos. Cuando pasa, suena
 * el aviso insistente y el banner se pone en coral; hasta entonces el banner
 * dice cuánto falta, o que ninguno está reportando todavía.
 *
 * Está en el layout por lo mismo que el recordatorio: la persona pone la
 * alarma en la ficha de la parada y se va a hacer otra cosa.
 *
 * Cuándo se apaga sola: cuando el coche que hizo sonar la alarma ya pasó
 * (ninguno de la línea a menos del umbral y ya se avisó), o cuando llevó
 * más de cuarenta y cinco minutos sin ver ningún coche de la línea: a esa
 * altura la línea no está saliendo, y un banner que dice "ninguno todavía"
 * durante una hora es un banner que nadie mira.
 */

const REVISION_MS = 15_000;

/** Cuánto se espera sin ver ningún coche de la línea antes de rendirse. */
const SIN_COCHES_MS = 45 * 60_000;

/** Desde cuántos minutos se mantiene la pantalla prendida. */
const PANTALLA_PRENDIDA_MIN = 12;

export function AlarmaDeLlegada() {
  const pendiente = useAlarmaStore((estado) => estado.pendiente);
  const marcarAvisada = useAlarmaStore((estado) => estado.marcarAvisada);
  const cancelar = useAlarmaStore((estado) => estado.cancelar);

  /** El coche más cercano de la línea, según la última revisión. */
  const [proximo, setProximo] = useState<Arrival | null>(null);
  const [sinRed, setSinRed] = useState(false);
  /**
   * Cuándo fue la última vez que se vio un coche de la línea. Es un ref y
   * no un estado porque lo lee el poll y no la pantalla: como estado, cada
   * revisión reiniciaría el efecto y con él el temporizador.
   */
  const ultimaVez = useRef<number>(Date.now());

  useEffect(() => {
    if (!pendiente) return;
    let cancelado = false;
    setProximo(null);
    ultimaVez.current = Date.now();

    const revisar = async () => {
      try {
        const arrivals = await transportService.getStopArrivals(pendiente.stopId);
        if (cancelado) return;
        setSinRed(false);

        const deLaLinea = arrivals
          .filter((arrival) => arrivalLine(arrival) === pendiente.linea)
          .sort((a, b) => a.eta_minutes - b.eta_minutes);
        const cercano = deLaLinea[0] ?? null;
        setProximo(cercano);

        const ahora = Date.now();
        if (cercano) ultimaVez.current = ahora;

        if (cercano && cercano.eta_minutes <= pendiente.umbralMin && !pendiente.avisada) {
          marcarAvisada();
          avisar({
            titulo: `La ${pendiente.linea} está llegando`,
            cuerpo:
              cercano.eta_minutes <= 0
                ? `Ya está en ${pendiente.stopName}`
                : `A ${cercano.eta_minutes} min de ${pendiente.stopName}`,
            insistente: true,
          });
          return;
        }

        // Ya sonó y el que la hizo sonar pasó: no hay nada más que avisar.
        if (pendiente.avisada && (!cercano || cercano.eta_minutes > pendiente.umbralMin)) {
          cancelar();
          return;
        }

        if (!cercano && ahora - ultimaVez.current > SIN_COCHES_MS) {
          cancelar();
        }
      } catch {
        if (!cancelado) setSinRed(true);
      }
    };

    void revisar();
    const timer = setInterval(() => void revisar(), REVISION_MS);
    const alVolver = () => {
      if (document.visibilityState === 'visible') void revisar();
    };
    document.addEventListener('visibilitychange', alVolver);

    return () => {
      cancelado = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [pendiente, marcarAvisada, cancelar]);

  useWakeLock(
    pendiente !== null && !pendiente.avisada && proximo !== null && proximo.eta_minutes <= PANTALLA_PRENDIDA_MIN,
  );

  if (!pendiente) return null;

  const sono = pendiente.avisada;

  return (
    <div
      role="status"
      className={`flex items-center gap-3 rounded-card px-3.5 py-3 shadow-float ${
        sono ? 'bg-coral-500 text-white' : 'bg-ink-900 text-white'
      }`}
    >
      {sono ? (
        <BellRing className="h-5 w-5 flex-none animate-pulse" strokeWidth={2.25} />
      ) : (
        <Radar className="h-5 w-5 flex-none text-ink-200" strokeWidth={2} />
      )}

      <Link to={`/transporte/paradas/${pendiente.stopId}`} className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">
          {sono
            ? proximo && proximo.eta_minutes > 0
              ? `¡La ${pendiente.linea} llega en ${proximo.eta_minutes} min!`
              : `¡La ${pendiente.linea} está llegando!`
            : proximo
              ? `La ${pendiente.linea} llega en ${proximo.eta_minutes} min`
              : sinRed
                ? `No pudimos mirar si viene la ${pendiente.linea}`
                : `Ninguna ${pendiente.linea} reportando todavía`}
        </span>
        <span className={`block truncate text-xs ${sono ? 'text-white/85' : 'text-ink-300'}`}>
          {pendiente.stopName}
          {!sono ? ` · te avisamos a ${pendiente.umbralMin} min · dejá la app abierta` : ''}
        </span>
      </Link>

      <button
        onClick={cancelar}
        aria-label={sono ? 'Listo' : 'Cancelar la alarma'}
        className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white/10 active:bg-white/20"
      >
        <X className="h-4 w-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}

export default AlarmaDeLlegada;
