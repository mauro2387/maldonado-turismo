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
}
