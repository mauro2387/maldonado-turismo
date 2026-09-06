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

  // ---------------------------------------------------------------------------
  // Procedencia
  //
  // Una parada cargada a mano por la Intendencia y una deducida del feed AVL de
  // las empresas no valen lo mismo, y la reconstrucción diaria solo pisa las
  // segundas. Ver stop-catalog.service.ts.
  // ---------------------------------------------------------------------------

  /** 'manual' | 'avl' | 'placeholder'. */
  @Column({ type: 'varchar', length: 16, default: 'manual' })
  source: string;

  /** Empresas cuyo feed reporta esta parada. */
  @Column({ type: 'text', array: true, nullable: true })
  operators: string[];

  /** Cruces registrados que sostienen la coordenada. */
  @Column({ type: 'integer', nullable: true })
  samples: number;

  /** Dispersión p90-p10 de esos cruces, en metros. A más chico, mejor. */
  @Column({ type: 'integer', nullable: true })
  spread_m: number;

  /**
   * Radio en metros dentro del cual está la parada de verdad.
   *
   * **No es `spread_m`.** La dispersión dice cuán juntas están las muestras
   * (precisión); esto dice cuán lejos puede estar la respuesta de la parada
   * real (exactitud), calibrado contra los nodos relevados de OpenStreetMap.
   * Una parada puede tener las muestras muy juntas y estar igual en la cuadra
   * equivocada, y sólo este número lo detecta.
   *
   * Es lo que decide si la pantalla puede decir "esperá acá" o tiene que decir
   * "la parada está por acá": con más de 60 m no se puede nombrar la esquina.
   */
  @Column({ type: 'integer', nullable: true })
  accuracy_m: number;

  /**
   * De dónde salió la coordenada, de más a menos firme: 'manual' (corregida a
   * mano), 'osm' (nodo relevado que coincide con lo medido), 'detenciones'
   * (mediana de ómnibus vistos frenando ahí), 'intervalo' (interpolada).
   */
  @Column({ type: 'varchar', length: 24, nullable: true })
  fix_source: string;

  /** El nodo de OpenStreetMap del que salió, para poder volver a la fuente. */
  @Column({ type: 'bigint', nullable: true })
  osm_node_id: string;

  /** Cuándo se recalculó la posición por última vez. */
  @Column({ type: 'timestamptz', nullable: true })
  fixed_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  avl_updated_at: Date;

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
