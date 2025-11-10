import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { RouteStop } from './route-stop.entity';
import { StopTime } from './stop-time.entity';

@Entity('bus_stops')
export class BusStop {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20, unique: true, nullable: true })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 8 })
  lat: number;

  @Column({ type: 'decimal', precision: 11, scale: 8 })
  lng: number;

  // PostGIS geography column (auto-generada por trigger en BD)
  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
    select: false
  })
  location: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  zone: string;

  @Column({ type: 'boolean', default: false })
  has_shelter: boolean;

  @Column({ type: 'boolean', default: false })
  has_bench: boolean;

  @Column({ type: 'boolean', default: false })
  has_lighting: boolean;

  @Column({ type: 'boolean', default: false })
  accessibility: boolean;

  @Column({ type: 'integer', nullable: true })
  qr_code_id: number;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Relaciones
  @OneToMany(() => RouteStop, routeStop => routeStop.stop)
  route_stops: RouteStop[];

  @OneToMany(() => StopTime, stopTime => stopTime.stop)
  stop_times: StopTime[];
}
