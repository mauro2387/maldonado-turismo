import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BusRoute } from './bus-route.entity';
import { ServiceCalendar } from './service-calendar.entity';
import { StopTime } from './stop-time.entity';

@Entity('bus_trips')
export class BusTrip {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  route_id: number;

  @Column({ type: 'varchar', length: 50 })
  service_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  trip_headsign: string;

  @Column({ type: 'smallint', default: 0 })
  direction: number; // 0=ida, 1=vuelta

  @Column({ type: 'varchar', length: 50, nullable: true })
  block_id: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  vehicle_id: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  created_at: Date;

  // Relaciones
  @ManyToOne(() => BusRoute, route => route.trips, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'route_id' })
  route: BusRoute;

  @ManyToOne(() => ServiceCalendar, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_id', referencedColumnName: 'service_id' })
  service: ServiceCalendar;

  @OneToMany(() => StopTime, stopTime => stopTime.trip, { cascade: true })
  stop_times: StopTime[];
}
