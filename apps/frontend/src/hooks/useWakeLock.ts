import { useEffect } from 'react';

/**
 * Que la pantalla no se apague durante el viaje.
 *
 * No es comodidad. Es lo que hace que el aviso llegue.
 *
 * Con la pantalla apagada el navegador frena los temporizadores de la página
 * —Chrome baja los `setInterval` a uno por minuto y termina congelando la
 * pestaña—, así que el poll de ocho segundos de `ABordo` deja de correr: la
 * app se entera de que hay que tocar el timbre **después** de que el ómnibus
 * pasó la parada. El teléfono se apaga solo a los treinta segundos, y un viaje
 * dura veinte minutos.
 *
 * El wake lock es lo único que un navegador ofrece para evitarlo sin
 * infraestructura. No lo tienen todos —Safari de iOS recién desde la 16.4, y
 * cualquier navegador puede negarlo sin dar motivo—, así que va entero en
 * try/catch: si no se puede, el viaje sigue funcionando exactamente igual, con
 * la pantalla apagándose como se apaga hoy.
 *
 * ## Por qué se vuelve a pedir al volver
 *
 * El sistema **suelta el lock solo** cada vez que la pantalla se apaga o la
 * app pasa a segundo plano, y no lo devuelve al volver. Sin volver a pedirlo,
 * el lock dura hasta el primer bloqueo del teléfono y después la pantalla se
 * apaga sola el resto del viaje, que es cuando más falta hace. Por eso se
 * escucha `visibilitychange` y se pide de nuevo.
 */
export function useWakeLock(activo: boolean): void {
  useEffect(() => {
    if (!activo) return;

    let sentinela: WakeLockSentinel | null = null;
    let cancelado = false;

    const pedir = async () => {
      // La API puede no estar. Preguntar por la propiedad en vez de confiar en
      // los tipos: `lib.dom` la declara siempre, el navegador no.
      if (!('wakeLock' in navigator)) return;

      try {
        const pedido = await navigator.wakeLock.request('screen');
        // Si mientras tanto se cerró la pantalla, se suelta enseguida: un lock
        // que sobrevive al viaje deja el teléfono prendido para siempre.
        if (cancelado) {
          void pedido.release();
          return;
        }
        sentinela = pedido;
      } catch {
        // Lo niega la batería baja, una política del sistema o el navegador
        // sin más. No hay nada que mostrar: nadie pidió esto explícitamente.
      }
    };

    const alVolver = () => {
      if (document.visibilityState === 'visible') void pedir();
    };

    void pedir();
    document.addEventListener('visibilitychange', alVolver);

    return () => {
      cancelado = true;
      document.removeEventListener('visibilitychange', alVolver);
      try {
        void sentinela?.release();
      } catch {
        // Ya lo había soltado el sistema.
      }
      sentinela = null;
    };
  }, [activo]);
}

export default useWakeLock;
