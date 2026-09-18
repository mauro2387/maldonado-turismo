import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BellRing, X } from 'lucide-react';
import { PREVIO_MS, useRecordatorioStore } from '@store/recordatorioStore';
import { useWakeLock } from '@hooks/useWakeLock';
import { avisar } from '@lib/avisos';
import { horaDeReloj } from '@lib/hora';

/**
 * El recordatorio de salida, vivo.
 *
 * Está montado en el layout y no en el planificador, porque el aviso tiene
 * que sonar aunque la persona se haya ido a otra pantalla: es lo primero que
 * hace cualquiera después de elegir un viaje para dentro de veinte minutos.
 * Mientras hay uno pendiente se ve un banner abajo, encima de la barra, con
 * la hora y a qué línea; cuando llega la hora, el banner se pone en coral y
 * suena el aviso.
 *
 * ## Dos avisos, no uno
 *
 * "En cinco minutos salís", suave, y "salí ahora", insistente. El primero es
 * para terminar lo que se está haciendo; el segundo, para irse. Son los
 * mismos dos golpes que da la pantalla de a bordo -preparate y bajate- y se
 * distinguen igual, sin sacar el teléfono del bolsillo.
 *
 * ## Por qué se mira el reloj cada diez segundos y no con un `setTimeout`
 *
 * Un temporizador de veinte minutos no sobrevive: con la app atrás el
 * navegador lo estira, y si la pestaña se descarga se pierde. Mirar la hora
 * seguido y comparar es lo único que aguanta que la app se vaya y vuelva: al
 * volver al frente se revisa en el acto (`visibilitychange`), y si la hora ya
 * pasó se avisa igual -"te tenías que haber ido hace 3 min" todavía sirve-.
 *
 * ## El wake lock, sólo al final
 *
 * Con la pantalla apagada no hay temporizador que corra ni vibración que
 * salga, así que en los últimos quince minutos se pide mantenerla prendida,
 * igual que a bordo. No antes: un recordatorio para dentro de dos horas con
 * la pantalla prendida dos horas es la batería del teléfono, y la persona no
 * pidió eso.
 */

/** Cada cuánto se mira el reloj. */
const REVISION_MS = 10_000;

/** Desde cuándo antes de salir se mantiene la pantalla prendida. */
const PANTALLA_PRENDIDA_MS = 15 * 60_000;

/**
 * Cuánto después de la hora de salir se sigue mostrando el banner. Es el
 * mismo plazo con el que el store descarta uno viejo al cargar.
 */
const GRACIA_MS = 30 * 60_000;

export function RecordatorioDeSalida() {
  const pendiente = useRecordatorioStore((estado) => estado.pendiente);
  const marcarAvisado = useRecordatorioStore((estado) => estado.marcarAvisado);
  const cancelar = useRecordatorioStore((estado) => estado.cancelar);

  /** El reloj de la pantalla, para la cuenta regresiva. */
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    if (!pendiente) return;

    const revisar = () => {
      const t = Date.now();
      setAhora(t);

      if (t > pendiente.salirA + GRACIA_MS) {
        cancelar();
        return;
      }

      if (t >= pendiente.salirA && !pendiente.avisado.salida) {
        marcarAvisado('salida');
        avisar({
          titulo: pendiente.linea ? `Salí ahora a tomar la ${pendiente.linea}` : 'Salí ahora',
          cuerpo:
            pendiente.pasaA !== null
              ? `Pasa ${horaDeReloj(pendiente.pasaA)} por ${pendiente.parada}`
              : `Hacia ${pendiente.destino}`,
          insistente: true,
        });
        return;
      }

      if (t >= pendiente.salirA - PREVIO_MS && !pendiente.avisado.previo) {
        marcarAvisado('previo');
        avisar({
          titulo: 'En 5 minutos tenés que salir',
          cuerpo: pendiente.linea
            ? `Para tomar la ${pendiente.linea} en ${pendiente.parada}`
            : `Para llegar a ${pendiente.destino}`,
        });
      }
    };

    revisar();
    const timer = setInterval(revisar, REVISION_MS);
    const alVolver = () => {
      if (document.visibilityState === 'visible') revisar();
    };
    document.addEventListener('visibilitychange', alVolver);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [pendiente, marcarAvisado, cancelar]);

  const faltaMs = pendiente ? pendiente.salirA - ahora : Infinity;
  useWakeLock(pendiente !== null && !pendiente.avisado.salida && faltaMs <= PANTALLA_PRENDIDA_MS);

  if (!pendiente) return null;

  const esHora = ahora >= pendiente.salirA;
  const faltaMin = Math.max(0, Math.round(faltaMs / 60_000));
  const pasadoMin = Math.round(-faltaMs / 60_000);

  // La posición la pone `AvisosFlotantes`, que apila este banner con el de
  // la alarma de llegada; acá va sólo la tarjeta.
  return (
    <div
      role="status"
      className={`flex items-center gap-3 rounded-card px-3.5 py-3 shadow-float ${
        esHora ? 'bg-coral-500 text-white' : 'bg-ink-900 text-white'
      }`}
    >
        {esHora ? (
          <BellRing className="h-5 w-5 flex-none animate-pulse" strokeWidth={2.25} />
        ) : (
          <Bell className="h-5 w-5 flex-none text-ink-200" strokeWidth={2} />
        )}

        <Link to={pendiente.enlace} className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">
            {esHora
              ? pasadoMin >= 1
                ? `Tenías que salir hace ${pasadoMin} min`
                : '¡Es hora de salir!'
              : `Salís ${horaDeReloj(pendiente.salirA)} · en ${faltaMin} min`}
          </span>
          <span
            className={`block truncate text-xs ${esHora ? 'text-white/85' : 'text-ink-300'}`}
          >
            {pendiente.linea ? `Línea ${pendiente.linea} en ${pendiente.parada}` : 'A pie'}
            {pendiente.pasaA !== null ? ` · pasa ${horaDeReloj(pendiente.pasaA)}` : ''}
            {/* Lo que esto no puede: avisar con la app cerrada. Se dice
                antes, no después de que el aviso no llegó. */}
            {!esHora ? ' · dejá la app abierta' : ''}
          </span>
        </Link>

        <button
          onClick={cancelar}
          aria-label={esHora ? 'Listo' : 'Cancelar el recordatorio'}
          className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white/10 active:bg-white/20"
        >
          <X className="h-4 w-4" strokeWidth={2.5} />
        </button>
    </div>
  );
}

export default RecordatorioDeSalida;
