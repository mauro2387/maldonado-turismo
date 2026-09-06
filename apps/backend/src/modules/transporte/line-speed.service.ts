import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { LngLat, pointAtDistance } from './geo.util';

/**
 * A qué velocidad anda de verdad cada recorrido, y en cada parte de él.
 *
 * El planificador usaba una constante de 18 km/h para todo. Es un número
 * razonable para el centro de Maldonado y muy malo para el resto: la 1 y la 24
 * hacen la mitad del viaje por la Ruta 39, la 8 llega hasta Piriápolis y la
 * 100 hasta Pan de Azúcar. Con 18 km/h, San Carlos - Punta del Este daba una
 * hora y media cuando son cincuenta minutos, y la app mandaba a la gente a
 * salir mucho antes de lo necesario.
 *
 * Medir una velocidad por recorrido arregló eso y dejó un error del mismo
 * tamaño para el otro lado. **Un recorrido no anda parejo.** La 15 son 34
 * kilómetros: veintinueve por la Ruta 10 y la Interbalnearia a cuarenta y
 * pico, y cinco por el centro de Maldonado parando cada dos cuadras. El
 * promedio da 30 km/h, que no es la velocidad de ninguno de los dos tramos.
 * Aplicado al centro —que es justo donde alguien está parado mirando el mapa a
 * ver si le da para cruzar— hace creer que el ómnibus llega en dos tercios del
 * tiempo que tarda, y la app contesta "no llegás" a alguien que llegaba bien.
 *
 * El contraste está medido contra el horario que publica la empresa, que es la
 * fuente independiente: CODESA da quince minutos entre la Terminal de
 * Maldonado y la Agencia, en los dos sentidos. Son 5.065 metros: 20 km/h. El
 * promedio del recorrido decía diez minutos.
 *
 * Así que se mide por **celda**: se parte el mapa en cuadros de medio
 * kilómetro y se mide cada recorrido en cada cuadro por el que pasa. La ruta
 * da rápido, el centro da lento, y cada tramo se calcula con la velocidad del
 * lugar por el que se anda. Donde no hay con qué medir se cae al promedio del
 * recorrido, después al de la línea y por último a la constante: siempre hay
 * respuesta, y siempre se sabe de dónde salió.
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
 * El lado del cuadro en que se parte el mapa, en grados.
 *
 * A esta latitud, 0,005° son unos 555 metros de norte a sur y 456 de este a
 * oeste: la escala en la que una avenida deja de ser una calle del centro.
 * Más chico separaría mejor pero deja cada cuadro sin muestras suficientes;
 * más grande vuelve a mezclar la ruta con el centro, que es el error que se
 * está corrigiendo.
 */
const CELL_DEGREES = 0.005;

/**
 * Cuántos tramos hacen falta para creerle a un cuadro.
 *
 * Es un umbral más bajo que el del recorrido entero a propósito: un cuadro ve
 * una fracción de las muestras, y exigirle las mismas treinta lo dejaría mudo
 * en media línea. Doce alcanzan para que un semáforo aislado no defina la
 * velocidad del lugar, y lo que no llega a doce cae al promedio del recorrido,
 * que es de donde venía todo hasta ahora.
 */
const MIN_TRAMOS_CELDA = 12;

/** Y cuántos para creerle al recorrido entero. */
const MIN_TRAMOS_ITINERARIO = 30;

/**
 * Cada cuántos metros se pregunta la velocidad al recorrer un tramo.
 *
 * Bastante más fino que el cuadro: con pasos del tamaño del cuadro, el reparto
 * entre uno y otro dependería de dónde cae el primer paso. A 150 metros cada
 * cuadro recibe tres o cuatro muestras y el error de borde se diluye.
 */
const SAMPLE_M = 150;

/**
 * Un par de posiciones separado por más de dos minutos no es un tramo: es un
 * hueco en el feed, y contarlo hunde la velocidad. Menos de cinco segundos es
 * ruido de reloj.
 *
 * El cuadro se toma de la posición **anterior**, que es donde el ómnibus
 * empezó a recorrer ese tramo.
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
         floor(lat_anterior / ($2)::double precision)::int AS celda_lat,
         floor(lng_anterior / ($2)::double precision)::int AS celda_lng,
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
       celda_lat,
       celda_lng,
       sum(metros) AS metros,
       sum(segundos) AS segundos,
       count(*)::int AS tramos
FROM tramos
GROUP BY operator, line_code, itinerary_key, celda_lat, celda_lng
`;

interface Acumulado {
  metros: number;
  segundos: number;
  tramos: number;
}

/** En qué cuadro cae un punto. */
export function cellKey(lat: number, lng: number): string {
  return `${Math.floor(lat / CELL_DEGREES)}|${Math.floor(lng / CELL_DEGREES)}`;
}

@Injectable()
export class LineSpeedService {
  private readonly logger = new Logger(LineSpeedService.name);

  /** Por recorrido y por línea, en km/h. */
  private speeds = new Map<string, number>();
  /** Por recorrido **y cuadro**, en km/h. */
  private cells = new Map<string, number>();
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
   * Velocidad comercial de un recorrido entero, en km/h. Si no hay con qué
   * medirlo -una línea con pocos viajes en el día- devuelve la de referencia.
   *
   * Sirve para lo que es propiedad del recorrido completo, como estimar cada
   * cuánto pasa uno a partir de cuántos coches lo están haciendo. Para saber
   * cuánto tarda un **tramo** está `travelMinutes`, que es lo que hay que usar
   * cuando el recorrido mezcla ruta y ciudad.
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

  /**
   * A qué velocidad anda ese recorrido **por ese lugar**, en metros por
   * minuto.
   *
   * La cadena de respaldo es lo que hace que esto se pueda usar en todos
   * lados: cuadro medido, si no el recorrido, si no la línea, si no la
   * constante. Nunca devuelve null y nunca inventa un número que no salga de
   * algo medido, salvo el último escalón, que está declarado.
   */
  metersPerMinuteAt(
    operator: string,
    lineCode: string,
    itineraryKey: string,
    lat: number,
    lng: number,
  ): number {
    const cell = this.cells.get(
      `${operator}|${lineCode}|${itineraryKey}|${cellKey(lat, lng)}`,
    );
    return ((cell ?? this.kmh(operator, lineCode, itineraryKey)) * 1000) / 60;
  }

  /**
   * Cuántos minutos le lleva a ese recorrido ir del metro `fromM` al `toM`.
   *
   * Se camina el trazo de a pasos y cada paso se cobra a la velocidad del
   * lugar por el que pasa. Sobre un recorrido homogéneo da lo mismo que
   * dividir la distancia por el promedio; sobre uno que mezcla ruta y ciudad
   * -que son casi todos los de Maldonado- da la diferencia entre decirle a
   * alguien que llega y decirle que no.
   *
   * Hacia atrás devuelve 0: un ómnibus no vuelve sobre su recorrido, y quien
   * pregunta por una parada que ya quedó atrás tiene que enterarse por otro
   * lado, no recibiendo un número negativo de minutos.
   */
  travelMinutes(
    operator: string,
    lineCode: string,
    itineraryKey: string,
    polyline: LngLat[],
    cumulative: number[],
    fromM: number,
    toM: number,
  ): number {
    const distance = toM - fromM;
    if (!(distance > 0)) return 0;

    let minutes = 0;
    for (let offset = 0; offset < distance; offset += SAMPLE_M) {
      const step = Math.min(SAMPLE_M, distance - offset);
      // El punto del medio del paso: cobrarle el borde lo asignaría al cuadro
      // de al lado la mitad de las veces.
      const point = pointAtDistance(polyline, cumulative, fromM + offset + step / 2);
      const metersPerMinute = point
        ? this.metersPerMinuteAt(operator, lineCode, itineraryKey, point[1], point[0])
        : ((this.kmh(operator, lineCode, itineraryKey) * 1000) / 60);

      minutes += step / metersPerMinute;
    }

    return minutes;
  }

  private async refresh(): Promise<void> {
    if (Date.now() - this.measuredAt < CACHE_MS && this.speeds.size > 0) return;

    try {
      const rows = await this.dataSource.query(SQL, [LOOKBACK_HOURS, CELL_DEGREES]);

      const cells = new Map<string, number>();
      const speeds = new Map<string, number>();
      const porItinerario = new Map<string, Acumulado>();
      const byLine = new Map<string, number[]>();

      for (const row of rows) {
        const metros = Number(row.metros);
        const segundos = Number(row.segundos);
        const tramos = Number(row.tramos);
        if (!Number.isFinite(metros) || !(segundos > 0)) continue;

        const itinerario = `${row.operator}|${row.line_code}|${row.itinerary_key}`;

        // El recorrido entero se arma sumando sus cuadros: es la misma cuenta
        // que hacía la consulta anterior, hecha acá.
        const acumulado = porItinerario.get(itinerario) ?? {
          metros: 0,
          segundos: 0,
          tramos: 0,
        };
        acumulado.metros += metros;
        acumulado.segundos += segundos;
        acumulado.tramos += tramos;
        porItinerario.set(itinerario, acumulado);

        if (tramos < MIN_TRAMOS_CELDA) continue;
        cells.set(`${itinerario}|${row.celda_lat}|${row.celda_lng}`, clamp(metros, segundos));
      }

      for (const [itinerario, acumulado] of porItinerario) {
        if (acumulado.tramos < MIN_TRAMOS_ITINERARIO) continue;
        const kmh = clamp(acumulado.metros, acumulado.segundos);
        speeds.set(itinerario, kmh);

        const line = itinerario.slice(0, itinerario.lastIndexOf('|'));
        byLine.set(line, [...(byLine.get(line) ?? []), kmh]);
      }

      // El promedio de la línea, para los recorridos sin medición propia.
      for (const [line, values] of byLine) {
        speeds.set(line, values.reduce((sum, value) => sum + value, 0) / values.length);
      }

      this.speeds = speeds;
      this.cells = cells;
      this.measuredAt = Date.now();
      this.logger.log(
        `Velocidad medida en ${speeds.size} recorridos y ${cells.size} cuadros de medio kilómetro`,
      );
    } catch (error: any) {
      this.logger.warn(`No se pudo medir la velocidad de las líneas: ${error?.message ?? error}`);
      this.measuredAt = Date.now();
    }
  }
}

function clamp(metros: number, segundos: number): number {
  const kmh = (metros / segundos) * 3.6;
  if (!Number.isFinite(kmh)) return DEFAULT_KMH;
  return Math.min(MAX_KMH, Math.max(MIN_KMH, kmh));
}
