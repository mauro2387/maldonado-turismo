import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Dónde para el ómnibus, visto y no calculado.
 *
 * El estimador anterior ubicaba cada parada **entre** las dos posiciones entre
 * las que el coche la cruzó, y sobre el trazo de la línea. Es correcto y no
 * alcanza: medido contra los nodos relevados de OpenStreetMap da un error
 * mediano de 57 m y un p90 de 176 m. A 57 m uno está esperando en la otra
 * esquina, y a 176 m en la otra cuadra. Ese es exactamente el reclamo de que
 * la app manda a esperar donde el ómnibus no para.
 *
 * En el mismo feed hay una observación mucho más directa, y se venía tirando:
 *
 *   **cuando el coche informa que acaba de pasar la parada X y además está
 *   detenido, ese punto ES la parada.**
 *
 * No es una interpolación entre dos posiciones lejanas: es el ómnibus parado
 * en la parada levantando gente. Medido contra los mismos nodos de OSM, el
 * error mediano cae a 15 m.
 *
 * Por qué hace falta una tabla y no basta con leer `vehicle_positions`: esa
 * tabla se poda a las 24 h, así que la evidencia se borra todos los días. Con
 * un día de feed hay avistamientos para 540 de las 1.170 paradas; el resto se
 * queda con el estimador viejo no porque el método falle, sino porque en esas
 * paradas ningún coche paró en esas 24 horas. Guardando los avistamientos la
 * cobertura sube sola con los días y nadie tiene que correr nada.
 *
 * Ver `StopPlacementService`, que es quien los resume en una coordenada, y
 * `2026-09-04-paradas-observadas.sql`.
 */

/**
 * Velocidad máxima, en km/h, para que una posición cuente como avistamiento.
 *
 * Es el corte entre "el coche está en la parada" y "el coche ya pasó y sigue
 * viaje". Se guarda holgado y el filtro fino lo hace el estimador, que primero
 * prueba con 5 km/h y sólo afloja a 8 y a 12 si no le alcanzan las muestras:
 * conviene tener guardado lo que después se puede descartar y no al revés.
 */
const MAX_SPEED_KMH = 20;

/**
 * Cuántas muestras después del cambio de cartel se siguen aceptando.
 *
 * 1 es la muestra en la que el campo "parada anterior" cambió de W a X; 2 y 3
 * son las siguientes, que todavía pueden caer dentro de la detención porque el
 * feed publica cada 45-70 s y el ómnibus para 15-30 s. De la cuarta en
 * adelante el coche ya se fue a la cuadra siguiente.
 */
const MAX_SINCE_CHANGE = 4;

/**
 * Cada cuánto se recolecta. Las posiciones viven 24 h, así que con correr una
 * vez por hora sobra; se relee una ventana más ancha que el intervalo para que
 * un reinicio del proceso no deje un hueco.
 */
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
const LOOKBACK_HOURS = 3;

/**
 * Cuántos avistamientos se conservan por parada.
 *
 * La mediana de una parada no mejora después de unas decenas de muestras, y
 * dejar crecer la tabla sin techo la vuelve inmanejable en unos meses. Se
 * conservan los más lentos —que son los más informativos, porque el coche
 * estaba más cerca de detenerse— y, a igual velocidad, los más nuevos: si la
 * empresa mueve una parada, las muestras nuevas terminan desplazando a las
 * viejas.
 */
const MAX_PER_STOP = 200;

/**
 * Los avistamientos de una ventana de posiciones.
 *
 * `tramo` numera los grupos de posiciones consecutivas del mismo coche que
 * comparten la misma "parada anterior": cada vez que ese campo cambia arranca
 * un tramo nuevo. Dentro del tramo, `since_change` es el orden de la posición,
 * o sea cuántas muestras pasaron desde que el coche registró la parada.
 *
 * Se exige que el cartel de la línea no haya cambiado dentro del tramo: si
 * cambió, el coche empezó otro recorrido en el medio y no se sabe a cuál
 * atribuir el avistamiento.
 */
const COLLECT_SQL = `
WITH ordenadas AS (
  SELECT operator,
         vehicle_id,
         line_code,
         line_name,
         recorded_at,
         latitude,
         longitude,
         speed,
         prev_stop_code,
         prev_stop_name,
         LAG(prev_stop_code) OVER w AS codigo_anterior
  FROM vehicle_positions
  WHERE recorded_at >= now() - ($1 || ' hours')::interval
    AND prev_stop_code IS NOT NULL
    AND btrim(coalesce(prev_stop_name, '')) <> ''
    AND speed IS NOT NULL
    AND speed <= $2
    AND latitude IS NOT NULL
    AND longitude IS NOT NULL
  WINDOW w AS (PARTITION BY operator, vehicle_id ORDER BY recorded_at)
),
tramos AS (
  SELECT *,
         SUM(CASE WHEN codigo_anterior IS DISTINCT FROM prev_stop_code THEN 1 ELSE 0 END)
           OVER (PARTITION BY operator, vehicle_id ORDER BY recorded_at) AS tramo
  FROM ordenadas
),
numeradas AS (
  SELECT btrim(prev_stop_code)                                          AS code,
         upper(btrim(regexp_replace(prev_stop_name, '\\s+', ' ', 'g'))) AS name,
         operator,
         vehicle_id,
         line_code,
         upper(btrim(line_name))                                        AS itinerary_key,
         latitude::float8                                               AS latitude,
         longitude::float8                                              AS longitude,
         speed::float8                                                  AS speed_kmh,
         recorded_at                                                    AS observed_at,
         ROW_NUMBER() OVER (PARTITION BY operator, vehicle_id, tramo
                            ORDER BY recorded_at)::int                  AS since_change
  FROM tramos
)
SELECT * FROM numeradas WHERE since_change <= $3
`;

/**
 * La poda. Se numeran los avistamientos de cada parada por lo informativos que
 * son y se borran los que sobran del tope.
 */
const PRUNE_SQL = `
WITH numeradas AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY code, name
                            ORDER BY speed_kmh ASC, observed_at DESC) AS puesto
  FROM stop_observations
)
DELETE FROM stop_observations
WHERE id IN (SELECT id FROM numeradas WHERE puesto > $1)
RETURNING id
`;

export interface CollectResult {
  /** Avistamientos nuevos guardados en esta corrida. */
  nuevos: number;
  /** Los que ya estaban (el recolector relee una ventana solapada). */
  repetidos: number;
  /** Filas borradas por la poda. */
  podados: number;
  /** Paradas distintas con al menos un avistamiento guardado. */
  paradas: number;
}

@Injectable()
export class StopObservationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StopObservationsService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.configService.get('STOP_OBSERVATIONS_ENABLED', 'true') !== 'true') {
      this.logger.log('Recolección de avistamientos apagada');
      return;
    }

    const interval = Number(
      this.configService.get('STOP_OBSERVATIONS_INTERVAL_MS', DEFAULT_INTERVAL_MS),
    );

    // La primera corrida va con retraso: al arranque hay bastante que hacer y
    // esto no es urgente, las posiciones viven 24 h.
    setTimeout(() => void this.collect(), 90_000).unref?.();
    this.timer = setInterval(() => void this.collect(), interval);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Guarda los avistamientos de las últimas horas. Idempotente: la ventana se
   * solapa a propósito y los repetidos los descarta la clave única.
   */
  async collect(lookbackHours = LOOKBACK_HOURS): Promise<CollectResult> {
    if (this.running) {
      this.logger.warn('Ya hay una recolección en curso');
      return { nuevos: 0, repetidos: 0, podados: 0, paradas: 0 };
    }
    this.running = true;

    try {
      const rows: any[] = await this.dataSource.query(COLLECT_SQL, [
        String(lookbackHours),
        MAX_SPEED_KMH,
        MAX_SINCE_CHANGE,
      ]);

      const nuevos = await this.insert(rows);
      const podados = await this.prune();

      const [{ paradas }] = await this.dataSource.query(
        'SELECT count(DISTINCT (code, name))::int AS paradas FROM stop_observations',
      );

      this.logger.log(
        `Avistamientos: ${nuevos} nuevos de ${rows.length} leídos, ` +
          `${podados} podados, ${paradas} paradas con evidencia`,
      );

      return { nuevos, repetidos: rows.length - nuevos, podados, paradas };
    } catch (error) {
      this.logger.error(`No se pudieron recolectar avistamientos: ${error}`);
      return { nuevos: 0, repetidos: 0, podados: 0, paradas: 0 };
    } finally {
      this.running = false;
    }
  }

  /** Cuántas paradas tienen evidencia directa, para los diagnósticos. */
  async coverage(): Promise<{ paradas: number; avistamientos: number; desde: string | null }> {
    const [row] = await this.dataSource.query(
      `SELECT count(DISTINCT (code, name))::int AS paradas,
              count(*)::int                     AS avistamientos,
              min(observed_at)                  AS desde
       FROM stop_observations`,
    );
    return {
      paradas: row?.paradas ?? 0,
      avistamientos: row?.avistamientos ?? 0,
      desde: row?.desde ?? null,
    };
  }

  /**
   * Inserta en lotes. Son miles de filas por corrida contra una base remota:
   * de a una, el ida y vuelta tarda más que todo el resto junto.
   */
  private async insert(rows: any[]): Promise<number> {
    if (rows.length === 0) return 0;

    const CHUNK = 500;
    let insertadas = 0;

    for (let i = 0; i < rows.length; i += CHUNK) {
      const lote = rows.slice(i, i + CHUNK);
      const valores: any[] = [];
      const marcadores = lote.map((row, n) => {
        const base = n * 11;
        valores.push(
          row.code,
          row.name,
          row.operator,
          row.vehicle_id,
          row.line_code,
          row.itinerary_key,
          row.latitude,
          row.longitude,
          row.speed_kmh,
          row.since_change,
          row.observed_at,
        );
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},` +
          `$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11})`;
      });

      const result = await this.dataSource.query(
        `INSERT INTO stop_observations
           (code, name, operator, vehicle_id, line_code, itinerary_key,
            latitude, longitude, speed_kmh, since_change, observed_at)
         VALUES ${marcadores.join(',')}
         ON CONFLICT (operator, vehicle_id, observed_at, code) DO NOTHING
         RETURNING id`,
        valores,
      );
      insertadas += result.length;
    }

    return insertadas;
  }

  private async prune(): Promise<number> {
    const borradas = await this.dataSource.query(PRUNE_SQL, [MAX_PER_STOP]);
    return borradas.length;
  }
}
