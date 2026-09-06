import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ArrivalsService } from './arrivals.service';
import { StopSequenceService } from './stop-sequence.service';
import { StopsReaderService } from './stops-reader.service';

/**
 * Llegadas en vivo.
 *
 * Son dos endpoints porque son dos preguntas distintas: "¿cuándo pasa por esta
 * parada?" (ficha de parada) y "¿qué sale ahora de las paradas que tengo
 * alrededor?" (la pantalla de entrada de Moverse, que no le pide nada al
 * usuario).
 */

/** Cuántas paradas cercanas se devuelven de una: más no entran en pantalla. */
const DEFAULT_NEARBY_STOPS = 6;
const MAX_NEARBY_STOPS = 15;
const DEFAULT_RADIUS_M = 800;

@Controller('transport')
export class ArrivalsController {
  constructor(
    private readonly arrivals: ArrivalsService,
    private readonly stopSequences: StopSequenceService,
    private readonly stops: StopsReaderService,
  ) {}

  /** Próximas llegadas a una parada. */
  @Get('stops/:id/arrivals')
  async forStop(@Param('id', ParseIntPipe) id: number) {
    const arrivals = await this.arrivals.getForStop(id);

    return {
      stop_id: id,
      lines: this.stopSequences.getLineCodesForStop(id),
      arrivals,
      // Sin recorridos reconstruidos no se puede calcular nada, y la interfaz
      // necesita distinguir "no viene ningún ómnibus ahora" de "todavía no
      // sabemos calcularlo" para no mostrar un vacío sin explicación.
      ready: this.stopSequences.isReady(),
      generated_at: new Date().toISOString(),
    };
  }

  /**
   * Paradas cercanas con sus próximas llegadas, listo para pintar la pantalla
   * "Cerca tuyo" de un solo pedido.
   */
  @Get('departures/nearby')
  async nearby(
    @Query('lat') latParam: string,
    @Query('lng') lngParam: string,
    @Query('radius') radiusParam?: string,
    @Query('limit') limitParam?: string,
  ) {
    const lat = Number(latParam);
    const lng = Number(lngParam);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { stops: [], ready: this.stopSequences.isReady(), error: 'Coordenadas inválidas' };
    }

    const radius = Number(radiusParam) || DEFAULT_RADIUS_M;
    const limit = Math.min(MAX_NEARBY_STOPS, Number(limitParam) || DEFAULT_NEARBY_STOPS);

    const nearbyStops = await this.stops.findNearby(lat, lng, radius, limit);

    // Las llegadas de cada parada se piden en paralelo: cada una es cálculo en
    // memoria sobre las mismas posiciones, así que no multiplica consultas.
    const withArrivals = await Promise.all(
      nearbyStops.map(async (stop) => ({
        id: stop.id,
        code: stop.code,
        name: stop.name,
        zone: stop.zone,
        lat: stop.lat,
        lng: stop.lng,
        has_shelter: stop.has_shelter,
        accessibility: stop.accessibility,
        distance_m: stop.distance_m,
        lines: this.stopSequences.getLineCodesForStop(stop.id),
        arrivals: await this.arrivals.getForStop(stop.id),
      })),
    );

    return {
      stops: withArrivals,
      ready: this.stopSequences.isReady(),
      generated_at: new Date().toISOString(),
    };
  }

  /** Orden de paradas derivado de los recorridos, para la ficha de línea. */
  @Get('lines/sequences')
  async sequences(@Query('line') line?: string, @Query('operator') operator?: string) {
    return this.stopSequences
      .getAll()
      .filter((sequence) => (line ? sequence.lineCode === line : true))
      .filter((sequence) => (operator ? sequence.operator === operator : true))
      .map((sequence) => ({
        operator: sequence.operator,
        line_code: sequence.lineCode,
        direction: sequence.direction,
        distance_m: Math.round(sequence.distanceM),
        stops: sequence.stops.map((stop) => ({
          stop_id: stop.stopId,
          code: stop.code,
          name: stop.name,
          lat: stop.lat,
          lng: stop.lng,
          sequence: stop.sequence,
          distance_from_start_m: Math.round(stop.alongMeters),
        })),
      }));
  }
}
