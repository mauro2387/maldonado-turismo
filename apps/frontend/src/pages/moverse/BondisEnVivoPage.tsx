import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { DivIcon, LatLngBounds, LatLngExpression, Map as LeafletMap } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  ArrowLeft,
  X,
  Accessibility,
  Zap,
  Users,
  ArrowRight,
  Route,
  RouteOff,
  Footprints,
  Crosshair,
  Clock,
} from 'lucide-react';
import { useVehiclePositions } from '@hooks/useDepartures';
import { useGeolocation, MALDONADO_CENTER } from '@hooks/useGeolocation';
import {
  transportService,
  RouteShape,
  RouteShapeStop,
  VehiclePosition,
  CatchResult,
} from '@services/transportService';
import { Basemap, DEFAULT_ZOOM } from '@components/map/basemap';
import { MapControls } from '@components/map/MapControls';
import { RouteLine, WalkLine, WALK_GREEN } from '@components/map/RouteLine';
import { stopMarker } from '@components/map/stopMarker';
import { LineScheduleSheet } from '@components/transporte/LineScheduleSheet';
import {
  busSprite,
  operatorColor,
  SPRITE_NATURAL_HEIGHT,
  SPRITE_NATURAL_WIDTH,
} from '@components/map/busSprites';
import { LiveIndicator } from '@components/ui/LiveIndicator';
import { formatStopName } from '@lib/stopNames';
import { formatDistance } from '@lib/geo';
import {
  cumulativeDistances,
  projectOnPolyline,
  sliceForLeaflet,
  toLeaflet,
  LatLng,
} from '@lib/polyline';

/**
 * Los ómnibus en vivo.
 *
 * El recorrido **no** se dibuja solo: aparece cuando alguien lo pide, tocando
 * un ómnibus o filtrando por número de línea. Ese es el momento en que
 * contesta una pregunta concreta.
 *
 * Y cuando aparece, se dibuja partido en los pedazos que son esa pregunta:
 *
 *   coral   por dónde viene el ómnibus hasta la parada donde lo vas a tomar
 *   gris    lo que ya pasó, para ubicarse
 *   punteado   lo que tenés que caminar hasta esa parada (nada si ya estás)
 *   verde   el viaje que vas a hacer vos, de esa parada en adelante
 *
 * Un solo trazo de un solo color obliga a mirar el mapa y deducir todo eso.
 * Filtrando por línea el corte es otro —ida y vuelta, cada una con su color—
 * porque ahí la pregunta es por dónde va la línea, no cuándo llega este coche.
 */

/** El sprite crece con el zoom: de lejos son puntos, de cerca son ómnibus. */
const SPRITE_ASPECT = SPRITE_NATURAL_HEIGHT / SPRITE_NATURAL_WIDTH;
const SPRITE_WIDTH_BY_ZOOM: Record<number, number> = { 12: 12, 13: 15, 14: 19, 15: 24, 16: 30 };

/**
 * Los colores del recorrido.
 *
 * Salen de la paleta de la app y no de una escala de mapa: el coral es el
 * acento y se reserva para lo que está pasando ahora -el ómnibus viniendo-, el
 * verde mar para lo que va a pasar, y el gris para lo que ya pasó.
 */
const COLORS = {
  incoming: '#DC4227',
  ride: '#0E7C86',
  // La caminata va en verde y con los puntos avanzando hacia la parada: es lo
  // único de esta pantalla que uno tiene que decidir antes de salir -para qué
  // lado camino- y en gris era lo que menos se veía. Ver `WalkLine`.
  walk: WALK_GREEN,
  behind: '#C4CDD6',
  ida: '#DC4227',
  vuelta: '#0E7C86',
  otro: '#3D5063',
} as const;

/**
 * Los umbrales de "¿llego a tomarlo?" ya no viven acá.
 *
 * Estaban escritos como constantes en esta pantalla -cuánto camina una
 * persona, a cuánto anda un ómnibus- y con constantes la respuesta era
 * sistemáticamente que no se llegaba. Ahora la decide el backend, en
 * `CatchBusService`, con la velocidad medida de cada línea y la caminata
 * ruteada por calle. Acá sólo se dibuja lo que contesta.
 */

function spriteSize(zoom: number) {
  const width = SPRITE_WIDTH_BY_ZOOM[Math.round(zoom)] ?? (zoom < 12 ? 12 : 30);
  const height = Math.round(width * SPRITE_ASPECT);
  // Un elemento rotado necesita una caja del largo de su diagonal, si no se
  // recorta cuando el rumbo cae en las diagonales.
  const box = Math.ceil(Math.hypot(width, height)) + 2;
  return { width, height, box };
}

/** El line_code viene del XML de la empresa y termina en innerHTML. */
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string,
  );
}

function busIcon(vehicle: VehiclePosition, zoom: number, selected: boolean): DivIcon {
  const color = operatorColor(vehicle.operator);
  const heading = vehicle.heading ?? 0;
  const sprite = busSprite(vehicle);
  const { width, height, box } = spriteSize(selected ? Math.max(zoom, 15) : zoom);
  const label = vehicle.line_code ? escapeHtml(vehicle.line_label ?? vehicle.line_code) : '';

  // El seleccionado lleva un halo: con sesenta ómnibus en pantalla, agrandarlo
  // solo no alcanza para volver a encontrarlo.
  const halo = selected
    ? `<span style="position:absolute;left:50%;top:50%;width:${box}px;height:${box}px;
                    transform:translate(-50%,-50%);border-radius:50%;
                    background:rgba(220,66,39,.18);border:2px solid #DC4227;"></span>`
    : '';

  const body = sprite
    ? `<img src="${sprite}" alt="" width="${width}" height="${height}"
          style="position:absolute;left:50%;top:50%;width:${width}px;height:${height}px;
                 transform:translate(-50%,-50%) rotate(${heading}deg);transform-origin:center;
                 filter:drop-shadow(0 1px 2px rgba(11,31,51,.45));" />`
    : `<span style="position:absolute;left:50%;top:50%;width:${width}px;height:${width}px;
                    transform:translate(-50%,-50%);border-radius:50%;background:${color};
                    border:2px solid #fff;box-shadow:0 1px 3px rgba(11,31,51,.4);"></span>`;

  // La chapita del número no rota: pegada al sprite quedaría cabeza abajo en
  // la mitad de los recorridos.
  const badge =
    label && zoom >= 13
      ? `<span style="position:absolute;right:0;bottom:1px;min-width:15px;height:15px;padding:0 3px;
                     box-sizing:border-box;border-radius:8px;background:${color};color:#fff;
                     border:1.5px solid #fff;font:700 10px/12px Archivo,system-ui,sans-serif;
                     text-align:center;">${label}</span>`
      : '';

  const size = selected ? box + 14 : box;

  return new DivIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="position:relative;width:${size}px;height:${size}px;">${halo}${body}${badge}</div>`,
  });
}

const userIcon = new DivIcon({
  className: '',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
  html: '<span style="display:block;width:16px;height:16px;border-radius:50%;background:#2A9099;border:3px solid #fff;box-shadow:0 0 0 4px rgba(14,124,134,.22);"></span>',
});

/** Avisa el zoom para dimensionar los sprites. No mueve el mapa. */
function ZoomWatcher({ onChange }: { onChange: (zoom: number) => void }) {
  const map = useMapEvents({ zoomend: () => onChange(map.getZoom()) });
  return null;
}

/**
 * Deja el mapa a mano para las pocas veces que hay que moverlo desde afuera.
 *
 * Antes había un componente que hacía `setView(center, zoom)` en cada
 * renderizado, y como el zoom era estado de React, cualquier acercamiento
 * disparaba un renderizado que volvía a centrar el mapa donde estaba: no se
 * podía navegar. El mapa se mueve **sólo** cuando alguien lo pide.
 */
function MapHandle({ onReady }: { onReady: (map: LeafletMap) => void }) {
  const map = useMap();
  useEffect(() => onReady(map), [map, onReady]);
  return null;
}

export default function BondisEnVivoPage() {
  const [searchParams] = useSearchParams();
  const { coords, granted, request } = useGeolocation();

  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const mapRef = useRef<LeafletMap | null>(null);

  /** Filtro por número de línea. null = todas. */
  const [lineFilter, setLineFilter] = useState<string | null>(searchParams.get('linea'));
  /** El horario de la línea filtrada: si está abierto, y si existe para ofrecerlo. */
  const [showSchedule, setShowSchedule] = useState(false);
  const [hasSchedule, setHasSchedule] = useState(false);
  /**
   * El ómnibus tocado, por número de coche: el id de la posición cambia solo.
   *
   * Puede venir en el enlace (`?coche=codesa-210`). Es lo que hace que desde
   * "tu próximo ómnibus" en la portada se caiga directamente en el mapa con
   * ese coche elegido y su recorrido dibujado, en vez de en un mapa con
   * cuarenta ómnibus donde hay que adivinar cuál era.
   */
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    searchParams.get('coche'),
  );
  /** La parada tocada sobre el recorrido dibujado. */
  const [selectedStopId, setSelectedStopId] = useState<number | null>(null);

  /** Recorridos ya traídos, por clave de pedido. */
  const [shapes, setShapes] = useState<Record<string, RouteShape[]>>({});
  const [shapesFailed, setShapesFailed] = useState(false);
  /**
   * La respuesta a "¿llego a tomar este coche, y dónde?".
   *
   * La contesta el backend, que es el único que tiene la velocidad medida de
   * la línea y el ruteo a pie por calle. Trae la parada, la caminata dibujada
   * y, si no se llega, el motivo.
   */
  const [catchInfo, setCatchInfo] = useState<CatchResult | null>(null);

  const { vehicles: allVehicles } = useVehiclePositions(true);

  /**
   * Los coches que son un servicio. El feed publica también los que van a
   * cargar combustible o hacen un traslado contratado: son ómnibus reales,
   * pero no paran en ningún lado y en el mapa hacen creer que sí.
   */
  const vehicles = useMemo(
    () => allVehicles.filter((vehicle) => vehicle.in_service !== false),
    [allVehicles],
  );

  /** El ómnibus tocado, tal como viene en el último feed. */
  const live = useMemo(
    () => vehicles.find((vehicle) => vehicle.vehicle_id === selectedVehicleId) ?? null,
    [vehicles, selectedVehicleId],
  );

  /**
   * La última posición conocida del ómnibus tocado.
   *
   * El feed se vuelve a pedir cada quince segundos y reemplaza la lista
   * entera. Un coche puede faltar en una vuelta —el GPS no reportó, entró a
   * una zona sin señal, la empresa lo sacó de servicio— y con eso se caía la
   * selección sola: la ficha se cerraba y el recorrido dibujado desaparecía
   * mientras uno lo estaba mirando. Guardando la última posición, la pantalla
   * se queda donde estaba y avisa que perdimos la señal, que es lo que
   * realmente pasó.
   */
  const [lastKnown, setLastKnown] = useState<VehiclePosition | null>(null);
  const [lostAt, setLostAt] = useState<number | null>(null);

  useEffect(() => {
    if (live) {
      setLastKnown(live);
      setLostAt(null);
    } else if (selectedVehicleId) {
      setLostAt((current) => current ?? Date.now());
    }
  }, [live, selectedVehicleId]);

  const selected =
    live ?? (lastKnown?.vehicle_id === selectedVehicleId ? lastKnown : null);

  /**
   * El coche del enlace no está en la calle.
   *
   * Pasa con un enlace de hace un rato: el ómnibus terminó su viaje. Como el
   * enlace trae también la línea, la pantalla queda mostrándola en vez de
   * dejar un mapa mudo donde no pasó nada al tocar.
   */
  const linkedVehicleGone = Boolean(
    searchParams.get('coche') && !selected && vehicles.length > 0,
  );

  /** True cuando lo que se muestra es la última posición y no la de ahora. */
  const selectionStale = Boolean(selected && !live);
  const lostMinutes = lostAt ? Math.max(1, Math.round((Date.now() - lostAt) / 60000)) : 0;

  const onMapReady = useCallback((map: LeafletMap) => {
    mapRef.current = map;
  }, []);

  // --- Qué recorridos hay que traer ---------------------------------------
  //
  // Tocar un ómnibus trae el suyo; filtrar por línea trae todos los de la
  // línea, que es lo que permite dibujar ida y vuelta con colores distintos.
  const itineraryKey = selected?.line_name?.trim().toUpperCase() ?? null;
  const vehicleShapeKey =
    selected?.line_code && itineraryKey ? `${selected.line_code}|${itineraryKey}` : null;
  const lineShapeKey = lineFilter ? `linea:${lineFilter}` : null;
  const wantedKey = vehicleShapeKey ?? lineShapeKey;

  useEffect(() => {
    if (!wantedKey || shapes[wantedKey]) return;

    let cancelled = false;
    const request =
      wantedKey === vehicleShapeKey
        ? transportService.getRouteShapes(selected?.line_code ?? undefined, itineraryKey ?? undefined)
        : transportService.getRouteShapes(lineFilter ?? undefined);

    request
      .then((data) => {
        if (!cancelled) setShapes((current) => ({ ...current, [wantedKey]: data }));
      })
      .catch(() => {
        if (!cancelled) setShapesFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [wantedKey, vehicleShapeKey, lineShapeKey, selected?.line_code, itineraryKey, lineFilter, shapes]);

  /** El recorrido del ómnibus tocado. */
  const activeShape = useMemo(() => {
    const forVehicle = vehicleShapeKey ? shapes[vehicleShapeKey] : undefined;
    return forVehicle?.find((shape) => shape.geometry?.length > 1) ?? null;
  }, [shapes, vehicleShapeKey]);

  /** Los recorridos de la línea filtrada, cuando no hay ningún coche tocado. */
  const lineShapes = useMemo(() => {
    if (selected || !lineShapeKey) return [];
    return (shapes[lineShapeKey] ?? []).filter((shape) => shape.geometry?.length > 1);
  }, [shapes, lineShapeKey, selected]);

  // --- El corte del recorrido en pedazos ----------------------------------
  const trip = useMemo(() => {
    if (!activeShape?.geometry?.length) return null;

    const geometry = activeShape.geometry;
    const cumulative = cumulativeDistances(geometry);
    const total = cumulative[cumulative.length - 1];

    const bus = selected
      ? projectOnPolyline(Number(selected.latitude), Number(selected.longitude), geometry, cumulative)
      : null;
    const busAlong = bus?.alongMeters ?? 0;

    // Dónde tomarlo lo decide el backend (`/transport/vehicles/:id/catch`).
    //
    // Antes se decidía acá, y no se puede: para saber si uno llega hay que
    // comparar la caminata **por calle** contra lo que tarda **esa** línea, que
    // se mide del GPS. La pantalla no tiene ninguna de las dos cosas, así que
    // usaba constantes, y con constantes el resultado era decirle a alguien a
    // una cuadra de la parada que no llegaba. Acá sólo se proyecta la parada
    // que contestó el backend sobre el trazo, para cortar el dibujo.
    const stop = catchInfo?.stop ?? null;
    const boardingAlong = stop
      ? (projectOnPolyline(stop.lat, stop.lng, geometry, cumulative)?.alongMeters ?? null)
      : null;

    return {
      geometry,
      cumulative,
      total,
      busAlong,
      behind: sliceForLeaflet(geometry, cumulative, 0, busAlong),
      incoming:
        boardingAlong === null
          ? sliceForLeaflet(geometry, cumulative, busAlong, total)
          : sliceForLeaflet(geometry, cumulative, busAlong, boardingAlong),
      ride:
        boardingAlong === null
          ? []
          : sliceForLeaflet(geometry, cumulative, boardingAlong, total),
    };
  }, [activeShape, selected, catchInfo]);

  // --- ¿Llego a tomarlo? --------------------------------------------------
  //
  // Un solo pedido por coche tocado: trae la parada, la caminata ruteada y el
  // motivo cuando no se llega. Se rehace si cambia el coche o si uno se movió
  // de verdad, no cada vez que el ómnibus reporta una posición nueva: la
  // respuesta se recalcula sola al tocar otra vez, y repreguntar cada cinco
  // segundos haría parpadear la ficha.
  const selectedVehicleKey = selected?.vehicle_id ?? null;

  useEffect(() => {
    if (!selectedVehicleKey || !granted) {
      setCatchInfo(null);
      return;
    }

    let cancelled = false;
    transportService
      .getCatch(selectedVehicleKey, coords)
      .then((result) => {
        if (!cancelled) setCatchInfo(result);
      })
      .catch(() => {
        if (!cancelled) setCatchInfo(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedVehicleKey, granted, coords.lat, coords.lng]);

  const boardingStopId = catchInfo?.stop?.id ?? null;

  /**
   * Las líneas que están circulando ahora, para el filtro.
   *
   * El código es el del feed —con el que se filtra— y la etiqueta es el número
   * del cartel: la 17/19 llega como "179", y ese número no existe en la calle.
   */
  const linesOnStreet = useMemo(() => {
    const byCode = new Map<string, string>();
    for (const vehicle of vehicles) {
      if (vehicle.line_code) {
        byCode.set(vehicle.line_code, vehicle.line_label ?? vehicle.line_code);
      }
    }
    return [...byCode.entries()]
      .map(([code, label]) => ({ code, label }))
      .sort((a, b) => Number(a.code) - Number(b.code) || a.code.localeCompare(b.code));
  }, [vehicles]);

  const visibleVehicles = useMemo(
    () => (lineFilter ? vehicles.filter((vehicle) => vehicle.line_code === lineFilter) : vehicles),
    [vehicles, lineFilter],
  );

  // ¿Esta línea tiene horario publicado cargado? Se consulta al filtrar, y el
  // botón de horarios aparece sólo si lo hay: ofrecer "Horarios" para abrir una
  // ficha vacía sería prometer algo que todavía no está.
  const filteredLabel = lineFilter ? lineLabelFor(lineFilter, linesOnStreet) : null;
  useEffect(() => {
    setShowSchedule(false);
    setHasSchedule(false);
    if (!filteredLabel) return;
    let cancelled = false;
    transportService
      .getLineSchedule(filteredLabel)
      .then((result) => {
        if (!cancelled) setHasSchedule(Boolean(result.available));
      })
      .catch(() => {
        if (!cancelled) setHasSchedule(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filteredLabel]);

  const activeStops = activeShape?.stops ?? [];
  const selectedStop = activeStops.find((stop) => stop.id === selectedStopId) ?? null;

  const clearSelection = () => {
    setSelectedVehicleId(null);
    setSelectedStopId(null);
    setLastKnown(null);
    setLostAt(null);
    setCatchInfo(null);
  };

  /**
   * El coche que llegó por el enlace se busca en el feed y el mapa se acomoda
   * sobre él. Una sola vez: después el mapa es de quien lo está mirando.
   */
  const openedOnVehicle = useRef(false);

  useEffect(() => {
    if (openedOnVehicle.current || !live || !mapRef.current) return;
    if (searchParams.get('coche') !== live.vehicle_id) return;
    openedOnVehicle.current = true;
    mapRef.current.setView([Number(live.latitude), Number(live.longitude)], 15);
  }, [live, searchParams]);

  /** Centrar en mi ubicación. Es lo único que mueve el mapa por su cuenta. */
  const goToMe = () => {
    if (!granted) {
      request();
      return;
    }
    mapRef.current?.flyTo([coords.lat, coords.lng], Math.max(zoom, 15), { duration: 0.6 });
  };

  /** Encuadrar el recorrido dibujado, cuando alguien lo pide. */
  const fitRoute = () => {
    const points: LatLng[] = activeShape
      ? toLeaflet(activeShape.geometry)
      : lineShapes.flatMap((shape) => toLeaflet(shape.geometry));
    if (points.length < 2 || !mapRef.current) return;
    mapRef.current.fitBounds(new LatLngBounds(points), { padding: [40, 40] });
  };

  const initialCenter: LatLngExpression = [MALDONADO_CENTER.lat, MALDONADO_CENTER.lng];

  return (
    <div className="relative h-[calc(100dvh-4.25rem)] w-full overflow-hidden md:h-[calc(100dvh-3.5rem)]">
      <MapContainer
        center={initialCenter}
        zoom={DEFAULT_ZOOM}
        zoomControl={false}
        attributionControl={false}
        preferCanvas
        className="h-full w-full"
      >
        <Basemap />
        <ZoomWatcher onChange={setZoom} />
        <MapHandle onReady={onMapReady} />

        {/* ---- Recorrido del ómnibus tocado, partido en lo que importa ---- */}
        {trip && (
          <>
            {/* Lo que ya pasó, al fondo y apagado. */}
            <RouteLine positions={trip.behind} color={COLORS.behind} weight={4} />
            {/* Por dónde viene hasta tu parada. */}
            <RouteLine positions={trip.incoming} color={COLORS.incoming} />
            {/* Y de ahí en adelante, tu viaje. */}
            <RouteLine positions={trip.ride} color={COLORS.ride} />
          </>
        )}

        {/* ---- La caminata hasta la parada donde esperarlo ---- */}
        {catchInfo && catchInfo.walk_geometry.length > 1 && (
          <WalkLine positions={toLeaflet(catchInfo.walk_geometry)} color={COLORS.walk} />
        )}

        {/* ---- Ida y vuelta de la línea filtrada ----
             Los dos sentidos comparten casi todas las calles, así que uno tapa
             al otro: dibujados del mismo grosor, la línea se ve de un solo
             color y parece que fuera un solo recorrido. La ida va abajo y más
             gruesa y la vuelta arriba y más fina, de manera que en las cuadras
             compartidas queda un borde coral alrededor de un centro verde —se
             ve que van los dos— y en las que no, cada una con su color. */}
        {orderedByWay(lineShapes).map(({ shape, weight, casing }) => (
          <RouteLine
            key={`${shape.operator}-${shape.line_code}-${shape.itinerary_key}`}
            positions={toLeaflet(shape.geometry)}
            color={wayColor(shape.way)}
            weight={weight}
            casing={casing}
          />
        ))}

        {/* Las paradas del recorrido activo. */}
        {activeStops.map((stop) => (
          <Marker
            key={`parada-${stop.id}`}
            position={[stop.lat, stop.lng]}
            icon={stopMarker({
              zoom,
              boarding: stop.id === boardingStopId,
              accuracyM: stop.accuracy_m ?? null,
              reliable: stop.reliable,
            })}
            title={formatStopName(stop.name)}
            eventHandlers={{ click: () => setSelectedStopId(stop.id) }}
          />
        ))}

        {visibleVehicles.map((vehicle) => (
          <Marker
            key={vehicle.vehicle_id}
            position={[Number(vehicle.latitude), Number(vehicle.longitude)]}
            icon={busIcon(vehicle, zoom, vehicle.vehicle_id === selectedVehicleId)}
            eventHandlers={{
              click: () => {
                setSelectedVehicleId(vehicle.vehicle_id);
                setSelectedStopId(null);
              },
            }}
          />
        ))}

        {granted && <Marker position={[coords.lat, coords.lng]} icon={userIcon} />}
      </MapContainer>

      {/* ---------- Encabezado ---------- */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-[500]">
        <div className="pointer-events-auto flex items-center gap-2 rounded-card bg-white px-3 py-2.5 shadow-float">
          <Link to="/moverse" aria-label="Volver a Moverse" className="flex-none p-0.5">
            <ArrowLeft className="h-4 w-4 text-ink-900" strokeWidth={2.2} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold tracking-tight text-ink-900">
              Bondis en vivo
            </p>
            <p className="truncate text-xs text-ink-400">
              {visibleVehicles.length} en calle
              {lineFilter ? ` · línea ${lineLabelFor(lineFilter, linesOnStreet)}` : ''}
              {!selected && !lineFilter && ' · tocá uno para ver su recorrido'}
            </p>
          </div>
          {vehicles.length > 0 && <LiveIndicator fixAgeSeconds={0} showAge={false} />}
        </div>

        {linesOnStreet.length > 0 && (
          <div className="chip-row pointer-events-auto mx-0 mt-2 px-0">
            <button
              onClick={() => {
                setLineFilter(null);
                clearSelection();
              }}
              className={`chip ${lineFilter === null ? 'chip-active' : ''}`}
            >
              Todas
            </button>
            {linesOnStreet.map(({ code, label }) => (
              <button
                key={code}
                onClick={() => {
                  setLineFilter(code === lineFilter ? null : code);
                  clearSelection();
                }}
                className={`chip ${lineFilter === code ? 'chip-active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ---------- La pila de abajo ----------
          El aviso y las referencias de color van uno arriba del otro y no cada
          uno pegado al borde: si no, se tapan entre sí. Cuando hay una ficha
          abierta las referencias viven adentro de ella —la ficha ocupa
          justamente este lugar—. */}
      {(linkedVehicleGone || (!selected && lineShapes.length > 0)) && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-[510] flex flex-col gap-2">
          {linkedVehicleGone && (
            <div className="pointer-events-auto flex items-center gap-3 rounded-card bg-ink-900 px-3.5 py-3 shadow-float">
              <p className="min-w-0 flex-1 text-xs font-semibold text-white">
                Ese coche ya terminó su viaje.
                {lineFilter ? ` Estos son los de la línea ${lineFilter} que andan ahora.` : ''}
              </p>
              <button
                onClick={() => setSelectedVehicleId(null)}
                aria-label="Cerrar aviso"
                className="flex-none p-0.5"
              >
                <X className="h-4 w-4 text-white/70" strokeWidth={2} />
              </button>
            </div>
          )}

          {!selected && lineShapes.length > 0 && (
            <div className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-card bg-white/95 px-3 py-2 shadow-float backdrop-blur">
              {legendForLine(lineShapes).map((entry) => (
                <Legend key={entry.label} color={entry.color} label={entry.label} />
              ))}
              {hasSchedule && filteredLabel && (
                <button
                  onClick={() => setShowSchedule(true)}
                  className="ml-auto flex items-center gap-1 text-xs font-bold text-ink-600"
                >
                  <Clock className="h-3.5 w-3.5" strokeWidth={2.5} />
                  Horarios
                </button>
              )}
              <button
                onClick={fitRoute}
                className={`flex items-center gap-1 text-xs font-bold text-coral-500 ${
                  hasSchedule && filteredLabel ? '' : 'ml-auto'
                }`}
              >
                <Crosshair className="h-3.5 w-3.5" strokeWidth={2.5} />
                Ver todo
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---------- Ficha de horarios de la línea filtrada ---------- */}
      {showSchedule && filteredLabel && (
        <LineScheduleSheet label={filteredLabel} onClose={() => setShowSchedule(false)} />
      )}

      <MapControls
        getMap={() => mapRef.current}
        onLocate={goToMe}
        className="absolute right-3 top-36"
      />

      {/* ---------- Ficha de la parada tocada ---------- */}
      {selectedStop && (
        <StopSheet
          stop={selectedStop}
          lineCode={selected?.line_code ?? null}
          isBoarding={selectedStop.id === boardingStopId}
          onClose={() => setSelectedStopId(null)}
        />
      )}

      {/* ---------- Ficha del ómnibus tocado ---------- */}
      {selected && !selectedStop && (
        <VehicleSheet
          vehicle={selected}
          shape={activeShape}
          shapesFailed={shapesFailed}
          catchInfo={catchInfo}
          hasRoute={Boolean(trip)}
          stale={selectionStale}
          staleMinutes={lostMinutes}
          locationDenied={!granted}
          onFit={fitRoute}
          onClose={clearSelection}
        />
      )}
    </div>
  );
}

/** El número del cartel de la línea filtrada, para el encabezado. */
function lineLabelFor(code: string, lines: Array<{ code: string; label: string }>): string {
  return lines.find((line) => line.code === code)?.label ?? code;
}

/**
 * Los recorridos en el orden en que hay que dibujarlos: primero los de ida,
 * gruesos, y encima los de vuelta, más finos.
 */
function orderedByWay(
  shapes: RouteShape[],
): Array<{ shape: RouteShape; weight: number; casing: boolean }> {
  // La diferencia de grosor tiene que alcanzar para que el de abajo asome
  // -si no, la línea se lee de un solo color- y no tanta como para que un
  // sentido parezca el principal y el otro un accesorio.
  const peso = (way: RouteShape['way']) => (way === 'vuelta' ? 4 : 6.5);

  return [...shapes]
    .sort((a, b) => peso(b.way) - peso(a.way))
    .map((shape) => ({
      shape,
      weight: peso(shape.way),
      // El contorno blanco lo lleva sólo el trazo de abajo: el de arriba lo
      // taparía.
      casing: shape.way !== 'vuelta',
    }));
}

function wayColor(way: RouteShape['way']): string {
  return way === 'ida' ? COLORS.ida : way === 'vuelta' ? COLORS.vuelta : COLORS.otro;
}

/**
 * Las referencias de color de una línea: una por sentido, no una por recorrido.
 *
 * La 24 tiene seis recorridos —tres de ida por avenidas distintas y tres de
 * vuelta— y listarlos todos llena la pantalla con seis renglones de dos
 * colores. Lo que hay que poder leer es "el coral va a Punta del Este y el
 * verde vuelve a San Carlos"; cuántas variantes hay se dice al lado.
 */
function legendForLine(shapes: RouteShape[]): Array<{ color: string; label: string }> {
  const groups = new Map<string, RouteShape[]>();
  for (const shape of shapes) {
    const way = shape.way ?? 'otro';
    groups.set(way, [...(groups.get(way) ?? []), shape]);
  }

  const titles: Record<string, string> = {
    ida: 'Ida',
    vuelta: 'Vuelta',
    circular: 'Circular',
    otro: 'Recorrido',
  };

  return [...groups.entries()].map(([way, group]) => {
    const destino = group[0].itinerary_name ? formatStopName(group[0].itinerary_name) : '';
    const variantes = group.length > 1 ? ` (${group.length})` : '';
    return {
      color: wayColor(way === 'otro' ? null : (way as RouteShape['way'])),
      label: `${titles[way]}${variantes}${destino ? ` · ${destino}` : ''}`,
    };
  });
}

function Legend({
  color,
  label,
  dashed = false,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-ink-600">
      <span
        className="h-1 w-5 flex-none rounded-full"
        style={
          dashed
            ? { backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 3px, transparent 3px 6px)` }
            : { background: color }
        }
      />
      <span className="truncate">{label}</span>
    </span>
  );
}

/**
 * La ficha de la parada tocada sobre el recorrido.
 *
 * Es chica a propósito: contesta "¿cuál es esta parada?" y ofrece el paso
 * siguiente, que es ver qué viene. Todo lo demás ya está en la pantalla de la
 * parada, que existe desde antes.
 */
function StopSheet({
  stop,
  lineCode,
  isBoarding,
  onClose,
}: {
  stop: RouteShapeStop;
  lineCode: string | null;
  isBoarding: boolean;
  onClose: () => void;
}) {
  return (
    <div className="sheet absolute inset-x-0 bottom-0 z-[540] animate-sheet-up px-4 pb-5 pt-2">
      <div className="sheet-grab" />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-extrabold tracking-tight text-ink-900">
            {formatStopName(stop.name)}
          </h2>
          <p className="truncate text-xs text-ink-400">
            Parada {stop.code}
            {lineCode ? ` · parada ${stop.sequence} de la línea ${lineCode}` : ''}
            {isBoarding ? ' · acá te conviene esperarlo' : ''}
          </p>
        </div>
        <button onClick={onClose} aria-label="Cerrar" className="flex-none p-1">
          <X className="h-4 w-4 text-ink-400" strokeWidth={2} />
        </button>
      </div>

      {/* La coordenada de las paradas se deduce de dónde frenan los ómnibus, y
          cada una viene con su error medido. Para la mayoría el punto cae sobre
          el cartel; para el resto hay que decir cuánto puede fallar, con el
          número, en vez de hacer caminar a alguien hasta una esquina donde no
          hay nada. */}
      {stop.reliable === false && (
        <p className="mt-3 rounded-card bg-sand-100 px-3 py-2 text-xs text-ink-400">
          El ómnibus para acá, pero el cartel todavía no está ubicado con precisión
          {stop.accuracy_m ? `: puede estar hasta ${stop.accuracy_m} m de este punto` : ''}. Mirá
          alrededor cuando llegues.
        </p>
      )}

      <Link
        to={`/transporte/paradas/${stop.id}`}
        className="mt-3.5 flex items-center justify-between rounded-card bg-sand-100 px-3 py-2.5 text-data font-bold text-ink-900"
      >
        Ver qué viene a esta parada
        <ArrowRight className="h-4 w-4 flex-none text-ink-400" strokeWidth={2.5} />
      </Link>
    </div>
  );
}

/**
 * La ficha del ómnibus.
 *
 * Contesta lo que se pregunta quien lo toca: qué línea es, a dónde va, por
 * dónde viene, dónde conviene esperarlo y si le va a servir (accesible, cuán
 * lleno). El recorrido en el mapa es la otra mitad de la respuesta, y acá se
 * dice de dónde salió: el que publica la empresa, o la reconstrucción por GPS
 * para las pocas líneas que no lo publican.
 */
function VehicleSheet({
  vehicle,
  shape,
  shapesFailed,
  catchInfo,
  hasRoute,
  stale,
  staleMinutes,
  locationDenied,
  onFit,
  onClose,
}: {
  vehicle: VehiclePosition;
  shape: RouteShape | null;
  shapesFailed: boolean;
  /** Si se llega a tomar este coche y dónde. Lo contesta el backend. */
  catchInfo: CatchResult | null;
  hasRoute: boolean;
  /** La posición dibujada es la última conocida: el feed dejó de traerlo. */
  stale: boolean;
  staleMinutes: number;
  locationDenied: boolean;
  onFit: () => void;
  onClose: () => void;
}) {
  const color = operatorColor(vehicle.operator);

  return (
    <div className="sheet absolute inset-x-0 bottom-0 z-[520] max-h-[62%] animate-sheet-up overflow-y-auto px-4 pb-5 pt-2">
      <div className="sheet-grab" />

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className="mt-0.5 flex h-7 min-w-7 flex-none items-center justify-center rounded-chip px-1.5 text-xs font-extrabold text-white"
            style={{ background: color }}
          >
            {vehicle.line_label ?? vehicle.line_code ?? '?'}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-extrabold tracking-tight text-ink-900">
              {vehicle.line_name ?? 'Línea sin destino publicado'}
            </h2>
            <p className="truncate text-xs text-ink-400">
              Coche {vehicle.vehicle_id.split('-').pop()}
              {vehicle.departure_time ? ` · salió ${vehicle.departure_time}` : ''}
            </p>
          </div>
        </div>
        <button onClick={onClose} aria-label="Cerrar" className="flex-none p-1">
          <X className="h-4 w-4 text-ink-400" strokeWidth={2} />
        </button>
      </div>

      {/* Cuando el coche deja de reportar no se cierra la ficha: se dice.
          Todo lo de abajo sigue siendo cierto salvo dónde está parado. */}
      {stale && (
        <p className="mt-3 rounded-card bg-warn-soft px-3 py-2 text-xs font-semibold text-warn">
          Perdimos la señal de este coche hace {staleMinutes} min. Lo que ves es su última
          posición.
        </p>
      )}

      {/* Qué es cada color del mapa. Va acá arriba y no flotando sobre el
          mapa porque esta ficha justamente tapa el borde de abajo. */}
      {hasRoute && (
        <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-y border-sand-200 py-2">
          <Legend color={COLORS.incoming} label="Por dónde viene" />
          {catchInfo?.stop && <Legend color={COLORS.ride} label="Tu viaje" />}
          {catchInfo?.walk_geometry?.length ? (
            <Legend color={COLORS.walk} label="A pie" dashed />
          ) : null}
          <Legend color={COLORS.behind} label="Ya pasó" />
          <button
            onClick={onFit}
            className="ml-auto flex items-center gap-1 text-xs font-bold text-coral-500"
          >
            <Crosshair className="h-3.5 w-3.5" strokeWidth={2.5} />
            Ver todo
          </button>
        </div>
      )}

      {/* Dónde tomarlo, o por qué no. Es lo que convierte el mapa en una
          instrucción. La decisión viene del backend: compara la caminata por
          calle contra lo que tarda esa línea, medida del GPS. */}
      {catchInfo?.stop ? (
        <div className="mt-3.5 flex items-start gap-2.5 rounded-card bg-sand-100 px-3 py-2.5">
          <Footprints className="mt-0.5 h-4 w-4 flex-none text-ink-500" strokeWidth={2} />
          <p className="min-w-0 flex-1 text-data">
            <span className="font-bold text-ink-900">
              {catchInfo.walk_minutes
                ? `${catchInfo.walk_minutes} min hasta ${formatStopName(catchInfo.stop.name)}`
                : `Tomalo en ${formatStopName(catchInfo.stop.name)}`}
            </span>
            {catchInfo.walk_distance_m !== null && (
              <span className="text-ink-400"> · {formatDistance(catchInfo.walk_distance_m)} caminando</span>
            )}
            {/* Cuánto margen queda. "Vas justo" es un dato distinto de "llegás":
                cambia si uno sale caminando o se queda esperando el siguiente. */}
            {catchInfo.bus_minutes !== null && (
              <span className="mt-0.5 block text-ink-400">
                {catchInfo.slack_minutes !== null && catchInfo.slack_minutes < 1
                  ? `Vas justo: el bondi llega en ${catchInfo.bus_minutes} min.`
                  : `El bondi llega en ${catchInfo.bus_minutes} min, te sobran ${catchInfo.slack_minutes}.`}
              </span>
            )}
          </p>
        </div>
      ) : catchInfo && !catchInfo.catchable && catchInfo.reason !== 'sin_recorrido' ? (
        /* Este coche no se alcanza. Decirlo es la respuesta: antes se mandaba
           igual a la parada más cercana del recorrido, que podía estar pegada
           al ómnibus y a veinte cuadras de uno. */
        <div className="mt-3.5 flex items-start gap-2.5 rounded-card bg-warn-soft px-3 py-2.5">
          <Footprints className="mt-0.5 h-4 w-4 flex-none text-warn" strokeWidth={2} />
          <p className="min-w-0 flex-1 text-data">
            <span className="font-bold text-warn">No llegás a este bondi</span>
            <span className="mt-0.5 block text-ink-400">
              {catchInfo.reason === 'lejos' && catchInfo.nearest_walk_m !== null
                ? `Su parada más cercana te queda a ${formatDistance(catchInfo.nearest_walk_m)}.`
                : catchInfo.reason === 'ya_paso'
                  ? 'Ya pasó por las paradas que te quedan cerca.'
                  : 'Pasa por la parada antes de que llegues caminando. Mirá otro de la línea.'}
            </span>
            {/* El "no llegás" es una cuenta, no una certeza: sale de una
                velocidad promedio de la línea y de un paso de caminata
                promedio. Decirlo evita las dos formas de quedar mal: que
                alguien no salga por un cálculo que erró, y que alguien salga
                corriendo creyendo que la app se lo garantizó. */}
            <span className="mt-1.5 block text-xs text-ink-400">
              Es un cálculo aproximado: usa la velocidad promedio de la línea y un
              paso de caminata promedio. Si el ómnibus se demora o vas rápido, capaz
              lo alcanzás igual.
            </span>
          </p>
        </div>
      ) : (
        locationDenied && (
          <p className="mt-3.5 text-xs text-ink-400">
            Activá tu ubicación y te decimos en qué parada conviene esperarlo.
          </p>
        )
      )}

      {/* Por dónde viene. Es el dato que dice si ya pasó o todavía no. */}
      {(vehicle.prev_stop_name || vehicle.next_stop_name) && (
        <div className="mt-2.5 flex items-center gap-2 rounded-card bg-sand-100 px-3 py-2.5 text-data">
          {vehicle.prev_stop_name && (
            <span className="min-w-0 flex-1 truncate text-ink-400">
              {formatStopName(vehicle.prev_stop_name)}
            </span>
          )}
          <ArrowRight className="h-3.5 w-3.5 flex-none text-ink-300" strokeWidth={2.5} />
          {vehicle.next_stop_name ? (
            <span className="min-w-0 flex-1 truncate font-bold text-ink-900">
              {formatStopName(vehicle.next_stop_name)}
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate text-ink-300">
              La empresa no publica la próxima
            </span>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-semibold">
        {vehicle.accessible && (
          <span className="flex items-center gap-1.5 text-ink-600">
            <Accessibility className="h-3.5 w-3.5" strokeWidth={2} />
            Accesible
          </span>
        )}
        {vehicle.electric && (
          <span className="flex items-center gap-1.5 text-ink-600">
            <Zap className="h-3.5 w-3.5" strokeWidth={2} />
            Eléctrico
          </span>
        )}
        {vehicle.occupancy_pct != null && (
          <span className="flex items-center gap-1.5 text-ink-600">
            <Users className="h-3.5 w-3.5" strokeWidth={2} />
            {vehicle.occupancy_pct}% ocupado
          </span>
        )}
        {vehicle.stopped_minutes != null && vehicle.stopped_minutes >= 10 && (
          <span className="text-ink-400">Detenido hace {vehicle.stopped_minutes} min</span>
        )}
      </div>

      {/* El recorrido calle por calle, tal como lo publica la empresa. Es el
          texto de la fuente, no una descripción escrita acá. */}
      {shape?.official?.street_text && (
        <details className="mt-3.5 border-t border-sand-200 pt-3">
          <summary className="cursor-pointer text-xs font-bold text-coral-500">
            Ver por dónde va
          </summary>
          <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-ink-600">
            {shape.official.street_text}
          </p>
          {shape.official.highlights.length > 0 && (
            <p className="mt-2 text-xs text-ink-400">
              <span className="font-bold text-ink-600">Pasa por: </span>
              {shape.official.highlights.slice(0, 12).join(' · ')}
            </p>
          )}
        </details>
      )}

      {/* De dónde sale la línea dibujada. Prometer el recorrido oficial cuando
          es una reconstrucción es la forma más rápida de perder la confianza
          de quien se guía por el mapa. */}
      <p className="mt-3.5 flex items-start gap-1.5 text-xs text-ink-300">
        {shape?.source === 'oficial' ? (
          <>
            <Route className="mt-0.5 h-3.5 w-3.5 flex-none" strokeWidth={2} />
            Recorrido publicado por la empresa
            {shape.official?.name ? ` · ${shape.official.name}` : ''}.
            {shape.stops?.length ? ` ${shape.stops.length} paradas.` : ''}
          </>
        ) : shape ? (
          <>
            <Route className="mt-0.5 h-3.5 w-3.5 flex-none" strokeWidth={2} />
            La empresa no publica este recorrido: el dibujado está reconstruido con las
            posiciones de las unidades.
          </>
        ) : shapesFailed ? (
          <>
            <RouteOff className="mt-0.5 h-3.5 w-3.5 flex-none" strokeWidth={2} />
            No pudimos traer el recorrido.
          </>
        ) : (
          <>
            <RouteOff className="mt-0.5 h-3.5 w-3.5 flex-none" strokeWidth={2} />
            {/* Se aclara el viaje y no la línea: la 24 hace cuatro recorridos
                distintos y podemos tener tres y faltarnos el cuarto. */}
            Todavía no tenemos el recorrido de este viaje de la línea{' '}
            {vehicle.line_label ?? vehicle.line_code}.
          </>
        )}
      </p>
    </div>
  );
}
