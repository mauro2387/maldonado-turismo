import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { RideService, RideStatus } from './ride.service';

/**
 * El viaje, ya arriba del ómnibus.
 *
 * Va por POST y no por GET por el mismo motivo que el planificador: el cuerpo
 * lleva la coordenada exacta del destino de una persona, y eso no tiene por
 * qué quedar escrito en la barra del navegador, en el historial ni en los logs
 * de acceso del servidor.
 *
 * Se consulta repetido mientras dura el viaje -es una pantalla que se mira
 * cada pocos segundos-, así que no hace nada caro: la posición del coche y el
 * orden de paradas ya están en memoria, y la caminata final la resuelve la
 * caché de `WalkingService`, que indexa por coordenada redondeada y por lo
 * tanto contesta sin salir a la red en todas las llamadas menos la primera.
 */

interface RideRequest {
  /** El coche al que se subió. Sale del planificador o de tocarlo en el mapa. */
  vehicle_id: string;
  destination: { lat: number; lng: number };
  /**
   * La parada de bajada, cuando el viaje viene del planificador.
   *
   * Fijarla es lo que evita que la app se contradiga a mitad de viaje: ya
   * prometió una bajada y quien está arriba del ómnibus no tiene por qué ver
   * que cambie sola.
   */
  stop_id?: number;
}

@Controller('transport/ride')
export class RideController {
  constructor(private readonly ride: RideService) {}

  @Post()
  async follow(@Body() body: RideRequest): Promise<RideStatus> {
    const vehicleId = String(body?.vehicle_id ?? '').trim();
    if (!vehicleId) throw new BadRequestException('Falta vehicle_id');

    const lat = Number(body?.destination?.lat);
    const lng = Number(body?.destination?.lng);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      throw new BadRequestException('Faltan las coordenadas del destino');
    }

    const stopId = Number(body?.stop_id);

    return this.ride.follow(
      vehicleId,
      { lat, lng },
      Number.isFinite(stopId) && stopId > 0 ? stopId : undefined,
    );
  }
}
