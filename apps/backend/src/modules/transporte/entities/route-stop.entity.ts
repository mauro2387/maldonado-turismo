import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BusRoute } from './bus-route.entity';
import { BusStop } from './bus-stop.entity';

@Entity('route_stops')
@Unique(['route_id', 'direction', 'stop_sequence'])
export class RouteStop {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  route_id: number;

  @Column({ type: 'integer' })
  stop_id: number;

  @Column({ type: 'smallint', default: 0 })
  direction: number; // 0=ida, 1=vuelta

  @Column({ type: 'integer' })
  stop_sequence: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  distance_from_start_km: number;

  @CreateDateColumn()
  created_at: Date;

  // Relaciones
  @ManyToOne(() => BusRoute, route => route.route_stops, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'route_id' })
  route: BusRoute;

  @ManyToOne(() => BusStop, stop => stop.route_stops, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stop_id' })
  stop: BusStop;
}
