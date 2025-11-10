import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { TransportAlert } from './entities/transport-alert.entity';
import { CreateTransportAlertDto, UpdateTransportAlertDto } from './dto/transport-alert.dto';

@Injectable()
export class TransportAlertsService {
  constructor(
    @InjectRepository(TransportAlert)
    private readonly alertsRepository: Repository<TransportAlert>,
  ) {}

  /**
   * Obtener todas las alertas con filtros
   */
  async findAll(filters?: {
    is_active?: boolean;
    route_id?: number;
    stop_id?: number;
    severity?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: TransportAlert[]; total: number }> {
    const query = this.alertsRepository.createQueryBuilder('alert');

    if (filters?.is_active !== undefined) {
      query.andWhere('alert.is_active = :is_active', { is_active: filters.is_active });
    }

    if (filters?.route_id) {
      query.andWhere('alert.route_id = :route_id', { route_id: filters.route_id });
    }

    if (filters?.stop_id) {
      query.andWhere('alert.stop_id = :stop_id', { stop_id: filters.stop_id });
    }

    if (filters?.severity) {
      query.andWhere('alert.severity = :severity', { severity: filters.severity });
    }

    if (filters?.limit) {
      query.limit(filters.limit);
    }
    if (filters?.offset) {
      query.offset(filters.offset);
    }

    query.orderBy('alert.effective_from', 'DESC');

    const [data, total] = await query.getManyAndCount();
    return { data, total };
  }

  /**
   * Obtener alertas activas vigentes
   */
  async findActive(): Promise<TransportAlert[]> {
    try {
      const now = new Date();
      
      // Usar find simple en lugar de query builder para evitar problemas de metadata
      const allAlerts = await this.alertsRepository.find({
        where: { is_active: true },
        order: { created_at: 'DESC' }
      });

      // Filtrar alertas vigentes por fecha
      return allAlerts.filter(alert => {
        const isAfterStart = new Date(alert.effective_from) <= now;
        const isBeforeEnd = !alert.effective_to || new Date(alert.effective_to) >= now;
        return isAfterStart && isBeforeEnd;
      });
    } catch (error) {
      console.error('Error fetching active alerts:', error);
      // Retornar array vacío en caso de error en lugar de fallar
      return [];
    }
  }

  /**
   * Obtener una alerta por ID
   */
  async findOne(id: number): Promise<TransportAlert> {
    const alert = await this.alertsRepository.findOne({ where: { id } });

    if (!alert) {
      throw new NotFoundException(`Alerta con ID ${id} no encontrada`);
    }

    return alert;
  }

  /**
   * Crear nueva alerta
   */
  async create(createDto: CreateTransportAlertDto, createdBy?: number): Promise<TransportAlert> {
    const alert = this.alertsRepository.create({
      ...createDto,
      created_by: createdBy,
    });

    return await this.alertsRepository.save(alert);
  }

  /**
   * Actualizar alerta
   */
  async update(id: number, updateDto: UpdateTransportAlertDto): Promise<TransportAlert> {
    const alert = await this.findOne(id);

    Object.assign(alert, updateDto);
    alert.updated_at = new Date();

    return await this.alertsRepository.save(alert);
  }

  /**
   * Desactivar alerta
   */
  async deactivate(id: number): Promise<void> {
    const alert = await this.findOne(id);
    alert.is_active = false;
    alert.updated_at = new Date();
    await this.alertsRepository.save(alert);
  }

  /**
   * Eliminar permanentemente
   */
  async remove(id: number): Promise<void> {
    const alert = await this.findOne(id);
    await this.alertsRepository.remove(alert);
  }

  /**
   * Obtener estadísticas
   */
  async getStats(): Promise<{
    total: number;
    active: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
  }> {
    const now = new Date();

    const [total, active] = await Promise.all([
      this.alertsRepository.count(),
      this.alertsRepository
        .createQueryBuilder('alert')
        .where('alert.is_active = true')
        .andWhere('alert.effective_from <= :now', { now })
        .andWhere('(alert.effective_to IS NULL OR alert.effective_to >= :now)', { now })
        .getCount(),
    ]);

    const bySeverityRaw = await this.alertsRepository
      .createQueryBuilder('alert')
      .select('alert.severity', 'severity')
      .addSelect('COUNT(*)', 'count')
      .where('alert.is_active = true')
      .groupBy('alert.severity')
      .getRawMany();

    const bySeverity: Record<string, number> = {};
    bySeverityRaw.forEach(item => {
      bySeverity[item.severity] = parseInt(item.count);
    });

    const byTypeRaw = await this.alertsRepository
      .createQueryBuilder('alert')
      .select('alert.alert_type', 'type')
      .addSelect('COUNT(*)', 'count')
      .where('alert.is_active = true')
      .andWhere('alert.alert_type IS NOT NULL')
      .groupBy('alert.alert_type')
      .getRawMany();

    const byType: Record<string, number> = {};
    byTypeRaw.forEach(item => {
      byType[item.type] = parseInt(item.count);
    });

    return { total, active, bySeverity, byType };
  }
}
