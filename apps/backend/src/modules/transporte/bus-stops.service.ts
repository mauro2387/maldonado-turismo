import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusStop } from './entities/bus-stop.entity';
import { CreateBusStopDto, UpdateBusStopDto, FindNearbyStopsDto } from './dto/bus-stop.dto';

@Injectable()
export class BusStopsService {
  constructor(
    @InjectRepository(BusStop)
    private readonly stopsRepository: Repository<BusStop>,
  ) {}

  /**
   * Obtener todas las paradas con filtros
   */
  async findAll(filters?: {
    is_active?: boolean;
    zone?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: BusStop[]; total: number }> {
    const query = this.stopsRepository.createQueryBuilder('stop');

    if (filters?.is_active !== undefined) {
      query.andWhere('stop.is_active = :is_active', { is_active: filters.is_active });
    }

    if (filters?.zone) {
      query.andWhere('stop.zone = :zone', { zone: filters.zone });
    }

    if (filters?.search) {
      query.andWhere(
        '(stop.code ILIKE :search OR stop.name ILIKE :search OR stop.description ILIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    if (filters?.limit) {
      query.limit(filters.limit);
    }
    if (filters?.offset) {
      query.offset(filters.offset);
    }

    query.orderBy('stop.name', 'ASC');

    const [data, total] = await query.getManyAndCount();
    return { data, total };
  }

  /**
   * Obtener una parada por ID
   */
  async findOne(id: number): Promise<BusStop> {
    const stop = await this.stopsRepository.findOne({ where: { id } });

    if (!stop) {
      throw new NotFoundException(`Parada con ID ${id} no encontrada`);
    }

    return stop;
  }

  /**
   * Obtener parada por código
   */
  async findByCode(code: string): Promise<BusStop> {
    const stop = await this.stopsRepository.findOne({ where: { code } });

    if (!stop) {
      throw new NotFoundException(`Parada con código ${code} no encontrada`);
    }

    return stop;
  }

  /**
   * Buscar paradas cercanas (usando cálculo simple de distancia)
   */
  async findNearby(dto: FindNearbyStopsDto): Promise<BusStop[]> {
    const radius = dto.radius || 500; // metros por defecto
    const radiusInDegrees = radius / 111320; // Aproximación: 1 grado ≈ 111.32 km

    const stops = await this.stopsRepository
      .createQueryBuilder('stop')
      .where('stop.is_active = true')
      .andWhere(
        `(6371000 * acos(cos(radians(:lat)) * cos(radians(stop.lat)) * cos(radians(stop.lng) - radians(:lng)) + sin(radians(:lat)) * sin(radians(stop.lat)))) <= :radius`,
        { lat: dto.lat, lng: dto.lng, radius }
      )
      .orderBy(
        `(6371000 * acos(cos(radians(:lat)) * cos(radians(stop.lat)) * cos(radians(stop.lng) - radians(:lng)) + sin(radians(:lat)) * sin(radians(stop.lat))))`,
        'ASC'
      )
      .setParameters({ lat: dto.lat, lng: dto.lng })
      .limit(20)
      .getMany();

    return stops;
  }

  /**
   * Buscar paradas en un bounding box (para mapa)
   */
  async findInBbox(bbox: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  }): Promise<BusStop[]> {
    return await this.stopsRepository
      .createQueryBuilder('stop')
      .where('stop.is_active = true')
      .andWhere('stop.lat BETWEEN :minLat AND :maxLat', {
        minLat: bbox.minLat,
        maxLat: bbox.maxLat,
      })
      .andWhere('stop.lng BETWEEN :minLng AND :maxLng', {
        minLng: bbox.minLng,
        maxLng: bbox.maxLng,
      })
      .limit(200)
      .getMany();
  }

  /**
   * Crear nueva parada
   */
  async create(createDto: CreateBusStopDto): Promise<BusStop> {
    if (createDto.code) {
      const existing = await this.stopsRepository.findOne({
        where: { code: createDto.code },
      });

      if (existing) {
        throw new BadRequestException(`Ya existe una parada con el código ${createDto.code}`);
      }
    }

    const stop = this.stopsRepository.create(createDto);
    return await this.stopsRepository.save(stop);
  }

  /**
   * Actualizar parada
   */
  async update(id: number, updateDto: UpdateBusStopDto): Promise<BusStop> {
    const stop = await this.findOne(id);

    if (updateDto.code && updateDto.code !== stop.code) {
      const existing = await this.stopsRepository.findOne({
        where: { code: updateDto.code },
      });

      if (existing) {
        throw new BadRequestException(`Ya existe una parada con el código ${updateDto.code}`);
      }
    }

    Object.assign(stop, updateDto);
    stop.updated_at = new Date();

    return await this.stopsRepository.save(stop);
  }

  /**
   * Eliminar parada (soft delete)
   */
  async remove(id: number): Promise<void> {
    const stop = await this.findOne(id);
    stop.is_active = false;
    stop.updated_at = new Date();
    await this.stopsRepository.save(stop);
  }

  /**
   * Eliminar permanentemente
   */
  async hardDelete(id: number): Promise<void> {
    const stop = await this.findOne(id);
    await this.stopsRepository.remove(stop);
  }

  /**
   * Qué tan bien ubicado está el catálogo.
   *
   * `spread_m` mide precisión (cuán juntas están las muestras) y `accuracy_m`
   * mide exactitud (cuán cerca está la respuesta de la parada de verdad,
   * calibrada contra OpenStreetMap). Sólo la segunda dice si se puede mandar a
   * alguien a esperar ahí, y es la que hay que mirar para saber si un cambio en
   * el estimador mejoró o empeoró las cosas.
   */
  async quality(): Promise<{
    total: number;
    porFuente: Array<{ fuente: string; paradas: number; errorMediano: number | null }>;
    esquinaNombrable: number;
    aproximadas: number;
    sinUbicar: number;
    conRefugio: number;
  }> {
    const porFuente = await this.stopsRepository.query(
      `SELECT coalesce(fix_source, 'sin ubicar')                    AS fuente,
              count(*)::int                                          AS paradas,
              percentile_disc(0.5) WITHIN GROUP (ORDER BY accuracy_m)::int AS error_mediano
         FROM bus_stops
        WHERE is_active
        GROUP BY 1
        ORDER BY paradas DESC`,
    );

    const [totales] = await this.stopsRepository.query(
      `SELECT count(*)::int                                              AS total,
              count(*) FILTER (WHERE accuracy_m <= 60)::int              AS nombrable,
              count(*) FILTER (WHERE accuracy_m > 60)::int               AS aproximadas,
              count(*) FILTER (WHERE accuracy_m IS NULL)::int            AS sin_ubicar,
              count(*) FILTER (WHERE osm_node_id IS NOT NULL)::int       AS con_osm
         FROM bus_stops
        WHERE is_active`,
    );

    return {
      total: totales.total,
      porFuente: porFuente.map((row: any) => ({
        fuente: row.fuente,
        paradas: row.paradas,
        errorMediano: row.error_mediano,
      })),
      esquinaNombrable: totales.nombrable,
      aproximadas: totales.aproximadas,
      sinUbicar: totales.sin_ubicar,
      conRefugio: totales.con_osm,
    };
  }

  /**
   * Obtener estadísticas
   */
  async getStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    byZone: Record<string, number>;
    withShelter: number;
    withAccessibility: number;
  }> {
    const [total, active, inactive, withShelter, withAccessibility] = await Promise.all([
      this.stopsRepository.count(),
      this.stopsRepository.count({ where: { is_active: true } }),
      this.stopsRepository.count({ where: { is_active: false } }),
      this.stopsRepository.count({ where: { has_shelter: true, is_active: true } }),
      this.stopsRepository.count({ where: { accessibility: true, is_active: true } }),
    ]);

    const byZoneRaw = await this.stopsRepository
      .createQueryBuilder('stop')
      .select('stop.zone', 'zone')
      .addSelect('COUNT(*)', 'count')
      .where('stop.is_active = true')
      .andWhere('stop.zone IS NOT NULL')
      .groupBy('stop.zone')
      .getRawMany();

    const byZone: Record<string, number> = {};
    byZoneRaw.forEach(item => {
      byZone[item.zone] = parseInt(item.count);
    });

    return { total, active, inactive, byZone, withShelter, withAccessibility };
  }
}
