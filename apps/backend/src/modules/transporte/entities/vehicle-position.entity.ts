import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { BusRoute } from './bus-route.entity';

@Entity('vehicle_positions')
export class VehiclePosition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  vehicle_id: string;

  @Column({ type: 'integer', nullable: true })
  route_id: number | null;

  @Column({ type: 'double precision' })
  latitude: number;

  @Column({ type: 'double precision' })
  longitude: number;

  @Column({ type: 'double precision', nullable: true })
  heading: number | null;

  @Column({ type: 'double precision', nullable: true })
  speed: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  recorded_at: Date;
}
