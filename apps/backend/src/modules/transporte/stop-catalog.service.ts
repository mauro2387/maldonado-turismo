import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * El catálogo de paradas, reconstruido desde los feeds AVL de las empresas.
 *
 * `bus_stops` tenía ocho filas de relleno inventadas —"Plaza Maldonado",
 * "Casapueblo"— con líneas que no existen. Las paradas de verdad ya estaban
 * entrando por la puerta de al lado: cada posición del XML de CODESA,
 * Maldonado Turismo y Micro viene con la parada por la que el coche acaba de
 * pasar, con el código y el nombre que usa la empresa.
 *
 *   <p1c>139</p1c><p1n>SAN CARLOS</p1n>
 *
 * Lo que el feed no publica es dónde queda cada parada. Eso se deduce de las
 * propias posiciones, y se explica en CROSSINGS_SQL.
 *
 * La reconstrucción es idempotente y se puede volver a correr cuando sea: cada
 * corrida recalcula sobre todo el histórico disponible, así que las posiciones
 * mejoran solas a medida que se acumulan viajes.
 */

/**
 * Un solo cruce ubica la parada dentro de un tramo de treinta segundos, que a
 * velocidad de calle son un par de cuadras. Con dos ya hay una mediana que
 * dice algo; abajo de eso la fila espera a la próxima corrida.
 */
const MIN_SAMPLES = 2;

/**
 * Solo se aceptan coordenadas dentro de Maldonado y sus bordes —las líneas
 * llegan hasta Piriápolis, San Carlos y el límite con Rocha—. Un cruce mal
 * emparejado por un hueco en el feed puede caer en cualquier lado, y una
 * parada en medio del Atlántico ensucia el mapa y el buscador.
 */
const BOUNDS = { minLat: -35.2, maxLat: -34.3, minLng: -55.8, maxLng: -53.9 };

/** Hora de Uruguay (UTC-3, fijo desde 2015) a la que corre la tarea diaria. */
const DEFAULT_HOUR = 4;

/**
 * De dónde sale la coordenada de una parada.
 *
 * El feed no dice dónde está la parada X, pero sí dice, coche por coche, cuál
 * fue la última que pasó. Cuando entre dos posiciones consecutivas del mismo
 * coche ese campo cambia de W a X, el coche cruzó X en algún punto de ese
 * intervalo: la parada está entre las dos posiciones. Como el cruce pudo
 * ocurrir en cualquier momento del intervalo, el punto medio es el estimador
 * sin sesgo, y la mediana sobre todos los cruces converge a la parada real.
 *
 * Se toma la mediana y no el promedio porque un solo hueco en el feed —un
 * coche que desaparece medio minuto y reaparece diez cuadras más adelante—
 * arrastra el promedio y no mueve la mediana.
 *
 * Dos detalles del emparejado:
 *
 * - Se descartan los pares separados por más de 45 s. El feed publica cada 30
 *   y un salto mayor significa que faltan posiciones en el medio, con lo cual
 *   el punto medio ya no representa nada.
 * - La partición es por coche además de por empresa: dos coches distintos
 *   pueden estar en puntos opuestos del recorrido, y su orden temporal
 *   combinado no significa nada.
 *
 * El agrupado final es por código + nombre, no por empresa. Los feeds
 * comparten la numeración casi siempre —de 206 códigos que aparecen en más de
 * una empresa, 186 traen el mismo nombre y caen a menos de 200 m—, así que
 * agrupar por código junta las muestras de las tres y afina la posición.
 * Cuando el nombre no coincide quedan como paradas separadas, que es lo
 * honesto: no hay con qué decidir cuál de las dos empresas tiene razón.
 *
 * El alta y la actualización van en la misma sentencia y solo tocan las filas
 * de origen `avl`: una parada corregida a mano por la Intendencia queda como
 * `manual` y la reconstrucción no la vuelve a pisar.
 */
const REBUILD_SQL = `
WITH ordenadas AS (
  SELECT operator,
         recorded_at,
         latitude,
         longitude,
         prev_stop_code,
         prev_stop_name,
         LAG(latitude)       OVER w AS lat_anterior,
         LAG(longitude)      OVER w AS lng_anterior,
         LAG(prev_stop_code) OVER w AS codigo_anterior,
         LAG(recorded_at)    OVER w AS momento_anterior
  FROM vehicle_positions
  WHERE prev_stop_code IS NOT NULL
    AND prev_stop_name IS NOT NULL
    AND btrim(prev_stop_name) <> ''
  WINDOW w AS (PARTITION BY operator, vehicle_id ORDER BY recorded_at)
),
cruces AS (
  SELECT operator,
         btrim(prev_stop_code)                                          AS code,
         upper(btrim(regexp_replace(prev_stop_name, '\\s+', ' ', 'g'))) AS name,
         (latitude  + lat_anterior)  / 2.0                              AS lat,
         (longitude + lng_anterior)  / 2.0                              AS lng
  FROM ordenadas
  WHERE codigo_anterior IS NOT NULL
    AND codigo_anterior <> prev_stop_code
    AND recorded_at - momento_anterior <= interval '45 seconds'
),
paradas AS (
  SELECT code,
         name,
         array_agg(DISTINCT operator ORDER BY operator)   AS operators,
         count(*)::int                                    AS samples,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY lat) AS lat,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY lng) AS lng,
         -- Dispersión de los cruces, en metros. No es el error de la mediana
         -- (que baja con la raíz de las muestras) sino cuán repartidos están:
         -- sirve para saber qué paradas todavía conviene no dibujar.
         greatest(
           (percentile_cont(0.9) WITHIN GROUP (ORDER BY lat)
          - percentile_cont(0.1) WITHIN GROUP (ORDER BY lat)) * 111320,
           (percentile_cont(0.9) WITHIN GROUP (ORDER BY lng)
          - percentile_cont(0.1) WITHIN GROUP (ORDER BY lng)) * 91500
         )::int                                           AS spread_m
  FROM cruces
  GROUP BY code, name
  HAVING count(*) >= $1
     AND percentile_cont(0.5) WITHIN GROUP (ORDER BY lat) BETWEEN $2 AND $3
     AND percentile_cont(0.5) WITHIN GROUP (ORDER BY lng) BETWEEN $4 AND $5
),
guardadas AS (
  INSERT INTO bus_stops (code, name, lat, lng, operators, samples, spread_m,
                         source, is_active, avl_updated_at, updated_at)
  SELECT code, name, lat, lng, operators, samples, spread_m,
         'avl', true, now(), now()
  FROM paradas
  ON CONFLICT (code, name) WHERE source = 'avl'
  DO UPDATE SET lat            = EXCLUDED.lat,
                lng            = EXCLUDED.lng,
                operators      = EXCLUDED.operators,
                samples        = EXCLUDED.samples,
                spread_m       = EXCLUDED.spread_m,
                is_active      = true,
                avl_updated_at = now(),
                updated_at     = now()
  RETURNING (xmax = 0) AS es_nueva
)
SELECT
  (SELECT count(*)::int FROM paradas)                              AS reconstruidas,
  (SELECT count(*)::int FROM guardadas WHERE es_nueva)             AS insertadas,
  (SELECT count(*)::int FROM guardadas WHERE NOT es_nueva)         AS actualizadas,
  (SELECT count(*)::int FROM paradas WHERE spread_m <= $6)         AS confiables
`;

export interface StopCatalogResult {
  /** Paradas que el feed sostiene con posición utilizable. */
  reconstruidas: number;
  insertadas: number;
  actualizadas: number;
  /** Cuántas quedaron con la posición lo bastante firme para dibujar. */
  confiables: number;
}

@Injectable()
export class StopCatalogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StopCatalogService.name);

  /** Debajo de esta dispersión la posición se considera buena para el mapa. */
  static readonly RELIABLE_SPREAD_M = 200;

  private running = false;
  private dailyTimer?: NodeJS.Timeout;

  /**
   * Avisos de que el catálogo cambió.
   *
   * Hace falta porque esta reconstrucción **pisa la coordenada de todas las
   * paradas del feed** con la estimación gruesa (el punto medio entre dos
   * posiciones), y la buena -la apoyada sobre el recorrido- se calcula
   * después, en StopPlacementService. Sin este aviso, la corrida de las 4 de
   * la mañana dejaba las paradas corridas hasta la próxima reconstrucción de
   * recorridos, seis horas más tarde.
   *
   * Es una lista de callbacks y no una inyección al revés porque quien
   * escucha ya depende de este servicio.
   */
  private rebuildListeners: Array<() => void | Promise<void>> = [];

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  private get enabled(): boolean {
    return this.configService.get('STOP_CATALOG_ENABLED', 'true') !== 'false';
  }

  private get scheduledHour(): number {
    const hour = Number(this.configService.get('STOP_CATALOG_HOUR', DEFAULT_HOUR));
    return Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_HOUR;
  }

  onModuleInit() {
    if (!this.enabled) {
      this.logger.log('Reconstrucción de paradas deshabilitada (STOP_CATALOG_ENABLED=false)');
      return;
    }

    // La primera corrida no bloquea el arranque: la API tiene que levantar
    // aunque la base esté lenta o la migración todavía sin aplicar.
    setTimeout(() => {
      void this.rebuildIfEmpty().catch((error) =>
        this.logger.error(`Reconstrucción inicial fallida: ${error?.message ?? error}`),
      );
    }, 5000).unref?.();

    this.scheduleNextRun();
    this.logger.log(
      `Reconstrucción de paradas activa: corre a las ${this.scheduledHour}:00 (hora de Uruguay)`,
    );
  }

  onModuleDestroy() {
    if (this.dailyTimer) clearTimeout(this.dailyTimer);
  }

  /**
   * Una vez por día alcanza: el catálogo de una empresa de ómnibus cambia con
   * obras y desvíos, no con el minuto. Corre de madrugada, cuando ya se
   * acumuló un día entero de recorridos.
   *
   * Se reprograma con setTimeout y no con un setInterval de 24 h para que
   * quede clavada a la hora elegida aunque el proceso se reinicie.
   */
  private scheduleNextRun(): void {
    this.dailyTimer = setTimeout(() => {
      void this.rebuild().catch((error) =>
        this.logger.error(`La corrida diaria falló: ${error?.message ?? error}`),
      );
      this.scheduleNextRun();
    }, this.msUntilNextRun());

    this.dailyTimer.unref?.();
  }

  private msUntilNextRun(): number {
    const now = new Date();
    const target = new Date(now);
    target.setUTCHours(this.scheduledHour + 3, 0, 0, 0);
    if (target <= now) target.setUTCDate(target.getUTCDate() + 1);
    return target.getTime() - now.getTime();
  }

  /** Reconstruye solo si todavía no hay catálogo. Para el primer arranque. */
  async rebuildIfEmpty(): Promise<StopCatalogResult | null> {
    const [{ total }] = await this.dataSource.query(
      `SELECT count(*)::int AS total FROM bus_stops WHERE source = 'avl'`,
    );

    if (total > 0) {
      this.logger.log(`Catálogo de paradas ya cargado: ${total} paradas del feed`);
      return null;
    }

    return this.rebuild();
  }

  /** Se notifica después de cada reconstrucción del catálogo. */
  onRebuilt(listener: () => void | Promise<void>) {
    this.rebuildListeners.push(listener);
  }

  private async notifyRebuilt() {
    for (const listener of this.rebuildListeners) {
      try {
        await listener();
      } catch (error: any) {
        this.logger.warn(`Error al propagar el catálogo: ${error?.message ?? error}`);
      }
    }
  }

  async rebuild(): Promise<StopCatalogResult> {
    if (this.running) {
      this.logger.warn('Ya hay una reconstrucción en curso; se ignora el pedido');
      return { reconstruidas: 0, insertadas: 0, actualizadas: 0, confiables: 0 };
    }
    this.running = true;

    try {
      const started = Date.now();

      const [fila] = await this.dataSource.query(REBUILD_SQL, [
        MIN_SAMPLES,
        BOUNDS.minLat,
        BOUNDS.maxLat,
        BOUNDS.minLng,
        BOUNDS.maxLng,
        StopCatalogService.RELIABLE_SPREAD_M,
      ]);

      const result: StopCatalogResult = {
        reconstruidas: Number(fila?.reconstruidas ?? 0),
        insertadas: Number(fila?.insertadas ?? 0),
        actualizadas: Number(fila?.actualizadas ?? 0),
        confiables: Number(fila?.confiables ?? 0),
      };

      if (result.reconstruidas === 0) {
        this.logger.warn(
          'El feed no dejó ningún cruce de parada utilizable: no hay nada que reconstruir',
        );
        return result;
      }

      const segundos = ((Date.now() - started) / 1000).toFixed(1);
      this.logger.log(
        `Catálogo reconstruido en ${segundos}s: ${result.reconstruidas} paradas ` +
          `(${result.insertadas} nuevas, ${result.actualizadas} actualizadas, ` +
          `${result.confiables} con posición firme)`,
      );

      await this.notifyRebuilt();

      return result;
    } finally {
      this.running = false;
    }
  }
}
