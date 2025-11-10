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
  Request,
} from '@nestjs/common';
import { TransportAlertsService } from './transport-alerts.service';
import { CreateTransportAlertDto, UpdateTransportAlertDto } from './dto/transport-alert.dto';
import { JwtAuthGuard } from '../admin/auth/jwt-auth.guard';

@Controller('transport/alerts')
export class TransportAlertsController {
  constructor(private readonly alertsService: TransportAlertsService) {}

  /**
   * GET /transport/alerts
   * Obtener todas las alertas
   */
  @Get()
  async findAll(
    @Query('is_active') isActive?: string,
    @Query('route_id') routeId?: string,
    @Query('stop_id') stopId?: string,
    @Query('severity') severity?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const filters = {
      is_active: isActive !== undefined ? isActive === 'true' : undefined,
      route_id: routeId ? parseInt(routeId) : undefined,
      stop_id: stopId ? parseInt(stopId) : undefined,
      severity,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    };

    return await this.alertsService.findAll(filters);
  }

  /**
   * GET /transport/alerts/active
   * Obtener alertas activas vigentes
   */
  @Get('active')
  async findActive() {
    return await this.alertsService.findActive();
  }

  /**
   * GET /transport/alerts/stats
   * Estadísticas de alertas
   */
  @Get('stats')
  async getStats() {
    return await this.alertsService.getStats();
  }

  /**
   * GET /transport/alerts/:id
   * Obtener alerta por ID
   */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.alertsService.findOne(id);
  }

  /**
   * POST /transport/alerts
   * Crear nueva alerta
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() createDto: CreateTransportAlertDto, @Request() req: any) {
    return await this.alertsService.create(createDto, req.user?.id);
  }

  /**
   * PATCH /transport/alerts/:id
   * Actualizar alerta
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateTransportAlertDto,
  ) {
    return await this.alertsService.update(id, updateDto);
  }

  /**
   * PATCH /transport/alerts/:id/deactivate
   * Desactivar alerta
   */
  @Patch(':id/deactivate')
  @UseGuards(JwtAuthGuard)
  async deactivate(@Param('id', ParseIntPipe) id: number) {
    await this.alertsService.deactivate(id);
    return { message: 'Alerta desactivada' };
  }

  /**
   * DELETE /transport/alerts/:id
   * Eliminar alerta permanentemente
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.alertsService.remove(id);
    return { message: 'Alerta eliminada' };
  }
}
