import { useEffect, useRef, useState } from 'react';
import { Bell, Footprints, MapPin, SignalZero, X } from 'lucide-react';
import { rideService, RideStatus } from '@services/rideService';
import { BondiSprite } from '@components/transporte/BondiSprite';
import { Llegaste } from '@components/transporte/Llegaste';
import { useWakeLock } from '@hooks/useWakeLock';
import { avisar } from '@lib/avisos';
import { formatStopName } from '@lib/stopNames';
import { formatDistance } from '@lib/geo';

/**
 * Ya te subiste.
 *
 * Es la pantalla que se mira parado, con una mano, en un ómnibus que se mueve
 * y mirando por la ventanilla cada dos por tres para ubicarse. Todo lo que
 * normalmente se puede pedir de una interfaz —leer, comparar, elegir— acá no
 * se puede. Así que contesta **una sola cosa a la vez**, en el tamaño en que
 * se lee de un vistazo: cuánto falta para bajarse.
 *
 * Tres decisiones de esta pantalla:
 *
 * **Cuadras cerca, minutos lejos.** Nadie sabe cuánto son 270 m mirando por la
 * ventanilla, y "faltan dos paradas" no dice nada en Maldonado: dos paradas en
 * el centro son dos cuadras y dos paradas en la Ruta 10 son tres kilómetros.
 * Cerca, la cuadra es la unidad en la que la gente piensa el viaje. Lejos deja
 * de serlo —Maldonado a San Carlos son 207 cuadras, que no es un número, es un
 * chiste— y lo que importa pasa a ser el tiempo. Ver `cuantoFalta`.
 *
 * **El aviso cambia la pantalla entera, no un renglón.** Cuando hay que tocar
 * el timbre, eso tiene que ser lo único que se vea. Un cartelito más entre
 * otros seis es un cartelito que no se ve.
 *
 * **Se dice cuándo el dato dejó de servir.** Si el coche deja de reportar, la
 * pantalla no sigue contando cuadras con la última posición buena: lo dice. Es
 * la diferencia entre una app que no sabe y una app que miente, y acá mentir
 * es que alguien se pase de parada.
 *
 * **Y el aviso sale de la pantalla.** Todo lo de arriba supone que alguien
 * está mirando, y nadie viaja veinte minutos mirando el teléfono: está en el
 * bolsillo. Así que en las dos transiciones que importan —preparate y
 * bajate— el teléfono además vibra, suena y, si la app quedó atrás, notifica.
 * Ver `avisos.ts` y `useWakeLock`.
 */

/**
 * Cada cuánto se vuelve a preguntar.
 *
 * Los feeds de las empresas publican cada 20-30 s, así que preguntar más
 * seguido no trae nada nuevo. Ocho segundos deja el número fresco -un ómnibus
 * urbano hace unos 40 m en ese rato, menos de media cuadra- sin castigar la
 * batería de alguien que va a tener esta pantalla abierta veinte minutos.
 */
const POLL_MS = 8000;

/**
 * Hasta acá la cuadra sirve como unidad.
 *
 * Más allá deja de decir nada: el backend contesta la conversión honesta de
 * los metros, y en un viaje Maldonado - San Carlos eso da **207 cuadras**, que
 * es un número que nadie puede usar para nada. Doce cuadras es lo que alguien
 * todavía puede contar por la ventanilla y ubicar en el barrio; de ahí para
 * arriba lo que importa es cuánto falta en tiempo.
 */
const MAX_BLOCKS = 12;

/** "acá", "en 1 cuadra", "en 3 cuadras". Es como se dice en la calle. */
function enCuadras(blocks: number): string {
  if (blocks <= 0) return 'acá';
  return blocks === 1 ? 'en 1 cuadra' : `en ${blocks} cuadras`;
}

/**
 * Cuánto falta, en la unidad que sirve a esa distancia.
 *
 * Cerca son cuadras y lejos son minutos, y el cambio no es cosmético: son dos
 * preguntas distintas. A veinte minutos uno quiere saber si le da para
 * dormirse; a tres cuadras quiere saber si llega a levantarse.
 */
function cuantoFalta(status: RideStatus): { grande: string; chico: string | null } {
  const blocks = status.blocks_away;
  const minutes = status.minutes_away;

  if (blocks !== null && blocks <= MAX_BLOCKS) {
    return {
      grande: enCuadras(blocks),
      chico: minutes === null ? null : minutes === 0 ? 'menos de 1 min' : `${minutes} min`,
    };
  }

  return {
    grande: minutes === null ? '—' : `${minutes} min`,
    chico: status.meters_away === null ? null : formatDistance(status.meters_away),
  };
}

/** Los colores del aviso. El de bajarse tiene que ganarle a todo lo demás. */
const TONO: Record<NonNullable<RideStatus['alert']>, string> = {
  viaja: 'bg-white text-ink-900',
  preparate: 'bg-warn-soft text-ink-900',
  bajate: 'bg-coral-500 text-white',
  te_pasaste: 'bg-ink-900 text-white',
};

/**
 * La línea que separa el nombre de la parada del número grande.
 *
 * Va aparte del tono y no como `border-current`: Tailwind 3 no sabe aplicarle
 * transparencia a `currentColor`, así que `border-current/15` no genera
 * ninguna regla y la división desaparece justo en el aviso de bajarse, que es
 * el que tiene que leerse mejor.
 */
const DIVISOR: Record<NonNullable<RideStatus['alert']>, string> = {
  viaja: 'border-sand-200',
  preparate: 'border-black/10',
  bajate: 'border-white/30',
  te_pasaste: 'border-white/20',
};

export function ABordo({
  vehicleId,
  destination,
  stopId,
  onClose,
}: {
  /** El coche al que se subió. Del planificador o de tocarlo en el mapa. */
  vehicleId: string;
  destination: { lat: number; lng: number; label?: string };
  /**
   * La bajada que ya se prometió, si el viaje viene del planificador.
   *
   * Fijarla es lo que evita que la app se contradiga a mitad de viaje: ya dijo
   * "bajás en tal lado" y quien está arriba del ómnibus no tiene por qué ver
   * que cambie sola, aunque el backend encuentre una parada mejor.
   */
  stopId?: number;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<RideStatus | null>(null);
  const [failed, setFailed] = useState(false);

  /**
   * El viaje terminado, congelado.
   *
   * Es una foto del último estado y no el dato vivo: cuando esto tiene valor,
   * el viaje se dio por cerrado y se deja de preguntar. Seguir al coche
   * después de bajarse no aporta nada y haría cambiar los números de una
   * pantalla que ya es un resumen. Volver a `null` es "no me bajé".
   */
  const [llegada, setLlegada] = useState<RideStatus | null>(null);

  /**
   * Qué avisos ya se dieron en este viaje.
   *
   * Sin esto el aviso saldría **en cada poll**: el coche pasa varios minutos
   * dentro de las ocho cuadras de "preparate", así que el teléfono vibraría
   * cada ocho segundos todo el tramo final. Lo que se avisa es el cambio de
   * estado, no el estado.
   *
   * Y se guarda "ya lo di" en vez de comparar contra el estado anterior
   * porque el estado anterior no alcanza: el aviso sale de proyectar una
   * posición de GPS sobre el recorrido, y con el coche justo en el borde de
   * las ocho cuadras esa proyección va y viene entre `viaja` y `preparate` de
   * un poll al otro. Comparando contra el anterior, cada ida y vuelta es otra
   * vibración. Cada aviso se da una sola vez por viaje.
   *
   * `cierre` es el mismo problema una vez más: sin él, quien contesta "no me
   * bajé" en la pantalla de llegada vuelve al seguimiento con el coche todavía
   * pasado de la parada, y el viaje se da por terminado otra vez en el poll
   * siguiente. El cierre automático se ofrece una sola vez.
   *
   * Va en un `ref` y no en estado porque nada de esto se dibuja: cambiarlo no
   * tiene por qué volver a pintar la pantalla.
   */
  const avisado = useRef({ preparate: false, bajate: false, cierre: false });

  /**
   * La pantalla prendida mientras dura el viaje.
   *
   * No es comodidad: con la pantalla apagada el navegador frena el poll de
   * abajo y el aviso llega tarde. Ver `useWakeLock`.
   */
  useWakeLock(llegada === null);

  useEffect(() => {
    // Viaje cerrado, no hay nada más que preguntar.
    if (llegada) return;

    let cancelled = false;

    const ask = () => {
      rideService
        .follow(vehicleId, { lat: destination.lat, lng: destination.lng }, stopId)
        .then((result) => {
          if (cancelled) return;
          setStatus(result);
          setFailed(false);
        })
        .catch(() => {
          // Se conserva el último estado bueno y se avisa aparte: vaciar la
          // pantalla porque un pedido no llegó es peor que un dato de hace
          // ocho segundos, que es lo que hay acá de todas formas.
          if (!cancelled) setFailed(true);
        });
    };

    ask();
    const timer = setInterval(ask, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [vehicleId, destination.lat, destination.lng, stopId, llegada]);

  const alert = status?.alert ?? null;
  const perdido = status?.reason === 'sin_coche' || status?.reason === 'sin_senal';

  /**
   * El aviso que no depende de que alguien esté mirando.
   *
   * Los dos momentos en los que hay que hacer algo —juntar las cosas y tocar
   * el timbre— y el que cierra el viaje. El tercero no se avisa: para cuando
   * el coche pasó la parada, la persona ya está en la vereda.
   */
  useEffect(() => {
    if (alert === 'preparate' && !avisado.current.preparate) {
      avisado.current.preparate = true;
      avisar({
        titulo: 'Preparate para bajar',
        cuerpo: status?.stop ? `Bajás en ${formatStopName(status.stop.name)}` : undefined,
      });
      return;
    }

    if (alert === 'bajate' && !avisado.current.bajate) {
      // También se marca el de preparate: si el coche llegó acá sin pasar por
      // ahí -o pasó tan rápido que cayó entre dos polls-, no tiene sentido
      // avisar de "preparate" después de haber dicho que se baje.
      avisado.current.preparate = true;
      avisado.current.bajate = true;
      avisar({
        titulo: 'Tocá el timbre',
        cuerpo: status?.stop ? `Bajás en ${formatStopName(status.stop.name)}` : undefined,
        insistente: true,
      });
      return;
    }

    // El coche pasó la parada después de haber avisado que se bajara: el viaje
    // terminó. Sin el aviso previo esto es otra cosa -alguien que abrió la
    // pantalla cuando ya se había pasado- y se dice tal cual, ver abajo.
    if (alert === 'te_pasaste' && avisado.current.bajate && !avisado.current.cierre && status) {
      avisado.current.cierre = true;
      setLlegada(status);
    }
  }, [alert, status]);

  if (llegada) {
    return (
      <Llegaste
        status={llegada}
        destination={destination}
        onClose={onClose}
        onSeguir={() => {
          // Se vuelve a seguir el coche, pero sin volver a avisar: el timbre
          // ya sonó y la parada ya quedó atrás.
          setLlegada(null);
        }}
      />
    );
  }

  // Por arriba de Leaflet: sus controles (`leaflet-bottom`, donde va el ⓘ del
  // crédito del mapa) se dibujan en z-index 1000. Con el overlay en el mismo
  // número, el botón del mapa que queda abajo se colaba encima de esta
  // pantalla y se veía un ⓘ flotando en el medio de la nada.
  return (
    <div className="fixed inset-0 z-[2000] flex flex-col bg-sand-100">
      {/* ---------- Qué coche es ----------
          Arriba de todo y con el número del cartel: lo primero que hace
          cualquiera al abrir esto es confirmar que la app está siguiendo el
          ómnibus en el que está sentado y no otro. */}
      <header className="flex items-center gap-3 bg-ink-900 px-4 py-3 text-white">
        {/* El coche dibujado, con el color de su empresa. Lo primero que hace
            cualquiera al abrir esto es confirmar que la app está siguiendo el
            ómnibus en el que está sentado y no el que va adelante, y a eso se
            contesta antes con el color que con el número. */}
        {status && <BondiSprite vehicle={status} width={40} />}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">
            {status?.line_label ? `Línea ${status.line_label}` : 'A bordo'}
          </span>
          {status?.headsign && (
            <span className="block truncate text-xs text-ink-300">
              {formatStopName(status.headsign)}
            </span>
          )}
        </span>
        <button
          onClick={onClose}
          aria-label="Terminar el viaje"
          className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white/10"
        >
          <X className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* ---------- El aviso ---------- */}
        {!status ? (
          // Todavía no contestó nadie. No se dibuja la ficha con los huecos
          // vacíos: un "te bajás" sin parada y sin cuadras se lee como que la
          // app se rompió, y acá se rompe la confianza justo cuando la persona
          // depende de esto para no pasarse.
          <div className="rounded-card bg-white px-4 py-8 text-center">
            <p className="text-data text-ink-400">
              {failed ? 'No pudimos conectarnos. Seguimos intentando.' : 'Ubicando el ómnibus…'}
            </p>
          </div>
        ) : perdido ? (
          <div className="rounded-card bg-white px-4 py-6 text-center">
            <SignalZero className="mx-auto h-8 w-8 text-ink-300" strokeWidth={2} />
            <p className="mt-3 text-base font-bold text-ink-900">
              {status?.reason === 'sin_senal'
                ? 'Este coche dejó de reportar'
                : 'Perdimos a este coche'}
            </p>
            <p className="mt-1 text-data text-ink-500">
              No podemos decirte cuánto falta sin saber dónde está. Fijate por la ventanilla:
              {status?.stop ? ` te bajás en ${formatStopName(status.stop.name)}.` : ''}
            </p>
          </div>
        ) : status?.reason === 'no_te_deja' ? (
          <div className="rounded-card bg-white px-4 py-6 text-center">
            <MapPin className="mx-auto h-8 w-8 text-ink-300" strokeWidth={2} />
            <p className="mt-3 text-base font-bold text-ink-900">
              Este ómnibus no te deja cerca
            </p>
            <p className="mt-1 text-data text-ink-500">
              Ninguna de las paradas que le quedan por delante queda a distancia de caminar de
              tu destino.
            </p>
          </div>
        ) : alert === 'te_pasaste' ? (
          <div className={`rounded-card px-4 py-8 text-center ${TONO.te_pasaste}`}>
            <p className="text-lg font-black">Ya pasó tu parada</p>
            <p className="mt-1 text-data text-ink-200">
              Bajate en la próxima y volvé caminando.
            </p>
          </div>
        ) : (
          <div className={`rounded-card px-4 py-8 text-center ${TONO[alert ?? 'viaja']}`}>
            {alert === 'bajate' ? (
              <>
                <Bell className="mx-auto h-8 w-8" strokeWidth={2.5} />
                <p className="mt-2 text-2xl font-black leading-none">Tocá el timbre</p>
                <p className="mt-2 text-data font-semibold opacity-90">
                  Bajás {enCuadras(status.blocks_away ?? 0)}
                </p>

                {/* Bajarse es lo último que se hace mirando el teléfono, así
                    que el botón no es obligatorio: si nadie lo toca, el viaje
                    se cierra solo cuando el coche pasa la parada. Está para
                    quien se bajó antes -en la parada de antes, o porque el
                    coche paró donde no debía- y no tiene por qué esperar a que
                    el GPS se entere. */}
                <button
                  onClick={() => {
                    avisado.current.cierre = true;
                    setLlegada(status);
                  }}
                  className="mt-4 w-full rounded-card bg-white/15 py-2.5 text-sm font-bold active:bg-white/25"
                >
                  Ya me bajé
                </button>
              </>
            ) : (
              <>
                <p className="section-label opacity-70">
                  {alert === 'preparate' ? 'Preparate' : 'Te bajás'}
                </p>
                <p className="mt-1 text-3xl font-black leading-none">
                  {cuantoFalta(status).grande}
                </p>
                {cuantoFalta(status).chico && (
                  <p className="mt-2 text-data opacity-70">{cuantoFalta(status).chico}</p>
                )}
              </>
            )}

            {status?.stop && (
              <p
                className={`mt-3 border-t pt-3 text-sm font-bold ${DIVISOR[alert ?? 'viaja']}`}
              >
                {formatStopName(status.stop.name)}
              </p>
            )}
          </div>
        )}

        {/* ---------- Lo que se ve por la ventanilla ----------
            El dato de control: la próxima parada y cuántas faltan. Sirve para
            confirmar contra el cartel de la calle que la app no se volvió
            loca, que es lo que uno hace de verdad arriba del ómnibus. */}
        {status?.next_stop && status.stops_away !== null && !perdido && (
          <div className="mt-3 rounded-card bg-white px-4 py-3">
            <p className="section-label">Próxima parada</p>
            <p className="mt-0.5 text-data font-bold text-ink-900">
              {formatStopName(status.next_stop.name)}
            </p>
            <p className="mt-1 text-xs text-ink-400">
              {status.stops_away === 0
                ? 'Es la tuya.'
                : status.stops_away === 1
                  ? 'Después de ésta, te bajás.'
                  : `Faltan ${status.stops_away} paradas antes de la tuya.`}
            </p>
          </div>
        )}

        {/* ---------- Y después ---------- */}
        {status?.walk_minutes !== null && status?.walk_minutes !== undefined && !perdido && (
          <div className="mt-3 flex items-center gap-3 rounded-card bg-white px-4 py-3">
            <Footprints className="h-4 w-4 flex-none text-ink-300" strokeWidth={2} />
            <p className="text-data text-ink-500">
              Después {status.walk_minutes} min a pie
              {destination.label ? ` hasta ${destination.label}` : ''}.
            </p>
          </div>
        )}

        {failed && (
          <p className="mt-3 text-center text-xs text-ink-400">
            No pudimos actualizar. Seguimos intentando.
          </p>
        )}
      </div>
    </div>
  );
}

export default ABordo;
