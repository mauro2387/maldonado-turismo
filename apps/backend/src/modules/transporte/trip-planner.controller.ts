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
  }> {
    if (!isValidPoint(body?.origin) || !isValidPoint(body?.destination)) {
      throw new BadRequestException('Faltan las coordenadas de origen o destino');
    }

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
      this.planner.plan(origin, destination),
      this.planner.lastReturn(origin, destination),
    ]);

    return {
      options,
      return_trip: returnTrip,
      // Sin recorridos reconstruidos no hay orden de paradas y no se puede
      // planificar nada. La interfaz necesita distinguirlo de "no encontramos
      // ninguna combinación".
      ready: this.stopSequences.isReady(),
    };
  }
}
