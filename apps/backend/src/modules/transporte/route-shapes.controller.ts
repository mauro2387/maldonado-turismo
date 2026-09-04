import { Controller, Get, Post, Query } from '@nestjs/common';
import { itineraryKey, RouteShapesService } from './route-shapes.service';
import { StopSequenceService } from './stop-sequence.service';
import { directionOf, OfficialRoutesService } from './official-routes.service';

@Controller('transport/shapes')
export class RouteShapesController {
  constructor(
    private readonly service: RouteShapesService,
    private readonly stopSequences: StopSequenceService,
    private readonly officialRoutes: OfficialRoutesService,
  ) {}

  /**
   * Recorridos de las líneas, para dibujarlos en el mapa.
   *
   * Cada uno viene con tres cosas que antes había que adivinar: **de dónde
   * sale el trazo** (el que publica la empresa o la reconstrucción por GPS),
   * **sus paradas en orden** y **el recorrido calle por calle tal como lo
   * publica la empresa**. Ese último es texto de la fuente, no una
   * descripción escrita acá: es lo que permite decir "va por Roosevelt" sin
   * inventarlo.
   */
  @Get()
  async list(
    @Query('line') line?: string,
    @Query('operator') operator?: string,
    @Query('itinerary') itinerary?: string,
  ) {
    return this.service
      .getShapes()
      .filter((shape) => (line ? shape.lineCode === line : true))
      .filter((shape) => (operator ? shape.operator === operator : true))
      // Una línea puede tener hasta seis recorridos por calles distintas, así
      // que pedirla entera devuelve los seis. El mapa pide uno.
      .filter((shape) => (itinerary ? shape.itineraryKey === itineraryKey(itinerary) : true))
      .map((shape) => {
        const sequence = this.stopSequences.get(
          shape.operator,
          shape.lineCode,
          shape.itineraryKey,
        );
        const official = shape.officialRouteId
          ? this.officialRoutes.getById(shape.officialRouteId)
          : null;

        return {
          operator: shape.operator,
          line_code: shape.lineCode,
          line_label: this.officialRoutes.lineLabel(shape.operator, shape.lineCode),
          // Qué recorrido de la línea es. Una línea puede tener hasta seis, por
          // avenidas distintas, y el mapa dibuja el del ómnibus que se tocó.
          itinerary_key: shape.itineraryKey,
          itinerary_name: shape.itineraryName,
          direction: shape.direction,
          /**
           * Ida, vuelta o circular. Es lo que permite dibujar los dos sentidos
           * de una línea con colores distintos y decir cuál es cuál; sin esto
           * el mapa mostraba dos trazos del mismo color encimados.
           */
          way: directionOf(official?.variant ?? null),
          variant: official?.variant ?? null,
          // Orden GeoJSON [lng, lat]; el frontend lo invierte para Leaflet.
          geometry: shape.geometry,
          point_count: shape.geometry.length,
          distance_m: shape.distanceM,
          /** 'oficial' = publicado por la empresa; 'avl' = reconstruido del GPS. */
          source: shape.source,
          /** Proporción del trazo que pisa calle recorrida de verdad. */
          confidence: shape.confidence,
          /** Proporción de las posiciones de otros viajes que caen sobre el trazo. */
          support: shape.support,
          built_at: shape.builtAt,

          /** Las paradas del recorrido, en orden. */
          stops:
            sequence?.stops.map((stop) => ({
              id: stop.stopId,
              code: stop.code,
              name: stop.name,
              lat: stop.lat,
              lng: stop.lng,
              sequence: stop.sequence,
              /** Si sirve para mandar a alguien a esperar el ómnibus ahí. */
              reliable: stop.reliable,
              /** Radio en metros dentro del cual está la parada de verdad. */
              accuracy_m: stop.accuracyM,
              /** De dónde salió la coordenada: osm, detenciones, intervalo. */
              fix_source: stop.fixSource,
            })) ?? [],

          /** Lo que publica la empresa sobre este recorrido. */
          official: official
            ? {
                name: official.name,
                headsign: official.headsign,
                /** El recorrido calle por calle, textual. */
                street_text: official.streetText,
                /** Las "pasadas de interés": terminal, shopping, hospital. */
                highlights: official.highlights,
                source_url: official.sourceUrl,
              }
            : null,
        };
      });
  }

  /**
   * Fuerza una reconstrucción sin esperar al ciclo automático. Vuelve a
   * emparejar los recorridos publicados con lo que informa el GPS y, para lo
   * que no tenga recorrido publicado, lo reconstruye.
   */
  @Post('rebuild')
  async rebuild() {
    return await this.service.buildAll();
  }
}
