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
   *
   * Es "salir a las" y no "llegar a las". Llegar a las es la otra pregunta y
   * es otro problema: hay que buscar hacia atrás desde la hora de llegada, no
   * alcanza con mover el reloj.
   */
  depart_at?: string;
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
 * La hora de salida pedida, ya validada.
 *
 * Devuelve `undefined` cuando el viaje es ahora, que es lo que el planificador
 * espera para usar las tres fuentes. Una hora que ya pasó **no** se contesta
 * como si fuera ahora: sería contestar otra pregunta que la que se hizo, y
 * quien pidió "ayer a las 18:30" leería el viaje de este momento creyendo que
 * es el de ayer.
 */
function parseDepartAt(raw: string | undefined): Date | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;

  const at = new Date(raw);
  if (!Number.isFinite(at.getTime())) {
    throw new BadRequestException('depart_at no es una fecha válida: se espera ISO 8601');
  }

  const minutosDesdeAhora = (at.getTime() - Date.now()) / 60_000;

  if (minutosDesdeAhora < -TOLERANCIA_PASADO_MIN) {
    throw new BadRequestException('La hora de salida ya pasó');
  }

  if (minutosDesdeAhora > MAX_DIAS_ADELANTE * 24 * 60) {
    throw new BadRequestException(
      `Sólo podemos planificar hasta ${MAX_DIAS_ADELANTE} días adelante`,
    );
  }

  // Dentro de la tolerancia es ahora, y ahora se contesta con todo lo que hay:
  // el coche en la calle además del papel.
  return minutosDesdeAhora <= 0 ? undefined : at;
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
  }> {
    if (!isValidPoint(body?.origin) || !isValidPoint(body?.destination)) {
      throw new BadRequestException('Faltan las coordenadas de origen o destino');
    }

    const departAt = parseDepartAt(body?.depart_at);

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

    // La vuelta se calcula junto con la ida y no en otro pedido: la pregunta
    // "¿y cómo vuelvo?" hay que contestarla **antes** de que la persona salga,
    // no cuando se le ocurra buscarla.
    const [options, returnTrip] = await Promise.all([
      this.planner.plan(origin, destination, departAt),
      // La vuelta también se mira desde la hora pedida: "la última vuelta ya
      // salió" es una respuesta sobre el momento en que uno está allá, no
      // sobre el momento en que lo está planificando.
      this.planner.lastReturn(origin, destination, departAt),
    ]);

    return {
      options,
      return_trip: returnTrip,
      planned_for: departAt ? departAt.toISOString() : null,
      // Sin recorridos reconstruidos no hay orden de paradas y no se puede
      // planificar nada. La interfaz necesita distinguirlo de "no encontramos
      // ninguna combinación".
      ready: this.stopSequences.isReady(),
    };
  }
}
