import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('qr_codes')
export class QrCode {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20 })
  target_type: string; // "stop", "route", "event", "place"

  @Column({ type: 'integer' })
  target_id: number;

  @Column({ type: 'varchar', length: 20, unique: true })
  short_code: string;

  @Column({ type: 'text' })
  signed_url: string;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'integer', nullable: true })
  created_by: number;

  @CreateDateColumn()
  created_at: Date;

  @Column({ type: 'timestamp', nullable: true })
  expires_at: Date;
}
