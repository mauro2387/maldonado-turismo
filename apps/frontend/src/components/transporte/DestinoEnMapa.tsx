import { useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, useMapEvents } from 'react-leaflet';
import { Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Check, MapPin, X } from 'lucide-react';
import { Basemap, DEFAULT_ZOOM } from '@components/map/basemap';
import { MapControls } from '@components/map/MapControls';
import { destinationsService } from '@services/destinationsService';
import { formatStopName } from '@lib/stopNames';

/**
 * "Quiero ir **acá**."
 *
 * El planificador sólo aceptaba destinos con nombre: se escribía y se elegía
 * de una lista. Eso alcanza para el shopping y para el hospital, y no alcanza
 * para la mitad de los viajes que se hacen en Maldonado —una casa, una obra,
 * la parada donde te dijeron que esperes, un punto de la Ruta 10 donde no hay
 * nada que se llame de alguna manera—. Para todo eso la respuesta de la app
 * era "no encontramos ese lugar", cuando el lugar existe y la persona lo puede
 * señalar con el dedo.
 *
 * El backend nunca tuvo ese problema: `POST /transport/plan` recibe dos
 * coordenadas y no le importa de dónde salieron. Lo que faltaba era la puerta.
 *
 * ## Por qué el pin va en el centro y no donde se toca
 *
 * Porque el dedo tapa justo lo que hay que ver. Tocando el mapa uno marca a
 * ciegas y después no sabe si acertó; con el pin fijo en el centro, el mapa se
 * mueve por debajo y el punto está siempre a la vista, encima del dedo y no
 * abajo. Es cómo lo hacen Uber, Cabify y Google Maps, y no es casualidad: en
 * un teléfono, con una mano, es la única forma de marcar con precisión de
 * media cuadra.
 *
 * ## Por qué se le pone nombre
 *
 * Confirmar un destino mirando "-34.90812, -54.95003" es imposible. Lo que
 * confirma es el lugar de al lado, así que mientras el mapa se mueve se le
 * pregunta al backend de qué está cerca. Si no hay nada cerca no se inventa
 * nada: dice "punto en el mapa", que es exactamente lo que es.
 */

/** Lo que se espera después de soltar el mapa antes de preguntar el nombre. */
const NAME_DEBOUNCE_MS = 300;

export interface PuntoElegido {
  lat: number;
  lng: number;
  /** "Cerca de Punta Shopping" o "Punto en el mapa". Nunca una coordenada. */
  label: string;
}

/** Escucha el arrastre del mapa y avisa dónde quedó el centro. */
function SigueElCentro({ onMove }: { onMove: (center: { lat: number; lng: number }) => void }) {
  const map = useMapEvents({
    // `move` y no sólo `moveend`: la coordenada de abajo tiene que seguir al
    // dedo. El pedido del nombre sí espera a que se suelte, ver abajo.
    move: () => {
      const center = map.getCenter();
      onMove({ lat: center.lat, lng: center.lng });
    },
  });

  return null;
}

export function DestinoEnMapa({
  center,
  onConfirm,
  onCancel,
}: {
  /** Dónde abre: la ubicación de la persona, o el centro de Maldonado. */
  center: { lat: number; lng: number };
  onConfirm: (point: PuntoElegido) => void;
  onCancel: () => void;
}) {
  const mapRef = useRef<LeafletMap | null>(null);
  const [point, setPoint] = useState(center);
  const [label, setLabel] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);

  const handleMove = useCallback((next: { lat: number; lng: number }) => {
    setPoint(next);
  }, []);

  // --- Cómo se llama esto ---
  //
  // Se espera a que el mapa se quede quieto: preguntar en cada cuadro del
  // arrastre serían decenas de pedidos por gesto y el nombre parpadearía todo
  // el tiempo. Mientras tanto se muestra el anterior en gris, que es mejor que
  // vaciar el renglón y hacer saltar el botón.
  useEffect(() => {
    let cancelled = false;
    setNaming(true);

    const timer = setTimeout(() => {
      destinationsService
        .nearest(point)
        .then(({ near }) => {
          if (cancelled) return;
          setLabel(
            near
              ? `Cerca de ${near.source === 'parada' ? formatStopName(near.name) : near.name}`
              : null,
          );
        })
        .catch(() => {
          // Sin nombre se puede seguir: el viaje se calcula con la coordenada.
          if (!cancelled) setLabel(null);
        })
        .finally(() => {
          if (!cancelled) setNaming(false);
        });
    }, NAME_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [point.lat, point.lng]);

  const shown = label ?? 'Punto en el mapa';

  // Por arriba de Leaflet: sus controles (`leaflet-bottom`, donde va el ⓘ del
  // crédito del mapa) se dibujan en z-index 1000. Con el overlay en el mismo
  // número, el botón del mapa que queda abajo se colaba encima de esta
  // pantalla y se veía un ⓘ flotando en el medio de la nada.
  return (
    <div className="fixed inset-0 z-[2000] flex flex-col bg-sand-100">
      {/* ---------- Qué se está haciendo ---------- */}
      <header className="flex items-center gap-3 bg-ink-900 px-4 py-3 text-white">
        <button
          onClick={onCancel}
          aria-label="Cancelar"
          className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white/10"
        >
          <X className="h-4 w-4" strokeWidth={2.5} />
        </button>
        <span className="text-sm font-bold">Marcá a dónde vas</span>
      </header>

      {/* ---------- El mapa, con el pin quieto en el centro ---------- */}
      <div className="relative flex-1">
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={DEFAULT_ZOOM + 3}
          attributionControl={false}
          zoomControl={false}
          className="h-full w-full"
          ref={mapRef}
        >
          <Basemap />
          <SigueElCentro onMove={handleMove} />
        </MapContainer>

        {/*
          El pin va acá y no como marcador de Leaflet: un marcador se mueve con
          el mapa y lo que se quiere es lo contrario, que se quede quieto
          mientras el mapa pasa por debajo. `pointer-events-none` para que no se
          coma el arrastre justo en el punto donde uno tiene el dedo.

          La punta del pin es lo que marca, no su centro: por eso el
          `-translate-y-full` sobre la mitad del alto del mapa.
        */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[500] -translate-x-1/2 -translate-y-full">
          <MapPin
            className="h-9 w-9 fill-coral-500 text-white drop-shadow-lg"
            strokeWidth={2}
          />
        </div>
        {/* La sombrita en el punto exacto: sin ella el pin parece flotar y no
            se sabe qué metro está marcando. */}
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-[499] h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-900/40" />

        <MapControls getMap={() => mapRef.current} className="absolute right-3 top-3" />
      </div>

      {/* ---------- Confirmar ---------- */}
      <div className="flex-none border-t border-sand-200 bg-white px-4 pb-6 pt-4">
        <p className="section-label">Destino</p>
        <p
          className={`mt-0.5 truncate text-base font-bold ${
            naming ? 'text-ink-400' : 'text-ink-900'
          }`}
        >
          {shown}
        </p>

        <button
          onClick={() => onConfirm({ ...point, label: shown })}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-card bg-ink-900 py-3 text-sm font-bold text-white active:bg-ink-800"
        >
          <Check className="h-4 w-4" strokeWidth={2.5} />
          Ir acá
        </button>
      </div>
    </div>
  );
}

export default DestinoEnMapa;
