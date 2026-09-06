import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BusTrip } from './bus-trip.entity';
import { BusStop } from './bus-stop.entity';

@Entity('stop_times')
@Unique(['trip_id', 'stop_sequence'])
export class StopTime {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  trip_id: number;

  @Column({ type: 'integer' })
  stop_id: number;

  @Column({ type: 'integer' })
  stop_sequence: number;

  @Column({ type: 'time' })
  arrival_time: string;

  @Column({ type: 'time' })
  departure_time: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  stop_headsign: string;

  @Column({ type: 'smallint', default: 0 })
  pickup_type: number; // 0=regular, 1=no hay subida

  @Column({ type: 'smallint', default: 0 })
  drop_off_type: number; // 0=regular, 1=no hay bajada

  @Column({ type: 'smallint', default: 1 })
  timepoint: number; // 1=horario exacto, 0=aproximado

  // Relaciones
  @ManyToOne(() => BusTrip, trip => trip.stop_times, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip: BusTrip;

  @ManyToOne(() => BusStop, stop => stop.stop_times, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stop_id' })
  stop: BusStop;
}
