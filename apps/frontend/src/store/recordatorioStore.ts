import { create } from 'zustand';

/**
 * "Avisame cuando tenga que salir."
 *
 * El planificador dice "salí en 23 min" y ahí termina su trabajo: la persona
 * cierra la app, se pone a hacer otra cosa y a los veinte minutos no se
 * acuerda si eran veintitrés o treinta y tres. Esto es lo que falta entre
 * elegir un viaje y hacerlo: un aviso a la hora de salir, con el mismo
 * canal que usa la pantalla de a bordo para avisar la bajada (vibración,
 * bip y notificación; ver `lib/avisos.ts`).
 *
 * ## Hay uno solo
 *
 * No es una lista de recordatorios: es **el** viaje que viene. Poner otro
 * reemplaza al anterior, y eso se le dice a quien lo pone. Dos alarmas de
 * salida para dos viajes distintos es una agenda, y una agenda es otra cosa.
 *
 * ## Dónde vive y quién lo mira
 *
 * Acá, fuera de cualquier pantalla, porque el aviso tiene que sonar aunque
 * la persona se haya ido del planificador a mirar las noticias. Lo tickea
 * `RecordatorioDeSalida`, montado en el layout. Va a `localStorage` para que
 * recargar la app no lo pierda; uno cuya hora quedó lejos atrás se descarta
 * al cargar, porque un "salí ahora" de hace dos horas ya no es un aviso, es
 * un susto.
 *
 * ## Lo que esto no puede
 *
 * Avisar con la app cerrada. Sin Web Push -que es un service worker con
 * suscripción y un backend que empuje, y no está- el aviso sólo sale si la
 * pestaña está viva. Con la app atrás, el navegador frena los temporizadores
 * hasta uno por minuto y después los congela: el aviso puede llegar tarde.
 * Por eso el banner pide dejar la app abierta, y por eso cuando faltan pocos
 * minutos se pide el wake lock. Ver `RecordatorioDeSalida`.
 */

export interface Recordatorio {
  /** Cuándo hay que salir, en milisegundos de época. */
  salirA: number;
  /** Cuándo pasa el ómnibus por la parada, si se sabe. */
  pasaA: number | null;
  /** El número del cartel de la línea que hay que tomar. Vacío si es a pie. */
  linea: string;
  /** Dónde se toma. */
  parada: string;
  /** A dónde se va. */
  destino: string;
  /** El planificador con ese viaje, para volver desde el banner. */
  enlace: string;
  /**
   * Qué avisos ya salieron. Se guarda para no repetirlos si la app se recarga
   * entre el "en cinco minutos" y el "ahora".
   */
  avisado: { previo: boolean; salida: boolean };
}

interface RecordatorioState {
  pendiente: Recordatorio | null;
  poner: (recordatorio: Omit<Recordatorio, 'avisado'>) => void;
  marcarAvisado: (cual: keyof Recordatorio['avisado']) => void;
  cancelar: () => void;
}

const STORAGE_KEY = 'recordatorio-de-salida';

/**
 * Cuánto después de la hora de salir sigue valiendo un recordatorio.
 *
 * Si la app se abre diez minutos después de la hora, todavía sirve decir "te
 * tenías que haber ido hace diez minutos": capaz que el ómnibus todavía no
 * pasó. Media hora después ya no: ese viaje se perdió y el aviso sólo
 * molesta.
 */
const GRACIA_MS = 30 * 60_000;

/**
 * Cuánto antes de salir sale el primer aviso, el suave.
 *
 * Cinco minutos es lo que se tarda en terminar lo que uno estaba haciendo y
 * agarrar las cosas. Si al poner el recordatorio ya falta menos que eso, el
 * aviso previo no tiene sentido -la persona está mirando la pantalla que
 * dice "salí en 3 min"- y se da por dado.
 */
export const PREVIO_MS = 5 * 60_000;

function esRecordatorio(valor: unknown): valor is Recordatorio {
  if (!valor || typeof valor !== 'object') return false;
  const v = valor as Record<string, unknown>;
  const avisado = v.avisado as Record<string, unknown> | undefined;
  return (
    typeof v.salirA === 'number' &&
    Number.isFinite(v.salirA) &&
    (v.pasaA === null || typeof v.pasaA === 'number') &&
    typeof v.linea === 'string' &&
    typeof v.parada === 'string' &&
    typeof v.destino === 'string' &&
    typeof v.enlace === 'string' &&
    !!avisado &&
    typeof avisado.previo === 'boolean' &&
    typeof avisado.salida === 'boolean'
  );
}

function cargar(): Recordatorio | null {
  try {
    const crudo = localStorage.getItem(STORAGE_KEY);
    if (!crudo) return null;
    const datos: unknown = JSON.parse(crudo);
    if (!esRecordatorio(datos)) return null;
    if (datos.salirA + GRACIA_MS < Date.now()) return null;
    return datos;
  } catch {
    return null;
  }
}

function guardar(pendiente: Recordatorio | null): void {
  try {
    if (pendiente) localStorage.setItem(STORAGE_KEY, JSON.stringify(pendiente));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sin disco el recordatorio dura lo que dure la pestaña.
  }
}

export const useRecordatorioStore = create<RecordatorioState>((set) => ({
  pendiente: cargar(),

  poner: (recordatorio) =>
    set({
      pendiente: {
        ...recordatorio,
        avisado: { previo: recordatorio.salirA - Date.now() <= PREVIO_MS, salida: false },
      },
    }),

  marcarAvisado: (cual) =>
    set((estado) =>
      estado.pendiente
        ? {
            pendiente: {
              ...estado.pendiente,
              avisado: { ...estado.pendiente.avisado, [cual]: true },
            },
          }
        : {},
    ),

  cancelar: () => set({ pendiente: null }),
}));

useRecordatorioStore.subscribe((estado) => guardar(estado.pendiente));

export default useRecordatorioStore;
