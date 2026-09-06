import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { RouteGeometry } from './route-geometry.entity';
import { RouteStop } from './route-stop.entity';
import { BusTrip } from './bus-trip.entity';

@Entity('bus_routes')
export class BusRoute {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'smallint', default: 3 })
  route_type: number; // 3=bus, 0=tram, 1=metro (GTFS)

  @Column({ type: 'varchar', length: 6, default: 'FF5722' })
  color: string;

  @Column({ type: 'varchar', length: 6, default: 'FFFFFF' })
  text_color: string;

  @Column({ type: 'varchar', length: 100, default: 'Intendencia de Maldonado' })
  agency: string;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'integer', nullable: true })
  frequency_minutes: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  fare_price: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Relaciones
  @OneToMany(() => RouteGeometry, geometry => geometry.route, { cascade: true })
  geometries: RouteGeometry[];

  @OneToMany(() => RouteStop, routeStop => routeStop.route)
  route_stops: RouteStop[];

  @OneToMany(() => BusTrip, trip => trip.route)
  trips: BusTrip[];
}
