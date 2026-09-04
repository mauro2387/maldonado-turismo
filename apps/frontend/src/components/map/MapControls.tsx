import { Minus, Navigation, Plus } from 'lucide-react';
import { Map as LeafletMap } from 'leaflet';

/**
 * Los botones del mapa: acercar, alejar y centrar en mi ubicación.
 *
 * Los mapas de la app se abrían sin ningún control: el zoom era la rueda del
 * mouse o dos dedos, y nada más. En un teléfono eso es un gesto que compite
 * con el desplazamiento de la página y que —cuando la mano está ocupada
 * sosteniendo el teléfono en la parada— directamente no se puede hacer. Dos
 * botones resuelven eso sin quitarle nada a quien prefiere los dedos.
 *
 * El zoom se pide al mapa por su método, no por estado de React: el mapa es el
 * dueño de su vista y cualquier intento de mantenerla en un `useState` termina
 * en el mapa peleándose consigo mismo.
 */
export function MapControls({
  getMap,
  onLocate,
  className = '',
}: {
  getMap: () => LeafletMap | null;
  /** Sin esto no se muestra el botón de ubicación. */
  onLocate?: () => void;
  className?: string;
}) {
  const step = (delta: number) => {
    const map = getMap();
    if (!map) return;
    map.setZoom(map.getZoom() + delta);
  };

  return (
    <div className={`z-[500] flex flex-col gap-2 ${className}`}>
      {/* Acercar y alejar van pegados, como en cualquier mapa. */}
      <div className="overflow-hidden rounded-full bg-white shadow-float">
        <button
          onClick={() => step(1)}
          aria-label="Acercar"
          className="flex h-10 w-10 items-center justify-center active:bg-sand-100"
        >
          <Plus className="h-4 w-4 text-ink-900" strokeWidth={2.4} />
        </button>
        <span className="mx-2 block h-px bg-sand-200" />
        <button
          onClick={() => step(-1)}
          aria-label="Alejar"
          className="flex h-10 w-10 items-center justify-center active:bg-sand-100"
        >
          <Minus className="h-4 w-4 text-ink-900" strokeWidth={2.4} />
        </button>
      </div>

      {onLocate && (
        <button
          onClick={onLocate}
          aria-label="Centrar en mi ubicación"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-float active:bg-sand-100"
        >
          <Navigation className="h-4 w-4 text-ink-900" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

export default MapControls;
