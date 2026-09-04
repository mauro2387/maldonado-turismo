import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { DivIcon, LatLngBounds, LatLngExpression, Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Search, Layers, X, Bus, Accessibility, ChevronRight } from 'lucide-react';
import { usePlaces } from '@hooks/usePlaces';
import { useEvents } from '@hooks/useEvents';
import { useStops } from '@hooks/useTransport';
import { useStopArrivals } from '@hooks/useDepartures';
import { useGeolocation, MALDONADO_CENTER } from '@hooks/useGeolocation';
import { Basemap, DEFAULT_ZOOM } from '@components/map/basemap';
import { MapControls } from '@components/map/MapControls';
import { ArrivalRow } from '@components/transporte/ArrivalRow';
import { LiveIndicator } from '@components/ui/LiveIndicator';
import { distanceMeters, formatDistance } from '@lib/geo';
import { formatStopName } from '@lib/stopNames';
import { stopMarker } from '@components/map/stopMarker';

/**
 * El mapa de la app: dónde queda cada cosa en Maldonado.
 *
 * Lugares, eventos y paradas. Los ómnibus en vivo y sus recorridos **no** van
 * acá: con doce recorridos dibujados como polilíneas de 9 px más la flota
 * encima, el callejero desaparecía debajo del transporte y el mapa dejaba de
 * servir para lo que la mayoría lo abre, que es ubicar un lugar. La flota en
 * vivo vive en Moverse, que es la sección de transporte (`/moverse/bondis`).
 *
 * Al tocar cualquier elemento sube una hoja con su información: no se cambia
 * de pantalla, igual que en Uber.
 */

type LayerId = 'paradas' | 'lugares' | 'eventos';

const LAYERS: Array<{ id: LayerId; label: string }> = [
  { id: 'lugares', label: 'Lugares' },
  { id: 'eventos', label: 'Eventos' },
  { id: 'paradas', label: 'Paradas' },
];

const INITIAL_ZOOM = DEFAULT_ZOOM;

/** Las paradas solo aparecen de cerca: más lejos son ruido sobre el mapa. */
const STOPS_MIN_ZOOM = 15;



function pinIcon(color: string): DivIcon {
  return new DivIcon({
    className: '',
    iconSize: [24, 30],
    iconAnchor: [12, 30],
    html: `<svg width="24" height="30" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg">
             <path d="M12 29c0 0 10-11.2 10-17A10 10 0 1 0 2 12c0 5.8 10 17 10 17z" fill="${color}" stroke="#fff" stroke-width="2"/>
             <circle cx="12" cy="11.5" r="3.6" fill="#fff"/>
           </svg>`,
  });
}

const placeIcon = pinIcon('#0B1F33');
const eventIcon = pinIcon('#DC4227');

const userIcon = new DivIcon({
  className: '',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  html: '<span style="display:block;width:16px;height:16px;border-radius:50%;background:#2A9099;border:3px solid #fff;box-shadow:0 0 0 4px rgba(14,124,134,.22);"></span>',
});

/** Avisa el zoom hacia afuera para dimensionar los sprites y ocultar paradas. */
function ZoomWatcher({ onChange }: { onChange: (zoom: number) => void }) {
  const map = useMapEvents({ zoomend: () => onChange(map.getZoom()) });
  return null;
}

/**
 * Avisa qué pedazo de mapa se está viendo.
 *
 * Sirve para dibujar sólo las paradas que entran en pantalla. Son más de mil
 * en el departamento y montarlas todas —aunque el 95 % quede fuera de la
 * vista— es lo que hace que el mapa se trabe al arrastrarlo en un teléfono de
 * gama media.
 */
function BoundsWatcher({ onChange }: { onChange: (bounds: LatLngBounds) => void }) {
  const map = useMapEvents({
    moveend: () => onChange(map.getBounds()),
    zoomend: () => onChange(map.getBounds()),
  });

  useEffect(() => {
    onChange(map.getBounds());
    // Sólo al montar: después lo mantienen los eventos del mapa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

/**
 * Deja el mapa a mano para las pocas veces que hay que moverlo desde afuera.
 *
 * Acá vivía un componente que hacía `setView(center, zoom)` cada vez que
 * cambiaba alguna de sus dos propiedades, y el zoom era estado de React
 * actualizado en `zoomend`: acercar el mapa disparaba un renderizado que lo
 * devolvía al centro guardado —la ubicación del usuario, que además se volvía
 * a escribir con cada lectura del GPS—. El resultado era un mapa que no se
 * dejaba mover ni acercar. El mapa se mueve **sólo** cuando alguien lo pide.
 */
function MapHandle({ onReady }: { onReady: (map: LeafletMap) => void }) {
  const map = useMap();
  useEffect(() => onReady(map), [map, onReady]);
  return null;
}

type Selection =
  | {
      kind: 'stop';
      id: number;
      name: string;
      zone?: string;
      code?: string;
      accessibility?: boolean;
      lat: number;
      lng: number;
    }
  | { kind: 'place'; id: string; name: string; description?: string; category?: string }
  | { kind: 'event'; id: string; name: string; location?: string; date?: string };

export default function MapaPage() {
  const [searchParams] = useSearchParams();
  const { coords, granted, request } = useGeolocation();

  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const mapRef = useRef<LeafletMap | null>(null);
  const [query, setQuery] = useState('');
  const [showLayers, setShowLayers] = useState(false);
  const [active, setActive] = useState<Record<LayerId, boolean>>({
    paradas: true,
    lugares: true,
    eventos: true,
  });
  const [selection, setSelection] = useState<Selection | null>(null);
  const [bounds, setBounds] = useState<LatLngBounds | null>(null);

  const onMapReady = useCallback((map: LeafletMap) => {
    mapRef.current = map;
  }, []);

  /**
   * Al conseguir la ubicación el mapa se acomoda **una sola vez**.
   *
   * El GPS reporta cada pocos segundos y con eso el mapa volvía a saltar a la
   * ubicación una y otra vez, arriba de donde uno estuviera mirando. Después
   * de la primera vez, mover el mapa es cosa del botón de ubicación.
   */
  const centeredOnUser = useRef(false);

  const { places } = usePlaces({ search: query || undefined });
  const { events } = useEvents({ search: query || undefined });
  const { stops } = useStops();

  /**
   * Al entrar desde una parada concreta -el QR del cartel, un enlace
   * compartido-, el mapa abre centrado en ella. Una vez: si no, cualquier
   * recarga del catálogo de paradas devuelve el mapa a ella.
   */
  const openedOnStop = useRef(false);

  useEffect(() => {
    const stopParam = searchParams.get('stop');
    if (!stopParam || openedOnStop.current) return;
    const stop = stops.find((candidate) => String(candidate.id) === stopParam);
    if (!stop) return;
    openedOnStop.current = true;
    // El que llegó siguiendo una parada quiere ver esa parada, no dónde está
    // parado él: el encuadre inicial por ubicación queda descartado.
    centeredOnUser.current = true;
    mapRef.current?.setView([stop.lat, stop.lng], 16);
    setSelection({
      kind: 'stop',
      id: stop.id,
      name: stop.name,
      zone: stop.zone,
      code: stop.code,
      accessibility: stop.accessibility,
      lat: stop.lat,
      lng: stop.lng,
    });
  }, [searchParams, stops]);

  useEffect(() => {
    if (!granted || centeredOnUser.current || !mapRef.current) return;
    centeredOnUser.current = true;
    mapRef.current.setView([coords.lat, coords.lng], Math.max(mapRef.current.getZoom(), 15));
  }, [granted, coords.lat, coords.lng]);

  const visiblePlaces = useMemo(
    () => places.filter((place) => (place.lat ?? place.latitude) && (place.lng ?? place.longitude)),
    [places]
  );

  /** Las paradas que entran en pantalla, y sólo de cerca. */
  const visibleStops = useMemo(() => {
    if (!active.paradas || zoom < STOPS_MIN_ZOOM) return [];
    if (!bounds) return stops;
    return stops.filter((stop) => bounds.contains([stop.lat, stop.lng]));
  }, [stops, bounds, zoom, active.paradas]);

  const visibleEvents = useMemo(
    () => events.filter((event) => (event.lat ?? event.latitude) && (event.lng ?? event.longitude)),
    [events]
  );

  /** Centrar en mi ubicación. Es lo único que mueve el mapa por su cuenta. */
  const goToMe = () => {
    if (!granted) {
      request();
      return;
    }
    mapRef.current?.flyTo([coords.lat, coords.lng], Math.max(zoom, 15), { duration: 0.6 });
  };

  const initialCenter: LatLngExpression = [MALDONADO_CENTER.lat, MALDONADO_CENTER.lng];

  return (
    <div className="relative h-[calc(100dvh-4.25rem)] w-full overflow-hidden md:h-[calc(100dvh-3.5rem)]">
      <MapContainer
        center={initialCenter}
        zoom={INITIAL_ZOOM}
        zoomControl={false}
        attributionControl={false}
        // Con cientos de paradas el renderizado por DOM se traba en teléfonos
        // de gama media.
        preferCanvas
        className="h-full w-full"
      >
        <Basemap />
        <ZoomWatcher onChange={setZoom} />
        <MapHandle onReady={onMapReady} />

        <BoundsWatcher onChange={setBounds} />

        {visibleStops.map((stop) => (
          <Marker
            key={`stop-${stop.id}`}
            position={[stop.lat, stop.lng]}
            icon={stopMarker({ zoom, accuracyM: stop.accuracy_m ?? null })}
            eventHandlers={{
              click: () =>
                setSelection({
                  kind: 'stop',
                  id: stop.id,
                  name: stop.name,
                  zone: stop.zone,
                  code: stop.code,
                  accessibility: stop.accessibility,
                  lat: stop.lat,
                  lng: stop.lng,
                }),
            }}
          />
        ))}

        {active.lugares &&
          visiblePlaces.map((place) => (
            <Marker
              key={`place-${place.id}`}
              position={[Number(place.lat ?? place.latitude), Number(place.lng ?? place.longitude)]}
              icon={placeIcon}
              eventHandlers={{
                click: () =>
                  setSelection({
                    kind: 'place',
                    id: place.id,
                    name: place.name,
                    description: place.description,
                    category: place.category,
                  }),
              }}
            />
          ))}

        {active.eventos &&
          visibleEvents.map((event) => (
            <Marker
              key={`event-${event.id}`}
              position={[Number(event.lat ?? event.latitude), Number(event.lng ?? event.longitude)]}
              icon={eventIcon}
              eventHandlers={{
                click: () =>
                  setSelection({
                    kind: 'event',
                    id: event.id,
                    name: event.title,
                    location: event.location,
                    date: event.date,
                  }),
              }}
            />
          ))}

        {granted && <Marker position={[coords.lat, coords.lng]} icon={userIcon} />}
      </MapContainer>

      {/* ---------- Buscador ---------- */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-[500]">
        <div className="pointer-events-auto relative">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
            strokeWidth={2}
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar lugar, parada o evento"
            aria-label="Buscar en el mapa"
            className="input border-transparent pl-10 shadow-float"
          />
        </div>

        <div className="chip-row pointer-events-auto mx-0 mt-2 px-0">
          {LAYERS.map((layer) => (
            <button
              key={layer.id}
              onClick={() => setActive({ ...active, [layer.id]: !active[layer.id] })}
              aria-pressed={active[layer.id]}
              className={`chip shadow-float ${active[layer.id] ? 'chip-active' : ''}`}
            >
              {layer.label}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- Controles flotantes ---------- */}
      <div className="absolute right-3 top-32 z-[500] flex flex-col gap-2">
        <button
          onClick={() => setShowLayers(!showLayers)}
          aria-label="Capas del mapa"
          aria-expanded={showLayers}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-float"
        >
          <Layers className="h-4 w-4 text-ink-900" strokeWidth={1.9} />
        </button>
        <MapControls getMap={() => mapRef.current} onLocate={goToMe} />
      </div>

      {showLayers && (
        <div className="absolute right-3 top-32 z-[510] w-52 animate-fade-in rounded-card bg-white p-3 shadow-float">
          <div className="mb-2 flex items-center justify-between">
            <p className="section-label">Capas</p>
            <button onClick={() => setShowLayers(false)} aria-label="Cerrar capas">
              <X className="h-4 w-4 text-ink-400" strokeWidth={2} />
            </button>
          </div>
          <div className="flex flex-col gap-1">
            {LAYERS.map((layer) => (
              <label
                key={layer.id}
                className="flex cursor-pointer items-center gap-2.5 py-1.5 text-sm font-semibold text-ink-600"
              >
                <input
                  type="checkbox"
                  checked={active[layer.id]}
                  onChange={() => setActive({ ...active, [layer.id]: !active[layer.id] })}
                  className="h-4 w-4 rounded border-sand-400 text-coral-500 focus:ring-coral-500"
                />
                {layer.label}
              </label>
            ))}
          </div>
          {!active.paradas || zoom < STOPS_MIN_ZOOM ? (
            <p className="mt-2 text-xs text-ink-300">Las paradas aparecen al acercar el mapa.</p>
          ) : null}
        </div>
      )}

      {/* ---------- Hoja de selección ---------- */}
      {selection && (
        <SelectionSheet
          selection={selection}
          userCoords={granted ? coords : null}
          onClose={() => setSelection(null)}
        />
      )}
    </div>
  );
}

/**
 * La hoja inferior. Al tocar algo en el mapa no se navega a otra pantalla: se
 * levanta la información sobre el mismo mapa, que sigue siendo el contexto.
 */
function SelectionSheet({
  selection,
  userCoords,
  onClose,
}: {
  selection: Selection;
  userCoords: { lat: number; lng: number } | null;
  onClose: () => void;
}) {
  const { arrivals } = useStopArrivals(selection.kind === 'stop' ? selection.id : undefined);

  const distance =
    selection.kind === 'stop' && userCoords
      ? distanceMeters(userCoords.lat, userCoords.lng, selection.lat, selection.lng)
      : null;

  return (
    <div className="sheet absolute inset-x-0 bottom-0 z-[520] animate-sheet-up px-4 pb-5 pt-2">
      <div className="sheet-grab" />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-extrabold tracking-tight text-ink-900">
            {selection.kind === 'stop' ? formatStopName(selection.name) : selection.name}
          </h2>
          <p className="truncate text-xs text-ink-400">
            {selection.kind === 'stop' && (selection.zone ?? 'Parada')}
            {selection.kind === 'place' && selection.category}
            {selection.kind === 'event' && selection.location}
            {distance !== null && ` · a ${formatDistance(distance)}`}
          </p>
        </div>
        <button onClick={onClose} aria-label="Cerrar" className="flex-none p-1">
          <X className="h-4 w-4 text-ink-400" strokeWidth={2} />
        </button>
      </div>

      {selection.kind === 'stop' && (
        <div className="mt-3.5 flex flex-col gap-2.5">
          {arrivals.length > 0 ? (
            <>
              <div className="flex items-center justify-between">
                <p className="section-label">Próximos</p>
                <LiveIndicator fixAgeSeconds={arrivals[0].fix_age_seconds} />
              </div>
              {arrivals.map((arrival) => (
                <ArrivalRow key={arrival.vehicle_id} arrival={arrival} />
              ))}
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm text-ink-400">
              <Bus className="h-4 w-4" strokeWidth={1.9} />
              Ningún ómnibus en camino ahora
            </p>
          )}
          {selection.accessibility && (
            <p className="flex items-center gap-1.5 text-xs font-semibold text-sea-600">
              <Accessibility className="h-3.5 w-3.5" strokeWidth={2} />
              Parada accesible
            </p>
          )}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Link
          to={
            selection.kind === 'stop'
              ? `/transporte/paradas/${selection.id}`
              : selection.kind === 'place'
                ? `/place/${selection.id}`
                : `/evento/${selection.id}`
          }
          className="btn btn-primary flex-1"
        >
          {selection.kind === 'stop' ? 'Ver parada' : 'Ver ficha'}
          <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
        </Link>
        {selection.kind !== 'stop' && (
          <Link
            to={`/transporte/planificador?destino=${encodeURIComponent(selection.name)}`}
            className="btn btn-secondary flex-none px-4"
            aria-label="Cómo llegar en ómnibus"
          >
            <Bus className="h-4 w-4" strokeWidth={2} />
          </Link>
        )}
      </div>
    </div>
  );
}
