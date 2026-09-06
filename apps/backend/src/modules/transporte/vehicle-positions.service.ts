import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Una posición ya normalizada, lista para guardar. Es lo que produce el
 * poller de los feeds GPS de las empresas y también lo que acepta el
 * endpoint de ingesta.
 */
export interface VehiclePositionInput {
  vehicle_id: string;
  route_id?: number | null;
  latitude: number;
  longitude: number;
  heading?: number | null;
  speed?: number | null;
  operator?: string | null;
  line_code?: string | null;
  line_name?: string | null;
  /**
   * Campo `sen` del feed. Las tres empresas lo publican siempre en 1, así que
   * no separa ida de vuelta: para eso está `itinerary`.
   */
  direction?: number | null;
  /** Campo `tra`: qué recorrido de la línea está haciendo la unidad. */
  itinerary?: number | null;
  plate?: string | null;
  accessible?: boolean | null;
  occupancy_pct?: number | null;
  schedule_deviation_min?: number | null;
  prev_stop_code?: string | null;
  prev_stop_name?: string | null;
  next_stop_code?: string | null;
  next_stop_name?: string | null;
  departure_time?: string | null;
  fix_time?: Date | null;
}

const INSERT_COLUMNS = [
  'vehicle_id',
  'route_id',
  'latitude',
  'longitude',
  'heading',
  'speed',
  'operator',
  'line_code',
  'line_name',
  'direction',
  'itinerary',
  'plate',
  'accessible',
  'occupancy_pct',
  'schedule_deviation_min',
  'prev_stop_code',
  'prev_stop_name',
  'next_stop_code',
  'next_stop_name',
  'departure_time',
  'fix_time',
] as const;

const SELECT_COLUMNS = ['id', ...INSERT_COLUMNS, 'recorded_at'].join(', ');

/**
 * Velocidad hasta la cual se considera que el ómnibus no se está moviendo.
 * No es 0 porque el GPS tirita: un coche estacionado reporta de a ratos 1 o 2
 * km/h y con el corte en 0 la racha de detención se cortaría sola.
 */
const STOPPED_SPEED_KMH = 2;

/**
 * Hasta dónde se mira hacia atrás para medir hace cuánto está detenido un
 * ómnibus. Sin este techo el cálculo agregaría las 24 h de histórico en cada
 * pedido, y este endpoint se consulta cada 5 segundos por cliente. Un coche
 * que lleva más de esta ventana quieto igual queda muy por encima de
 * cualquier umbral de "fuera de servicio": lo único que se pierde es saber
 * exactamente cuánto hace que está.
 */
const STOPPED_LOOKBACK_HOURS = 3;

@Injectable()
export class VehiclePositionsService {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  /**
   * Return the latest position for each vehicle (one row per vehicle).
   *
   * Descarta los vehículos que dejaron de reportar: un ómnibus que no manda
   * un fix hace media hora ya no está en la calle y no debería quedar
   * clavado en el mapa.
   *
   * Agrega `stopped_minutes`: hace cuántos minutos que el coche no se mueve.
   * La velocidad sola no alcanza para saber si un ómnibus terminó su
   * recorrido, porque un semáforo o una parada también dan 0 km/h; lo que
   * distingue las dos cosas es cuánto dura la detención. Es null mientras el
   * coche circula.
   *
   * El valor es un piso, no un dato exacto: si el ómnibus ya estaba quieto
   * cuando arranca la ventana de búsqueda -o cuando arrancó el servicio- se
   * cuenta desde el registro más viejo que hay, así que puede llevar detenido
   * más tiempo del que informa. Nunca al revés.
   */
  async getLatestPositions(maxAgeMinutes = 30): Promise<any[]> {
    // Use DISTINCT ON to pick latest recorded_at per vehicle_id
    const rows = await this.dataSource.query(
      `
      WITH ventana AS (
        SELECT vehicle_id, speed, COALESCE(fix_time, recorded_at) AS t
        FROM vehicle_positions
        WHERE recorded_at > now() - ($3 || ' hours')::interval
      ),
      detencion AS (
        SELECT vehicle_id,
               -- Velocidad desconocida cuenta como movimiento: ante la duda
               -- es preferible no afirmar que el coche está detenido.
               max(t) FILTER (WHERE speed IS NULL OR speed > $2) AS ultimo_movimiento,
               min(t) AS primer_registro
        FROM ventana
        GROUP BY vehicle_id
      ),
      latest AS (
        SELECT DISTINCT ON (vehicle_id) ${SELECT_COLUMNS}
        FROM vehicle_positions
        ORDER BY vehicle_id, recorded_at DESC
      )
      SELECT latest.*,
             CASE
               WHEN latest.speed IS NOT NULL AND latest.speed <= $2
                 THEN floor(
                        extract(epoch from now() - COALESCE(d.ultimo_movimiento, d.primer_registro))
                        / 60
                      )::int
             END AS stopped_minutes
      FROM latest
      LEFT JOIN detencion d ON d.vehicle_id = latest.vehicle_id
      WHERE COALESCE(latest.fix_time, latest.recorded_at) > now() - ($1 || ' minutes')::interval
      ORDER BY latest.line_code, latest.vehicle_id
    `,
      [maxAgeMinutes, STOPPED_SPEED_KMH, STOPPED_LOOKBACK_HOURS],
    );
    return rows;
  }

  async insertPosition(payload: VehiclePositionInput) {
    const inserted = await this.insertPositions([payload]);
    return inserted[0] ?? null;
  }

  /**
   * Inserta un lote de posiciones en una sola query.
   *
   * El feed repite el último fix mientras el ómnibus no reporta uno nuevo,
   * así que los duplicados los corta el índice único (vehicle_id, fix_time).
   * Devuelve solo las filas que efectivamente entraron.
   */
  async insertPositions(rows: VehiclePositionInput[]): Promise<any[]> {
    if (rows.length === 0) return [];

    const params: any[] = [];
    const tuples = rows.map((row) => {
      const placeholders = INSERT_COLUMNS.map((column) => {
        params.push(row[column] ?? null);
        return `$${params.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });

    return await this.dataSource.query(
      `INSERT INTO vehicle_positions (${INSERT_COLUMNS.join(', ')})
       VALUES ${tuples.join(', ')}
       ON CONFLICT DO NOTHING
       RETURNING ${SELECT_COLUMNS}`,
      params,
    );
  }

  /**
   * Borra el histórico viejo. La tabla crece a razón de un registro por
   * ómnibus cada pocos segundos, así que sin esto no tiene techo.
   */
  async prunePositions(retentionHours: number): Promise<number> {
    const rows = await this.dataSource.query(
      `WITH deleted AS (
         DELETE FROM vehicle_positions
         WHERE recorded_at < now() - ($1 || ' hours')::interval
         RETURNING 1
       )
       SELECT count(*)::int AS deleted FROM deleted`,
      [retentionHours],
    );
    return rows[0]?.deleted ?? 0;
  }

  /**
   * Mapa código de línea -> id de bus_routes, para poder enlazar la posición
   * con la ruta que ya tenemos cargada.
   */
  async getRouteIdsByCode(): Promise<Map<string, number>> {
    const rows = await this.dataSource.query(
      `SELECT id, code FROM bus_routes WHERE code IS NOT NULL`,
    );
    return new Map(rows.map((r: any) => [String(r.code).trim(), Number(r.id)]));
  }
}
