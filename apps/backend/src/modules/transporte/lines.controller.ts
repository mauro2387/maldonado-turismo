import { Controller, Get, Param } from '@nestjs/common';
import { RouteShapesService } from './route-shapes.service';
import { StopSequenceService } from './stop-sequence.service';
import { directionOf, OfficialRoutesService } from './official-routes.service';
import { SchedulesService } from './schedules.service';

/**
 * Las líneas que circulan, con sus recorridos.
 *
 * Hasta ahora la app no tenía dónde contestar "¿qué líneas hay?" ni "¿por
 * dónde va la 24?": el catálogo `bus_routes` son dos filas de ejemplo ('L5',
 * 'L12') que no se corresponden con ninguna línea real, y lo único que se
 * podía ver era el recorrido del ómnibus que uno tocara en el mapa.
 *
 * Este catálogo se arma con lo que hay de verdad: los recorridos que se están
 * dibujando (`route_shapes`), que son los itinerarios que las empresas
 * publican y que el GPS confirma que están circulando. Una línea aparece con
 * sus dos sentidos —o con los cuatro recorridos de la 24— y cada uno dice si
 * es ida o vuelta, cuánto mide y cuántas paradas hace.
 */
@Controller('transport/lines')
export class LinesController {
  constructor(
    private readonly shapes: RouteShapesService,
    private readonly stopSequences: StopSequenceService,
    private readonly officialRoutes: OfficialRoutesService,
    private readonly schedules: SchedulesService,
  ) {}

  /**
   * El horario publicado de una línea, para su ficha.
   *
   * Devuelve `{ available: false }` cuando esa línea no tiene horario cargado
   * para la temporada de hoy -que hoy es siempre, hasta que se importen-. La
   * interfaz distingue "no hay horario" de "todavía no lo cargamos", y de
   * mostrar un horario de la temporada equivocada, que sería peor que nada.
   */
  @Get(':label/schedule')
  async schedule(@Param('label') label: string) {
    const timetable = await this.schedules.getLineSchedule(decodeURIComponent(label));
    if (!timetable) return { available: false };
    return { available: true, ...timetable };
  }

  @Get()
  async list() {
    const byLine = new Map<
      string,
      {
        operator: string;
        line_code: string;
        itineraries: Array<Record<string, unknown>>;
        stops: Set<number>;
      }
    >();

    for (const shape of this.shapes.getShapes()) {
      const official = shape.officialRouteId
        ? this.officialRoutes.getById(shape.officialRouteId)
        : null;
      const sequence = this.stopSequences.get(
        shape.operator,
        shape.lineCode,
        shape.itineraryKey,
      );

      const key = `${shape.operator}|${shape.lineCode}`;
      let line = byLine.get(key);
      if (!line) {
        byLine.set(
          key,
          (line = {
            operator: shape.operator,
            line_code: shape.lineCode,
            itineraries: [],
            stops: new Set<number>(),
          }),
        );
      }

      for (const stop of sequence?.stops ?? []) line.stops.add(stop.stopId);

      line.itineraries.push({
        itinerary_key: shape.itineraryKey,
        // El cartel del ómnibus: es como la gente la nombra.
        headsign: shape.itineraryName,
        // Cómo la nombra la empresa en su mapa.
        name: official?.name ?? null,
        way: directionOf(official?.variant ?? null),
        distance_m: shape.distanceM,
        stops_count: sequence?.stops.length ?? 0,
        source: shape.source,
        highlights: official?.highlights ?? [],
      });
    }

    return [...byLine.values()]
      .map((line) => ({
        operator: line.operator,
        line_code: line.line_code,
        /** El número del cartel: "17/19" y no "179". */
        line_label: this.officialRoutes.lineLabel(line.operator, line.line_code),
        /** Paradas distintas de la línea, sumando todos sus recorridos. */
        stops_count: line.stops.size,
        // Ida antes que vuelta, y lo que no tiene sentido declarado al final.
        itineraries: line.itineraries.sort((a, b) => order(a.way) - order(b.way)),
      }))
      .sort(byLineCode);
  }
}

function order(way: unknown): number {
  return way === 'ida' ? 0 : way === 'circular' ? 1 : way === 'vuelta' ? 2 : 3;
}

/** 1, 3, 7... 100, y las que tienen letra al final. */
function byLineCode(
  a: { line_code: string },
  b: { line_code: string },
): number {
  const numberA = Number(a.line_code.replace(/\D/g, ''));
  const numberB = Number(b.line_code.replace(/\D/g, ''));
  if (Number.isFinite(numberA) && Number.isFinite(numberB) && numberA !== numberB) {
    return numberA - numberB;
  }
  return a.line_code.localeCompare(b.line_code);
}
