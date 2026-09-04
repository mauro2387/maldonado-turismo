import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Lectura de paradas tolerante al esquema.
 *
 * La base tiene hoy la versión vieja de `bus_stops` —id, name, address, lat,
 * lng— mientras que las entidades TypeORM describen la versión de la migración
 * `2025-11-09-transport-module-complete.sql`, con code, zone, is_active y los
 * servicios de la parada. Esa migración nunca se aplicó a esta base.
 *
 * Consultar por entidad contra el esquema viejo hace fallar el pedido entero
 * con un 500. Este servicio mira una vez qué columnas existen de verdad y arma
 * el SELECT con esas: funciona con el esquema actual y sigue funcionando —
 * devolviendo más datos— en cuanto se corra la migración.
 */

export interface StopRecord {
  id: number;
  code: string | null;
  name: string;
  zone: string | null;
  lat: number;
  lng: number;
  has_shelter: boolean;
  has_bench: boolean;
  has_lighting: boolean;
  accessibility: boolean;

  /**
   * Qué tan firme es la posición de la parada.
   *
   * `placement` dice cómo se calculó: 'recorrido' es apoyada sobre el trazo de
   * la línea -está sobre la calle por construcción- y null es la estimación
   * vieja, el punto medio entre dos posiciones, que puede caer adentro de la
   * manzana. `spread_m` es cuánta calle queda sin descartar.
   *
   * Importa para el planificador: mandar a alguien a caminar cuatro cuadras
   * hasta un punto que no es una parada es peor que no ofrecer ese viaje.
   */
  placement: string | null;
  spread_m: number | null;
  samples: number | null;

  /**
   * Radio en metros dentro del cual está la parada de verdad.
   *
   * Es lo que hay que mirar para decidir si se manda a alguien a esperar acá,
   * y no `spread_m`: la dispersión dice cuán juntas están las muestras
   * (precisión) y esto dice cuán lejos está la respuesta de la parada de
   * verdad (exactitud), calibrado contra los nodos relevados de
   * OpenStreetMap. Una parada puede tener las muestras muy juntas y estar
   * igual en la cuadra equivocada.
   */
  accuracy_m: number | null;

  /** De dónde salió la coordenada: osm, detenciones, intervalo, manual. */
  fix_source: string | null;
}

/** Columnas que puede o no tener la tabla, según si se corrió la migración. */
const OPTIONAL_COLUMNS = [
  'code',
  'zone',
  'address',
  'has_shelter',
  'has_bench',
  'has_lighting',
  'accessibility',
  'is_active',
  'placement',
  'spread_m',
  'samples',
  'accuracy_m',
  'fix_source',
] as const;

@Injectable()
export class StopsReaderService implements OnModuleInit {
  private readonly logger = new Logger(StopsReaderService.name);

  private available = new Set<string>();
  private introspected = false;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onModuleInit() {
    await this.introspect();
  }

  private async introspect(): Promise<void> {
    if (this.introspected) return;

    try {
      const rows = await this.dataSource.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'bus_stops' AND table_schema = current_schema()`,
      );
      this.available = new Set(rows.map((row: any) => row.column_name));
      this.introspected = true;

      const missing = OPTIONAL_COLUMNS.filter((column) => !this.available.has(column));
      if (missing.length > 0) {
        this.logger.warn(
          `bus_stops sin las columnas ${missing.join(', ')}: la migración del módulo de transporte no está aplicada`,
        );
      }
    } catch (error: any) {
      this.logger.error(`No se pudo leer el esquema de bus_stops: ${error?.message ?? error}`);
    }
  }

  private column(name: string, fallback: string): string {
    return this.available.has(name) ? name : `${fallback} AS ${name}`;
  }

  private selectList(): string {
    return [
      'id',
      'name',
      'lat',
      'lng',
      this.column('code', 'NULL::text'),
      this.column('zone', this.available.has('address') ? 'address' : 'NULL::text'),
      this.column('has_shelter', 'false'),
      this.column('has_bench', 'false'),
      this.column('has_lighting', 'false'),
      this.column('accessibility', 'false'),
      this.column('placement', 'NULL::text'),
      this.column('spread_m', 'NULL::int'),
      this.column('samples', 'NULL::int'),
      this.column('accuracy_m', 'NULL::int'),
      this.column('fix_source', 'NULL::text'),
    ].join(', ');
  }

  private get activeFilter(): string {
    return this.available.has('is_active') ? 'WHERE is_active = true' : '';
  }

  private normalize(row: any): StopRecord {
    return {
      id: Number(row.id),
      code: row.code ?? null,
      name: row.name,
      zone: row.zone ?? null,
      lat: Number(row.lat),
      lng: Number(row.lng),
      has_shelter: row.has_shelter === true,
      has_bench: row.has_bench === true,
      has_lighting: row.has_lighting === true,
      accessibility: row.accessibility === true,
      placement: row.placement ?? null,
      spread_m: row.spread_m === null || row.spread_m === undefined ? null : Number(row.spread_m),
      samples: row.samples === null || row.samples === undefined ? null : Number(row.samples),
      accuracy_m:
        row.accuracy_m === null || row.accuracy_m === undefined ? null : Number(row.accuracy_m),
      fix_source: row.fix_source ?? null,
    };
  }

  /** Todas las paradas activas. */
  async findAll(): Promise<StopRecord[]> {
    await this.introspect();

    try {
      const rows = await this.dataSource.query(
        `SELECT ${this.selectList()} FROM bus_stops ${this.activeFilter}`,
      );
      return rows
        .map((row: any) => this.normalize(row))
        .filter((stop: StopRecord) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
    } catch (error: any) {
      this.logger.error(`No se pudieron leer las paradas: ${error?.message ?? error}`);
      return [];
    }
  }

  /**
   * Paradas dentro de un radio, ordenadas por cercanía.
   *
   * El filtro por caja se aplica antes que la distancia esférica para que el
   * motor pueda usar el índice sobre lat/lng en vez de recorrer la tabla
   * calculando cosenos.
   */
  async findNearby(lat: number, lng: number, radiusMeters: number, limit = 15): Promise<
    Array<StopRecord & { distance_m: number }>
  > {
    await this.introspect();

    const latDelta = radiusMeters / 111320;
    const lngDelta = radiusMeters / (111320 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));

    try {
      const rows = await this.dataSource.query(
        `
        SELECT ${this.selectList()},
               6371000 * acos(
                 least(1, greatest(-1,
                   cos(radians($1)) * cos(radians(lat)) * cos(radians(lng) - radians($2))
                   + sin(radians($1)) * sin(radians(lat))
                 ))
               ) AS distance_m
        FROM bus_stops
        WHERE lat BETWEEN $3 AND $4
          AND lng BETWEEN $5 AND $6
          ${this.available.has('is_active') ? 'AND is_active = true' : ''}
        ORDER BY distance_m ASC
        LIMIT $7
      `,
        [
          lat,
          lng,
          lat - latDelta,
          lat + latDelta,
          lng - lngDelta,
          lng + lngDelta,
          limit,
        ],
      );

      return rows
        .map((row: any) => ({ ...this.normalize(row), distance_m: Math.round(Number(row.distance_m)) }))
        .filter((stop: StopRecord & { distance_m: number }) => stop.distance_m <= radiusMeters);
    } catch (error: any) {
      this.logger.error(`No se pudieron buscar paradas cercanas: ${error?.message ?? error}`);
      return [];
    }
  }

  /** Cuántas paradas hay cargadas. Sirve para explicar por qué no hay ETAs. */
  async count(): Promise<number> {
    await this.introspect();
    try {
      const rows = await this.dataSource.query(
        `SELECT count(*)::int AS total FROM bus_stops ${this.activeFilter}`,
      );
      return rows[0]?.total ?? 0;
    } catch {
      return 0;
    }
  }
}
