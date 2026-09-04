import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  ParseFloatPipe,
} from '@nestjs/common';
import { BusStopsService } from './bus-stops.service';
import { StopCatalogService } from './stop-catalog.service';
import { StopPlacementService } from './stop-placement.service';
import { StopObservationsService } from './stop-observations.service';
import { CreateBusStopDto, UpdateBusStopDto, FindNearbyStopsDto } from './dto/bus-stop.dto';
import { JwtAuthGuard } from '../admin/auth/jwt-auth.guard';

@Controller('transport/stops')
export class BusStopsController {
  constructor(
    private readonly stopsService: BusStopsService,
    private readonly stopCatalog: StopCatalogService,
    private readonly stopPlacement: StopPlacementService,
    private readonly stopObservations: StopObservationsService,
  ) {}

  /**
   * GET /transport/stops
   * Obtener todas las paradas
   */
  @Get()
  async findAll(
    @Query('is_active') isActive?: string,
    @Query('zone') zone?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const filters = {
      is_active: isActive !== undefined ? isActive === 'true' : undefined,
      zone,
      search,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    };

    return await this.stopsService.findAll(filters);
  }

  /**
   * GET /transport/stops/nearby
   * Buscar paradas cercanas
   */
  @Get('nearby')
  async findNearby(
    @Query('lat', ParseFloatPipe) lat: number,
    @Query('lng', ParseFloatPipe) lng: number,
    @Query('radius') radius?: string,
  ) {
    const dto: FindNearbyStopsDto = {
      lat,
      lng,
      radius: radius ? parseInt(radius) : 500,
    };

    return await this.stopsService.findNearby(dto);
  }

  /**
   * GET /transport/stops/bbox
   * Buscar paradas en bounding box (para mapa)
   */
  @Get('bbox')
  async findInBbox(
    @Query('minLat', ParseFloatPipe) minLat: number,
    @Query('maxLat', ParseFloatPipe) maxLat: number,
    @Query('minLng', ParseFloatPipe) minLng: number,
    @Query('maxLng', ParseFloatPipe) maxLng: number,
  ) {
    return await this.stopsService.findInBbox({ minLat, maxLat, minLng, maxLng });
  }

  /**
   * GET /transport/stops/stats
   * Estadísticas de paradas
   */
  @Get('stats')
  async getStats() {
    return await this.stopsService.getStats();
  }

  /**
   * POST /transport/stops/rebuild-catalog
   *
   * Vuelve a deducir las paradas desde el feed AVL de las empresas. Corre sola
   * de madrugada; esto es para no esperar hasta mañana después de un desvío o
   * una parada nueva. Es idempotente y no toca las paradas cargadas a mano.
   *
   * Va antes de :id porque Nest resuelve por orden de declaración y una ruta
   * con parámetro se traga cualquier literal que venga después.
   */
  @Post('rebuild-catalog')
  @UseGuards(JwtAuthGuard)
  async rebuildCatalog() {
    return await this.stopCatalog.rebuild();
  }

  /**
   * POST /transport/stops/place
   *
   * Recalcula **dónde** está cada parada con toda la evidencia disponible: los
   * ómnibus vistos detenidos ahí, la ventana entre las dos posiciones que la
   * cruzaron y el nodo relevado en OpenStreetMap. Devuelve de qué fuente salió
   * cada una y cuántas quedaron con la esquina nombrable, que es lo que hay
   * que mirar para saber si mejoró.
   *
   * Distinto de rebuild-catalog: aquel decide **qué paradas existen** (código y
   * nombre, que los publica la empresa); éste, dónde están.
   */
  @Post('place')
  @UseGuards(JwtAuthGuard)
  async place() {
    await this.stopObservations.collect(24);
    return await this.stopPlacement.place();
  }

  /**
   * GET /transport/stops/quality
   *
   * Qué tan bien ubicado está el catálogo, por fuente y por zona. Es el número
   * que hay que mirar antes y después de tocar el estimador.
   */
  @Get('quality')
  async quality() {
    return await this.stopsService.quality();
  }

  /**
   * GET /transport/stops/:id
   * Obtener parada por ID
   */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.stopsService.findOne(id);
  }

  /**
   * POST /transport/stops
   * Crear nueva parada
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() createDto: CreateBusStopDto) {
    return await this.stopsService.create(createDto);
  }

  /**
   * PATCH /transport/stops/:id
   * Actualizar parada
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateBusStopDto,
  ) {
    return await this.stopsService.update(id, updateDto);
  }

  /**
   * DELETE /transport/stops/:id
   * Desactivar parada
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.stopsService.remove(id);
    return { message: 'Parada desactivada' };
  }

  /**
   * DELETE /transport/stops/:id/hard
   * Eliminar permanentemente
   */
  @Delete(':id/hard')
  @UseGuards(JwtAuthGuard)
  async hardDelete(@Param('id', ParseIntPipe) id: number) {
    await this.stopsService.hardDelete(id);
    return { message: 'Parada eliminada permanentemente' };
  }
}
