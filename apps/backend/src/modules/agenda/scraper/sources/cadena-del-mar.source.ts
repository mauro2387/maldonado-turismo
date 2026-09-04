/**
 * Fuente: sección "Eventos" de Cadena del Mar (FM 106.5, Maldonado).
 *
 * Es la que mejor cobertura da de la agenda cultural chica —teatro, museos,
 * ciclos, ferias de balneario— que la Intendencia no siempre publica. Cubre el
 * hueco de la fuente oficial, que es más confiable pero mucho más acotada.
 *
 *   listado  /eventos?pagina=N  -> <article class="shadow eventos">
 *   nota     /eventos/<slug>-ID -> <div class="cuerpo"> y <div class="fecha">
 */

import { Logger } from '@nestjs/common';
import { absoluteUrl, attr, extractBlocks, fetchText, htmlToInlineText, htmlToText } from '../html.util';
import { EventSourceAdapter, ScrapedArticle } from './source.types';

const BASE_URL = 'https://cadenadelmar.uy';

export class CadenaDelMarSource implements EventSourceAdapter {
  readonly key = 'cadena-del-mar';
  readonly name = 'Cadena del Mar - Eventos';

  private readonly logger = new Logger(CadenaDelMarSource.name);

  async fetchArticles(maxPages: number): Promise<ScrapedArticle[]> {
    const articles: ScrapedArticle[] = [];
    const seen = new Set<string>();

    for (let page = 0; page < maxPages; page++) {
      const listUrl = `${BASE_URL}/eventos?pagina=${page}`;
      const html = await fetchText(listUrl);

      // "shadow eventos" es la card de la sección; el sitio usa la misma
      // plantilla con otra clase para el resto de las secciones.
      const items = extractBlocks(html, 'article', 'eventos');
      if (items.length === 0) break;

      for (const item of items) {
        const link = absoluteUrl(attr(item, 'href'), BASE_URL);
        if (!link || seen.has(link)) continue;
        seen.add(link);

        const title = htmlToInlineText(item.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? '');
        if (!title) continue;

        const summary = htmlToInlineText(item.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '');
        const listImage = absoluteUrl(attr(item, 'src'), BASE_URL);

        try {
          const detail = await this.fetchDetail(link);
          articles.push({
            sourceId: this.sourceIdFrom(link),
            url: link,
            title,
            summary: detail.lead ?? summary ?? null,
            body: [detail.lead ?? summary, detail.body].filter(Boolean).join('\n\n'),
            imageUrl: detail.imageUrl ?? listImage,
            publishedAt: detail.publishedAt,
            // La volanta ("PRIMICIA", "AGENDA CULTURAL", "FOLKLORE") es lo más
            // parecido a una etiqueta que trae el sitio.
            tags: detail.kicker ? [detail.kicker] : [],
          });
        } catch (error) {
          this.logger.warn(`No se pudo leer ${link}: ${(error as Error).message}`);
        }
      }
    }

    return articles;
  }

  /** El id numérico va al final del slug: .../titulo-de-la-nota-23615 */
  private sourceIdFrom(url: string): string {
    const numeric = url.match(/-(\d+)\/?$/);
    return numeric ? numeric[1] : new URL(url).pathname.replace(/^\/+|\/+$/g, '').slice(-120);
  }

  private async fetchDetail(url: string): Promise<{
    body: string;
    lead: string | null;
    kicker: string | null;
    imageUrl: string | null;
    publishedAt: Date;
  }> {
    const html = await fetchText(url);

    const body = extractBlocks(html, 'div', 'cuerpo')
      .map((block) => htmlToText(block))
      .join('\n\n');

    const lead = htmlToInlineText(
      html.match(/<p\b[^>]*class="[^"]*copete[^"]*"[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '',
    );
    const kicker = htmlToInlineText(
      html.match(/<h5\b[^>]*class="[^"]*volanta[^"]*"[^>]*>([\s\S]*?)<\/h5>/i)?.[1] ?? '',
    );

    const slider = html.match(/<ul\b[^>]*class="[^"]*bxslider[^"]*"[^>]*>([\s\S]*?)<\/ul>/i);
    const imageUrl = absoluteUrl(slider ? attr(slider[1], 'src') : null, BASE_URL);

    return {
      body,
      lead: lead || null,
      kicker: kicker || null,
      imageUrl,
      publishedAt: this.publishedAt(html),
    };
  }

  /** `<div class="fecha">31/08/2026 - 19:12hs</div>`, en hora de Uruguay. */
  private publishedAt(html: string): Date {
    const raw = htmlToInlineText(
      html.match(/<div\b[^>]*class="[^"]*fecha[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? '',
    );
    const match = raw.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s*-\s*(\d{1,2}):(\d{2}))?/);
    if (!match) return new Date();

    const iso = `${match[3]}-${match[2]}-${match[1]}T${(match[4] ?? '00').padStart(2, '0')}:${match[5] ?? '00'}:00-03:00`;
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }
}
