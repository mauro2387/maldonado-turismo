import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusRoute } from './entities/bus-route.entity';
import { CreateBusRouteDto, UpdateBusRouteDto } from './dto/bus-route.dto';

@Injectable()
export class BusRoutesService {
  constructor(
    @InjectRepository(BusRoute)
    private readonly routesRepository: Repository<BusRoute>,
  ) {}

  /**
   * Obtener todas las rutas (con filtros opcionales)
   */
  async findAll(filters?: {
    is_active?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: BusRoute[]; total: number }> {
    const query = this.routesRepository.createQueryBuilder('route');

    // Filtro por activo
    if (filters?.is_active !== undefined) {
      query.andWhere('route.is_active = :is_active', { is_active: filters.is_active });
    }

    // Búsqueda por código o nombre
    if (filters?.search) {
      query.andWhere(
        '(route.code ILIKE :search OR route.name ILIKE :search OR route.description ILIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    // Paginación
    if (filters?.limit) {
      query.limit(filters.limit);
    }
    if (filters?.offset) {
      query.offset(filters.offset);
    }

    query.orderBy('route.code', 'ASC');

    const [data, total] = await query.getManyAndCount();
    return { data, total };
  }

  /**
   * Obtener una ruta por ID
   */
  async findOne(id: number): Promise<BusRoute> {
    const route = await this.routesRepository.findOne({
      where: { id },
    });

    if (!route) {
      throw new NotFoundException(`Ruta con ID ${id} no encontrada`);
    }

    return route;
  }

  /**
   * Obtener una ruta por código
   */
  async findByCode(code: string): Promise<BusRoute> {
    const route = await this.routesRepository.findOne({
      where: { code },
    });

    if (!route) {
      throw new NotFoundException(`Ruta con código ${code} no encontrada`);
    }

    return route;
  }

  /**
   * Crear nueva ruta
   */
  async create(createDto: CreateBusRouteDto): Promise<BusRoute> {
    // Verificar que el código no exista
    const existing = await this.routesRepository.findOne({
      where: { code: createDto.code },
    });

    if (existing) {
      throw new BadRequestException(`Ya existe una ruta con el código ${createDto.code}`);
    }

    const route = this.routesRepository.create(createDto);
    return await this.routesRepository.save(route);
  }

  /**
   * Actualizar ruta
   */
  async update(id: number, updateDto: UpdateBusRouteDto): Promise<BusRoute> {
    const route = await this.findOne(id);

    // Si se cambia el código, verificar que no exista
    if (updateDto.code && updateDto.code !== route.code) {
      const existing = await this.routesRepository.findOne({
        where: { code: updateDto.code },
      });

      if (existing) {
        throw new BadRequestException(`Ya existe una ruta con el código ${updateDto.code}`);
      }
    }

    Object.assign(route, updateDto);
    route.updated_at = new Date();

    return await this.routesRepository.save(route);
  }

  /**
   * Eliminar ruta (soft delete - marcar como inactiva)
   */
  async remove(id: number): Promise<void> {
    const route = await this.findOne(id);
    route.is_active = false;
    route.updated_at = new Date();
    await this.routesRepository.save(route);
  }

  /**
   * Eliminar ruta permanentemente
   */
  async hardDelete(id: number): Promise<void> {
    const route = await this.findOne(id);
    await this.routesRepository.remove(route);
  }

  /**
   * Obtener estadísticas de rutas
   */
  async getStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    byRouteType: Record<number, number>;
  }> {
    const [total, active, inactive] = await Promise.all([
      this.routesRepository.count(),
      this.routesRepository.count({ where: { is_active: true } }),
      this.routesRepository.count({ where: { is_active: false } }),
    ]);

    // Agrupar por tipo de ruta (GTFS)
    const byType = await this.routesRepository
      .createQueryBuilder('route')
      .select('route.route_type', 'type')
      .addSelect('COUNT(*)', 'count')
      .where('route.is_active = true')
      .groupBy('route.route_type')
      .getRawMany();

    const byRouteType: Record<number, number> = {};
    byType.forEach(item => {
      byRouteType[item.type] = parseInt(item.count);
    });

    return { total, active, inactive, byRouteType };
  }
}
