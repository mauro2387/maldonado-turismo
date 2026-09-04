import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * A qué velocidad anda de verdad cada recorrido.
 *
 * El planificador usaba una constante de 18 km/h para todo. Es un número
 * razonable para el centro de Maldonado y muy malo para el resto: la 1 y la 24
 * hacen la mitad del viaje por la Ruta 39, la 8 llega hasta Piriápolis y la
 * 100 hasta Pan de Azúcar. Con 18 km/h, San Carlos - Punta del Este daba una
 * hora y media cuando son cincuenta minutos, y la app mandaba a la gente a
 * salir mucho antes de lo necesario.
 *
 * Se mide de las posiciones, que es lo que hay: para cada viaje se suman los
 * tramos entre posiciones consecutivas y el tiempo que llevaron, y la
 * velocidad es el cociente. Incluye las detenciones —el semáforo y la parada
 * suman tiempo y no suman distancia—, que es justamente lo que hay que contar:
 * lo que se quiere saber es cuánto tarda el viaje, no a qué velocidad va el
 * ómnibus cuando anda.
 *
 * Es distinto de la velocidad que usa ArrivalsService, que descarta los
 * coches detenidos a propósito: ahí se estima cuánto falta para que llegue uno
 * que está en movimiento, acá cuánto va a durar el viaje entero.
 */

/** Se recalcula cada tanto: la velocidad de una línea cambia con la temporada. */
const CACHE_MS = 10 * 60 * 1000;

/** Ventana de posiciones sobre la que se mide. */
const LOOKBACK_HOURS = 24;

/**
 * Cotas. Por debajo de 8 km/h algo anda mal en los datos -un coche parado en
 * la playa de maniobras con el equipo prendido-, y por encima de 60 no es un
 * ómnibus urbano ni uno de ruta con paradas.
 */
const MIN_KMH = 8;
const MAX_KMH = 60;

/** Cuando no hay con qué medir. Velocidad comercial urbana de referencia. */
const DEFAULT_KMH = 18;

/**
 * Un par de posiciones separado por más de dos minutos no es un tramo: es un
 * hueco en el feed, y contarlo hunde la velocidad. Menos de cinco segundos es
 * ruido de reloj.
 */
const SQL = `
WITH pasos AS (
  SELECT operator,
         line_code,
         upper(btrim(line_name)) AS itinerary_key,
         latitude,
         longitude,
         COALESCE(fix_time, recorded_at) AS at,
         LAG(latitude)  OVER w AS lat_anterior,
         LAG(longitude) OVER w AS lng_anterior,
         LAG(COALESCE(fix_time, recorded_at)) OVER w AS momento_anterior
  FROM vehicle_positions
  WHERE operator IS NOT NULL
    AND line_code IS NOT NULL
    AND btrim(coalesce(line_name, '')) <> ''
    AND COALESCE(fix_time, recorded_at) > now() - ($1 || ' hours')::interval
  WINDOW w AS (
    PARTITION BY operator, vehicle_id, departure_time, line_name
    ORDER BY COALESCE(fix_time, recorded_at)
  )
),
tramos AS (
  SELECT operator,
         line_code,
         itinerary_key,
         -- Distancia plana: a esta escala el error es de centímetros.
         sqrt(
           power((longitude - lng_anterior) * 91500, 2) +
           power((latitude  - lat_anterior) * 111320, 2)
         ) AS metros,
         EXTRACT(EPOCH FROM (at - momento_anterior)) AS segundos
  FROM pasos
  WHERE lat_anterior IS NOT NULL
    AND at - momento_anterior BETWEEN interval '5 seconds' AND interval '2 minutes'
)
SELECT operator,
       line_code,
       itinerary_key,
       sum(metros) / NULLIF(sum(segundos), 0) * 3.6 AS kmh,
       count(*)::int AS tramos
FROM tramos
GROUP BY operator, line_code, itinerary_key
HAVING count(*) >= 30
`;

@Injectable()
export class LineSpeedService {
  private readonly logger = new Logger(LineSpeedService.name);

  private speeds = new Map<string, number>();
  private measuredAt = 0;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Deja las mediciones al día. Se llama una vez antes de planificar, para que
   * el cálculo de cada tramo sea después una lectura de memoria.
   */
  async warm(): Promise<void> {
    await this.refresh();
  }

  /**
   * Velocidad comercial de un recorrido, en km/h. Si no hay con qué medirlo
   * -una línea con pocos viajes en el día- devuelve la de referencia.
   */
  kmh(operator: string, lineCode: string, itineraryKey: string): number {
    return (
      this.speeds.get(`${operator}|${lineCode}|${itineraryKey}`) ??
      // Un recorrido nuevo hereda la velocidad de su línea antes que la
      // constante: la 8 a Piriápolis anda parecido en sus dos sentidos.
      this.speeds.get(`${operator}|${lineCode}`) ??
      DEFAULT_KMH
    );
  }

  private async refresh(): Promise<void> {
    if (Date.now() - this.measuredAt < CACHE_MS && this.speeds.size > 0) return;

    try {
      const rows = await this.dataSource.query(SQL, [LOOKBACK_HOURS]);

      const speeds = new Map<string, number>();
      const byLine = new Map<string, number[]>();

      for (const row of rows) {
        const kmh = Number(row.kmh);
        if (!Number.isFinite(kmh)) continue;

        const clamped = Math.min(MAX_KMH, Math.max(MIN_KMH, kmh));
        speeds.set(`${row.operator}|${row.line_code}|${row.itinerary_key}`, clamped);

        const line = `${row.operator}|${row.line_code}`;
        byLine.set(line, [...(byLine.get(line) ?? []), clamped]);
      }

      // El promedio de la línea, para los recorridos sin medición propia.
      for (const [line, values] of byLine) {
        speeds.set(line, values.reduce((sum, value) => sum + value, 0) / values.length);
      }

      this.speeds = speeds;
      this.measuredAt = Date.now();
      this.logger.log(`Velocidad medida en ${rows.length} recorridos`);
    } catch (error: any) {
      this.logger.warn(`No se pudo medir la velocidad de las líneas: ${error?.message ?? error}`);
      this.measuredAt = Date.now();
    }
  }
}
