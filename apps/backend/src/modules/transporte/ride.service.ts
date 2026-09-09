import { Injectable } from '@nestjs/common';
import { RouteStopSequence, StopOnRoute, StopSequenceService } from './stop-sequence.service';
import { itineraryKey, RouteShapesService } from './route-shapes.service';
import { VehiclePositionsService } from './vehicle-positions.service';
import { OfficialRoutesService } from './official-routes.service';
import { LineSpeedService } from './line-speed.service';
import { WalkingService } from './walking.service';
import { slicePolyline } from './route-match.util';
import { cumulativeDistances, distanceAlongPolyline, distanceMeters, LngLat } from './geo.util';

/**
 * Ya te subiste. ¿Dónde te bajás?
 *
 * Es la otra mitad de `CatchBusService`. Aquélla contesta antes de subir -¿lo
 * alcanzo, y en qué parada?-; ésta contesta arriba del coche, que es donde la
 * pregunta cambia por completo: uno ya no elige nada, sólo necesita saber
 * cuándo tocar el timbre. Y es el momento en que la app más se usa y en el que
 * peor se la puede mirar: parado, con una mano, mirando por la ventanilla para
 * ubicarse.
 *
 * Por eso la respuesta no es una lista de paradas ni un mapa: son tres datos y
 * un aviso. Dónde te bajás, cuánto falta, y qué hacer **ahora**.
 *
 * ## Dónde te bajás no es la parada más cercana al destino
 *
 * Es la parada que te deja **llegando antes**. No es lo mismo: una parada 80 m
 * más cerca del destino pero cuatro cuadras más adelante sobre el recorrido
 * cuesta tres minutos de ómnibus para ahorrar uno de caminata. Así que se
 * elige por la misma línea de tiempo que usa el planificador:
 *
 *     costo = lo que falta de ómnibus + lo que se camina después
 *
 * Y esa elección es **estable mientras el coche avanza**, que es la propiedad
 * que permite mostrarla sin que parpadee: los minutos de ómnibus hasta todas
 * las paradas que quedan adelante bajan por igual a medida que el coche
 * avanza, así que la diferencia entre dos candidatas no cambia. La bajada
 * elegida sólo cambia cuando el coche la pasa, y eso ya tiene su propio aviso.
 *
 * ## El aviso se da por metros, no por paradas
 *
 * "Faltan dos paradas" no dice nada en Maldonado: dos paradas en el centro son
 * dos cuadras y dos paradas en la Ruta 10 son tres kilómetros. Lo que decide
 * cuándo levantarse es la distancia; las paradas son el dato de apoyo, sirven
 * para saber que no hay otra antes y no confundirse de campana.
 *
 * Por eso `alert` se calcula con metros y `stops_away` va aparte.
 *
 * ## Lo que no hace
 *
 * No verifica que la persona esté realmente arriba de ese coche. Se podría
 * comparar su GPS contra el del ómnibus, pero las dos posiciones tienen error
 * y la del feed además llega con demora: adentro de un ómnibus en movimiento
 * eso da falsos "no estás en este coche" justo cuando más molesta. Quien tocó
 * "ya me subí" sabe mejor que el GPS. Lo que sí se detecta es que el coche
 * **dejó de reportar**, que es lo que pasa de verdad y deja la pantalla
 * contando metros con el último dato bueno.
 */

/**
 * Una cuadra de Maldonado.
 *
 * Está en 90 m porque es lo que mide el amanzanado del centro y de Maldonado
 * Nuevo -entre 80 y 100 m-, el mismo número con el que `StopSequenceService`
 * decide si una parada se ve desde donde uno llega. Se usa para traducir los
 * metros a la unidad en la que la gente piensa el viaje: nadie sabe qué son
 * 270 m, todos saben qué son tres cuadras.
 */
const BLOCK_M = 90;

/**
 * Cuánto tiene que pasarse el coche de la parada para dar el viaje por
 * terminado.
 *
 * No es cero: la posición del feed cae a decenas de metros de la calle y la
 * parada tiene su propio error, así que con el corte en cero el aviso
 * "te pasaste" saltaría con el ómnibus **frenando** en la parada, que es el
 * peor momento posible para decirle a alguien que ya se pasó. Media cuadra de
 * margen cubre los dos errores.
 */
const PASSED_MARGIN_M = 50;

/**
 * A partir de acá hay que tocar el timbre.
 *
 * Son tres cuadras. El timbre se toca antes de la parada, no en la parada, y
 * un ómnibus en ciudad hace tres cuadras en menos de un minuto: es el aviso
 * que llega a tiempo sin sacar a nadie del asiento cinco minutos antes.
 */
const RING_M = 3 * BLOCK_M;

/**
 * A partir de acá conviene ir juntando las cosas.
 *
 * Ocho cuadras: alcanza para guardar el teléfono, levantar la mochila y
 * acercarse a la puerta en un coche lleno, que es donde estos metros se gastan
 * de verdad.
 */
const PREPARE_M = 8 * BLOCK_M;

/**
 * Cuánto se acepta caminar desde la bajada hasta el destino.
 *
 * El mismo tope que el planificador (`MAX_WALK_M`), y estar alineados no es
 * cosmético: el planificador ya prometió un viaje con cierta caminata final, y
 * si acá el tope fuera más chico la pantalla de a bordo contestaría "este
 * ómnibus no te deja cerca" sobre el viaje que la propia app acaba de armar.
 */
const MAX_WALK_M = 900;

/**
 * Cuánto error de posición de la parada se regala antes de cobrarlo.
 *
 * Mismo criterio y mismo número que el planificador y que `CatchBusService`.
 * Una parada con 90 m de error no es inservible, es media cuadra de buscar el
 * cartel: no se descarta, se le suman los metros de más a la caminata y así
 * compite con las demás en vez de desaparecer.
 */
const HUNTING_FREE_M = 60;

/**
 * Hace cuánto puede haber reportado el coche para seguir creyéndole.
 *
 * Los feeds de las tres empresas publican cada 20-30 s. Con dos minutos sin
 * novedades el ómnibus puede haber hecho dos kilómetros, y mostrar "faltan 400
 * m" con un dato de hace dos minutos es exactamente cómo se pasa alguien de
 * parada creyéndole a la app.
 */
const STALE_FIX_MIN = 2;

export interface RideStop {
  id: number;
  code: string;
  name: string;
  lat: number;
  lng: number;
}

export interface RideStatus {
  /** El coche está reportando y todavía le falta para tu bajada. */
  active: boolean;

  /** Dónde bajarse. */
  stop: RideStop | null;

  /**
   * La próxima parada del recorrido, que puede ser la tuya.
   *
   * Sirve para lo que uno hace de verdad arriba del ómnibus: mirar por la
   * ventanilla y confirmar contra el cartel que la app no se volvió loca.
   */
  next_stop: RideStop | null;

  /**
   * Cuántas paradas hace el coche **antes** de la tuya.
   *
   * Cero es "la próxima es la tuya". Es el número que se muestra, así que la
   * convención importa: contarlo al revés hace que alguien se baje una parada
   * antes o después, que es el único error que esta pantalla no se puede
   * permitir.
   */
  stops_away: number | null;

  /** Metros de recorrido que faltan hasta la bajada. */
  meters_away: number | null;

  /** Los mismos metros en cuadras, que es como se piensa el viaje. */
  blocks_away: number | null;

  /** Minutos hasta la bajada, con la velocidad medida del tramo que falta. */
  minutes_away: number | null;

  /**
   * Qué hacer ahora:
   * - `viaja`: falta, quedate tranquilo.
   * - `preparate`: juntá las cosas y acercate a la puerta.
   * - `bajate`: tocá el timbre.
   * - `te_pasaste`: el coche ya pasó tu parada.
   */
  alert: 'viaja' | 'preparate' | 'bajate' | 'te_pasaste' | null;

  /** La caminata desde la bajada hasta el destino, por calle. */
  walk_minutes: number | null;
  walk_distance_m: number | null;
  walk_geometry: LngLat[];
  /** True si la caminata es la recta porque el ruteador no contestó. */
  walk_straight: boolean;

  /** Lo que le falta al coche hasta la bajada, dibujado sobre el recorrido. */
  ride_geometry: LngLat[];

  /** El número del cartel y hacia dónde va, para confirmar que es este coche. */
  line_label: string | null;
  headsign: string | null;

  /**
   * Por qué no se puede contestar:
   * - `sin_coche`: ese coche no está en el feed.
   * - `sin_senal`: está, pero su última posición es vieja.
   * - `sin_recorrido`: no hay trazo o secuencia de paradas para su itinerario.
   * - `no_te_deja`: ninguna parada que le queda por delante cae a distancia de
   *   caminar del destino. Este ómnibus no va para donde vas.
   */
  reason: 'sin_coche' | 'sin_senal' | 'sin_recorrido' | 'no_te_deja' | null;
}

/** Una bajada posible, ya evaluada. */
interface Alighting {
  stop: StopOnRoute;
  /** Minutos de ómnibus desde donde está el coche hasta esa parada. */
  busMinutes: number;
  /** Minutos de caminata de esa parada al destino, con el castigo del cartel. */
  walkMinutes: number;
  /** Metros de recorrido que faltan hasta ella. Negativo si ya la pasó. */
  remainingMeters: number;
  /** Cuántas paradas hace el coche antes de ésa. */
  stopsAway: number;
}

const NO_RIDE: RideStatus = {
  active: false,
  stop: null,
  next_stop: null,
  stops_away: null,
  meters_away: null,
  blocks_away: null,
  minutes_away: null,
  alert: null,
  walk_minutes: null,
  walk_distance_m: null,
  walk_geometry: [],
  walk_straight: true,
  ride_geometry: [],
  line_label: null,
  headsign: null,
  reason: 'sin_coche',
};

/**
 * El aviso, a partir de los metros que faltan.
 *
 * Va aparte del servicio porque es la regla de producto que hay que poder
 * mirar y discutir sin levantar la base ni el GPS, y la que hay que congelar
 * en una prueba: los umbrales se eligieron a mano y dentro de un mes nadie se
 * va a acordar de por qué son tres cuadras y no una.
 */
export function avisoPorMetros(remainingMeters: number): NonNullable<RideStatus['alert']> {
  if (remainingMeters < -PASSED_MARGIN_M) return 'te_pasaste';
  if (remainingMeters <= RING_M) return 'bajate';
  if (remainingMeters <= PREPARE_M) return 'preparate';
  return 'viaja';
}

/** Metros a cuadras, para mostrar. Cero es "es acá nomás". */
export function enCuadras(meters: number): number {
  return Math.max(0, Math.round(meters / BLOCK_M));
}

@Injectable()
export class RideService {
  constructor(
    private readonly vehiclePositions: VehiclePositionsService,
    private readonly stopSequences: StopSequenceService,
    private readonly routeShapes: RouteShapesService,
    private readonly officialRoutes: OfficialRoutesService,
    private readonly lineSpeeds: LineSpeedService,
    private readonly walking: WalkingService,
  ) {}

  /**
   * Seguí el viaje.
   *
   * `stopId` fija la parada de bajada cuando el viaje viene del planificador:
   * la app ya prometió "bajás en tal lado" y cambiar de idea a mitad de viaje
   * -aunque fuera por una parada mejor- es contradecirse con alguien que está
   * arriba del ómnibus mirando la pantalla. Sin `stopId` se elige la mejor.
   */
  async follow(
    vehicleId: string,
    destination: { lat: number; lng: number },
    stopId?: number,
  ): Promise<RideStatus> {
    const positions = await this.vehiclePositions.getLatestPositions();
    const vehicle = positions.find((position) => position.vehicle_id === vehicleId);
    if (!vehicle) return { ...NO_RIDE };

    const identity = {
      // `lineLabel` devuelve cadena vacía cuando no hay código, y una etiqueta
      // vacía en la ficha se lee como un error de la app: mejor ausente.
      line_label: this.officialRoutes.lineLabel(vehicle.operator, vehicle.line_code) || null,
      headsign: vehicle.line_name ?? null,
    };

    if (this.stale(vehicle)) return { ...NO_RIDE, ...identity, reason: 'sin_senal' };

    const sequence = this.stopSequences.get(
      vehicle.operator,
      vehicle.line_code,
      itineraryKey(vehicle.line_name ?? null),
    );
    if (!sequence || sequence.stops.length === 0) {
      return { ...NO_RIDE, ...identity, reason: 'sin_recorrido' };
    }

    const shape = this.geometryFor(sequence);
    if (!shape) return { ...NO_RIDE, ...identity, reason: 'sin_recorrido' };

    const along = distanceAlongPolyline(
      Number(vehicle.latitude),
      Number(vehicle.longitude),
      shape.geometry,
      shape.cumulative,
    );
    if (!along) return { ...NO_RIDE, ...identity, reason: 'sin_recorrido' };

    await this.lineSpeeds.warm();

    // Las paradas en el orden en que el coche las hace. El orden llega bien de
    // las dos fuentes, pero ordenar acá es gratis y saca la suposición: todo
    // lo de abajo -contar cuántas faltan, cuál es la próxima- se apoya en él.
    const stops = [...sequence.stops].sort((a, b) => a.alongMeters - b.alongMeters);
    const busAlong = along.alongMeters;

    const ahead = stops.filter((stop) => stop.alongMeters - busAlong >= -PASSED_MARGIN_M);
    const nextStop = ahead.length > 0 ? this.toRideStop(ahead[0]) : null;

    const chosen = stopId
      ? this.pinned(stops, stopId, sequence, shape, busAlong)
      : this.best(stops, sequence, shape, busAlong, destination);

    if (!chosen) {
      return { ...NO_RIDE, ...identity, next_stop: nextStop, reason: 'no_te_deja' };
    }

    const alert = avisoPorMetros(chosen.remainingMeters);
    const walk = await this.walking
      .route(chosen.stop, destination)
      .catch(() => this.walking.estimate(chosen.stop, destination));

    const remaining = Math.max(0, chosen.remainingMeters);

    return {
      // El viaje sigue vivo mientras no te hayas pasado. Cuando te pasaste, la
      // pantalla tiene que dejar de contar metros y decir una sola cosa.
      active: alert !== 'te_pasaste',
      stop: this.toRideStop(chosen.stop),
      next_stop: nextStop,
      stops_away: chosen.stopsAway,
      meters_away: Math.round(remaining),
      blocks_away: enCuadras(remaining),
      minutes_away: Math.round(chosen.busMinutes),
      alert,
      walk_minutes: walk.minutes,
      walk_distance_m: Math.round(walk.distanceM),
      walk_geometry: walk.geometry,
      walk_straight: walk.straight,
      ride_geometry:
        alert === 'te_pasaste'
          ? []
          : slicePolyline(shape.geometry, busAlong, chosen.stop.alongMeters),
      ...identity,
      reason: null,
    };
  }

  /**
   * La bajada que te deja llegando antes.
   *
   * Ómnibus más caminata, no caminata sola: ver el encabezado. Sólo se miran
   * las paradas que el coche todavía no hizo -a un ómnibus no se le pide que
   * vuelva- y las que dejan una caminata que alguien realmente vaya a hacer.
   */
  private best(
    stops: StopOnRoute[],
    sequence: RouteStopSequence,
    shape: { geometry: LngLat[]; cumulative: number[] },
    busAlong: number,
    destination: { lat: number; lng: number },
  ): Alighting | null {
    let best: Alighting | null = null;
    let stopsAway = 0;

    for (const stop of stops) {
      const remaining = stop.alongMeters - busAlong;
      if (remaining < -PASSED_MARGIN_M) continue;

      // El puesto en la fila se cuenta sobre **todas** las que faltan, aunque
      // la parada después se descarte por lejos o por no estar ubicada: es lo
      // que la persona ve pasar por la ventanilla.
      const index = stopsAway;
      stopsAway += 1;

      // Sin coordenada medida no hay a dónde mandar a nadie. El error grande
      // no descarta, se cobra: ver HUNTING_FREE_M.
      if (stop.accuracyM === null && !stop.reliable) continue;
      const huntingMeters = Math.max(0, (stop.accuracyM ?? 0) - HUNTING_FREE_M);

      const walkMeters =
        distanceMeters(stop.lat, stop.lng, destination.lat, destination.lng) + huntingMeters;
      if (walkMeters > MAX_WALK_M) continue;

      const busMinutes = this.lineSpeeds.travelMinutes(
        sequence.operator,
        sequence.lineCode,
        sequence.itineraryKey,
        shape.geometry,
        shape.cumulative,
        busAlong,
        stop.alongMeters,
      );

      const candidate: Alighting = {
        stop,
        busMinutes,
        walkMinutes: walkMeters / this.walking.speedMPerMin,
        remainingMeters: remaining,
        stopsAway: index,
      };

      if (!best || this.arrival(candidate) < this.arrival(best)) best = candidate;
    }

    return best;
  }

  /**
   * La bajada que ya venía elegida, medida contra dónde está el coche ahora.
   *
   * Se busca entre todas las paradas y no sólo entre las que faltan: si el
   * coche ya la pasó hay que poder decirlo, y una parada que desapareció de la
   * lista no se distingue de una que nunca estuvo.
   */
  private pinned(
    stops: StopOnRoute[],
    stopId: number,
    sequence: RouteStopSequence,
    shape: { geometry: LngLat[]; cumulative: number[] },
    busAlong: number,
  ): Alighting | null {
    const stop = stops.find((candidate) => candidate.stopId === stopId);
    if (!stop) return null;

    const stopsAway = stops.filter(
      (candidate) =>
        candidate.alongMeters - busAlong >= -PASSED_MARGIN_M &&
        candidate.alongMeters < stop.alongMeters,
    ).length;

    return {
      stop,
      busMinutes: this.lineSpeeds.travelMinutes(
        sequence.operator,
        sequence.lineCode,
        sequence.itineraryKey,
        shape.geometry,
        shape.cumulative,
        busAlong,
        stop.alongMeters,
      ),
      // La caminata no se calcula: con la parada fijada no hay nada que
      // elegir, y `arrival` -que es lo único que la usa- no se llama.
      walkMinutes: 0,
      remainingMeters: stop.alongMeters - busAlong,
      stopsAway,
    };
  }

  /** Cuándo llegás al destino si te bajás ahí. Es el criterio de elección. */
  private arrival(candidate: Alighting): number {
    return candidate.busMinutes + candidate.walkMinutes;
  }

  /**
   * ¿Su última posición sigue sirviendo?
   *
   * `fix_time` es la hora del GPS y `recorded_at` la de cuando la guardamos.
   * Se mira la del GPS cuando está: un feed que repite una posición vieja
   * actualiza la segunda y no la primera, y creerle a la segunda es tomar por
   * fresco un dato que no lo es.
   */
  private stale(vehicle: { fix_time?: unknown; recorded_at?: unknown }): boolean {
    const fix = (vehicle.fix_time ?? vehicle.recorded_at) as string | Date | null | undefined;
    if (!fix) return false;

    const at = new Date(fix).getTime();
    if (!Number.isFinite(at)) return false;

    return Date.now() - at > STALE_FIX_MIN * 60_000;
  }

  private toRideStop(stop: StopOnRoute): RideStop {
    return {
      id: stop.stopId,
      code: stop.code,
      name: stop.name,
      lat: stop.lat,
      lng: stop.lng,
    };
  }

  private geometryFor(
    sequence: RouteStopSequence,
  ): { geometry: LngLat[]; cumulative: number[] } | null {
    const shape = this.routeShapes
      .getShapes()
      .find(
        (candidate) =>
          candidate.operator === sequence.operator &&
          candidate.lineCode === sequence.lineCode &&
          candidate.itineraryKey === sequence.itineraryKey,
      );

    if (!shape?.geometry || shape.geometry.length < 2) return null;

    const geometry = shape.geometry as LngLat[];
    return { geometry, cumulative: cumulativeDistances(geometry) };
  }
}
