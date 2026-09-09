import { Controller, Get, Query } from '@nestjs/common';
import { Destination, DestinationsService } from './destinations.service';

/**
 * "¿A dónde vas?": los destinos que coinciden con lo que se está escribiendo.
 *
 * Va por GET porque lo que se manda es lo que la persona tipeó, no dónde está.
 * Las coordenadas de referencia son opcionales y sólo ordenan los resultados
 * por cercanía; se aceptan con precisión de calle porque acá no hace falta
 * más, y así no se guarda la ubicación exacta de nadie en los logs.
 */
@Controller('transport/destinations')
export class DestinationsController {
  constructor(private readonly destinations: DestinationsService) {}

  @Get()
  async search(
    @Query('q') query?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('limit') limit?: string,
  ): Promise<{ results: Destination[] }> {
    const term = (query ?? '').trim();
    if (term.length < 2) return { results: [] };

    const reference =
      Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
        ? { lat: Number(lat), lng: Number(lng) }
        : undefined;

    const results = await this.destinations.search(
      term,
      reference,
      Math.min(20, Math.max(1, Number(limit) || 8)),
    );

    return { results };
  }

  /**
   * Cómo se llama el punto que se marcó en el mapa.
   *
   * Contesta "cerca de X" o nada. Ver `DestinationsService.nearest`: no se
   * inventa un nombre para una coordenada, se dice de qué está cerca cuando
   * hay algo lo bastante cerca como para que sea cierto.
   *
   * Va por GET porque el punto que se marca en el mapa no es dónde está la
   * persona, y el mapa mismo ya es público. Igual llega redondeado desde la
   * pantalla: para nombrar una esquina no hacen falta los siete decimales.
   */
  @Get('cercano')
  async nearest(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ): Promise<{ near: Destination | null; distance_m: number | null }> {
    const point = { lat: Number(lat), lng: Number(lng) };
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
      return { near: null, distance_m: null };
    }

    const found = await this.destinations.nearest(point);
    return {
      near: found?.destination ?? null,
      distance_m: found?.distanceM ?? null,
    };
  }
}
