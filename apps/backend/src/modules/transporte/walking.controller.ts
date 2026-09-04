import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { WalkingService } from './walking.service';

/**
 * El camino a pie entre dos puntos.
 *
 * Lo usa el mapa en vivo para dibujar cuánto hay que caminar hasta la parada
 * donde conviene esperar el ómnibus que se tocó. El planificador ya rutea sus
 * caminatas por dentro; esto es para las pantallas que necesitan una sola y no
 * arman un viaje entero.
 *
 * Va por GET con las coordenadas redondeadas a cinco decimales -un metro- del
 * lado del cliente: es la precisión que necesita un dibujo y evita escribir la
 * ubicación exacta de alguien en los logs de acceso.
 */
@Controller('transport/walk')
export class WalkingController {
  constructor(private readonly walking: WalkingService) {}

  @Get()
  async route(
    @Query('fromLat') fromLat: string,
    @Query('fromLng') fromLng: string,
    @Query('toLat') toLat: string,
    @Query('toLng') toLng: string,
  ) {
    const from = { lat: Number(fromLat), lng: Number(fromLng) };
    const to = { lat: Number(toLat), lng: Number(toLng) };

    if (![from.lat, from.lng, to.lat, to.lng].every((value) => Number.isFinite(value))) {
      throw new BadRequestException('Faltan las coordenadas de origen o destino');
    }

    const walk = await this.walking.route(from, to);

    return {
      distance_m: walk.distanceM,
      minutes: walk.minutes,
      /** Orden GeoJSON [lng, lat]. */
      geometry: walk.geometry,
      /** True cuando no se pudo rutear y el camino es la recta. */
      straight: walk.straight,
    };
  }
}
