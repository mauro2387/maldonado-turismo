import { Controller, Get, Header } from '@nestjs/common';
import { FeedHealthService, TransportHealth } from './feed-health.service';
import { SchedulesService } from './schedules.service';

/** Lo que informa el endpoint: los feeds y los horarios de la temporada. */
interface SaludDelTransporte extends TransportHealth {
  schedules: {
    /** La temporada de hoy, según la fecha. */
    season: 'verano' | 'invierno';
    /** La que está cargada en memoria. */
    loaded_season: string | null;
    lines: number;
    available: boolean;
    /**
     * Qué hacer, en una frase, cuando falta algo. Null si está todo bien.
     *
     * El caso que importa es el 1 de diciembre: cambia la temporada, los
     * horarios de verano no están importados y la app pierde en silencio la
     * mitad de sus respuestas. Que el aviso salga acá es lo que convierte un
     * acantilado callado en una tarea.
     */
    warning: string | null;
  };
}

/**
 * ¿Está entrando el GPS?
 *
 * Sirve para dos cosas distintas y las dos importan:
 *
 * 1. **Que alguien se entere.** Los feeds viven en el DNS dinámico de la
 *    oficina de cada empresa y se caen. Sin esto, la única alarma es que se
 *    queje un pasajero.
 * 2. **Que la app no mienta.** Con el GPS caído la pantalla decía "No hay
 *    ómnibus en camino ahora", que suena a dato y es ignorancia. Sabiendo que
 *    el feed está mudo puede decir la verdad y ofrecer el horario.
 *
 * Va sin autenticación a propósito: es lo que va a mirar un monitor externo, y
 * no expone nada -ni URLs con credenciales ni posiciones-, sólo si entra dato
 * y hace cuánto.
 */
@Controller('transport/health')
export class TransportHealthController {
  constructor(
    private readonly health: FeedHealthService,
    private readonly schedules: SchedulesService,
  ) {}

  @Get()
  // Un monitor que pregunta cada minuto no puede recibir una respuesta cacheada.
  @Header('Cache-Control', 'no-store')
  salud(): SaludDelTransporte {
    const estado = this.schedules.estado();

    return {
      ...this.health.snapshot(),
      schedules: {
        ...estado,
        warning: estado.available
          ? null
          : `No hay horarios cargados para la temporada de ${estado.season}. ` +
            'Hay que bajar los PDF de las empresas, extraerlos con ' +
            'tools/horarios y correr import-schedules.ts. Mientras tanto la app ' +
            'sólo puede contestar con los ómnibus que estén en la calle.',
      },
    };
  }
}
