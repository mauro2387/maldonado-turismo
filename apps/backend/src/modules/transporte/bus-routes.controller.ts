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
} from '@nestjs/common';
import { BusRoutesService } from './bus-routes.service';
import { CreateBusRouteDto, UpdateBusRouteDto } from './dto/bus-route.dto';
import { JwtAuthGuard } from '../admin/auth/jwt-auth.guard';

@Controller('transport/routes')
export class BusRoutesController {
  constructor(private readonly routesService: BusRoutesService) {}

  /**
   * GET /transport/routes
   * Obtener todas las rutas con filtros opcionales
   */
  @Get()
  async findAll(
    @Query('is_active') isActive?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const filters = {
      is_active: isActive !== undefined ? isActive === 'true' : undefined,
      search,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    };

    return await this.routesService.findAll(filters);
  }

  /**
   * GET /transport/routes/stats
   * Obtener estadísticas de rutas
   */
  @Get('stats')
  async getStats() {
    return await this.routesService.getStats();
  }

  /**
   * GET /transport/routes/:id
   * Obtener una ruta por ID
   */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.routesService.findOne(id);
  }

  /**
   * POST /transport/routes
   * Crear nueva ruta (requiere autenticación admin)
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() createDto: CreateBusRouteDto) {
    return await this.routesService.create(createDto);
  }

  /**
   * PATCH /transport/routes/:id
   * Actualizar ruta (requiere autenticación admin)
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateBusRouteDto,
  ) {
    return await this.routesService.update(id, updateDto);
  }

  /**
   * DELETE /transport/routes/:id
   * Marcar ruta como inactiva (requiere autenticación admin)
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.routesService.remove(id);
    return { message: 'Ruta marcada como inactiva' };
  }

  /**
   * DELETE /transport/routes/:id/hard
   * Eliminar ruta permanentemente (requiere autenticación admin)
   */
  @Delete(':id/hard')
  @UseGuards(JwtAuthGuard)
  async hardDelete(@Param('id', ParseIntPipe) id: number) {
    await this.routesService.hardDelete(id);
    return { message: 'Ruta eliminada permanentemente' };
  }
}
