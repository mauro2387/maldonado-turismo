/**
 * Ingesta diaria de la agenda de eventos del departamento.
 *
 * Recorre las agendas públicas (Intendencia, prensa local, portal de turismo),
 * saca de cada nota la fecha del evento y guarda en `events` todo lo que sea de
 * hoy en adelante.
 *
 * Reglas que valen la pena tener presentes:
 *
 * - La clave del upsert es (source, source_id): la misma nota puede volver a
 *   aparecer en el listado durante semanas y tiene que actualizar la fila, no
 *   crear otra.
 * - Una fila con `edited_by_admin` no se toca nunca más. Si alguien de Cultura
 *   corrigió el horario a mano, la corrida siguiente no puede pisárselo.
 * - Lo que el parser saca con poca confianza entra como `status = 'pending'` y
 *   no se muestra en la app hasta que un editor lo aprueba. Publicar una fecha
 *   mal parseada es peor que no publicar nada.
 * - Los eventos ya pasados no se borran: son el histórico de la agenda.
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import {
  detectCategory,
  detectLocality,
  detectOrganizer,
  detectPrice,
  detectVenue,
  looksLikeAttendableEvent,
} from './classify.util';
import { normalizeText, parseEventDate } from './spanish-date.util';
import { CadenaDelMarSource } from './sources/cadena-del-mar.source';
import { MaldonadoGubSource } from './sources/maldonado-gub.source';
import { MaldonadoTurismoSource } from './sources/maldonado-turismo.source';
import { EventSourceAdapter, ScrapedArticle } from './sources/source.types';

/**
 * Por debajo de esto el evento queda pendiente de revisión en vez de
 * publicarse. El valor sale de mirar el parseo de la agenda real: 0.75 deja
 * pasar "sábado 26 de setiembre a las 20 horas" y frena las notas donde la
 * fecha aparece suelta y sin hora.
 */
const DEFAULT_CONFIDENCE_THRESHOLD = 0.75;

/** Nada demasiado lejos en el tiempo: casi siempre es un año mal inferido. */
const MAX_MONTHS_AHEAD = 14;

export interface ScrapeSourceResult {
  source: string;
  name: string;
  found: number;
  created: number;
  updated: number;
  skipped: number;
  /** Cuántas notas se descartaron por cada motivo. */
  rejections: Record<string, number>;
  error: string | null;
}

export interface ScrapeRunResult {
  runId: string;
  status: 'ok' | 'partial' | 'error';
  found: number;
  created: number;
  updated: number;
  skipped: number;
  detail: ScrapeSourceResult[];
}

/**
 * Motivo por el que una nota no llegó a ser un evento. Se cuenta por motivo en
 * cada corrida: si de golpe sube "sin-fecha-futura" es que un sitio cambió de
 * formato, y sin el detalle eso se ve sólo como "trajo menos que ayer".
 */
export type RejectionReason =
  | 'no-es-evento'
  | 'fuera-del-departamento'
  | 'sin-fecha-futura'
  | 'fecha-implausible'
  | 'sin-localidad';

export interface ScrapeRejection {
  rejected: RejectionReason;
}

function isRejection(value: CandidateEvent | ScrapeRejection): value is ScrapeRejection {
  return 'rejected' in value;
}

/** 00:00 de hoy en hora de Uruguay (UTC-3 fijo), expresado en UTC. */
function startOfTodayInUruguay(): Date {
  const now = new Date();
  const uruguayNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(
      uruguayNow.getUTCFullYear(),
      uruguayNow.getUTCMonth(),
      uruguayNow.getUTCDate(),
      3,
      0,
      0,
      0,
    ),
  );
}

/** Primeros párrafos del cuerpo: es donde estas notas dicen qué, cuándo y dónde. */
function leadOf(body: string): string {
  return body.split('\n').filter(Boolean).slice(0, 4).join('\n').slice(0, 900);
}

/**
 * Referencias a actividades que ocurren fuera del departamento. La prensa local
 * cubre bastante de Montevideo y esas notas no van a la agenda de Maldonado.
 *
 * La lista es corta a propósito. Se probó con todos los departamentos y daba
 * falsos positivos todo el tiempo: "Biblioteca José Artigas", "Plaza Artigas",
 * "Rambla Artigas", "Colonia del Sacramento" en una charla de historia, o
 * "cantante argentina" en un festival de Pan de Azúcar. Sólo quedan los
 * topónimos y las salas que no se confunden con nada de acá.
 */
const ELSEWHERE =
  /\b(montevideo|antel arena|estadio centenario|teatro solis|parque roosevelt|punta carretas|ciudad vieja|parque rodo|pocitos|carrasco)\b/;

/**
 * La prensa local titula "Tema (Lugar): la nota". Ese prefijo es una etiqueta
 * del medio, no dónde ocurre la actividad: "San Carlos (Música)" quiere decir
 * que la banda es carolina, aunque toque en Montevideo. Se lo saca antes de
 * comparar posiciones para que no gane siempre la localidad del prefijo.
 */
function withoutOutletPrefix(headline: string): string {
  return headline.replace(/^[^:\n]{0,60}\([^)\n]{0,40}\)\s*:\s*/, '');
}

function isElsewhere(headline: string): boolean {
  const normalized = normalizeText(withoutOutletPrefix(headline));
  // Si además nombra una localidad de Maldonado, es una nota que compara las
  // dos plazas y no necesariamente un evento de afuera; decide el orden en que
  // aparecen.
  const elsewhereAt = normalized.search(ELSEWHERE);
  if (elsewhereAt === -1) return false;

  const localAt = normalized.search(
    /\b(maldonado|punta del este|la barra|manantiales|jose ignacio|piriapolis|san carlos|pan de azucar|aigua|garzon|punta ballena)\b/,
  );
  return localAt === -1 || elsewhereAt < localAt;
}

/** Lo que se guarda en `events` una vez normalizada la nota. */
interface CandidateEvent {
  source: string;
  sourceId: string;
  sourceUrl: string;
  title: string;
  description: string | null;
  longDescription: string;
  startDate: Date;
  endDate: Date | null;
  time: string | null;
  location: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  locality: string | null;
  category: string;
  price: string | null;
  organizer: string | null;
  image: string | null;
  tags: string[];
  confidence: number;
  status: 'published' | 'pending';
}

@Injectable()
export class EventScraperService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventScraperService.name);

  private dailyTimer: NodeJS.Timeout | null = null;
  private running = false;

  private readonly adapters: EventSourceAdapter[] = [
    new MaldonadoGubSource(),
    new CadenaDelMarSource(),
    new MaldonadoTurismoSource(),
  ];

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  private get enabled(): boolean {
    return this.configService.get('EVENTS_SCRAPER_ENABLED', 'true') !== 'false';
  }

  /** Hora local de Uruguay en la que corre la tarea diaria. */
  private get scheduledHour(): number {
    const hour = Number(this.configService.get('EVENTS_SCRAPER_HOUR', 5));
    return Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : 5;
  }

  private get confidenceThreshold(): number {
    const value = Number(
      this.configService.get('EVENTS_SCRAPER_MIN_CONFIDENCE', DEFAULT_CONFIDENCE_THRESHOLD),
    );
    return Number.isFinite(value) ? value : DEFAULT_CONFIDENCE_THRESHOLD;
  }

  // ==========================================================================
  // Tarea diaria
  // ==========================================================================

  onModuleInit() {
    if (!this.enabled) {
      this.logger.log('Scraper de eventos deshabilitado (EVENTS_SCRAPER_ENABLED=false)');
      return;
    }

    this.scheduleNextRun();
    this.logger.log(
      `Scraper de eventos activo: corre todos los días a las ${this.scheduledHour}:00 (hora de Uruguay)`,
    );
  }

  onModuleDestroy() {
    if (this.dailyTimer) clearTimeout(this.dailyTimer);
  }

  /**
   * Se reprograma con setTimeout en vez de un setInterval de 24 h para que la
   * corrida quede clavada a la hora del día elegida: con un intervalo fijo se
   * corre de a poco cada vez que el proceso se reinicia.
   */
  private scheduleNextRun(): void {
    const delay = this.msUntilNextRun();
    this.dailyTimer = setTimeout(() => {
      void this.run('schedule').catch((error) => {
        this.logger.error(`La corrida diaria falló: ${(error as Error).message}`);
      });
      this.scheduleNextRun();
    }, delay);

    // Un timer no debe mantener vivo el proceso por sí solo.
    this.dailyTimer.unref?.();
  }

  private msUntilNextRun(): number {
    const now = new Date();
    // La hora se calcula en hora de Uruguay (UTC-3, fijo desde 2015) para que
    // no dependa del huso donde esté corriendo el servidor.
    const target = new Date(now);
    target.setUTCHours(this.scheduledHour + 3, 0, 0, 0);
    if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 1);
    return target.getTime() - now.getTime();
  }

  // ==========================================================================
  // Corrida
  // ==========================================================================

  isRunning(): boolean {
    return this.running;
  }

  /**
   * @param triggeredBy 'schedule' para la tarea diaria, o el email del admin
   *                    que la disparó desde el backoffice.
   */
  async run(triggeredBy = 'schedule'): Promise<ScrapeRunResult> {
    if (this.running) {
      throw new Error('Ya hay una corrida en curso');
    }
    this.running = true;

    const [run] = await this.dataSource.query(
      `INSERT INTO event_scrape_runs (triggered_by) VALUES ($1) RETURNING id`,
      [triggeredBy],
    );
    const runId: string = run.id;

    const detail: ScrapeSourceResult[] = [];

    try {
      const sources = await this.enabledSources();

      for (const { adapter, maxPages } of sources) {
        detail.push(await this.runSource(adapter, maxPages));
      }

      const totals = detail.reduce(
        (acc, item) => ({
          found: acc.found + item.found,
          created: acc.created + item.created,
          updated: acc.updated + item.updated,
          skipped: acc.skipped + item.skipped,
        }),
        { found: 0, created: 0, updated: 0, skipped: 0 },
      );

      const failed = detail.filter((item) => item.error).length;
      const status: ScrapeRunResult['status'] =
        failed === 0 ? 'ok' : failed === detail.length ? 'error' : 'partial';

      await this.dataSource.query(
        `UPDATE event_scrape_runs
         SET finished_at = now(), status = $2, items_found = $3, items_created = $4,
             items_updated = $5, items_skipped = $6, detail = $7
         WHERE id = $1`,
        [runId, status, totals.found, totals.created, totals.updated, totals.skipped, JSON.stringify(detail)],
      );

      this.logger.log(
        `Corrida ${status}: ${totals.found} notas, ${totals.created} eventos nuevos, ` +
          `${totals.updated} actualizados, ${totals.skipped} descartados`,
      );

      return { runId, status, ...totals, detail };
    } catch (error) {
      const message = (error as Error).message;
      await this.dataSource.query(
        `UPDATE event_scrape_runs
         SET finished_at = now(), status = 'error', error = $2, detail = $3
         WHERE id = $1`,
        [runId, message, JSON.stringify(detail)],
      );
      throw error;
    } finally {
      this.running = false;
    }
  }

  /** Fuentes habilitadas en la tabla, cruzadas con los adaptadores que existen. */
  private async enabledSources(): Promise<{ adapter: EventSourceAdapter; maxPages: number }[]> {
    const rows: { key: string; max_pages: number }[] = await this.dataSource.query(
      `SELECT key, max_pages FROM event_sources WHERE enabled = true`,
    );

    // Si la tabla está vacía (base recién migrada) se corren todas.
    if (rows.length === 0) {
      return this.adapters.map((adapter) => ({ adapter, maxPages: 3 }));
    }

    return rows
      .map((row) => {
        const adapter = this.adapters.find((item) => item.key === row.key);
        return adapter ? { adapter, maxPages: row.max_pages } : null;
      })
      .filter((value): value is { adapter: EventSourceAdapter; maxPages: number } => value !== null);
  }

  private async runSource(
    adapter: EventSourceAdapter,
    maxPages: number,
  ): Promise<ScrapeSourceResult> {
    const result: ScrapeSourceResult = {
      source: adapter.key,
      name: adapter.name,
      found: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      rejections: {},
      error: null,
    };

    try {
      const articles = await adapter.fetchArticles(maxPages);
      result.found = articles.length;

      for (const article of articles) {
        const candidate = this.toEvent(article, adapter.key);

        if (isRejection(candidate)) {
          result.skipped++;
          result.rejections[candidate.rejected] = (result.rejections[candidate.rejected] ?? 0) + 1;
          continue;
        }

        const outcome = await this.upsert(candidate);
        if (outcome === 'created') result.created++;
        else if (outcome === 'updated') result.updated++;
        else {
          result.skipped++;
          result.rejections.duplicado = (result.rejections.duplicado ?? 0) + 1;
        }
      }

      await this.dataSource.query(
        `UPDATE event_sources SET last_run_at = now(), last_status = 'ok', last_error = NULL WHERE key = $1`,
        [adapter.key],
      );
    } catch (error) {
      result.error = (error as Error).message;
      this.logger.error(`Fuente ${adapter.key} falló: ${result.error}`);

      await this.dataSource.query(
        `UPDATE event_sources SET last_run_at = now(), last_status = 'error', last_error = $2 WHERE key = $1`,
        [adapter.key, result.error],
      );
    }

    return result;
  }

  // ==========================================================================
  // Normalización
  // ==========================================================================

  /**
   * Convierte una nota en un evento, o explica por qué no lo es.
   *
   * El texto se mira en dos alcances distintos y la diferencia importa:
   *
   * - `headline` (título + bajada + primeros párrafos) es de donde salen el
   *   lugar y la categoría. Estas notas dicen el qué, el cuándo y el dónde
   *   arriba; más abajo aparecen otras ciudades y otros temas, y clasificar
   *   sobre la nota entera mandaba a "Deportes" un concurso de canto sólo
   *   porque el último párrafo nombraba un torneo.
   * - El cuerpo completo se usa sólo para la fecha, y como respaldo: la fecha a
   *   veces está recién en la programación del final.
   */
  toEvent(article: ScrapedArticle, source: string): CandidateEvent | ScrapeRejection {
    const headline = [article.title, article.summary, leadOf(article.body)]
      .filter(Boolean)
      .join('\n');
    const fullText = `${article.title}\n${article.body}`;

    if (!looksLikeAttendableEvent(headline)) return { rejected: 'no-es-evento' };

    // Notas sobre actividades de otros departamentos: la banda es de San Carlos
    // pero toca en Montevideo. Se descartan antes de buscarles localidad, que
    // si no la encuentra igual por el gentilicio.
    if (isElsewhere(headline)) return { rejected: 'fuera-del-departamento' };

    // El corte es a las 00:00 de hoy en Uruguay: un evento de esta tarde tiene
    // que entrar igual, y uno de ayer no.
    const startOfToday = startOfTodayInUruguay();

    const parsed =
      parseEventDate(headline, article.publishedAt, startOfToday) ??
      parseEventDate(fullText, article.publishedAt, startOfToday);
    if (!parsed) return { rejected: 'sin-fecha-futura' };

    // Una fecha a más de un año vista casi siempre es un año mal inferido.
    const horizon = new Date();
    horizon.setUTCMonth(horizon.getUTCMonth() + MAX_MONTHS_AHEAD);
    if (parsed.start.getTime() > horizon.getTime()) return { rejected: 'fecha-implausible' };

    // El lugar sale del encabezado; el cuerpo sólo se consulta si arriba no
    // se nombró ninguna localidad.
    const venue = detectVenue(headline) ?? detectVenue(fullText);
    const localityInHeadline = detectLocality(headline);
    const locality = localityInHeadline ?? detectLocality(fullText);

    // Sin localidad reconocible no se puede afirmar que el evento sea en el
    // departamento, y esta agenda es sólo de Maldonado.
    if (!locality) return { rejected: 'sin-localidad' };

    // Si el encabezado no ubicó el evento y la localidad salió recién del
    // cuerpo, hay que mirar de nuevo si la nota es de afuera: es el caso de la
    // banda de San Carlos que toca en Montevideo, donde lo único de Maldonado
    // es de dónde son los músicos.
    if (!localityInHeadline && isElsewhere(fullText)) {
      return { rejected: 'fuera-del-departamento' };
    }

    const confidence = parsed.confidence;

    return {
      source,
      sourceId: article.sourceId,
      sourceUrl: article.url,
      title: this.cleanTitle(article.title),
      description: article.summary,
      longDescription: article.body,
      startDate: parsed.start,
      endDate: parsed.end,
      time: parsed.timeLabel,
      location: venue?.name ?? locality.name,
      address: venue?.address ?? null,
      lat: venue?.lat ?? locality.lat,
      lng: venue?.lng ?? locality.lng,
      locality: locality.name,
      category: detectCategory(headline),
      price: detectPrice(fullText),
      organizer: detectOrganizer(fullText),
      image: article.imageUrl,
      tags: [...new Set([locality.name, ...article.tags])].filter(Boolean),
      confidence,
      status: confidence >= this.confidenceThreshold ? 'published' : 'pending',
    };
  }

  /**
   * El título se respeta como lo publicó la fuente. Se probó recortarle el
   * prefijo de lugar que usa la prensa local ("Casa de la Cultura (Maldonado):
   * ...") y quedaban títulos que no se entendían solos ("se extenderá hasta el
   * 12 de septiembre"), así que sólo se limita el largo.
   */
  private cleanTitle(title: string): string {
    const cleaned = title.trim().replace(/\.$/, '');
    return cleaned.length > 200 ? `${cleaned.slice(0, 197)}...` : cleaned;
  }

  // ==========================================================================
  // Persistencia
  // ==========================================================================

  private async upsert(event: CandidateEvent): Promise<'created' | 'updated' | 'skipped'> {
    const [existing] = await this.dataSource.query(
      `SELECT id, edited_by_admin, status FROM events WHERE source = $1 AND source_id = $2`,
      [event.source, event.sourceId],
    );

    if (existing) {
      // Fila corregida a mano: el scraper no la vuelve a tocar.
      if (existing.edited_by_admin) return 'skipped';
      // Un evento rechazado por un editor no se vuelve a proponer.
      if (existing.status === 'rejected') return 'skipped';

      await this.dataSource.query(
        `UPDATE events SET
           title = $2, description = $3, long_description = $4,
           start_date = $5, end_date = $6, time = $7,
           location = $8, address = $9, lat = $10, lng = $11, locality = $12,
           category = $13, price = $14, organizer = $15, image = $16, tags = $17,
           source_url = $18, source_confidence = $19,
           -- Un editor que ya aprobó algo pendiente manda sobre el umbral.
           status = CASE WHEN events.status = 'published' THEN 'published' ELSE $20 END,
           scraped_at = now(), updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [
          existing.id,
          event.title,
          event.description,
          event.longDescription,
          event.startDate,
          event.endDate,
          event.time,
          event.location,
          event.address,
          event.lat,
          event.lng,
          event.locality,
          event.category,
          event.price,
          event.organizer,
          event.image,
          event.tags,
          event.sourceUrl,
          event.confidence,
          event.status,
        ],
      );

      return 'updated';
    }

    // Antes de crear, se descarta el mismo evento traído por otra fuente: la
    // Intendencia y la prensa local publican la misma actividad y no tiene que
    // aparecer dos veces en la agenda.
    if (await this.isDuplicate(event)) return 'skipped';

    await this.dataSource.query(
      `INSERT INTO events (
         title, description, long_description, start_date, end_date, time,
         location, address, lat, lng, locality, category, price, organizer,
         image, tags, source, source_id, source_url, source_confidence, status, scraped_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, now())`,
      [
        event.title,
        event.description,
        event.longDescription,
        event.startDate,
        event.endDate,
        event.time,
        event.location,
        event.address,
        event.lat,
        event.lng,
        event.locality,
        event.category,
        event.price,
        event.organizer,
        event.image,
        event.tags,
        event.source,
        event.sourceId,
        event.sourceUrl,
        event.confidence,
        event.status,
      ],
    );

    return 'created';
  }

  /**
   * Dos notas son el mismo evento si caen el mismo día y los títulos comparten
   * lo esencial. Se compara por palabras significativas y no por el título
   * entero porque cada medio lo redacta distinto ("Fiesta Nacional del Chorizo:
   * Karina será la figura estelar" vs "Pan de Azúcar prepara la quinta edición
   * de la Fiesta Nacional del Chorizo").
   */
  private async isDuplicate(event: CandidateEvent): Promise<boolean> {
    const sameDay: { title: string }[] = await this.dataSource.query(
      `SELECT title FROM events
       WHERE start_date::date = $1::date AND status <> 'rejected'`,
      [event.startDate],
    );

    const incoming = significantWords(event.title);
    if (incoming.size < 2) return false;

    return sameDay.some((row) => {
      const existing = significantWords(row.title);
      if (existing.size < 2) return false;

      const shared = [...incoming].filter((word) => existing.has(word)).length;
      return shared / Math.min(incoming.size, existing.size) >= 0.6;
    });
  }

  // ==========================================================================
  // Consultas para el backoffice
  // ==========================================================================

  async listRuns(limit = 20) {
    return this.dataSource.query(
      `SELECT id, started_at, finished_at, status, triggered_by,
              items_found, items_created, items_updated, items_skipped, detail, error
       FROM event_scrape_runs
       ORDER BY started_at DESC
       LIMIT $1`,
      [limit],
    );
  }

  async listSources() {
    return this.dataSource.query(
      `SELECT s.key, s.name, s.url, s.enabled, s.max_pages, s.last_run_at, s.last_status, s.last_error,
              (SELECT count(*)::int FROM events e WHERE e.source = s.key) AS total_events,
              (SELECT count(*)::int FROM events e
                WHERE e.source = s.key AND e.start_date >= CURRENT_DATE) AS upcoming_events
       FROM event_sources s
       ORDER BY s.name`,
    );
  }

  async setSourceEnabled(key: string, enabled: boolean) {
    const [row] = await this.dataSource.query(
      `UPDATE event_sources SET enabled = $2 WHERE key = $1 RETURNING key, name, enabled`,
      [key, enabled],
    );
    return row ?? null;
  }

  /** Eventos que quedaron esperando revisión por baja confianza en la fecha. */
  async listPending() {
    return this.dataSource.query(
      `SELECT id, title, start_date, end_date, time, location, locality, category,
              price, image, source, source_url, source_confidence, description
       FROM events
       WHERE status = 'pending'
       ORDER BY start_date ASC`,
    );
  }

  /**
   * Aprueba o rechaza un evento pendiente. Ambos casos lo marcan como tocado
   * por un humano, así que la ingesta deja de sobrescribirlo.
   */
  async review(id: number, decision: 'approve' | 'reject', userId: number, userEmail: string, ip: string) {
    const status = decision === 'approve' ? 'published' : 'rejected';

    const [row] = await this.dataSource.query(
      `UPDATE events SET status = $2, edited_by_admin = true, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING id, title, status`,
      [id, status],
    );
    if (!row) return null;

    await this.dataSource.query(
      `INSERT INTO audit_log (user_id, user_email, action, entity_type, entity_id, changes, ip_address)
       VALUES ($1, $2, $3, 'events', $4, $5, $6)`,
      [userId, userEmail, decision === 'approve' ? 'approve' : 'reject', id, JSON.stringify({ new: row }), ip],
    );

    return row;
  }

  async stats() {
    const [row] = await this.dataSource.query(
      `SELECT
         (SELECT count(*)::int FROM events WHERE start_date >= CURRENT_DATE AND status = 'published') AS upcoming,
         (SELECT count(*)::int FROM events WHERE status = 'pending') AS pending,
         (SELECT count(*)::int FROM events WHERE source IS NOT NULL) AS scraped,
         (SELECT count(*)::int FROM events WHERE source IS NULL) AS manual,
         (SELECT max(finished_at) FROM event_scrape_runs WHERE status <> 'error') AS last_success`,
    );

    return { ...row, running: this.running, scheduledHour: this.scheduledHour };
  }
}

/**
 * Palabras del título que sirven para comparar: sin artículos, preposiciones ni
 * muletillas de la prensa local.
 */
const STOP_WORDS = new Set([
  'de','del','la','las','los','el','en','y','a','con','por','para','un','una','al','se','su','sus',
  'que','es','sera','fue','este','esta','estos','estas','lo','como','mas','edicion','nueva','nuevo',
  'gran','proxima','proximo','sobre','desde','hasta','entre','durante','ante','tras','ser','habra',
]);

function significantWords(title: string): Set<string> {
  return new Set(
    // Sin el prefijo del medio: "Casa de la Cultura (Maldonado):" aparece en
    // casi todos los títulos de la prensa local, y contarlo como coincidencia
    // hacía que dos actividades distintas del mismo día se tomaran por la
    // misma. Fusionar dos eventos reales es peor que dejar un duplicado.
    withoutOutletPrefix(title)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3 && !STOP_WORDS.has(word)),
  );
}
