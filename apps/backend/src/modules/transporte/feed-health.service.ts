import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * La salud de los feeds GPS de las empresas.
 *
 * Los tres feeds no son la API de una empresa grande: son servidores AVL
 * detrás de DNS dinámico, sobre la conexión de la oficina de una empresa de
 * ómnibus. Eso se cae. Un router que se reinicia, una IP que cambia, un
 * cable.
 *
 * El problema no es que se caiga —va a pasar— sino **qué dice la app cuando
 * pasa**. Hoy dice "No hay ómnibus en camino ahora", que es una mentira con
 * cara de dato: no distingue entre *ninguno viene* y *no tenemos idea*. Alguien
 * se queda esperando en la parada por una frase que la app dijo con seguridad.
 *
 * Acá se guarda, por feed, cómo salió el último intento y cuándo fue el último
 * que salió bien. Con eso la app puede decir la verdad -"el GPS de CODESA no
 * está respondiendo, te muestro el horario"- y alguien puede enterarse de que
 * se rompió antes de que se queje un pasajero.
 *
 * Es memoria del proceso, no base: es estado de *este* servidor y se pierde al
 * reiniciar, que es exactamente lo que se quiere. Un reinicio arranca sin
 * historia y lo dice.
 */

/** Cuánto silencio se tolera antes de dar un feed por caído. */
const STALE_MINUTES_DEFAULT = 15;

/**
 * Cuántos fallos seguidos alcanzan para dar un feed por caído sin esperar al
 * reloj.
 *
 * El período de gracia del arranque existe para no gritar antes de la primera
 * vuelta. Pero **fallar no es lo mismo que no haber contestado todavía**: si el
 * feed ya contestó veintiséis veces que no, seguir diciendo "arrancando" es la
 * misma clase de mentira que se está tratando de sacar de la app.
 *
 * Cinco a quince segundos por vuelta es poco más de un minuto de intentos: lo
 * suficiente para descartar un tropiezo y no tanto como para tapar una caída.
 */
const FALLOS_PARA_CAIDO = 5;

export type FeedState = 'ok' | 'caido' | 'arrancando' | 'apagado';

export interface FeedHealth {
  operator: string;
  state: FeedState;
  /** Si el último intento salió bien. */
  ok: boolean;
  last_success_at: string | null;
  last_failure_at: string | null;
  /** El mensaje del último error, para poder arreglarlo sin abrir los logs. */
  last_error: string | null;
  /** Hace cuánto que no entra un dato bueno. Null si nunca entró. */
  seconds_since_success: number | null;
  /** Cuántos vehículos trajo la última vez que contestó. */
  vehicles_last_success: number | null;
  consecutive_failures: number;
}

export interface TransportHealth {
  /**
   * `ok` todos contestando · `degradado` alguno mudo · `caido` ninguno
   * contesta · `arrancando` el servidor recién levantó y todavía no hay
   * ninguna vuelta completa · `apagado` la ingesta está deshabilitada.
   */
  status: 'ok' | 'degradado' | 'caido' | 'arrancando' | 'apagado';
  checked_at: string;
  /** Desde cuándo está levantado este proceso. */
  uptime_seconds: number;
  stale_after_minutes: number;
  feeds: FeedHealth[];
}

interface Registro {
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastError: string | null;
  vehiclesLastSuccess: number | null;
  consecutiveFailures: number;
  okLast: boolean | null;
}

@Injectable()
export class FeedHealthService {
  private readonly startedAt = new Date();
  private readonly registros = new Map<string, Registro>();

  constructor(private readonly configService: ConfigService) {}

  private get staleAfterMinutes(): number {
    return Number(
      this.configService.get('GPS_FEED_STALE_MINUTES', String(STALE_MINUTES_DEFAULT)),
    );
  }

  private get ingestaActiva(): boolean {
    return this.configService.get('GPS_FEEDS_ENABLED', 'true') !== 'false';
  }

  /** Deja constancia de que un feed contestó y trajo datos. */
  registrarExito(operator: string, vehicles: number): void {
    const registro = this.registro(operator);
    registro.lastSuccessAt = new Date();
    registro.vehiclesLastSuccess = vehicles;
    registro.consecutiveFailures = 0;
    registro.okLast = true;
    registro.lastError = null;
  }

  /** Deja constancia de que un feed no contestó, y por qué. */
  registrarFallo(operator: string, error: unknown): void {
    const registro = this.registro(operator);
    registro.lastFailureAt = new Date();
    registro.lastError = this.mensaje(error);
    registro.consecutiveFailures += 1;
    registro.okLast = false;
  }

  /**
   * Qué feeds se están consultando. Se declaran al arrancar para que un feed
   * que **nunca** contestó aparezca igual en el informe: si no, un feed roto
   * desde el arranque sería indistinguible de uno que no existe.
   */
  declarar(operators: string[]): void {
    for (const operator of operators) this.registro(operator);
  }

  snapshot(now = new Date()): TransportHealth {
    const staleMs = this.staleAfterMinutes * 60_000;
    const uptimeMs = now.getTime() - this.startedAt.getTime();

    const feeds: FeedHealth[] = [...this.registros.entries()].map(([operator, registro]) => {
      const desdeExito = registro.lastSuccessAt
        ? now.getTime() - registro.lastSuccessAt.getTime()
        : null;

      // Sin ningún éxito todavía: si el proceso recién arrancó no es una
      // caída, es que no hubo tiempo. Pasado el umbral ya no hay excusa.
      const state: FeedState = !this.ingestaActiva
        ? 'apagado'
        : desdeExito === null
          ? // Nunca contestó bien. Es "arrancando" sólo mientras no haya dicho
            // que no unas cuantas veces: con la racha de fallos ya no es que
            // falte tiempo, es que está caído.
            uptimeMs < staleMs && registro.consecutiveFailures < FALLOS_PARA_CAIDO
            ? 'arrancando'
            : 'caido'
          : desdeExito > staleMs
            ? 'caido'
            : 'ok';

      return {
        operator,
        state,
        ok: registro.okLast === true,
        last_success_at: registro.lastSuccessAt?.toISOString() ?? null,
        last_failure_at: registro.lastFailureAt?.toISOString() ?? null,
        last_error: registro.lastError,
        seconds_since_success: desdeExito === null ? null : Math.round(desdeExito / 1000),
        vehicles_last_success: registro.vehiclesLastSuccess,
        consecutive_failures: registro.consecutiveFailures,
      };
    });

    return {
      status: this.resumen(feeds),
      checked_at: now.toISOString(),
      uptime_seconds: Math.round(uptimeMs / 1000),
      stale_after_minutes: this.staleAfterMinutes,
      feeds,
    };
  }

  /**
   * Si hay al menos un feed vivo. Lo usa la app para saber si puede decir "no
   * viene ninguno" o tiene que decir "no tenemos el GPS".
   */
  hayDatosEnVivo(now = new Date()): boolean {
    return this.snapshot(now).feeds.some((feed) => feed.state === 'ok');
  }

  private resumen(feeds: FeedHealth[]): TransportHealth['status'] {
    if (!this.ingestaActiva) return 'apagado';
    if (feeds.length === 0) return 'arrancando';
    if (feeds.every((feed) => feed.state === 'ok')) return 'ok';
    if (feeds.some((feed) => feed.state === 'ok')) return 'degradado';
    if (feeds.every((feed) => feed.state === 'arrancando')) return 'arrancando';
    return 'caido';
  }

  private registro(operator: string): Registro {
    let registro = this.registros.get(operator);
    if (!registro) {
      registro = {
        lastSuccessAt: null,
        lastFailureAt: null,
        lastError: null,
        vehiclesLastSuccess: null,
        consecutiveFailures: 0,
        okLast: null,
      };
      this.registros.set(operator, registro);
    }
    return registro;
  }

  /**
   * El error, con la causa adentro.
   *
   * `fetch` de Node envuelve todo en un "fetch failed" que no dice nada, y la
   * causa de verdad -`ENOTFOUND`, `ECONNREFUSED`, `ETIMEDOUT`- va colgada en
   * `cause`. Esa distinción es justamente la que hace falta para saber si se
   * cayó el DNS dinámico, si el router está rechazando o si la conexión de la
   * empresa está lenta, que son tres arreglos distintos.
   */
  private mensaje(error: unknown): string {
    if (!(error instanceof Error)) return String(error);

    const causa = (error as Error & { cause?: unknown }).cause;
    if (causa instanceof Error && causa.message && causa.message !== error.message) {
      const codigo = (causa as Error & { code?: string }).code;
      return codigo ? `${error.message}: ${causa.message} (${codigo})` : `${error.message}: ${causa.message}`;
    }

    return error.message;
  }
}
