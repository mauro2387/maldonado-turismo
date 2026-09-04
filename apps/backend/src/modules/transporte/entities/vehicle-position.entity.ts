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

  // Empresa que publica el dato: 'codesa' | 'maldonado-turismo'
  @Column({ type: 'varchar', length: 50, nullable: true })
  operator: string | null;

  // Línea tal como la publica la empresa. Se conserva aunque no haya match
  // contra bus_routes, así la app puede mostrarla igual.
  @Column({ type: 'varchar', length: 20, nullable: true })
  line_code: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  line_name: string | null;

  @Column({ type: 'smallint', nullable: true })
  direction: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  plate: string | null;

  @Column({ type: 'boolean', nullable: true })
  accessible: boolean | null;

  @Column({ type: 'smallint', nullable: true })
  occupancy_pct: number | null;

  // Minutos de desvío respecto al horario: negativo = atrasado
  @Column({ type: 'smallint', nullable: true })
  schedule_deviation_min: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  prev_stop_code: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  prev_stop_name: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  next_stop_code: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  next_stop_name: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  departure_time: string | null;

  // Momento del reporte GPS según la empresa
  @Column({ type: 'timestamptz', nullable: true })
  fix_time: Date | null;

  // Momento en que lo guardamos nosotros
  @CreateDateColumn({ type: 'timestamptz' })
  recorded_at: Date;
}
