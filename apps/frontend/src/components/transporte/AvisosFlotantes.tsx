import { RecordatorioDeSalida } from '@components/transporte/RecordatorioDeSalida';
import { AlarmaDeLlegada } from '@components/transporte/AlarmaDeLlegada';

/**
 * Los avisos que flotan encima de la barra de abajo, en todas las pantallas.
 *
 * Son dos -el recordatorio de salida y la alarma de llegada- y pueden estar
 * los dos a la vez: uno para el viaje de la tarde y otro para el ómnibus que
 * se está esperando ahora. Cada uno decide si se muestra; acá sólo se los
 * apila para que no se tapen entre sí.
 */
export function AvisosFlotantes() {
  return (
    <div className="safe-bottom pointer-events-none fixed inset-x-0 bottom-[4.25rem] z-30 flex flex-col gap-2 px-3 pb-2 md:bottom-4 md:px-4">
      <div className="pointer-events-auto mx-auto flex w-full max-w-3xl flex-col gap-2">
        <AlarmaDeLlegada />
        <RecordatorioDeSalida />
      </div>
    </div>
  );
}

export default AvisosFlotantes;
