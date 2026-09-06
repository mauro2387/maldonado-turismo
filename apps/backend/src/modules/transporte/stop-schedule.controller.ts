import { BadRequestException, Controller, Get, Param } from '@nestjs/common';
import { SchedulesService, StopServiceToday } from './schedules.service';
import { StopSequenceService } from './stop-sequence.service';

/**
 * Qué le queda hoy a una parada, según el horario publicado.
 *
 * Es la respuesta a las dos preguntas de la noche, que son las que más
 * importan y las que la app no sabía contestar:
 *
 *   "¿A qué hora pasa el último?"   -> `last_at`
 *   "¿Ya pasó o está atrasado?"     -> `previous_at` + `next_at` + `finished`
 *
 * Hasta ahora la pantalla de una parada sólo miraba el GPS, así que a las 23:40
 * decía "ningún ómnibus en camino" tanto si faltaban veinte minutos como si el
 * servicio se había terminado a las 22. Son dos situaciones que llevan a hacer
 * cosas distintas: una es esperar, la otra es pedir un taxi.
 *
 * Va aparte del endpoint de llegadas a propósito: aquello es el GPS -qué está
 * pasando- y esto es el papel -qué debería pasar-. Mezclarlos haría que una
 * caída del feed se lea como "no hay más servicio".
 */
@Controller('transport/stops')
export class StopScheduleController {
  constructor(
    private readonly schedules: SchedulesService,
    private readonly stopSequences: StopSequenceService,
  ) {}

  @Get(':id/schedule')
  async paraHoy(@Param('id') id: string): Promise<{
    /** False cuando no hay horarios de la temporada de hoy. */
    available: boolean;
    lines: StopServiceToday[];
    /** La hora del último ómnibus de la parada, de cualquier línea. */
    last_at: string | null;
    /** Ninguna línea pasa más hoy por esta parada. */
    finished: boolean;
  }> {
    const stopId = Number(id);
    if (!Number.isInteger(stopId) || stopId <= 0) {
      throw new BadRequestException('id de parada inválido');
    }

    if (!this.schedules.hasSchedules()) {
      return { available: false, lines: [], last_at: null, finished: false };
    }

    const lines: StopServiceToday[] = [];
    for (const sequence of this.stopSequences.getForStop(stopId)) {
      const boarding = sequence.stops.find((stop) => stop.stopId === stopId);
      if (!boarding) continue;

      const servicio = this.schedules.serviceAtStop(sequence, boarding);
      if (servicio) lines.push(servicio);
    }

    // Lo que viene primero arriba, y lo que ya se terminó al final: en una
    // parada la pregunta es "qué me llevo ahora", no "qué líneas existen".
    lines.sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? 1 : -1;
      return (a.next_in_minutes ?? Infinity) - (b.next_in_minutes ?? Infinity);
    });

    return {
      available: true,
      lines,
      last_at: this.ultimaDeTodas(lines),
      finished: lines.length > 0 && lines.every((linea) => linea.finished),
    };
  }

  /**
   * El último de la parada entero, mirando todas sus líneas.
   *
   * Se compara por hora del día y no por texto para que la madrugada no gane
   * por ser "00:30" > "23:10" al revés de lo que uno espera: un servicio que
   * cruza la medianoche es más tarde, no más temprano.
   */
  private ultimaDeTodas(lines: StopServiceToday[]): string | null {
    let mejor: { texto: string; orden: number } | null = null;

    for (const linea of lines) {
      const [h, m] = linea.last_at.split(':').map(Number);
      // Antes de las 4 de la mañana es la madrugada del mismo servicio.
      const orden = h * 60 + m + (h < 4 ? 24 * 60 : 0);
      if (!mejor || orden > mejor.orden) mejor = { texto: linea.last_at, orden };
    }

    return mejor?.texto ?? null;
  }
}
