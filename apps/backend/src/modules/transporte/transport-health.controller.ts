import { Controller, Get, Header } from '@nestjs/common';
import { FeedHealthService, TransportHealth } from './feed-health.service';
import { SchedulesService, SpeedCheck } from './schedules.service';
import { LineSpeedService } from './line-speed.service';
import { StopSequenceService } from './stop-sequence.service';

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
    private readonly lineSpeeds: LineSpeedService,
    private readonly stopSequences: StopSequenceService,
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

  /**
   * ¿Le estamos errando el tiempo de viaje a alguna línea?
   *
   * Compara la velocidad que la app mide del GPS contra el horario que
   * publican las empresas, tramo por tramo entre puntos de control. Son dos
   * fuentes independientes: si no coinciden, una de las dos está mal y hay que
   * ir a mirar.
   *
   * Existe porque el error se descubrió por casualidad. Alguien tocó un
   * ómnibus de la 15 en el mapa, la app le dijo "no llegás" con el coche a dos
   * kilómetros, y recién ahí se vio que el promedio de un recorrido de 34 km
   * -veintinueve de ruta y cinco de ciudad- se estaba aplicando al tramo
   * urbano. Con esto, la próxima vez no hace falta la casualidad.
   *
   * `worst` es lo que se mira de un vistazo: los recorridos donde la app y el
   * papel más se contradicen.
   */
  @Get('speeds')
  @Header('Cache-Control', 'no-store')
  async velocidades(): Promise<{
    checked: number;
    /** Cociente global: minutos que calcula la app sobre minutos publicados. */
    ratio: number;
    /** Recorridos cuyo total se aparta más de un 20% del papel. */
    off_by_20pct: number;
    /**
     * Recorridos con **algún tramo** apartado más de un 20%, aunque el total
     * cierre. Este es el número que hay que mirar: es el que había estado en
     * 1,00 para la 15 mientras su tramo urbano erraba por un tercio.
     */
    with_bad_segment: number;
    /**
     * Y de esos, los que la app cree **más rápidos** que el papel. Son los que
     * hacen daño: subestimar el viaje es decirle "no llegás" a alguien que
     * llegaba, y prometer una llegada antes de la que va a ser.
     */
    optimistic: number;
    worst: SpeedCheck[];
    lines: SpeedCheck[];
  }> {
    await this.lineSpeeds.warm();
    const lines = this.schedules.speedCheck(this.stopSequences.getAll());

    const publicados = lines.reduce((suma, fila) => suma + fila.published_minutes, 0);
    const medidos = lines.reduce((suma, fila) => suma + fila.measured_minutes, 0);
    const malos = lines.filter((fila) => Math.abs((fila.worst_segment?.ratio ?? 1) - 1) > 0.2);

    return {
      checked: lines.length,
      ratio: publicados ? Number((medidos / publicados).toFixed(3)) : 0,
      off_by_20pct: lines.filter((fila) => Math.abs(fila.ratio - 1) > 0.2).length,
      with_bad_segment: malos.length,
      optimistic: malos.filter((fila) => (fila.worst_segment?.ratio ?? 1) < 1).length,
      worst: lines.slice(0, 12),
      lines,
    };
  }
}
