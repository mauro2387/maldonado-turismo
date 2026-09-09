import { Injectable } from '@nestjs/common';
import { RouteStopSequence, StopOnRoute, StopSequenceService } from './stop-sequence.service';
import { itineraryKey, RouteShapesService } from './route-shapes.service';
import { VehiclePositionsService } from './vehicle-positions.service';
import { LineSpeedService } from './line-speed.service';
import { WalkingService, Walk } from './walking.service';
import { cumulativeDistances, distanceAlongPolyline, distanceMeters, LngLat } from './geo.util';

/**
 * ¿Llego a tomar **este** ómnibus?
 *
 * Es la pregunta que se hace alguien que ve un coche en el mapa y lo toca. La
 * respuesta no es "la parada más cercana del recorrido": es si esa parada la
 * alcanza **antes que el ómnibus**, y si no, cuál sí.
 *
 * Esto vivía en la pantalla, con constantes escritas a mano, y estaba mal en
 * las dos direcciones a la vez: suponía que la persona camina a 57 m/min
 * -contra los 80 que usa el resto de la app- y que el ómnibus va a 300 m/min
 * -la velocidad por defecto, cuando la mayoría de las líneas de acá andan más
 * despacio porque paran-. Los dos errores empujan para el mismo lado, así que
 * el resultado era decirle a alguien parado a una cuadra de la parada, con el
 * ómnibus a cinco cuadras, que no llegaba. Con esos números el coche tenía que
 * estar a más de 820 m para que la app lo diera por alcanzable.
 *
 * Acá se hace con los datos que el backend ya tiene y que la pantalla no puede
 * tener:
 *
 * - **La velocidad de esa línea, medida.** `LineSpeedService` la saca del GPS
 *   de las últimas 24 h, así que ya incluye lo que el coche pierde parando en
 *   cada parada. No es una constante.
 * - **La caminata por la calle.** `WalkingService` rutea a pie de verdad; el
 *   frontend sólo podía medir en línea recta y castigar con un factor.
 * - **El orden de paradas del recorrido**, con los metros acumulados de cada
 *   una ya calculados.
 *
 * El costo es una llamada al ruteador por parada candidata, así que el orden
 * importa: primero se descarta con cuentas baratas y recién se sale a la red
 * por las poquitas que quedan vivas.
 */

/** El ómnibus tiene que estar antes de la parada, con margen para el GPS. */
const AHEAD_MARGIN_M = 60;

/**
 * Cuánto error de posición de la parada se regala antes de cobrarlo.
 *
 * Es el mismo criterio y el mismo número que usa el planificador
 * (`HUNTING_FREE_M`), y estar alineados importa: son dos pantallas que
 * contestan la misma pregunta -¿dónde me subo?- y si una descarta lo que la
 * otra acepta, la app se contradice sola.
 *
 * Antes acá se descartaba con un booleano: `if (!stop.reliable) continue`.
 * Cuando `reliable` pasó a significar "error medido ≤ 60 m" -que es más
 * honesto que la dispersión de las muestras que medía antes- eso dejó afuera
 * al **57% de las paradas** de golpe, y el efecto en esta pantalla es
 * exactamente el que se estaba tratando de arreglar: más "no llegás" de los
 * debidos.
 *
 * Una parada con 90 m de error no es inservible: es media cuadra de buscar el
 * cartel. Así que no se descarta, se cobra: los metros que pasan de este piso
 * se suman a la caminata, y ahí compite con las demás en vez de desaparecer.
 * Lo único que se descarta es la parada que nunca se pudo ubicar.
 */
const HUNTING_FREE_M = 60;

/**
 * Hasta dónde se busca. Más de un kilómetro caminando para tomar un coche que
 * ya viene no es una sugerencia útil: para eso está el planificador.
 */
const MAX_CATCH_WALK_M = 1000;

/**
 * Cuánto hay que llegar antes que el ómnibus.
 *
 * No es un número fijo, y ahí estaba la otra mitad del problema. Un colchón
 * plano de un minuto sobre una caminata de treinta segundos es un recargo del
 * 200%: con eso, alguien parado **en** la parada con el coche a una cuadra se
 * comía un "no llegás".
 *
 * El riesgo de no llegar no es constante: crece con lo que uno camina. Media
 * cuadra es media cuadra; ocho cuadras son un semáforo, una vereda rota y que
 * el coche agarre una verde larga. Así que el margen es un piso chico -el
 * último metro, levantar la mano- más una fracción de la caminata.
 */
const CATCH_FLOOR_MIN = 0.25;
const CATCH_UNCERTAINTY = 0.15;

/**
 * Cuántas paradas se rutean de verdad. Las candidatas se ordenan por cercanía
 * y se pregunta por las primeras: la que se busca es la que menos camine, así
 * que las de más adelante casi nunca se necesitan.
 */
const MAX_ROUTED_CANDIDATES = 4;

/**
 * Techo de tiempo para el ruteo. Si el ruteador a pie se demora, se contesta
 * con la estimación en línea recta antes que dejar la ficha colgada: la
 * pantalla tiene que responder mientras la persona mira el mapa.
 */
const ROUTING_BUDGET_MS = 2500;

export interface CatchResult {
  /** Si se llega a tomar ese coche en alguna parada. */
  catchable: boolean;
  /** Dónde tomarlo. Null si no se llega. */
  stop: {
    id: number;
    name: string;
    lat: number;
    lng: number;
  } | null;
  /** La caminata hasta esa parada, por calle. */
  walk_minutes: number | null;
  walk_distance_m: number | null;
  walk_geometry: LngLat[];
  /** True si la caminata es la recta porque el ruteador no contestó. */
  walk_straight: boolean;
  /** En cuántos minutos llega el ómnibus a esa parada. */
  bus_minutes: number | null;
  /** Minutos de sobra al llegar. Sirve para decir "vas justo". */
  slack_minutes: number | null;
  /**
   * Por qué no se llega:
   * - `pasa_antes`: hay paradas a mano, pero el coche llega primero.
   * - `lejos`: ninguna parada de lo que le falta al coche está a distancia
   *   de caminar.
   * - `sin_recorrido`: no hay trazo o secuencia de paradas para ese coche.
   * - `ya_paso`: al coche no le queda ninguna parada por delante.
   */
  reason: 'pasa_antes' | 'lejos' | 'sin_recorrido' | 'ya_paso' | null;
  /** La parada más cercana de su recorrido, para poder explicar el "lejos". */
  nearest_walk_m: number | null;
}

interface Candidate {
  stop: StopOnRoute;
  straightMeters: number;
  busMinutes: number;
  /** Metros extra por buscar el cartel, según el error de la parada. */
  huntingMeters: number;
}

const NO_ROUTE: CatchResult = {
  catchable: false,
  stop: null,
  walk_minutes: null,
  walk_distance_m: null,
  walk_geometry: [],
  walk_straight: true,
  bus_minutes: null,
  slack_minutes: null,
  reason: 'sin_recorrido',
  nearest_walk_m: null,
};

@Injectable()
export class CatchBusService {
  constructor(
    private readonly vehiclePositions: VehiclePositionsService,
    private readonly stopSequences: StopSequenceService,
    private readonly routeShapes: RouteShapesService,
    private readonly lineSpeeds: LineSpeedService,
    private readonly walking: WalkingService,
  ) {}

  async evaluate(vehicleId: string, from: { lat: number; lng: number }): Promise<CatchResult> {
    const positions = await this.vehiclePositions.getLatestPositions();
    const vehicle = positions.find((position) => position.vehicle_id === vehicleId);
    if (!vehicle) return { ...NO_ROUTE };

    const sequence = this.stopSequences.get(
      vehicle.operator,
      vehicle.line_code,
      itineraryKey(vehicle.line_name ?? null),
    );
    if (!sequence || sequence.stops.length === 0) return { ...NO_ROUTE };

    const geometry = this.geometryFor(sequence);
    if (!geometry) return { ...NO_ROUTE };

    const along = distanceAlongPolyline(
      Number(vehicle.latitude),
      Number(vehicle.longitude),
      geometry.geometry,
      geometry.cumulative,
    );
    if (!along) return { ...NO_ROUTE };

    await this.lineSpeeds.warm();

    // --- Las candidatas, con cuentas baratas -------------------------------
    //
    // Todo esto es en memoria y en línea recta: sirve para tirar abajo las que
    // no tienen ninguna chance antes de gastar un pedido de red en ellas.
    const candidates: Candidate[] = [];
    let nearestAhead: number | null = null;

    for (const stop of sequence.stops) {
      // Lo único que se descarta es la parada que **nunca se pudo ubicar**:
      // sin coordenada medida no hay a dónde mandar a nadie. El error grande
      // no descarta, se cobra abajo. Ver HUNTING_FREE_M.
      if (stop.accuracyM === null && !stop.reliable) continue;

      const huntingMeters = Math.max(0, (stop.accuracyM ?? 0) - HUNTING_FREE_M);

      const remaining = stop.alongMeters - along.alongMeters;
      if (remaining < AHEAD_MARGIN_M) continue;

      const straightMeters =
        distanceMeters(from.lat, from.lng, stop.lat, stop.lng) + huntingMeters;
      if (nearestAhead === null || straightMeters < nearestAhead) {
        nearestAhead = straightMeters;
      }
      if (straightMeters > MAX_CATCH_WALK_M) continue;

      // Con la velocidad del tramo que le falta recorrer, no con la del
      // recorrido entero. La 15 promedia 30 km/h porque son treinta
      // kilómetros de ruta, pero las paradas donde alguien la alcanza están
      // en el centro, donde anda a 20: con el promedio la app le daba diez
      // minutos a un tramo que la propia empresa publica en quince.
      const busMinutes = this.lineSpeeds.travelMinutes(
        sequence.operator,
        sequence.lineCode,
        sequence.itineraryKey,
        geometry.geometry,
        geometry.cumulative,
        along.alongMeters,
        stop.alongMeters,
      );

      // La recta es una cota inferior de la caminata real: si ni caminando en
      // línea recta se llega, rutear por calle sólo va a dar peor.
      const optimisticWalk = straightMeters / this.walking.speedMPerMin;
      if (this.required(optimisticWalk) > busMinutes) continue;

      candidates.push({ stop, straightMeters, busMinutes, huntingMeters });
    }

    if (nearestAhead === null) {
      return { ...NO_ROUTE, reason: 'ya_paso' };
    }

    if (candidates.length === 0) {
      // Había paradas por delante: o quedan lejos, o el coche llega primero.
      return {
        ...NO_ROUTE,
        reason: nearestAhead > MAX_CATCH_WALK_M ? 'lejos' : 'pasa_antes',
        nearest_walk_m: Math.round(nearestAhead),
      };
    }

    // --- Las que quedaron, ruteadas de verdad ------------------------------
    //
    // Se busca la que **menos camine**, no la más temprana: es el mismo coche,
    // así que subirse en una parada o en la siguiente no cambia a qué hora se
    // llega. Lo único que cambia es cuánto camina la persona.
    candidates.sort((a, b) => a.straightMeters - b.straightMeters);
    const shortlist = candidates.slice(0, MAX_ROUTED_CANDIDATES);

    const walks = await this.routeAll(from, shortlist);

    for (let index = 0; index < shortlist.length; index += 1) {
      const { stop, busMinutes, huntingMeters } = shortlist[index];
      const walk = walks[index];

      // Con los minutos finos y no con `walk.minutes`, que viene redondeado y
      // nunca baja de 1: contra un ómnibus que llega en 50 segundos, redondear
      // la caminata a un minuto entero es justo el error que se quiere evitar.
      const walkMinutes = (walk.distanceM + huntingMeters) / this.walking.speedMPerMin;
      if (this.required(walkMinutes) > busMinutes) continue;
      const slack = busMinutes - walkMinutes;

      return {
        catchable: true,
        stop: { id: stop.stopId, name: stop.name, lat: stop.lat, lng: stop.lng },
        walk_minutes: walk.minutes,
        walk_distance_m: Math.round(walk.distanceM),
        walk_geometry: walk.geometry,
        walk_straight: walk.straight,
        bus_minutes: Math.round(busMinutes),
        slack_minutes: Math.round(slack),
        reason: null,
        nearest_walk_m: Math.round(nearestAhead),
      };
    }

    // Pasaban el filtro barato y no el de la calle: la vuelta que hay que dar
    // caminando es más larga que la recta.
    return {
      ...NO_ROUTE,
      reason: 'pasa_antes',
      nearest_walk_m: Math.round(nearestAhead),
    };
  }

  /**
   * En cuántos minutos hay que tener al ómnibus para salir a buscarlo.
   *
   * La caminata más el margen. Ver `CATCH_FLOOR_MIN`: el margen crece con la
   * caminata porque el riesgo también.
   */
  private required(walkMinutes: number): number {
    return walkMinutes * (1 + CATCH_UNCERTAINTY) + CATCH_FLOOR_MIN;
  }

  /**
   * Rutea las candidatas en paralelo y con techo de tiempo.
   *
   * Si el ruteador se pasa del presupuesto se contesta con la recta: vale más
   * una respuesta con un número aproximado que una ficha que no carga.
   */
  private async routeAll(
    from: { lat: number; lng: number },
    candidates: Candidate[],
  ): Promise<Walk[]> {
    const fallback = candidates.map((candidate) =>
      this.walking.estimate(from, candidate.stop),
    );

    const routed = Promise.all(
      candidates.map((candidate) =>
        this.walking.route(from, candidate.stop).catch(() => this.walking.estimate(from, candidate.stop)),
      ),
    );

    const budget = new Promise<Walk[]>((resolve) => {
      setTimeout(() => resolve(fallback), ROUTING_BUDGET_MS);
    });

    return Promise.race([routed, budget]);
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
