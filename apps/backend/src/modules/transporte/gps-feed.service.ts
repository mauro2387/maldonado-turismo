import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FeedHealthService } from './feed-health.service';
import { VehiclePositionInput, VehiclePositionsService } from './vehicle-positions.service';

/**
 * Ingesta de las posiciones en tiempo real que publican las empresas de
 * ómnibus de Maldonado.
 *
 * CODESA y Maldonado Turismo usan el mismo sistema AVL (BTK Server) y ambas
 * exponen un XML plano con la flota en calle. Este servicio lo consulta cada
 * pocos segundos, lo normaliza y lo guarda en vehicle_positions, que es de
 * donde ya lee el mapa en vivo del frontend.
 *
 * Dos cosas a tener presentes:
 *
 * - Los feeds son HTTP sin CORS, así que la ingesta tiene que ser desde el
 *   backend. El navegador no puede consultarlos directo.
 * - El feed de Maldonado Turismo publica id y nombre del conductor (con/cnm).
 *   Son datos personales: no se leen, no se guardan y no se exponen
 *   (Ley 18.331 de Protección de Datos Personales).
 */

interface FeedSource {
  operator: string;
  url: string;
}

/** Uruguay no aplica horario de verano desde 2015, el offset es fijo. */
const UY_UTC_OFFSET = '-03:00';

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

/**
 * Las tres empresas que publican AVL, sin la dirección de sus servidores.
 *
 * Los endpoints no viajan en el código: son infraestructura de las empresas
 * -DNS dinámico sobre la conexión de sus oficinas- y su uso está sujeto al
 * acuerdo con cada una. Se configuran por entorno (ver FEED_URL_ENV_VARS); el
 * feed que no tenga URL queda filtrado y sencillamente no se consulta.
 *
 * Maldonado Turismo y Micro son del mismo grupo y comparten servidor AVL: una
 * instancia por empresa, en puertos consecutivos.
 */
const DEFAULT_FEEDS: FeedSource[] = [
  { operator: 'codesa', url: '' },
  { operator: 'maldonado-turismo', url: '' },
  { operator: 'micro', url: '' },
];

/** Variable de entorno que sobreescribe la URL del feed de cada empresa. */
const FEED_URL_ENV_VARS: Record<string, string> = {
  codesa: 'GPS_FEED_CODESA_URL',
  'maldonado-turismo': 'GPS_FEED_MALDONADO_TURISMO_URL',
  micro: 'GPS_FEED_MICRO_URL',
};

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return String.fromCodePoint(parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith('#')) {
      return String.fromCodePoint(parseInt(entity.slice(1), 10));
    }
    return XML_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/**
 * El XML es una lista plana de <marker> con hijos de un solo nivel y sin
 * atributos, así que no hace falta arrastrar un parser completo.
 */
export function parseAvlMarkers(xml: string): Record<string, string>[] {
  const markers: Record<string, string>[] = [];
  const markerPattern = /<marker>([\s\S]*?)<\/marker>/g;

  let markerMatch: RegExpExecArray | null;
  while ((markerMatch = markerPattern.exec(xml)) !== null) {
    const fields: Record<string, string> = {};
    // Contempla tanto <tag>valor</tag> como los <tag/> vacíos que aparecen
    // cuando un coche no tiene matrícula cargada.
    const fieldPattern = /<(\w+)>([\s\S]*?)<\/\1>|<(\w+)\s*\/>/g;

    let fieldMatch: RegExpExecArray | null;
    while ((fieldMatch = fieldPattern.exec(markerMatch[1])) !== null) {
      if (fieldMatch[3]) {
        fields[fieldMatch[3]] = '';
      } else {
        fields[fieldMatch[1]] = decodeEntities(fieldMatch[2]).trim();
      }
    }

    if (Object.keys(fields).length > 0) markers.push(fields);
  }

  return markers;
}

function toNumber(value?: string): number | null {
  if (value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toText(value?: string): string | null {
  return value === undefined || value === '' ? null : value;
}

/** `fec` viene como dd/mm/yyyy y `hor` como HH:MM:SS, en hora local. */
export function parseFixTime(fec?: string, hor?: string): Date | null {
  if (!fec || !hor) return null;

  const [day, month, year] = fec.split('/');
  if (!day || !month || !year) return null;

  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hor}${UY_UTC_OFFSET}`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;

  // Los feeds mandan de a ratos fechas corruptas (se vio un fix fechado en
  // 2007). Si se guardaran tal cual, la posición quedaría fuera de la ventana
  // de frescura y el ómnibus desaparecería del mapa. Ante una fecha
  // implausible conviene devolver null: recorded_at hace de respaldo.
  const deltaMs = Date.now() - parsed.getTime();
  const isPlausible = deltaMs > -ONE_HOUR_MS && deltaMs < ONE_DAY_MS;
  return isPlausible ? parsed : null;
}

/**
 * Traduce un <marker> del feed a nuestra forma. Devuelve null si le falta lo
 * mínimo indispensable (posición y número de coche).
 */
export function normalizeMarker(
  marker: Record<string, string>,
  operator: string,
  routeIdsByCode: Map<string, number>,
): VehiclePositionInput | null {
  const latitude = toNumber(marker.lat);
  const longitude = toNumber(marker.lon);
  const bus = toText(marker.bus);

  if (latitude === null || longitude === null || !bus) return null;

  const lineCode = toText(marker.lin);

  return {
    // Los números de coche se repiten entre empresas, así que el prefijo es
    // lo que mantiene único el vehicle_id.
    vehicle_id: `${operator}-${bus}`,
    route_id: lineCode ? routeIdsByCode.get(lineCode) ?? null : null,
    latitude,
    longitude,
    heading: toNumber(marker.rum),
    speed: toNumber(marker.vel),
    operator,
    line_code: lineCode,
    line_name: toText(marker.lnm),
    direction: toNumber(marker.sen),
    // `tra` es el recorrido concreto que hace la unidad dentro de su línea, y
    // es el campo que separa ida de vuelta y las variantes por distintas
    // calles. `sen`, que parecía el sentido, llega siempre en 1 en las tres
    // empresas. Se ve cruzándolo con el destino que publica `lnm`:
    //
    //   lin=24  tra=3 -> "P. DEL ESTE DE VIAL"   tra=5 -> "P. DEL ESTE DE AG X LAV"
    //           tra=4 -> "SAN CARLOS A VIAL."    tra=6 -> "SAN CARLOS A AG X LAV"
    itinerary: toNumber(marker.tra),
    plate: toText(marker.bmt),
    accessible: marker.bac === undefined ? null : marker.bac === '1',
    occupancy_pct: toNumber(marker.poc),
    schedule_deviation_min: toNumber(marker.reg),
    prev_stop_code: toText(marker.p1c),
    prev_stop_name: toText(marker.p1n),
    next_stop_code: toText(marker.p2c),
    next_stop_name: toText(marker.p2n),
    departure_time: toText(marker.sal),
    fix_time: parseFixTime(marker.fec, marker.hor),
  };
}

@Injectable()
export class GpsFeedService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GpsFeedService.name);

  private pollTimer: NodeJS.Timeout | null = null;
  private pruneTimer: NodeJS.Timeout | null = null;
  private polling = false;

  private routeIdsByCode = new Map<string, number>();
  private routeCacheLoadedAt = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly positionsService: VehiclePositionsService,
    private readonly feedHealth: FeedHealthService,
  ) {}

  private get enabled(): boolean {
    return this.configService.get('GPS_FEEDS_ENABLED', 'true') !== 'false';
  }

  private get pollIntervalMs(): number {
    return Number(this.configService.get('GPS_POLL_INTERVAL_MS', 15000));
  }

  private get requestTimeoutMs(): number {
    return Number(this.configService.get('GPS_REQUEST_TIMEOUT_MS', 10000));
  }

  private get retentionHours(): number {
    return Number(this.configService.get('GPS_RETENTION_HOURS', 24));
  }

  private get feeds(): FeedSource[] {
    return DEFAULT_FEEDS.map(({ operator, url }) => ({
      operator,
      url: this.configService.get(FEED_URL_ENV_VARS[operator], url),
    })).filter((feed) => Boolean(feed.url));
  }

  onModuleInit() {
    if (!this.enabled) {
      this.logger.log('Ingesta de feeds GPS deshabilitada (GPS_FEEDS_ENABLED=false)');
      return;
    }

    this.logger.log(
      `Ingesta de feeds GPS activa: ${this.feeds.length} feeds cada ${this.pollIntervalMs} ms`,
    );

    this.feedHealth.declarar(this.feeds.map((feed) => feed.operator));
    this.pollTimer = setInterval(() => void this.pollAll(), this.pollIntervalMs);
    // Una pasada de limpieza por hora alcanza; la retención se mide en horas.
    this.pruneTimer = setInterval(() => void this.prune(), 60 * 60 * 1000);

    void this.pollAll();
  }

  onModuleDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.pruneTimer) clearInterval(this.pruneTimer);
  }

  /**
   * Consulta los feeds y guarda lo que traigan. Cada feed va por su cuenta:
   * si una empresa tiene el servidor caído, la otra se ingesta igual.
   */
  async pollAll(): Promise<void> {
    // Un feed lento no debe encimarse con el siguiente tick.
    if (this.polling) return;
    this.polling = true;

    try {
      await this.refreshRouteCache();
      const results = await Promise.allSettled(this.feeds.map((feed) => this.pollFeed(feed)));

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          this.feedHealth.registrarFallo(this.feeds[index].operator, result.reason);
          this.logger.warn(
            `Feed ${this.feeds[index].operator} no respondió: ${result.reason?.message ?? result.reason}`,
          );
        }
      });
    } finally {
      this.polling = false;
    }
  }

  private async pollFeed(feed: FeedSource): Promise<void> {
    const xml = await this.fetchFeed(feed.url);
    const markers = parseAvlMarkers(xml);

    const positions = markers
      .map((marker) => normalizeMarker(marker, feed.operator, this.routeIdsByCode))
      .filter((position): position is VehiclePositionInput => position !== null);

    if (positions.length === 0) {
      // Contestó, aunque sea con la lista vacía: el feed está vivo. De noche
      // es lo normal y no es una caída.
      this.feedHealth.registrarExito(feed.operator, 0);
      this.logger.debug(`Feed ${feed.operator}: sin vehículos en circulación`);
      return;
    }

    this.feedHealth.registrarExito(feed.operator, positions.length);
    const inserted = await this.positionsService.insertPositions(positions);
    this.logger.debug(
      `Feed ${feed.operator}: ${positions.length} vehículos, ${inserted.length} posiciones nuevas`,
    );
  }

  private async fetchFeed(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      // El parámetro anti-caché lo usa el propio visor de las empresas.
      const separator = url.includes('?') ? '&' : '?';
      const response = await fetch(`${url}${separator}noCache=${Date.now()}`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // El XML se declara ISO-8859-1: decodificarlo como UTF-8 rompe los
      // nombres con acento ("EL JAGÜEL", "JOSÉ IGNACIO").
      const buffer = Buffer.from(await response.arrayBuffer());
      return buffer.toString('latin1');
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Las rutas casi no cambian; con refrescar el mapa cada 10 minutos sobra. */
  private async refreshRouteCache(): Promise<void> {
    const isFresh = Date.now() - this.routeCacheLoadedAt < 10 * 60 * 1000;
    if (isFresh && this.routeIdsByCode.size > 0) return;

    try {
      this.routeIdsByCode = await this.positionsService.getRouteIdsByCode();
      this.routeCacheLoadedAt = Date.now();
    } catch (error: any) {
      // Sin el mapa las posiciones entran con route_id null, que es
      // degradado pero utilizable: line_code sigue estando.
      this.logger.warn(`No se pudo cargar el mapa de rutas: ${error?.message ?? error}`);
    }
  }

  private async prune(): Promise<void> {
    try {
      const deleted = await this.positionsService.prunePositions(this.retentionHours);
      if (deleted > 0) {
        this.logger.log(`Limpieza de posiciones: ${deleted} registros eliminados`);
      }
    } catch (error: any) {
      this.logger.warn(`No se pudo limpiar el histórico: ${error?.message ?? error}`);
    }
  }
}
