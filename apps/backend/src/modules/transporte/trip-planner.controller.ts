import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { LastReturn, TripPlannerService, TripOption } from './trip-planner.service';
import { StopSequenceService } from './stop-sequence.service';

/**
 * Planificación de viajes.
 *
 * Va por POST y no por GET porque el cuerpo lleva las coordenadas exactas de
 * origen y destino: son datos de ubicación de una persona y no tienen por qué
 * quedar escritos en la barra del navegador, en el historial ni en los logs de
 * acceso del servidor.
 */

interface PlanRequest {
  origin: { lat: number; lng: number; label?: string };
  destination: { lat: number; lng: number; label?: string };
  /**
   * Cuándo se sale, en ISO 8601. Ausente es "ahora", que es el 95% de los
   * pedidos.
   */
  depart_at?: string;
  /**
   * A qué hora hay que estar, en ISO 8601. Es la otra pregunta: se busca
   * hacia atrás desde esta hora, ver `TripPlannerService.planArriveBy`. No
   * va junto con `depart_at`: las dos a la vez no significan nada.
   */
  arrive_by?: string;
  /**
   * Sólo ómnibus con rampa. Cambia qué coche se elige, no sólo qué se
   * muestra: ver `TripPlannerService.plan`.
   */
  accessible_only?: boolean;
}

function isValidPoint(point: any): boolean {
  return (
    point &&
    Number.isFinite(Number(point.lat)) &&
    Number.isFinite(Number(point.lng)) &&
    Math.abs(Number(point.lat)) <= 90 &&
    Math.abs(Number(point.lng)) <= 180
  );
}

/**
 * Cuánto puede quedar para atrás una hora de salida y seguir siendo "ahora".
 *
 * El reloj del teléfono y el del servidor no son el mismo, y entre que alguien
 * elige la hora y toca buscar pasan segundos. Dos minutos cubre las dos cosas
 * sin llegar a tapar un error de verdad.
 */
const TOLERANCIA_PASADO_MIN = 2;

/**
 * Hasta cuándo se planifica hacia adelante.
 *
 * El horario publicado es **semanal**: cada servicio trae los días en los que
 * corre y nada más. Con eso, contestar "el 3 de diciembre" es repetir el
 * horario de este miércoles para un día del que no sabemos nada —ni si es
 * feriado, ni si para entonces cambió la temporada—. Una semana es lo que el
 * dato aguanta.
 *
 * Los feriados quedan mal igual, incluso para mañana: en la tabla no hay
 * calendario de feriados, así que un 1º de mayo se contesta con el horario de
 * un viernes común. Está acá escrito porque es una limitación del dato, no del
 * planificador.
 */
const MAX_DIAS_ADELANTE = 7;

/**
 * Una hora pedida, validada: parseable, no pasada, no más allá de una semana.
 *
 * Una hora que ya pasó **no** se contesta como si fuera ahora: sería contestar
 * otra pregunta que la que se hizo, y quien pidió "ayer a las 18:30" leería el
 * viaje de este momento creyendo que es el de ayer.
 */
function parseHora(raw: string, campo: string, yaPaso: string): Date {
  const at = new Date(raw);
  if (!Number.isFinite(at.getTime())) {
    throw new BadRequestException(`${campo} no es una fecha válida: se espera ISO 8601`);
  }

  const minutosDesdeAhora = (at.getTime() - Date.now()) / 60_000;

  if (minutosDesdeAhora < -TOLERANCIA_PASADO_MIN) {
    throw new BadRequestException(yaPaso);
  }

  if (minutosDesdeAhora > MAX_DIAS_ADELANTE * 24 * 60) {
    throw new BadRequestException(
      `Sólo podemos planificar hasta ${MAX_DIAS_ADELANTE} días adelante`,
    );
  }

  return at;
}

/**
 * La hora de salida pedida, ya validada.
 *
 * Devuelve `undefined` cuando el viaje es ahora, que es lo que el planificador
 * espera para usar las tres fuentes.
 */
function parseDepartAt(raw: string | undefined): Date | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;

  const at = parseHora(raw, 'depart_at', 'La hora de salida ya pasó');

  // Dentro de la tolerancia es ahora, y ahora se contesta con todo lo que hay:
  // el coche en la calle además del papel.
  return at.getTime() <= Date.now() ? undefined : at;
}

/**
 * La hora de llegada pedida, ya validada.
 *
 * A diferencia de la salida, no tiene un "ahora": llegar ya no es una
 * pregunta. Y no se puede llegar en menos que nada, así que dentro de la
 * tolerancia también se rechaza.
 */
function parseArriveBy(raw: string | undefined): Date | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;

  const at = parseHora(raw, 'arrive_by', 'La hora de llegada ya pasó');

  if (at.getTime() <= Date.now()) {
    throw new BadRequestException('La hora de llegada ya pasó');
  }

  return at;
}

@Controller('transport/plan')
export class TripPlannerController {
  constructor(
    private readonly planner: TripPlannerService,
    private readonly stopSequences: StopSequenceService,
  ) {}

  @Post()
  async plan(@Body() body: PlanRequest): Promise<{
    options: TripOption[];
    ready: boolean;
    /** La última vuelta desde el destino, para saberlo antes de ir. */
    return_trip: LastReturn;
    /**
     * Desde qué momento están contados los minutos de la respuesta.
     *
     * Null es ahora. Cuando hay hora pedida va escrito, y no por prolijidad:
     * todos los minutos que devuelve el planificador -`leave_in_minutes`,
     * `departs_in_minutes`, `total_minutes`- se cuentan desde este instante, y
     * si la pantalla los sumara a su propio reloj mostraría horas corridas por
     * la diferencia entre los dos.
     */
    planned_for: string | null;
    /**
     * La hora a la que se pidió llegar, cuando la pregunta fue esa. Con esto
     * puesto, las opciones vienen ordenadas por salida -la más tarde
     * primero- y `planned_for` es la salida más temprana de las que quedaron.
     */
    arrive_by: string | null;
  }> {
    if (!isValidPoint(body?.origin) || !isValidPoint(body?.destination)) {
      throw new BadRequestException('Faltan las coordenadas de origen o destino');
    }

    if (body?.depart_at && body?.arrive_by) {
      throw new BadRequestException('Elegí salir a las o llegar a las, no las dos');
    }

    const departAt = parseDepartAt(body?.depart_at);
    const arriveBy = parseArriveBy(body?.arrive_by);
    const soloAccesibles = body?.accessible_only === true;

    const origin = {
      lat: Number(body.origin.lat),
      lng: Number(body.origin.lng),
      label: body.origin.label,
    };
    const destination = {
      lat: Number(body.destination.lat),
      lng: Number(body.destination.lng),
      label: body.destination.label,
    };

    if (arriveBy) {
      // Hacia atrás desde la hora de llegada. La vuelta se mira desde esa
      // hora, que es cuando uno está allá.
      const [ida, returnTrip] = await Promise.all([
        this.planner.planArriveBy(origin, destination, arriveBy, new Date(), soloAccesibles),
        this.planner.lastReturn(origin, destination, arriveBy),
      ]);

      return {
        options: ida.options,
        return_trip: returnTrip,
        planned_for: ida.desde ? ida.desde.toISOString() : null,
        arrive_by: arriveBy.toISOString(),
        ready: this.stopSequences.isReady(),
      };
    }

    // La vuelta se calcula junto con la ida y no en otro pedido: la pregunta
    // "¿y cómo vuelvo?" hay que contestarla **antes** de que la persona salga,
    // no cuando se le ocurra buscarla.
    const [options, returnTrip] = await Promise.all([
      this.planner.plan(origin, destination, departAt, soloAccesibles),
      // La vuelta también se mira desde la hora pedida: "la última vuelta ya
      // salió" es una respuesta sobre el momento en que uno está allá, no
      // sobre el momento en que lo está planificando.
      this.planner.lastReturn(origin, destination, departAt),
    ]);

    return {
      options,
      return_trip: returnTrip,
      planned_for: departAt ? departAt.toISOString() : null,
      arrive_by: null,
      // Sin recorridos reconstruidos no hay orden de paradas y no se puede
      // planificar nada. La interfaz necesita distinguirlo de "no encontramos
      // ninguna combinación".
      ready: this.stopSequences.isReady(),
    };
  }
}
