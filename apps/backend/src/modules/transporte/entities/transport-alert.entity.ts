import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BusRoute } from './bus-route.entity';
import { BusStop } from './bus-stop.entity';

@Entity('transport_alerts')
export class TransportAlert {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'varchar', length: 20, default: 'info' })
  severity: string; // info, warning, danger

  @Column({ type: 'varchar', length: 50, nullable: true })
  alert_type: string; // detour, delay, construction, accident

  @Column({ type: 'integer', nullable: true })
  route_id: number;

  @Column({ type: 'integer', nullable: true })
  stop_id: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  affected_zone: string;

  @Column({ type: 'timestamp' })
  effective_from: Date;

  @Column({ type: 'timestamp', nullable: true })
  effective_to: Date;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'integer', nullable: true })
  created_by: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Relaciones
  @ManyToOne(() => BusRoute, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'route_id' })
  route: BusRoute;

  @ManyToOne(() => BusStop, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'stop_id' })
  stop: BusStop;
}
