import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('service_calendars')
export class ServiceCalendar {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  service_id: string;

  @Column({ type: 'boolean', default: false })
  monday: boolean;

  @Column({ type: 'boolean', default: false })
  tuesday: boolean;

  @Column({ type: 'boolean', default: false })
  wednesday: boolean;

  @Column({ type: 'boolean', default: false })
  thursday: boolean;

  @Column({ type: 'boolean', default: false })
  friday: boolean;

  @Column({ type: 'boolean', default: false })
  saturday: boolean;

  @Column({ type: 'boolean', default: false })
  sunday: boolean;

  @Column({ type: 'date' })
  start_date: Date;

  @Column({ type: 'date' })
  end_date: Date;

  @Column({ type: 'text', nullable: true })
  description: string;

  @CreateDateColumn()
  created_at: Date;
}
