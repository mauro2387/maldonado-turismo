import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { QrCode } from './qr-code.entity';

@Entity('qr_scans')
export class QrScan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer' })
  qr_code_id: number;

  @CreateDateColumn()
  scanned_at: Date;

  @Column({ type: 'text', nullable: true })
  user_agent: string;

  @Column({ type: 'inet', nullable: true })
  ip_address: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  geoip_city: string;

  @Column({ type: 'varchar', length: 2, nullable: true })
  geoip_country: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  device_type: string; // mobile, tablet, desktop

  @Column({ type: 'varchar', length: 5, default: 'es' })
  language: string;

  @Column({ type: 'text', nullable: true })
  referer: string;

  // Relación
  @ManyToOne(() => QrCode, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'qr_code_id' })
  qr_code: QrCode;
}
