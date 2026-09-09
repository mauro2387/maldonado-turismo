import { useEffect, useState } from 'react';
import { Bell, Footprints, MapPin, SignalZero, X } from 'lucide-react';
import { rideService, RideStatus } from '@services/rideService';
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

  useEffect(() => {
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
  }, [vehicleId, destination.lat, destination.lng, stopId]);

  const alert = status?.alert ?? null;
  const perdido = status?.reason === 'sin_coche' || status?.reason === 'sin_senal';

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
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">
            {status?.line_label ? `Línea ${status.line_label}` : 'A bordo'}
          </span>
          {status?.headsign && (
            <span className="block truncate text-xs text-ink-300">{status.headsign}</span>
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
