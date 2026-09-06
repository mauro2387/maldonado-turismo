/**
 * Fuente: sección "Eventos" del sitio de la Intendencia de Maldonado.
 *
 * Es la agenda oficial del departamento y la más confiable de las tres: las
 * fechas están bien y el evento suele estar confirmado. La contra es que la
 * misma sección mezcla anuncios con crónicas de lo que ya pasó y con agenda
 * protocolar, así que buena parte se descarta después en el filtro común.
 *
 * El sitio es un Drupal sin JSON:API expuesto (/jsonapi devuelve 404), de modo
 * que se lee el HTML renderizado:
 *
 *   listado  /eventos?page=N   -> <article class="novedad__item">
 *   nota     /noticias/<slug>  -> <div class="text-area"> con el cuerpo
 */

import { Logger } from '@nestjs/common';
import {
  absoluteUrl,
  attr,
  extractBlocks,
  fetchText,
  htmlToInlineText,
  htmlToText,
} from '../html.util';
import { EventSourceAdapter, ScrapedArticle } from './source.types';

const BASE_URL = 'https://www.maldonado.gub.uy';

export class MaldonadoGubSource implements EventSourceAdapter {
  readonly key = 'maldonado-gub';
  readonly name = 'Intendencia de Maldonado - Eventos';

  private readonly logger = new Logger(MaldonadoGubSource.name);

  async fetchArticles(maxPages: number): Promise<ScrapedArticle[]> {
    const articles: ScrapedArticle[] = [];
    const seen = new Set<string>();

    for (let page = 0; page < maxPages; page++) {
      const listUrl = `${BASE_URL}/eventos?page=${page}`;
      const html = await fetchText(listUrl);
      const items = extractBlocks(html, 'article', 'novedad__item');

      // Sin items el listado se acabó (o cambió el marcado): no tiene sentido
      // seguir pidiendo páginas.
      if (items.length === 0) break;

      for (const item of items) {
        const link = absoluteUrl(this.hrefOf(item), BASE_URL);
        if (!link || seen.has(link)) continue;
        seen.add(link);

        const title = htmlToInlineText(
          item.match(/<h2\b[^>]*class="[^"]*novedad__title[^"]*"[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? '',
        );
        if (!title) continue;

        const summary = htmlToInlineText(
          item.match(/<p\b[^>]*class="[^"]*novedad__summary[^"]*"[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '',
        );

        const listImage = absoluteUrl(attr(item, 'src'), BASE_URL);
        const tags = [...item.matchAll(/<a\b[^>]*class="[^"]*label__primary[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)].map(
          (match) => htmlToInlineText(match[1]),
        );

        try {
          const detail = await this.fetchDetail(link);
          articles.push({
            sourceId: this.sourceIdFrom(link),
            url: link,
            title,
            summary: summary || null,
            // El resumen del listado suele traer la fecha y el cuerpo la
            // programación completa; se concatenan para no perder ninguno.
            body: [summary, detail.body].filter(Boolean).join('\n\n'),
            imageUrl: detail.imageUrl ?? listImage,
            publishedAt: detail.publishedAt,
            tags,
          });
        } catch (error) {
          // Una nota caída no puede tumbar la corrida entera.
          this.logger.warn(`No se pudo leer ${link}: ${(error as Error).message}`);
        }
      }
    }

    return articles;
  }

  private hrefOf(item: string): string | null {
    const link = item.match(/<a\b[^>]*class="[^"]*novedad__link[^"]*"[^>]*>/i);
    return link ? attr(link[0], 'href') : null;
  }

  /** El slug de la nota es único y estable; alcanza como source_id. */
  private sourceIdFrom(url: string): string {
    return new URL(url).pathname.replace(/^\/+|\/+$/g, '').slice(-120);
  }

  private async fetchDetail(url: string): Promise<{
    body: string;
    imageUrl: string | null;
    publishedAt: Date;
  }> {
    const html = await fetchText(url);

    // El cuerpo viene partido en varios componentes .text-area (bajada,
    // desarrollo, programación). Se concatenan en orden de aparición.
    const body = extractBlocks(html, 'div', 'text-area')
      .map((block) => htmlToText(block))
      .filter((text) => text.length > 0)
      .join('\n\n');

    const image =
      absoluteUrl(attr(extractBlocks(html, 'div', 'content__img')[0] ?? '', 'src'), BASE_URL) ??
      absoluteUrl(this.ogImage(html), BASE_URL);

    return { body, imageUrl: image, publishedAt: this.publishedAt(html) };
  }

  private ogImage(html: string): string | null {
    const meta = html.match(/<meta[^>]+property="og:image"[^>]*>/i);
    return meta ? attr(meta[0], 'content') : null;
  }

  /**
   * Drupal deja la fecha de publicación en el único `datetime=` de la página.
   * Sin ella no se puede inferir el año de "26 de setiembre", así que se cae a
   * "hoy", que para una nota recién publicada es equivalente.
   */
  private publishedAt(html: string): Date {
    const match = html.match(/datetime="([^"]+)"/i);
    if (match) {
      const parsed = new Date(match[1]);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  }
}
