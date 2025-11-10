import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BusRoute } from './bus-route.entity';

@Entity('route_geometries')
export class RouteGeometry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  route_id: number;

  @Column({ type: 'smallint', default: 0 })
  direction: number; // 0=ida, 1=vuelta

  // PostGIS geometry column
  @Column({
    type: 'geography',
    spatialFeatureType: 'LineString',
    srid: 4326,
    nullable: false
  })
  geometry: string; // GeoJSON LineString

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  distance_km: number;

  @CreateDateColumn()
  created_at: Date;

  // Relación
  @ManyToOne(() => BusRoute, route => route.geometries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'route_id' })
  route: BusRoute;
}
