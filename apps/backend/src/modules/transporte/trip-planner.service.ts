import { Injectable } from '@nestjs/common';
import { RouteStopSequence, StopOnRoute, StopSequenceService } from './stop-sequence.service';
import { StopRecord, StopsReaderService } from './stops-reader.service';
import { Arrival, ArrivalsService } from './arrivals.service';
import { itineraryKey, RouteShapesService } from './route-shapes.service';
import { VehiclePositionsService } from './vehicle-positions.service';
import { OfficialRoutesService } from './official-routes.service';
import { WalkingService } from './walking.service';
import { LineSpeedService } from './line-speed.service';
import { SchedulesService, StopServiceToday } from './schedules.service';
import { isInService } from './fleet.util';
import { cumulativeDistances, distanceAlongPolyline, distanceMeters, LngLat } from './geo.util';
import { slicePolyline } from './route-match.util';

/**
 * Planificador de viajes.
 *
 * Un tramo en ómnibus sólo existe si la parada de subida viene *antes* que la
 * de bajada en el mismo recorrido, y el orden de paradas no se estima: sale de
 * lo que informa el propio feed de las empresas, coche por coche (ver
 * StopPlacementService).
 *
 * Lo que se calcula no es una suma de duraciones sino **una línea de tiempo**.
 * Antes se sumaba "caminata + espera + viaje" con la espera tomada del ómnibus
 * más próximo a la parada, y eso producía el error más grave que puede tener
 * una app de transporte: ofrecer un coche que uno no llega a tomar. Si el
 * ómnibus está a 1 minuto de la parada y la parada está a 4 cuadras, ese
 * ómnibus ya se fue cuando uno llega. Ahora el reloj corre:
 *
 *   0            salís
 *   +caminata    llegás a la parada
 *   +espera      sale el primer coche que se puede tomar desde ese momento
 *   +viaje       te bajás
 *   +transbordo  caminás hasta la otra parada y esperás la otra línea
 *   +caminata    llegás
 *
 * Sobre esa línea de tiempo se aplican tres reglas que son las que separan un
 * itinerario útil de uno que se ve razonable en una lista y es un disparate en
 * la calle:
 *
 * 1. **Se puede tomar.** Un coche cuenta sólo si llega a la parada después de
 *    que uno llegó, con un margen (`BOARD_SLACK_MIN`). Si no hay ninguna unidad
 *    en vivo que sirva, la próxima salida sale del **horario publicado** por la
 *    empresa (SchedulesService); y si tampoco hay horario cargado para la
 *    temporada de hoy, de la frecuencia real de la línea. En ese orden: el GPS
 *    es más certero que el papel, y el papel más que una estimación.
 * 2. **El ómnibus tiene que servir para algo.** Subirse una parada para
 *    después caminar tres cuadras hasta el transbordo no es un viaje: si
 *    caminando el mismo tramo se llega igual o antes, el tramo se descarta.
 * 3. **La línea tiene que estar circulando.** Si ningún coche está haciendo
 *    ese recorrido ahora, no se ofrece: prometer "esperá 10 minutos" cuando la
 *    línea no está en la calle es inventar un viaje.
 *
 * 4. **Nada de transbordos si hay una línea que te deja.** Acá no se combina:
 *    se espera el que va derecho aunque tarde un poco más. El transbordo no
 *    compite con el directo por costo —así fuera más rápido—, directamente no
 *    se calcula mientras haya un directo. Aparece sólo cuando ninguna línea
 *    une los dos puntos, que es el caso de los viajes largos y atravesados.
 *
 * Los márgenes salen de la práctica de OpenTripPlanner: `transferSlack` por
 * defecto son 120 s además de la caminata, y el `boardSlack` es el colchón
 * para subirse.
 *
 * Cada opción sale además **dibujada**: la caminata con el camino por la calle
 * y el tramo en ómnibus con el pedazo del recorrido publicado que le toca.
 */

/** Cuánto se acepta caminar hasta la primera parada o desde la última. */
const MAX_WALK_M = 900;

/** Cuánto se acepta caminar en un transbordo entre dos paradas distintas. */
const MAX_TRANSFER_WALK_M = 400;

/**
 * Hay que estar en la parada antes de que llegue el ómnibus, no en el mismo
 * minuto: el reloj de la app, el del chofer y el paso de la persona no son el
 * mismo. Es el `boardSlack` de OpenTripPlanner.
 */
const BOARD_SLACK_MIN = 1;

/**
 * Entre bajarse de uno y poder tomarse el otro, además de la caminata entre
 * las dos paradas. Es el `transferSlack` de OpenTripPlanner, que trae 120 s
 * por defecto.
 */
const TRANSFER_SLACK_MIN = 2;

/**
 * Cuántas paradas candidatas se prueban de cada lado, como tope de trabajo.
 *
 * Eran 8, después 12, y **contar paradas era la medida equivocada**. En
 * Maldonado Nuevo hay 44 paradas a menos de 900 m de cualquier punto: las doce
 * más cercanas resultaron ser todas del sentido contrario y de la vereda de
 * enfrente, así que el viaje Hospital → Maldonado Nuevo se quedaba sin ninguna
 * opción **aunque la 16 pasara por ahí** — su parada de ida caía en el puesto
 * dieciséis. Y no es un caso raro: casi toda parada existe dos veces, una por
 * mano, y muchas veces con dos códigos porque cada empresa numera aparte.
 *
 * Lo que hay que garantizar no es una cantidad de paradas sino que **ninguna
 * línea se quede sin cupo**: para armar un viaje alcanza con la parada más
 * cercana de cada itinerario, y la segunda por si la primera no sirve. Ver
 * `nearbyStops`.
 */
const MAX_CANDIDATE_STOPS = 24;

/**
 * Cuántas paradas se conservan de cada itinerario.
 *
 * Con una sola alcanzaría para ofrecer la línea, pero a veces la más cercana
 * está justo pasando el destino -y entonces el sentido no sirve- o el tramo
 * queda tan corto que no le gana a caminar. La segunda cubre eso. De la
 * tercera en adelante son variantes del mismo viaje que después descarta
 * `rank`, así que sería trabajo tirado.
 */
const STOPS_PER_ITINERARY = 2;

/**
 * Un tramo en ómnibus más corto que esto no le ahorra nada a nadie: se sube,
 * se baja y caminó lo mismo, pero encima esperó.
 */
const MIN_RIDE_METERS = 500;
const MIN_RIDE_STOPS = 2;

/**
 * Cuánto se penaliza un transbordo al ordenar las opciones (no al mostrarlas:
 * los minutos que se muestran son los reales).
 *
 * Es una red de seguridad, no la defensa principal: un viaje con transbordo ni
 * siquiera se calcula si existe uno directo (ver `plan` y `transferOptions`).
 * Esto sólo ordena entre transbordos cuando no hay más remedio, y sigue siendo
 * alto a propósito para que uno con dos tramos no le gane a uno con uno por un
 * par de minutos.
 */
const TRANSFER_PENALTY_MIN = 15;

/**
 * Distancia en línea recta de punta a punta por debajo de la cual **no se
 * combina nunca**, haya o no una línea que te deje.
 *
 * Once kilómetros es más que cualquier viaje dentro de la conurbación
 * Maldonado–Punta del Este–San Carlos, que es donde vive el 95% de los viajes.
 * Adentro de esa mancha, si no hay una línea directa la respuesta honesta es
 * "no hay", no "tomate dos". Un transbordo se justifica recién cuando el viaje
 * es de los largos y atravesados —San Carlos a los balnearios de la Ruta 10,
 * Piriápolis—, donde nadie espera llegar de un saque.
 *
 * Se mide en línea recta y no por calle a propósito: es un umbral de criterio,
 * no una medición, y tiene que ser barato y estable.
 */
const MIN_TRANSFER_TRIP_M = 11_000;

/**
 * ¿Este viaje es de los que admiten un transbordo?
 *
 * Se saca afuera de la clase para que la regla se pueda probar sin levantar el
 * planificador entero: es una decisión de producto -acá no se combina- y tiene
 * que poder defenderse sola, no quedar enterrada en un método privado que
 * necesita base de datos y GPS para ejecutarse.
 */
export function admiteTransbordo(tripMeters: number): boolean {
  return tripMeters >= MIN_TRANSFER_TRIP_M;
}

/** Y cuánto pesa cada minuto de caminata de más, con el mismo criterio. */
const WALK_PENALTY_PER_MIN = 0.4;

/**
 * Cuánto peor que la mejor puede ser una opción y seguir mostrándose.
 *
 * Llegar veinte minutos después no es "otra opción": es la misma pregunta mal
 * contestada. Se muestran las que compiten.
 */
const MAX_MINUTES_OVER_BEST = 12;

/** Techo y piso de la espera estimada por frecuencia. */
const MIN_HEADWAY_WAIT_MIN = 3;
const MAX_HEADWAY_WAIT_MIN = 25;

/** Si el destino está más cerca que esto, ir caminando es una opción de verdad. */
const MAX_WALK_ONLY_M = 1600;

/**
 * Cuánta incertidumbre se acepta en la posición de una parada antes de mandar
 * a alguien a caminar hasta ella.
 *
 * Se mide con `accuracy_m` y no con `spread_m`, que es lo que se usaba antes.
 * La dispersión dice cuán juntas están las muestras (precisión) y el error
 * dice cuán lejos está la respuesta de la parada de verdad (exactitud,
 * calibrada contra los nodos relevados de OpenStreetMap). Una parada puede
 * tener las muestras muy juntas y estar igual en la cuadra equivocada, que es
 * exactamente el caso que hacía esperar a la gente donde el ómnibus no para.
 *
 * **No es un corte, es un costo.** La primera versión descartaba toda parada
 * con más de 150 m de error, y en Maldonado y Punta del Este eso está bien
 * porque siempre hay otra a la vuelta. En José Ignacio dejaba 6 paradas de 32 y
 * el planificador se quedaba sin nada que ofrecer: ahí la línea pasa una vez
 * cada tanto y no hay parada alternativa. Cambiar "no hay viaje" por "hay
 * viaje, y la parada está en esta zona" es mejor para quien pregunta.
 *
 * Así que la incertidumbre se cobra en la moneda en la que se paga de verdad:
 * **metros de más**. Una parada con 200 m de error puede hacerte caminar 140 m
 * extra buscando el cartel, y con eso una parada bien ubicada tres cuadras más
 * lejos le gana sola, sin ninguna constante inventada. Ver `huntingMeters`.
 *
 * Lo único que se descarta es la parada que **nunca se pudo ubicar**: sin
 * coordenada medida no hay a dónde mandar a nadie.
 */
const HUNTING_FREE_M = 60;

/**
 * Cuántas opciones se muestran.
 *
 * Una por línea: la pregunta "¿cómo voy?" se contesta con qué ómnibus tomar,
 * no con doce variantes de la misma línea saliendo de paradas distintas.
 *
 * El piso está para que se vean **todas las que sirven, de las tres
 * empresas**, aunque alguna pase bastante después; el techo, para que la lista
 * siga siendo una lista y no un volcado.
 */
const MIN_OPTIONS = 5;
const MAX_OPTIONS = 8;

export interface PlannerPoint {
  lat: number;
  lng: number;
  label?: string;
}

export interface TripLeg {
  type: 'walk' | 'wait' | 'bus';
  duration_minutes: number;
  distance_m?: number;
  from: string;
  to: string;
  line_code?: string;
  /** El número del cartel: "17/19" y no "179". */
  line_label?: string;
  operator?: string;
  /** Hacia dónde va el ómnibus, tal como lo publica la empresa. */
  headsign?: string | null;
  /** True si la espera sale de una unidad en camino y no de una estimación. */
  live?: boolean;
  /** True si la hora sale del horario publicado por la empresa. */
  scheduled?: boolean;
  /** Minutos desde ahora en que pasa ese ómnibus por la parada. */
  departs_in_minutes?: number;
  /** El coche concreto que se va a tomar, cuando la espera es en vivo. */
  vehicle_id?: string;
  stops_count?: number;
  /**
   * Dónde se sube y dónde se baja, por identificador.
   *
   * `from` y `to` son nombres para mostrar y no sirven para identificar una
   * parada: hay tres "HOSPITAL" y cada empresa las numera aparte. Estos dos
   * son los que la pantalla de a bordo le pasa al backend para fijar la
   * bajada, y fijarla es lo que evita que la app prometa una parada antes de
   * salir y otra distinta con la persona ya arriba del ómnibus.
   */
  boarding_stop_id?: number;
  alighting_stop_id?: number;
  /** El tramo dibujado, en orden GeoJSON [lng, lat]. */
  geometry?: LngLat[];
  /** True cuando la caminata se dibuja derecha porque no hubo ruteo. */
  straight?: boolean;
  /** Las paradas por las que pasa el tramo en ómnibus, para el mapa. */
  stops?: Array<{ id: number; name: string; lat: number; lng: number }>;
}

/**
 * La última vuelta desde el destino, para saberlo **antes** de ir.
 *
 * `finished` en true es la señal fuerte: hoy ya no se puede volver en ómnibus
 * desde ahí. Es el dato que evita que alguien quede a pie en la Ruta 10.
 */
export interface LastReturn {
  available: boolean;
  /** Hora del último servicio de vuelta, "22:24". */
  last_at: string | null;
  line_label: string | null;
  /** Dónde se toma la vuelta. */
  stop_name: string | null;
  /** Ya salió: hoy no hay con qué volver. */
  finished: boolean;
}

export interface TripOption {
  id: string;
  /** Minutos desde ahora hasta llegar al destino. */
  total_minutes: number;
  walk_minutes: number;
  transfers: number;
  /**
   * Dentro de cuántos minutos hay que salir para llegar justo a la parada.
   *
   * Cero es "salí ahora". Si el ómnibus pasa dentro de veinte minutos y la
   * parada está a tres, no hay ningún motivo para ir a esperar diecisiete
   * minutos parado en la vereda.
   */
  leave_in_minutes: number;
  /** "Más rápido", "Menos caminata", "Sin transbordo". Una sola por opción. */
  label?: string;
  legs: TripLeg[];
}

interface CandidateStop {
  stop: StopRecord;
  walkMeters: number;
  /** Metros que se pueden caminar de más buscando el cartel. Ver huntingMeters. */
  huntingMeters: number;
}

/** Cuándo sale el ómnibus que se puede tomar, contado desde ahora. */
interface Departure {
  /** Minutos desde ahora en que ese coche pasa por la parada. */
  atMinute: number;
  /** True cuando sale de una unidad en camino y no de la frecuencia. */
  live: boolean;
  /** True cuando la hora sale del horario publicado y no del vivo ni la frecuencia. */
  scheduled?: boolean;
  vehicleId?: string;
}

/** Una opción todavía sin dibujar: sólo las decisiones. */
interface PlannedOption {
  walkIn: CandidateStop;
  walkOut: CandidateStop;
  rides: Array<{
    sequence: RouteStopSequence;
    boarding: StopOnRoute;
    alighting: StopOnRoute;
    departure: Departure;
    waitMinutes: number;
  }>;
  transferWalkMeters?: number;
  estimatedMinutes: number;
  estimatedWalkMinutes: number;
  /** Lo que se usa para ordenar: minutos más las penalizaciones. */
  cost: number;
}

@Injectable()
export class TripPlannerService {
  /**
   * Las distancias acumuladas de cada trazo, calculadas una sola vez.
   *
   * La clave es el propio arreglo de puntos: cuando `RouteShapesService`
   * reconstruye los recorridos entrega arreglos nuevos, así que esto se
   * invalida solo y no hay que acordarse de vaciarlo.
   */
  private readonly cumulativeByShape = new WeakMap<object, number[]>();

  constructor(
    private readonly stopSequences: StopSequenceService,
    private readonly arrivals: ArrivalsService,
    private readonly stopsReader: StopsReaderService,
    private readonly routeShapes: RouteShapesService,
    private readonly vehiclePositions: VehiclePositionsService,
    private readonly officialRoutes: OfficialRoutesService,
    private readonly walking: WalkingService,
    private readonly lineSpeeds: LineSpeedService,
    private readonly schedules: SchedulesService,
  ) {}

  async plan(origin: PlannerPoint, destination: PlannerPoint): Promise<TripOption[]> {
    if (!this.stopSequences.isReady()) return [];

    // La velocidad de cada recorrido se mide una vez y después se lee de
    // memoria: el planificador calcula la duración de decenas de tramos.
    await this.lineSpeeds.warm();

    const [stops, positions] = await Promise.all([
      this.stopsReader.findAll(),
      this.vehiclePositions.getLatestPositions(),
    ]);

    /** Cuántos coches está haciendo cada recorrido ahora mismo. */
    const runningByItinerary = this.countRunning(positions);

    /** Dónde está cada coche, para dibujar por dónde viene el que se toma. */
    const byVehicle = new Map<string, { latitude: number | string; longitude: number | string }>(
      positions.map((position) => [position.vehicle_id, position]),
    );

    const originStops = this.nearbyStops(stops, origin, MAX_WALK_M);
    const destinationStops = this.nearbyStops(stops, destination, MAX_WALK_M);

    // Las llegadas de cada parada de origen, una sola vez: qué unidades vienen
    // y en cuántos minutos.
    //
    // **En paralelo, y no una atrás de otra.** Estaban en un for con await
    // adentro, así que el planificador esperaba la suma de todas las consultas
    // aunque sean independientes entre sí: con 24 paradas candidatas eso son
    // cinco segundos de reloj para dos décimas de trabajo. Medido: pasa de
    // 5.200 ms a 800 ms sin cambiar ni una cuenta.
    const etasByStop = new Map<number, Map<string, Arrival[]>>();
    await Promise.all(
      originStops.map(async (from) => {
        etasByStop.set(
          from.stop.id,
          this.etasByItinerary(await this.arrivals.getForStop(from.stop.id)),
        );
      }),
    );

    // En Maldonado el transbordo es la excepción, no una alternativa más.
    // Mientras haya una línea que te deje, esa es la respuesta; el transbordo
    // ni se calcula. Y por debajo de cierta distancia no se calcula nunca,
    // haya directo o no. Ver `transferOptions` para el porqué.
    const direct = this.directOptions(originStops, destinationStops, etasByStop, runningByItinerary);

    const tripMeters = distanceMeters(origin.lat, origin.lng, destination.lat, destination.lng);
    const longEnough = admiteTransbordo(tripMeters);

    const planned = direct.length
      ? direct
      : longEnough
        ? this.transferOptions(originStops, destinationStops, etasByStop, runningByItinerary)
        : [];

    const best = this.rank(planned);

    // Recién ahora se sale a buscar los caminos por calle: para las cuatro
    // opciones que se van a mostrar y no para las decenas que se probaron.
    const options: TripOption[] = [];
    for (const option of best) {
      options.push(await this.materialize(option, origin, destination, byVehicle));
    }

    const onFoot = await this.walkOnlyOption(origin, destination);
    if (onFoot) options.push(onFoot);

    return this.label(options);
  }

  /**
   * ¿Y cómo vuelvo?
   *
   * La pregunta que nadie se hace hasta que ya es tarde. Alguien que planifica
   * ir a José Ignacio a las cuatro de la tarde tiene que ver, en el mismo
   * resultado, que la última vuelta sale a tal hora. Si no, se entera parado en
   * la Ruta 10 a las nueve de la noche.
   *
   * Es una función de seguridad disfrazada de comodidad, y sólo se puede
   * contestar con el horario publicado: el GPS dice lo que hay ahora, no si
   * dentro de cinco horas va a pasar el último.
   *
   * Se busca al revés que el viaje: se sube en una parada cerca del **destino**
   * y se baja en una cerca del **origen**, sobre el mismo recorrido y en ese
   * orden. Sólo directos: si para volver hace falta combinar, la respuesta
   * "hay vuelta" sería optimista de más para algo que se usa para decidir si ir.
   */
  async lastReturn(
    origin: PlannerPoint,
    destination: PlannerPoint,
    now = new Date(),
  ): Promise<LastReturn> {
    const vacio: LastReturn = {
      available: false,
      last_at: null,
      line_label: null,
      stop_name: null,
      finished: false,
    };

    if (!this.stopSequences.isReady() || !this.schedules.hasSchedules()) return vacio;

    const stops = await this.stopsReader.findAll();
    // Al revés: se sube cerca del destino y se baja cerca del origen.
    const boardingStops = this.nearbyStops(stops, destination, MAX_WALK_M);
    const backHome = new Set(
      this.nearbyStops(stops, origin, MAX_WALK_M).map((candidate) => candidate.stop.id),
    );
    if (boardingStops.length === 0 || backHome.size === 0) return vacio;

    let mejor: { orden: number; servicio: StopServiceToday; stopName: string } | null = null;

    for (const candidate of boardingStops) {
      for (const sequence of this.stopSequences.getForStop(candidate.stop.id)) {
        const boarding = sequence.stops.find((stop) => stop.stopId === candidate.stop.id);
        if (!boarding) continue;

        // Que ese recorrido efectivamente vuelva: tiene que pasar por una
        // parada cerca del origen **después** de donde uno se sube.
        const vuelve = sequence.stops.some(
          (stop) => backHome.has(stop.stopId) && stop.sequence > boarding.sequence,
        );
        if (!vuelve) continue;

        const servicio = this.schedules.serviceAtStop(sequence, boarding, now);
        if (!servicio) continue;

        const orden = this.ordenDelDia(servicio.last_at);
        if (!mejor || orden > mejor.orden) {
          mejor = { orden, servicio, stopName: boarding.name };
        }
      }
    }

    if (!mejor) return vacio;

    return {
      available: true,
      last_at: mejor.servicio.last_at,
      line_label: mejor.servicio.line_label,
      stop_name: mejor.stopName,
      // Si la última de todas ya pasó, hoy no hay con qué volver.
      finished: mejor.servicio.finished,
    };
  }

  /**
   * Ordena horas del día dejando la madrugada al final.
   *
   * "00:30" es más tarde que "23:10", no más temprano: es el último servicio
   * cruzando la medianoche. Comparado como texto daría al revés.
   */
  private ordenDelDia(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m + (h < 4 ? 24 * 60 : 0);
  }

  // ---------------------------------------------------------------- opciones

  /**
   * Los viajes de una sola línea: subirse una vez y bajarse en el destino.
   *
   * Es lo que la gente hace acá. Maldonado, Punta y San Carlos están cosidos
   * por líneas largas que cruzan todo -la 24 y la 7/24 van de San Carlos a
   * Punta del Este, la 14 y la 5 llegan hasta los balnearios, la 8 hasta
   * Piriápolis-, así que el par de puntos que uno quiera unir casi siempre
   * cae sobre una misma línea.
   */
  private directOptions(
    originStops: CandidateStop[],
    destinationStops: CandidateStop[],
    etasByStop: Map<number, Map<string, Arrival[]>>,
    running: Map<string, number>,
  ): PlannedOption[] {
    const planned: PlannedOption[] = [];

    for (const from of originStops) {
      const etas = etasByStop.get(from.stop.id) ?? new Map<string, Arrival[]>();

      for (const sequence of this.stopSequences.getForStop(from.stop.id)) {
        const boarding = sequence.stops.find((stop) => stop.stopId === from.stop.id);
        if (!boarding) continue;
        if (!this.isOfferable(sequence, boarding, from, running)) continue;

        for (const to of destinationStops) {
          const alighting = sequence.stops.find((stop) => stop.stopId === to.stop.id);
          // El sentido importa: si la parada de bajada viene antes que la de
          // subida, este recorrido no sirve para este viaje.
          if (!alighting || alighting.sequence <= boarding.sequence) continue;

          const option = this.buildOption({
            walkIn: from,
            walkOut: to,
            rides: [{ sequence, boarding, alighting }],
            etas,
            running,
          });
          if (option) planned.push(option);
        }
      }
    }

    return planned;
  }

  /**
   * Los viajes con un transbordo. **El último recurso.**
   *
   * Sólo se llama cuando no hay una sola línea que una los dos puntos, y eso
   * en Maldonado pasa poco: viajes largos y atravesados, del tipo San Carlos a
   * un balneario de la Ruta 10 fuera del horario de la 5.
   *
   * Antes esto se calculaba siempre y competía con los directos por costo. El
   * problema es que un transbordo puede ganar por un par de minutos y quedar
   * arriba de todo, y entonces el planificador contestaba "tomate la 9, bajate
   * y tomate la 12" para ir del Centro al Shopping, que es un viaje de una
   * línea sola. Nadie hace eso acá: se espera el que va derecho aunque tarde
   * un poco más. Por eso ahora el transbordo no compite: aparece solamente
   * cuando la alternativa es no llegar.
   */
  private transferOptions(
    originStops: CandidateStop[],
    destinationStops: CandidateStop[],
    etasByStop: Map<number, Map<string, Arrival[]>>,
    running: Map<string, number>,
  ): PlannedOption[] {
    const planned: PlannedOption[] = [];

    for (const from of originStops) {
      const etas = etasByStop.get(from.stop.id) ?? new Map<string, Arrival[]>();

      for (const sequence of this.stopSequences.getForStop(from.stop.id)) {
        const boarding = sequence.stops.find((stop) => stop.stopId === from.stop.id);
        if (!boarding) continue;
        if (!this.isOfferable(sequence, boarding, from, running)) continue;

        for (const to of destinationStops) {
          for (const secondSequence of this.stopSequences.getForStop(to.stop.id)) {
            if (
              secondSequence.operator === sequence.operator &&
              secondSequence.lineCode === sequence.lineCode
            ) {
              continue;
            }
            if (
              !this.isRunning(secondSequence, running) &&
              !this.schedules.hasScheduleFor(secondSequence)
            ) {
              continue;
            }

            const finalAlighting = secondSequence.stops.find(
              (stop) => stop.stopId === to.stop.id,
            );
            if (!finalAlighting) continue;

            const transfer = this.findTransfer(sequence, boarding, secondSequence, finalAlighting);
            if (!transfer) continue;

            const option = this.buildOption({
              walkIn: from,
              walkOut: to,
              rides: [
                { sequence, boarding, alighting: transfer.alighting },
                {
                  sequence: secondSequence,
                  boarding: transfer.boarding,
                  alighting: finalAlighting,
                },
              ],
              transferWalkMeters: transfer.walkMeters,
              etas,
              running,
            });
            if (option) planned.push(option);
          }
        }
      }
    }

    return planned;
  }

  /**
   * Arma una opción sobre la línea de tiempo y la descarta si no se sostiene.
   *
   * Devuelve null cuando el viaje no se puede tomar, cuando alguno de los
   * tramos en ómnibus no le gana a caminar, o cuando el transbordo cuesta más
   * calle de la que ahorra.
   */
  private buildOption(input: {
    walkIn: CandidateStop;
    walkOut: CandidateStop;
    rides: Array<{
      sequence: RouteStopSequence;
      boarding: StopOnRoute;
      alighting: StopOnRoute;
    }>;
    transferWalkMeters?: number;
    etas: Map<string, Arrival[]>;
    running: Map<string, number>;
  }): PlannedOption | null {
    const walkInMinutes = this.walking.minutes(input.walkIn.walkMeters);
    const walkOutMinutes = this.walking.minutes(input.walkOut.walkMeters);
    const transferWalkMinutes = input.transferWalkMeters
      ? this.walking.minutes(input.transferWalkMeters)
      : 0;

    // Un mismo instante para todo el itinerario: el horario se lee contra un
    // solo reloj de pared, no uno por tramo.
    const now = new Date();

    let clock = walkInMinutes;
    const rides: PlannedOption['rides'] = [];

    for (const [index, ride] of input.rides.entries()) {
      const rideMeters = ride.alighting.alongMeters - ride.boarding.alongMeters;
      const rideStops = ride.alighting.sequence - ride.boarding.sequence;

      // Regla 2: un tramo de una parada y doscientos metros no es un viaje.
      if (rideMeters < MIN_RIDE_METERS && rideStops < MIN_RIDE_STOPS) return null;

      if (index > 0) {
        // La caminata del transbordo no puede ser más larga que lo que se
        // viajó: bajarse para caminar más de lo que se anduvo arriba es el
        // itinerario que nadie sigue.
        const previousMeters =
          input.rides[index - 1].alighting.alongMeters - input.rides[index - 1].boarding.alongMeters;
        if ((input.transferWalkMeters ?? 0) > previousMeters) return null;

        clock += transferWalkMinutes + TRANSFER_SLACK_MIN;
      }

      // Regla 1: el primero que se puede tomar desde que uno está en la parada.
      // En vivo si hay coche; si no, el horario publicado; si no, la frecuencia.
      const departure =
        index === 0
          ? this.departureFor(ride.sequence, ride.boarding, clock, input.etas, input.running, now)
          : this.schedules.nextDeparture(ride.sequence, ride.boarding, clock, now) ??
            this.headwayDeparture(ride.sequence, clock, input.running);
      if (!departure) return null;

      const waitMinutes = Math.max(0, departure.atMinute - clock);
      const rideMinutes = this.rideMinutes(ride);

      // Regla 2, la otra mitad: si caminando ese mismo tramo se llega antes,
      // el ómnibus no sirve para nada.
      const walkInstead = this.walking.minutes(
        this.walking.estimate(ride.boarding, ride.alighting).distanceM,
      );
      if (walkInstead <= waitMinutes + rideMinutes) return null;

      rides.push({ ...ride, departure, waitMinutes });
      clock = departure.atMinute + rideMinutes;
    }

    clock += walkOutMinutes;

    const walkMinutes = walkInMinutes + walkOutMinutes + transferWalkMinutes;

    // Los minutos que se pueden perder buscando el cartel de una parada mal
    // ubicada. Pesan en el costo igual que la caminata -son caminata- pero
    // **no** entran en `estimatedMinutes`: son minutos posibles, no seguros, y
    // el tiempo que se le muestra a alguien no se infla con una hipótesis.
    // Sirven para que, entre dos viajes parecidos, gane el que sube en una
    // parada que sabemos ubicar.
    const huntingMinutes =
      (input.walkIn.huntingMeters + input.walkOut.huntingMeters) / this.walking.speedMPerMin;

    return {
      walkIn: input.walkIn,
      walkOut: input.walkOut,
      rides,
      transferWalkMeters: input.transferWalkMeters,
      estimatedMinutes: clock,
      estimatedWalkMinutes: walkMinutes,
      cost:
        clock +
        TRANSFER_PENALTY_MIN * (rides.length - 1) +
        WALK_PENALTY_PER_MIN * walkMinutes +
        (1 + WALK_PENALTY_PER_MIN) * huntingMinutes,
    };
  }

  /**
   * Cuándo sale el ómnibus que uno alcanza a tomar en esta parada.
   *
   * Primero se miran las unidades en camino: la primera que llegue después de
   * que uno esté en la parada, con el margen de subida. Las que llegan antes
   * no se descartan por prolijidad — es que ya se fueron.
   *
   * Si ninguna sirve, se cae a la frecuencia: cuántos coches está haciendo ese
   * recorrido ahora y cuánto tarda una vuelta.
   */
  private departureFor(
    sequence: RouteStopSequence,
    boarding: StopOnRoute,
    readyAtMinute: number,
    etas: Map<string, Arrival[]>,
    running: Map<string, number>,
    now: Date,
  ): Departure | null {
    const catchable = (etas.get(this.itineraryId(sequence)) ?? []).find(
      (arrival) => arrival.eta_minutes >= readyAtMinute + BOARD_SLACK_MIN,
    );

    if (catchable) {
      return {
        atMinute: catchable.eta_minutes,
        live: catchable.live,
        vehicleId: catchable.vehicle_id,
      };
    }

    // Sin coche en vivo que se alcance: el horario publicado, y recién si no
    // hay, la frecuencia.
    return (
      this.schedules.nextDeparture(sequence, boarding, readyAtMinute, now) ??
      this.headwayDeparture(sequence, readyAtMinute, running)
    );
  }

  /**
   * La espera cuando no hay ninguna unidad en camino que sirva.
   *
   * No es una constante: sale de la frecuencia con la que la línea está
   * pasando ahora. Una vuelta completa del recorrido dividida por la cantidad
   * de coches que la están haciendo da cada cuánto pasa uno, y en promedio se
   * espera la mitad de eso. Con la 24 y cinco coches en la calle son cinco
   * minutos; con una línea que tiene un solo coche dando la vuelta a Punta,
   * media hora — y eso es lo que hay que decir, no diez minutos siempre.
   */
  private headwayDeparture(
    sequence: RouteStopSequence,
    readyAtMinute: number,
    running: Map<string, number>,
  ): Departure | null {
    const vehicles = running.get(this.itineraryId(sequence)) ?? 0;
    if (vehicles === 0) return null;

    const shape = this.shapeFor(sequence);
    const kmh = this.lineSpeeds.kmh(sequence.operator, sequence.lineCode, sequence.itineraryKey);
    const cycleMinutes = ((shape?.distanceM ?? 8000) / ((kmh * 1000) / 60)) || 30;

    const wait = Math.min(
      MAX_HEADWAY_WAIT_MIN,
      Math.max(MIN_HEADWAY_WAIT_MIN, Math.round(cycleMinutes / vehicles / 2)),
    );

    return { atMinute: readyAtMinute + wait, live: false };
  }

  /** Las llegadas de una parada, agrupadas por recorrido y en orden. */
  private etasByItinerary(arrivals: Arrival[]): Map<string, Arrival[]> {
    const byItinerary = new Map<string, Arrival[]>();

    for (const arrival of arrivals) {
      const key = `${arrival.operator}|${arrival.line_code}|${itineraryKey(arrival.line_name)}`;
      byItinerary.set(key, [...(byItinerary.get(key) ?? []), arrival]);
    }

    for (const list of byItinerary.values()) {
      list.sort((a, b) => a.eta_minutes - b.eta_minutes);
    }

    return byItinerary;
  }

  /**
   * Cuántos ómnibus está haciendo cada recorrido en este momento.
   *
   * Es lo que decide si una línea se puede ofrecer. Los coches que van a
   * cargar combustible o hacen un traslado contratado no cuentan: están en la
   * calle pero no levantan a nadie.
   */
  private countRunning(positions: any[]): Map<string, number> {
    const running = new Map<string, number>();

    for (const position of positions) {
      if (!position.line_code || !isInService(position.line_name)) continue;
      if (typeof position.stopped_minutes === 'number' && position.stopped_minutes >= 15) continue;

      const key = `${position.operator}|${position.line_code}|${itineraryKey(position.line_name ?? null)}`;
      running.set(key, (running.get(key) ?? 0) + 1);
    }

    return running;
  }

  private isRunning(sequence: RouteStopSequence, running: Map<string, number>): boolean {
    return (running.get(this.itineraryId(sequence)) ?? 0) > 0;
  }

  /**
   * ¿Se puede ofrecer esta línea para este viaje?
   *
   * Antes la respuesta era una sola: **que hubiera un coche en la calle en este
   * momento**. Con eso, a las ocho de la noche de un miércoles quedaban afuera
   * dos de cada tres líneas, y viajes enteros no tenían ninguna opción -Centro
   * a José Ignacio devolvía cero, aunque la 14 vaya derecho y esté publicada
   * con hora de paso por José Ignacio-.
   *
   * El horario ya estaba cargado y ya se usaba, pero **sólo para poner la
   * hora** de una línea que la regla de arriba ya había dejado pasar. Nunca
   * llegaba a usarse en el caso para el que sirve, que es justamente cuando no
   * hay ningún coche circulando.
   *
   * Así que ahora hay dos maneras de habilitar una línea: que esté circulando,
   * o que tenga una salida publicada que uno alcance a tomar. Y no hay una
   * tercera: sin coche y sin horario la línea no se ofrece, porque la
   * frecuencia estimada se calcula a partir de los coches que están dando la
   * vuelta y sin ninguno no hay de dónde sacarla. `buildOption` lo vuelve a
   * verificar y descarta el viaje si al final no hay salida.
   */
  private isOfferable(
    sequence: RouteStopSequence,
    boarding: StopOnRoute,
    from: CandidateStop,
    running: Map<string, number>,
  ): boolean {
    if (this.isRunning(sequence, running)) return true;

    // La caminata hasta la parada decide qué salidas se alcanzan: preguntar
    // por la próxima "desde ahora" ofrecería un ómnibus que sale mientras uno
    // todavía está caminando.
    const readyAtMinute = this.walking.minutes(from.walkMeters);
    return this.schedules.nextDeparture(sequence, boarding, readyAtMinute) !== null;
  }

  private itineraryId(sequence: RouteStopSequence): string {
    return `${sequence.operator}|${sequence.lineCode}|${sequence.itineraryKey}`;
  }

  private shapeFor(sequence: RouteStopSequence) {
    return this.routeShapes
      .getShapes()
      .find(
        (candidate) =>
          candidate.operator === sequence.operator &&
          candidate.lineCode === sequence.lineCode &&
          candidate.itineraryKey === sequence.itineraryKey,
      );
  }

  /**
   * Punto de transbordo: una parada de la primera línea, posterior a la
   * subida, que esté a poca caminata de una parada de la segunda línea
   * anterior a la bajada final.
   *
   * Se queda con el que menos calle deja sin recorrer, que en la práctica es
   * el transbordo más natural.
   */
  private findTransfer(
    first: RouteStopSequence,
    boarding: StopOnRoute,
    second: RouteStopSequence,
    finalAlighting: StopOnRoute,
  ): { alighting: StopOnRoute; boarding: StopOnRoute; walkMeters: number } | null {
    let best: { alighting: StopOnRoute; boarding: StopOnRoute; walkMeters: number } | null = null;
    let bestRemaining = Infinity;

    for (const candidate of first.stops) {
      if (candidate.sequence <= boarding.sequence) continue;

      for (const target of second.stops) {
        if (target.sequence >= finalAlighting.sequence) continue;

        const walkMeters =
          candidate.stopId === target.stopId
            ? 0
            : this.walking.estimate(candidate, target).distanceM;

        if (walkMeters > MAX_TRANSFER_WALK_M) continue;

        const remaining = finalAlighting.alongMeters - target.alongMeters;
        if (remaining < bestRemaining) {
          bestRemaining = remaining;
          best = { alighting: candidate, boarding: target, walkMeters };
        }
      }
    }

    return best;
  }

  // ------------------------------------------------------------- el dibujado

  /**
   * Arma la opción tal como se muestra: los pasos, con su camino dibujado y
   * la línea de tiempo rehecha sobre las caminatas ruteadas, que son las que
   * de verdad va a caminar la persona.
   */
  private async materialize(
    option: PlannedOption,
    origin: PlannerPoint,
    destination: PlannerPoint,
    /** Dónde está cada coche ahora, para dibujar por dónde viene el tuyo. */
    byVehicle: Map<string, { latitude: number | string; longitude: number | string }>,
  ): Promise<TripOption> {
    const originLabel = origin.label ?? 'Tu ubicación';
    const destinationLabel = destination.label ?? 'Tu destino';

    const legs: TripLeg[] = [];
    const materializeNow = new Date();
    let walkMinutes = 0;
    let clock = 0;
    let leaveInMinutes = 0;

    const walkIn = await this.walking.route(origin, option.walkIn.stop);
    walkMinutes += walkIn.minutes;
    clock += walkIn.minutes;
    legs.push({
      type: 'walk',
      duration_minutes: walkIn.minutes,
      distance_m: walkIn.distanceM,
      from: originLabel,
      to: option.walkIn.stop.name,
      geometry: walkIn.geometry,
      straight: walkIn.straight,
    });

    for (const [index, ride] of option.rides.entries()) {
      // El transbordo en la misma parada no se camina: se espera ahí.
      const previous = index > 0 ? option.rides[index - 1].alighting : null;
      if (previous && previous.stopId !== ride.boarding.stopId) {
        const transfer = await this.walking.route(previous, ride.boarding);
        walkMinutes += transfer.minutes;
        clock += transfer.minutes;
        legs.push({
          type: 'walk',
          duration_minutes: transfer.minutes,
          distance_m: transfer.distanceM,
          from: previous.name,
          to: ride.boarding.name,
          geometry: transfer.geometry,
          straight: transfer.straight,
        });
      }
      if (index > 0) clock += TRANSFER_SLACK_MIN;

      // La espera se vuelve a resolver con el reloj ya corrido: en el segundo
      // tramo recién acá se sabe a qué hora se llega a esa parada, y qué
      // ómnibus de esa línea se puede tomar de verdad.
      const departure =
        index === 0
          ? ride.departure
          : (await this.refineDeparture(ride.sequence, ride.boarding, clock)) ??
            this.schedules.nextDeparture(ride.sequence, ride.boarding, clock, materializeNow) ??
            ride.departure;

      const wait = Math.max(0, Math.round(departure.atMinute - clock));
      clock = clock + wait;

      if (index === 0) leaveInMinutes = Math.max(0, Math.round(departure.atMinute - walkIn.minutes - BOARD_SLACK_MIN));

      legs.push({
        type: 'wait',
        duration_minutes: wait,
        departs_in_minutes: Math.round(departure.atMinute),
        from: ride.boarding.name,
        to: ride.boarding.name,
        line_code: ride.sequence.lineCode,
        line_label: this.officialRoutes.lineLabel(ride.sequence.operator, ride.sequence.lineCode),
        operator: ride.sequence.operator,
        headsign: ride.sequence.itineraryName,
        live: departure.live,
        scheduled: departure.scheduled,
        vehicle_id: departure.vehicleId,
        // Por dónde viene el ómnibus hasta la parada donde uno lo espera. Es
        // el mismo trazo coral del mapa de Bondis en vivo: sin él, en el mapa
        // del planificador el coche es un punto suelto en una avenida y no se
        // entiende que ese que viene por ahí es el tuyo.
        geometry: this.approachGeometry(ride.sequence, ride.boarding, byVehicle, departure.vehicleId),
      });

      const rideMinutes = this.rideMinutes(ride);
      clock += rideMinutes;

      const rideMeters = ride.alighting.alongMeters - ride.boarding.alongMeters;
      legs.push({
        type: 'bus',
        duration_minutes: rideMinutes,
        distance_m: Math.round(rideMeters),
        from: ride.boarding.name,
        to: ride.alighting.name,
        line_code: ride.sequence.lineCode,
        line_label: this.officialRoutes.lineLabel(ride.sequence.operator, ride.sequence.lineCode),
        operator: ride.sequence.operator,
        headsign: ride.sequence.itineraryName,
        vehicle_id: departure.vehicleId,
        stops_count: ride.alighting.sequence - ride.boarding.sequence,
        boarding_stop_id: ride.boarding.stopId,
        alighting_stop_id: ride.alighting.stopId,
        geometry: this.rideGeometry(ride.sequence, ride.boarding, ride.alighting),
        stops: ride.sequence.stops
          .filter(
            (stop) =>
              stop.sequence >= ride.boarding.sequence && stop.sequence <= ride.alighting.sequence,
          )
          .map((stop) => ({
            id: stop.stopId,
            name: stop.name,
            lat: stop.lat,
            lng: stop.lng,
            /**
             * Radio en metros dentro del cual está la parada. La pantalla lo
             * usa para no prometer una esquina que no puede afirmar: con más
             * de 60 m dice "la parada está por acá" en vez de "esperá acá".
             */
            accuracy_m: stop.accuracyM,
            reliable: stop.reliable,
          })),
      });
    }

    const lastStop = option.rides[option.rides.length - 1].alighting;
    const walkOut = await this.walking.route(lastStop, destination);
    walkMinutes += walkOut.minutes;
    clock += walkOut.minutes;
    legs.push({
      type: 'walk',
      duration_minutes: walkOut.minutes,
      distance_m: walkOut.distanceM,
      from: lastStop.name,
      to: destinationLabel,
      geometry: walkOut.geometry,
      straight: walkOut.straight,
    });

    const lineCodes = option.rides.map((ride) => ride.sequence.lineCode).join('-');

    return {
      id: `${option.walkIn.stop.id}-${lineCodes}-${option.walkOut.stop.id}`,
      // El total es cuándo llegás, no la suma de los pasos: el margen del
      // transbordo también es tiempo que pasa.
      total_minutes: Math.round(clock),
      walk_minutes: walkMinutes,
      transfers: option.rides.length - 1,
      leave_in_minutes: leaveInMinutes,
      legs,
    };
  }

  /** Las llegadas reales de la parada del transbordo, ya con el reloj corrido. */
  private async refineDeparture(
    sequence: RouteStopSequence,
    boarding: StopOnRoute,
    readyAtMinute: number,
  ): Promise<Departure | null> {
    const arrivals = await this.arrivals.getForStop(boarding.stopId);
    const etas = this.etasByItinerary(arrivals);

    const catchable = (etas.get(this.itineraryId(sequence)) ?? []).find(
      (arrival) => arrival.eta_minutes >= readyAtMinute + BOARD_SLACK_MIN,
    );

    if (!catchable) return null;

    return {
      atMinute: catchable.eta_minutes,
      live: catchable.live,
      vehicleId: catchable.vehicle_id,
    };
  }

  /**
   * Ir caminando, cuando el destino está cerca.
   *
   * Es la opción con la que se comparan todas las demás. Sin ella el
   * planificador ofrece tomarse un ómnibus para hacer ochocientos metros —lo
   * cual, con la espera, es más lento que ir a pie— y encima lo pone primero
   * porque "va en ómnibus".
   */
  private async walkOnlyOption(
    origin: PlannerPoint,
    destination: PlannerPoint,
  ): Promise<TripOption | null> {
    const estimate = this.walking.estimate(origin, destination);
    if (estimate.distanceM > MAX_WALK_ONLY_M) return null;

    const walk = await this.walking.route(origin, destination);

    return {
      id: 'a-pie',
      total_minutes: walk.minutes,
      walk_minutes: walk.minutes,
      transfers: 0,
      leave_in_minutes: 0,
      legs: [
        {
          type: 'walk',
          duration_minutes: walk.minutes,
          distance_m: walk.distanceM,
          from: origin.label ?? 'Tu ubicación',
          to: destination.label ?? 'Tu destino',
          geometry: walk.geometry,
          straight: walk.straight,
        },
      ],
    };
  }

  /**
   * El pedazo del recorrido entre la parada donde se sube y donde se baja.
   *
   * Es el recorrido publicado por la empresa, recortado: el ómnibus va por ahí
   * y por ningún otro lado, así que dibujar la recta entre las dos paradas
   * sería mostrar un viaje que no existe.
   */
  /**
   * El pedazo de recorrido que al ómnibus le falta para llegar a tu parada.
   *
   * Sólo existe cuando la espera sale de una unidad concreta en la calle: si
   * la salida vino del horario publicado o de la frecuencia, no hay coche del
   * que medir y no se dibuja nada. Dibujar "por dónde viene" un ómnibus que no
   * se sabe dónde está sería inventar.
   */
  private approachGeometry(
    sequence: RouteStopSequence,
    boarding: StopOnRoute,
    byVehicle: Map<string, { latitude: number | string; longitude: number | string }>,
    vehicleId?: string,
  ): LngLat[] | undefined {
    if (!vehicleId) return undefined;

    const shape = this.geometryFor(sequence);
    if (!shape) return undefined;

    const position = byVehicle.get(vehicleId);
    if (!position) return undefined;

    const along = distanceAlongPolyline(
      Number(position.latitude),
      Number(position.longitude),
      shape.geometry,
      shape.cumulative,
    );
    if (!along || along.alongMeters >= boarding.alongMeters) return undefined;

    return slicePolyline(shape.geometry, along.alongMeters, boarding.alongMeters);
  }

  private rideGeometry(
    sequence: RouteStopSequence,
    boarding: StopOnRoute,
    alighting: StopOnRoute,
  ): LngLat[] | undefined {
    const shape = this.shapeFor(sequence);
    if (!shape?.geometry || shape.geometry.length < 2) return undefined;

    return slicePolyline(shape.geometry, boarding.alongMeters, alighting.alongMeters);
  }

  /**
   * Cuánto dura el tramo en ómnibus.
   *
   * La velocidad es la que ese recorrido viene teniendo de verdad, medida
   * sobre las posiciones de las últimas horas e incluyendo las detenciones
   * (ver LineSpeedService). La constante de 18 km/h que había antes servía
   * para el centro y sobraba en todo lo demás: la 1 y la 24 hacen media línea
   * por la Ruta 39.
   */
  private rideMinutes(ride: {
    sequence: RouteStopSequence;
    boarding: StopOnRoute;
    alighting: StopOnRoute;
  }): number {
    const geometry = this.geometryFor(ride.sequence);

    // Con la velocidad de cada parte del recorrido. El promedio único servía
    // mientras el tramo fuera todo del mismo tipo; en un viaje que arranca en
    // el centro y sigue por la ruta subestima la primera mitad y sobrestima
    // la segunda, y las dos cosas juntas mueven la hora de llegada.
    if (geometry) {
      const minutes = this.lineSpeeds.travelMinutes(
        ride.sequence.operator,
        ride.sequence.lineCode,
        ride.sequence.itineraryKey,
        geometry.geometry,
        geometry.cumulative,
        ride.boarding.alongMeters,
        ride.alighting.alongMeters,
      );
      if (minutes > 0) return Math.max(1, Math.round(minutes));
    }

    // Sin trazo no hay tramo que recorrer: queda el promedio del recorrido,
    // que es con lo que se venía calculando.
    const meters = ride.alighting.alongMeters - ride.boarding.alongMeters;
    const kmh = this.lineSpeeds.kmh(
      ride.sequence.operator,
      ride.sequence.lineCode,
      ride.sequence.itineraryKey,
    );

    return Math.max(1, Math.round(meters / ((kmh * 1000) / 60)));
  }

  /** El trazo de un recorrido con sus distancias acumuladas ya calculadas. */
  private geometryFor(
    sequence: RouteStopSequence,
  ): { geometry: LngLat[]; cumulative: number[] } | null {
    const shape = this.shapeFor(sequence);
    if (!shape?.geometry || shape.geometry.length < 2) return null;

    const geometry = shape.geometry as LngLat[];
    let cumulative = this.cumulativeByShape.get(geometry);
    if (!cumulative) {
      cumulative = cumulativeDistances(geometry);
      this.cumulativeByShape.set(geometry, cumulative);
    }

    return { geometry, cumulative };
  }

  private nearbyStops(stops: StopRecord[], point: PlannerPoint, maxMeters: number): CandidateStop[] {
    const cercanas = stops
      .filter((stop) => this.trustworthy(stop))
      .map((stop) => ({
        stop,
        walkMeters: this.walking.estimate(point, stop).distanceM,
        huntingMeters: this.huntingMeters(stop),
      }))
      .filter((candidate) => candidate.walkMeters <= maxMeters)
      // El orden es por caminata pura y no por caminata más incertidumbre: acá
      // se decide qué entra, no qué se prefiere, y penalizar en un corte no
      // reordena preferencias sino que saca paradas del tablero. La
      // incertidumbre se cobra después, en el costo de la opción ya armada,
      // donde compite en vez de eliminar. Ver `huntingMeters` y `buildOption`.
      .sort((a, b) => a.walkMeters - b.walkMeters);

    // Se recorren de la más cercana a la más lejana y se conserva la parada que
    // le aporte cupo a algún itinerario. Así el corte deja de ser "las N más
    // cercanas" -que en un barrio denso son N veces la misma esquina- y pasa a
    // ser "la más cercana de cada línea que pasa por acá".
    const cupo = new Map<string, number>();
    const elegidas: CandidateStop[] = [];

    for (const candidata of cercanas) {
      const itinerarios = this.stopSequences.getForStop(candidata.stop.id);
      // Una parada que ningún recorrido reclama no sirve para subirse: está en
      // el mapa porque existe, pero no hay línea que la use.
      if (itinerarios.length === 0) continue;

      const aporta = itinerarios.some(
        (sequence) => (cupo.get(this.itineraryId(sequence)) ?? 0) < STOPS_PER_ITINERARY,
      );
      if (!aporta) continue;

      for (const sequence of itinerarios) {
        const id = this.itineraryId(sequence);
        cupo.set(id, (cupo.get(id) ?? 0) + 1);
      }

      elegidas.push(candidata);
      if (elegidas.length >= MAX_CANDIDATE_STOPS) break;
    }

    return elegidas;
  }

  /**
   * ¿Se puede mandar gente a esta parada?
   *
   * Se pide que la posición esté apoyada sobre el recorrido y que la
   * incertidumbre sea chica. Las que no cumplen siguen existiendo -en el mapa,
   * en el buscador, en la pantalla de la parada- pero no se usan para armar un
   * viaje.
   */
  private trustworthy(stop: StopRecord): boolean {
    // Una parada cargada a mano por la Intendencia no tiene estas medidas y se
    // acepta: alguien la puso donde está.
    if (stop.placement === null && stop.spread_m === null && stop.accuracy_m === null) return true;

    // Con error declarado alcanza: lo que no sirve se cobra en metros, no se
    // descarta. Ver HUNTING_FREE_M.
    if (stop.accuracy_m !== null) return true;

    // Sin error declarado se cae al criterio viejo: es una parada que todavía
    // no pasó por la colocación nueva, no una parada mala.
    return stop.placement === 'recorrido';
  }

  /**
   * Los metros que alguien va a caminar de más buscando el cartel.
   *
   * Es el error declarado de la parada menos el margen que no cuesta nada: con
   * 60 m el cartel está a lo sumo en la esquina de al lado y se lo ve desde
   * donde uno llega. Todo lo que pase de ahí son metros que hay que caminar
   * mirando alrededor, y por eso se suman a la caminata para ordenar
   * candidatas.
   *
   * No entra en el tiempo que se le muestra a la persona: son metros posibles,
   * no metros seguros. Sirve para elegir entre paradas, que es donde hace la
   * diferencia.
   */
  private huntingMeters(stop: StopRecord): number {
    if (stop.accuracy_m === null) return 0;
    return Math.max(0, stop.accuracy_m - HUNTING_FREE_M);
  }

  /**
   * Se queda con las mejores opciones, sin repetir combinaciones de líneas.
   *
   * Cinco variantes del mismo viaje cambiando la parada de subida no son cinco
   * opciones, son ruido: se muestra como mucho una por combinación de líneas.
   * El orden es por costo —minutos más las penalizaciones de transbordo y
   * caminata—, no por minutos pelados.
   */
  private rank(options: PlannedOption[]): PlannedOption[] {
    const sorted = [...options].sort((a, b) => a.cost - b.cost);
    if (sorted.length === 0) return [];

    // La referencia es la que antes llega, no la de menor costo: el costo
    // lleva penalizaciones que sirven para ordenar, no para medir el viaje.
    const bestMinutes = Math.min(...sorted.map((option) => option.estimatedMinutes));

    const seen = new Set<string>();
    const diverse: PlannedOption[] = [];

    for (const option of sorted) {
      const lines = option.rides
        .map((ride) => `${ride.sequence.operator}|${ride.sequence.lineCode}`)
        .join('-');
      if (seen.has(lines)) continue;

      // El corte por tiempo recién se aplica cuando ya hay un abanico armado.
      // Lo que se pide es ver **todas las líneas que sirven**, de las tres
      // empresas, aunque una pase mucho después: alguien que no tiene apuro
      // prefiere saber que existe la 8 aunque pase en dos horas, y alguien que
      // sí lo tiene ya vio la primera de la lista. Recién pasadas las
      // MIN_OPTIONS se descartan las que llegan absurdamente más tarde.
      if (
        diverse.length >= MIN_OPTIONS &&
        option.estimatedMinutes > bestMinutes + MAX_MINUTES_OVER_BEST
      ) {
        continue;
      }

      seen.add(lines);
      diverse.push(option);
      if (diverse.length >= MAX_OPTIONS) break;
    }

    return diverse;
  }

  /**
   * Etiqueta la que gana en cada criterio. Como en Citymapper: la gente no
   * siempre quiere lo más rápido — con lluvia o con valijas quiere caminar
   * menos.
   */
  private label(options: TripOption[]): TripOption[] {
    if (options.length === 0) return options;

    options.sort((a, b) => a.total_minutes - b.total_minutes);
    options[0].label = 'Más rápido';

    const onFoot = options.find((option) => option.id === 'a-pie');
    if (onFoot && !onFoot.label) onFoot.label = 'A pie';

    const leastWalk = options.reduce((best, option) =>
      option.walk_minutes < best.walk_minutes ? option : best,
    );
    if (!leastWalk.label) leastWalk.label = 'Menos caminata';

    // "Sin transbordo" sólo dice algo si hay alguna con transbordo para
    // comparar. Como ahora el transbordo aparece únicamente cuando no existe
    // ningún directo, lo normal es que todas sean directas y la etiqueta no
    // distinga nada: puesta ahí sugiere que las otras sí combinan.
    if (options.some((option) => option.transfers > 0)) {
      const direct = options.find(
        (option) => option.transfers === 0 && option.id !== 'a-pie' && !option.label,
      );
      if (direct) direct.label = 'Sin transbordo';
    }

    return options;
  }
}
