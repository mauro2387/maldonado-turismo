import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, useMap } from 'react-leaflet';
import { DivIcon, LatLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Basemap } from '@components/map/basemap';
import { RouteLine, WalkLine, WALK_GREEN } from '@components/map/RouteLine';
import { stopDot } from '@components/map/stopMarker';
import { busSprite, SPRITE_NATURAL_HEIGHT, SPRITE_NATURAL_WIDTH } from '@components/map/busSprites';
import { useVehiclePositions } from '@hooks/useDepartures';
import { TripLeg, TripOption } from '@services/routePlannerService';
import { formatStopName } from '@lib/stopNames';
import { LatLng } from '@lib/polyline';

/**
 * El viaje, dibujado.
 *
 * El dibujo tiene que contestar tres preguntas en el orden en que se hacen:
 * hasta dónde camino, cuál me tomo y dónde me bajo. Antes contestaba ninguna:
 * los tramos se pintaban con el color de la **empresa**, así que las dos
 * líneas de CODESA de un viaje con transbordo salían del mismo verde y el
 * mapa se leía como un solo trazo que iba y volvía sin explicación.
 *
 * Ahora cada tramo lleva su propio color, el mismo que su ficha en la lista de
 * pasos, y abajo hay una referencia que los nombra. La caminata va punteada y
 * en gris —es la parte que uno resuelve mirando alrededor—, el ómnibus sigue
 * el recorrido publicado y no la recta entre paradas, y donde hay que subirse
 * y bajarse hay una marca con el número de la línea.
 *
 * Y si el ómnibus que hay que tomarse está reportando, se dibuja **dónde está
 * ahora**: es la diferencia entre "la línea pasa por acá" y "ese que viene por
 * la avenida es el tuyo".
 */

/**
 * Verde para la caminata, y con los puntos avanzando hacia donde uno va.
 *
 * Antes iba en gris azulado, "acompañando". El problema es que gris es lo que
 * el ojo descarta: en un mapa donde lo único que uno decide antes de salir es
 * **para qué lado camina**, ese tramo no puede ser el que menos se ve. El
 * verde lo separa del ómnibus sin leer la referencia, y el movimiento contesta
 * la pregunta que el color no contesta, que es hacia dónde. Ver `WalkLine`.
 */
export const WALK_COLOR = WALK_GREEN;

/**
 * Por dónde viene el ómnibus hasta la parada donde lo esperás.
 *
 * Es el mismo coral que usa el mapa de Bondis en vivo para lo mismo, y va
 * punteado: no es el viaje —todavía no te subiste—, es el camino que le falta
 * al coche para llegar a buscarte. Sin esto, en el planificador el ómnibus era
 * un punto suelto en una avenida y no se entendía que ese que viene por ahí es
 * el tuyo.
 */
export const APPROACH_COLOR = '#DC4227';

/**
 * Un color por tramo en ómnibus, en orden.
 *
 * No es el color de la empresa: dos tramos de la misma empresa tienen que
 * distinguirse, que es justamente el caso del transbordo. Salen de la paleta
 * de la app —mar, coral, tinta— y son los mismos que usa la lista de pasos.
 */
const RIDE_COLORS = ['#0E7C86', '#DC4227', '#3D5063'];

export function rideColor(index: number): string {
  return RIDE_COLORS[index % RIDE_COLORS.length];
}

/** El número que se muestra de una línea: "17/19" y no "179". */
export function legLine(leg: TripLeg): string {
  return leg.line_label ?? leg.line_code ?? '';
}

/** Las puntas del viaje: de dónde sale y a dónde llega. */
function endpointIcon(color: string, label: string): DivIcon {
  const width = label.length > 2 ? 26 : 18;
  return new DivIcon({
    className: '',
    iconSize: [width, 18],
    iconAnchor: [width / 2, 9],
    html:
      `<span style="display:flex;align-items:center;justify-content:center;width:${width}px;height:18px;` +
      `border-radius:9px;background:${color};border:3px solid #fff;` +
      `box-shadow:0 1px 4px rgba(11,31,51,.4);color:#fff;font:700 9px/1 Archivo,system-ui,sans-serif;">` +
      `${label}</span>`,
  });
}

const originIcon = endpointIcon('#0E7C86', '');
const destinationIcon = endpointIcon('#DC4227', '');

/** El ómnibus que hay que tomarse, donde está ahora. */
function liveBusIcon(sprite: string | null, heading: number, color: string): DivIcon {
  const width = 22;
  const height = Math.round((width * SPRITE_NATURAL_HEIGHT) / SPRITE_NATURAL_WIDTH);
  const box = Math.ceil(Math.hypot(width, height)) + 12;

  const body = sprite
    ? `<img src="${sprite}" alt="" width="${width}" height="${height}"
          style="position:absolute;left:50%;top:50%;width:${width}px;height:${height}px;
                 transform:translate(-50%,-50%) rotate(${heading}deg);transform-origin:center;
                 filter:drop-shadow(0 1px 2px rgba(11,31,51,.45));" />`
    : `<span style="position:absolute;left:50%;top:50%;width:${width}px;height:${width}px;
                    transform:translate(-50%,-50%);border-radius:50%;background:${color};
                    border:2px solid #fff;"></span>`;

  return new DivIcon({
    className: '',
    iconSize: [box, box],
    iconAnchor: [box / 2, box / 2],
    html:
      `<div style="position:relative;width:${box}px;height:${box}px;">` +
      `<span style="position:absolute;inset:0;border-radius:50%;background:${color}22;border:2px solid ${color};"></span>` +
      `${body}</div>`,
  });
}

/** Encuadra el viaje entero cada vez que cambia la opción elegida. */
function FitToTrip({ points }: { points: LatLng[] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length < 2) return;
    map.fitBounds(new LatLngBounds(points), {
      padding: [28, 28],
      animate: false,
    });
  }, [map, points]);

  return null;
}

export function TripMap({ option }: { option: TripOption }) {
  // Leaflet trabaja en [lat, lng] y la API devuelve [lng, lat].
  const legs = useMemo(() => {
    let rideIndex = -1;

    return option.legs
      .filter((leg) => leg.geometry && leg.geometry.length >= 2)
      .map((leg) => {
        if (leg.type === 'bus') rideIndex += 1;
        return {
          leg,
          color:
            leg.type === 'walk'
              ? WALK_COLOR
              : leg.type === 'wait'
                ? APPROACH_COLOR
                : rideColor(rideIndex),
          path: leg.geometry!.map(([lng, lat]) => [lat, lng] as LatLng),
        };
      });
  }, [option]);

  // El encuadre es el del **viaje**, sin por dónde viene el ómnibus: si el
  // coche está a tres kilómetros, incluirlo achica el viaje hasta que no se
  // lee. Se dibuja igual, pero el mapa abre sobre lo que uno va a hacer.
  const allPoints = useMemo(
    () => legs.filter((entry) => entry.leg.type !== 'wait').flatMap((entry) => entry.path),
    [legs],
  );

  /** Los coches que hay que tomarse, si están reportando. */
  const { vehicles } = useVehiclePositions(true);
  const boarding = useMemo(() => {
    const wanted = new Map<string, { color: string; label: string }>();
    let rideIndex = -1;

    for (const leg of option.legs) {
      if (leg.type !== 'bus') continue;
      rideIndex += 1;
      if (leg.vehicle_id) {
        wanted.set(leg.vehicle_id, { color: rideColor(rideIndex), label: legLine(leg) });
      }
    }

    return vehicles
      .filter((vehicle) => wanted.has(vehicle.vehicle_id))
      .map((vehicle) => ({ vehicle, ...wanted.get(vehicle.vehicle_id)! }));
  }, [vehicles, option]);

  const origin = allPoints[0];
  const destination = allPoints[allPoints.length - 1];

  if (allPoints.length < 2) return null;

  return (
    <MapContainer
      center={origin}
      zoom={14}
      zoomControl={false}
      attributionControl={false}
      className="h-full w-full"
      style={{ background: '#EAE6DF' }}
    >
      <Basemap />
      <FitToTrip points={allPoints} />

      {/* Las caminatas van abajo: en las cuadras que comparte con el ómnibus,
          lo que importa ver es el ómnibus. */}
      {legs
        .filter((entry) => entry.leg.type === 'walk')
        .map((entry, index) => (
          <WalkLine key={`pie-${index}`} positions={entry.path} color={entry.color} />
        ))}

      {/* Por dónde viene el coche hasta tu parada. Va debajo del viaje y
          punteado: es lo que está pasando ahora, no lo que vas a hacer. */}
      {legs
        .filter((entry) => entry.leg.type === 'wait')
        .map((entry, index) => (
          <RouteLine
            key={`viene-${index}`}
            positions={entry.path}
            color={entry.color}
            dashed
            weight={5}
          />
        ))}

      {legs
        .filter((entry) => entry.leg.type === 'bus')
        .map((entry, index) => (
          <RouteLine key={`bondi-${index}`} positions={entry.path} color={entry.color} weight={6} />
        ))}

      {/* Las paradas del tramo en ómnibus, sin la primera y la última: esas
          llevan su propia marca abajo. */}
      {option.legs
        .filter((leg) => leg.type === 'bus')
        .flatMap((leg) => (leg.stops ?? []).slice(1, -1))
        .map((stop) => (
          <Marker
            key={`parada-${stop.id}`}
            position={[stop.lat, stop.lng]}
            icon={stopDot(rideColor(0))}
            title={formatStopName(stop.name)}
            interactive={false}
          />
        ))}

      {/* Dónde se sube y dónde se baja, que es lo que hay que mirar. */}
      {option.legs
        .filter((leg) => leg.type === 'bus')
        .flatMap((leg, index) => {
          const stops = leg.stops ?? [];
          const first = stops[0];
          const last = stops[stops.length - 1];
          return [first, last]
            .filter(Boolean)
            .map((stop) => ({ stop, leg, color: rideColor(index) }));
        })
        .map(({ stop, leg, color }) => (
          <Marker
            key={`clave-${leg.line_code}-${stop.id}`}
            position={[stop.lat, stop.lng]}
            icon={endpointIcon(color, legLine(leg))}
            title={formatStopName(stop.name)}
            interactive={false}
          />
        ))}

      {boarding.map(({ vehicle, color }) => (
        <Marker
          key={`coche-${vehicle.vehicle_id}`}
          position={[Number(vehicle.latitude), Number(vehicle.longitude)]}
          icon={liveBusIcon(busSprite(vehicle), vehicle.heading ?? 0, color)}
          title={`Tu ómnibus, coche ${vehicle.vehicle_id.split('-').pop()}`}
          interactive={false}
        />
      ))}

      <Marker position={origin} icon={originIcon} interactive={false} />
      <Marker position={destination} icon={destinationIcon} interactive={false} />
    </MapContainer>
  );
}

/**
 * Qué es cada color del mapa.
 *
 * Va fuera del mapa y no flotando encima: son tres o cuatro renglones cortos y
 * arriba del dibujo taparían justamente las cuadras del centro.
 */
export function TripLegend({ option }: { option: TripOption }) {
  const rides = option.legs.filter((leg) => leg.type === 'bus');
  const hasWalk = option.legs.some((leg) => leg.type === 'walk');
  const liveBus = option.legs.find((leg) => leg.type === 'bus' && leg.vehicle_id);
  // Sólo hay tramo de acercamiento cuando el coche está reportando: el
  // backend no lo dibuja si la salida salió del horario o de la frecuencia.
  const hasApproach = option.legs.some(
    (leg) => leg.type === 'wait' && (leg.geometry?.length ?? 0) >= 2,
  );

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 text-xs font-semibold text-ink-600">
      {hasWalk && (
        <span className="flex items-center gap-1.5">
          <span
            className="h-1 w-5 flex-none rounded-full"
            style={{
              backgroundImage: `repeating-linear-gradient(90deg, ${WALK_COLOR} 0 2px, transparent 2px 6px)`,
            }}
          />
          A pie
        </span>
      )}

      {hasApproach && (
        <span className="flex items-center gap-1.5">
          <span
            className="h-1 w-5 flex-none rounded-full"
            style={{
              backgroundImage: `repeating-linear-gradient(90deg, ${APPROACH_COLOR} 0 3px, transparent 3px 6px)`,
            }}
          />
          Por dónde viene
        </span>
      )}

      {rides.map((leg, index) => (
        <span key={`${leg.line_code}-${index}`} className="flex min-w-0 items-center gap-1.5">
          <span
            className="h-1 w-5 flex-none rounded-full"
            style={{ background: rideColor(index) }}
          />
          <span className="truncate">Línea {legLine(leg)}</span>
        </span>
      ))}

      {liveBus && (
        <span className="flex items-center gap-1.5 text-live">
          <span className="h-1.5 w-1.5 rounded-full bg-live-dot animate-pulse-dot" />
          Tu ómnibus en vivo
        </span>
      )}
    </div>
  );
}

export default TripMap;
