import { useMemo } from 'react';
import { MapContainer, Marker } from 'react-leaflet';
import { DivIcon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Check, Footprints } from 'lucide-react';
import { Basemap } from '@components/map/basemap';
import { WalkLine } from '@components/map/RouteLine';
import { FitToPoints } from '@components/transporte/TripMap';
import { RideStatus } from '@services/rideService';
import { formatStopName } from '@lib/stopNames';
import { formatDistance } from '@lib/geo';
import { LatLng } from '@lib/polyline';

/**
 * Llegaste.
 *
 * El viaje no terminaba en ningún lado. `ABordo` decía "tocá el timbre", el
 * ómnibus pasaba la parada y la pantalla se quedaba mostrando "ya pasó tu
 * parada" —que es un aviso de error— hasta que alguien tocaba la X. Quien se
 * bajó bien veía un cartel diciéndole que algo salió mal, y quien no se bajó
 * veía lo mismo: la app no distinguía las dos cosas.
 *
 * Acá termina, y termina contestando la pregunta que uno tiene **parado en la
 * vereda**, que ya no es la del viaje: dónde quedé, cuánto me falta y para qué
 * lado camino. Los tres datos ya venían en la respuesta —`walk_minutes`,
 * `walk_distance_m` y `walk_geometry`— y no los miraba nadie.
 *
 * ## Para qué lado se camina lo contesta el dibujo
 *
 * Con un número no alcanza: "480 m al noreste" es inútil parado en una esquina
 * de Maldonado Nuevo, donde uno no sabe dónde está el noreste. Lo que se
 * entiende de un vistazo es el mapa con la caminata dibujada desde la parada,
 * con los puntos avanzando hacia el destino (ver `WalkLine`), que es el mismo
 * trazo que la persona ya vio antes de salir en el planificador.
 *
 * ## El botón de "no me bajé"
 *
 * La app no sabe si alguien se bajó: sabe que el ómnibus pasó la parada
 * después de haber avisado. Casi siempre es lo mismo, pero no siempre —se
 * puede haber quedado hablando, o el coche puede haber parado antes—, así que
 * la salida está a la vista y devuelve al seguimiento en vez de dejar a
 * alguien discutiendo con una pantalla que da el viaje por terminado.
 */

/**
 * El destino, en el coral de la app.
 *
 * Es el mismo punto que marca el final del viaje en el mapa del planificador:
 * quien llegó hasta acá ya vio ese coral dos pantallas antes y no tiene que
 * volver a aprender qué significa.
 */
const destinoIcon = new DivIcon({
  className: '',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  html:
    '<span style="display:block;width:18px;height:18px;border-radius:9px;' +
    'background:#DC4227;border:3px solid #fff;box-shadow:0 1px 4px rgba(11,31,51,.4);"></span>',
});

/** De dónde se sale a caminar: la parada donde te bajaste. */
const paradaIcon = new DivIcon({
  className: '',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  html:
    '<span style="display:block;width:16px;height:16px;border-radius:8px;' +
    'background:#fff;border:3px solid #0E7C86;box-shadow:0 1px 4px rgba(11,31,51,.35);"></span>',
});

export function Llegaste({
  status,
  destination,
  onClose,
  onSeguir,
}: {
  /**
   * El estado con el que se cerró el viaje.
   *
   * Es una foto y no el dato vivo: cuando esta pantalla aparece, `ABordo` ya
   * dejó de preguntar. Seguir el coche después de bajarse no aporta nada y
   * haría cambiar los números de una pantalla que ya es un resumen.
   */
  status: RideStatus;
  destination: { lat: number; lng: number; label?: string };
  onClose: () => void;
  /** "No me bajé": vuelve al seguimiento. */
  onSeguir: () => void;
}) {
  // Leaflet trabaja en [lat, lng] y la API devuelve [lng, lat].
  const camino = useMemo<LatLng[]>(
    () => status.walk_geometry.map(([lng, lat]) => [lat, lng] as LatLng),
    [status.walk_geometry],
  );

  const hayCaminata = status.walk_minutes !== null && camino.length >= 2;

  return (
    // Por arriba de Leaflet, igual que el resto de las pantallas completas de
    // transporte: sus controles se dibujan en z-index 1000 y se colarían
    // encima de ésta.
    <div className="fixed inset-0 z-[2000] flex flex-col bg-sand-100">
      <header className="flex items-center gap-3 bg-ink-900 px-4 py-3 text-white">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-live">
          <Check className="h-4 w-4" strokeWidth={3} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">Llegaste</span>
          {status.stop && (
            <span className="block truncate text-xs text-ink-300">
              Bajaste en {formatStopName(status.stop.name)}
            </span>
          )}
        </span>
      </header>

      {/* El mapa se lleva todo lo que sobra: es lo único de esta pantalla que
          se mira más de dos segundos, y en un teléfono cada centímetro que
          gana son media cuadra más de contexto alrededor del destino. */}
      <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4">
        {/* ---------- Lo que falta ---------- */}
        {hayCaminata ? (
          <div className="rounded-card bg-white px-4 py-6 text-center">
            <Footprints className="mx-auto h-7 w-7 text-ink-300" strokeWidth={2} />
            <p className="mt-2 text-3xl font-black leading-none text-ink-900">
              {status.walk_minutes} min
            </p>
            <p className="mt-2 text-data text-ink-500">
              a pie
              {status.walk_distance_m !== null
                ? ` · ${formatDistance(status.walk_distance_m)}`
                : ''}
              {destination.label ? ` hasta ${destination.label}` : ''}
            </p>
          </div>
        ) : (
          // Sin caminata calculada no se inventa una distancia: se dice dónde
          // quedó parada la persona, que es lo único que sabemos.
          <div className="rounded-card bg-white px-4 py-6 text-center">
            <p className="text-base font-bold text-ink-900">Fin del viaje</p>
            <p className="mt-1 text-data text-ink-500">
              No pudimos calcular lo que te falta caminar
              {destination.label ? ` hasta ${destination.label}` : ''}.
            </p>
          </div>
        )}

        {/* ---------- Para qué lado ---------- */}
        {hayCaminata && (
          <>
            <div className="mt-3 min-h-[13rem] flex-1 overflow-hidden rounded-card">
              <MapContainer
                center={camino[0]}
                zoom={16}
                zoomControl={false}
                attributionControl={false}
                className="h-full w-full"
                style={{ background: '#EAE6DF' }}
              >
                <Basemap />
                <FitToPoints points={camino} />
                <WalkLine positions={camino} />
                {status.stop && (
                  <Marker
                    position={[status.stop.lat, status.stop.lng]}
                    icon={paradaIcon}
                    title={formatStopName(status.stop.name)}
                    interactive={false}
                  />
                )}
                <Marker
                  position={[destination.lat, destination.lng]}
                  icon={destinoIcon}
                  title={destination.label ?? 'Tu destino'}
                  interactive={false}
                />
              </MapContainer>
            </div>

            {/* La recta no es el camino: cuando el ruteador no contestó, el
                trazo une los dos puntos por el aire y la distancia es una
                estimación. Decirlo es la diferencia entre un mapa y una
                promesa que las calles no van a cumplir. */}
            {status.walk_straight && (
              <p className="mt-2 px-1 text-xs text-ink-400">
                El camino está dibujado derecho: no pudimos calcular cómo va por las calles.
              </p>
            )}
          </>
        )}
      </div>

      {/* ---------- Cerrar ---------- */}
      <div className="flex-none border-t border-sand-200 bg-white px-4 pb-6 pt-4">
        <button
          onClick={onClose}
          className="flex w-full items-center justify-center gap-2 rounded-card bg-ink-900 py-3 text-sm font-bold text-white active:bg-ink-800"
        >
          Listo
        </button>
        <button
          onClick={onSeguir}
          className="mt-2 w-full py-2 text-xs font-semibold text-ink-400 active:text-ink-600"
        >
          No me bajé, seguí avisándome
        </button>
      </div>
    </div>
  );
}

export default Llegaste;
