/**
 * Fuente: maldonadoturismo.com.uy, el portal de la Dirección de Turismo.
 *
 * Publica poco pero es lo que trae los eventos grandes de temporada (maratón,
 * espectáculos del Enjoy, circuitos) que las otras dos fuentes recién levantan
 * sobre la fecha.
 *
 * Es un WordPress con la REST API abierta, así que no hay HTML que parsear:
 * /wp-json/wp/v2/posts devuelve título, contenido y fecha ya estructurados.
 */

import { Logger } from '@nestjs/common';
import { fetchText, htmlToInlineText, htmlToText } from '../html.util';
import { EventSourceAdapter, ScrapedArticle } from './source.types';

const BASE_URL = 'https://maldonadoturismo.com.uy';
/** Id de la categoría "eventos" en ese WordPress. */
const EVENTS_CATEGORY = 92;
const PER_PAGE = 30;

interface WpPost {
  id: number;
  date_gmt: string;
  link: string;
  title: { rendered: string };
  excerpt: { rendered: string };
  content: { rendered: string };
  jetpack_featured_media_url?: string;
  _embedded?: { 'wp:featuredmedia'?: { source_url?: string }[] };
}

export class MaldonadoTurismoSource implements EventSourceAdapter {
  readonly key = 'maldonado-turismo';
  readonly name = 'Maldonado Turismo - Eventos';

  private readonly logger = new Logger(MaldonadoTurismoSource.name);

  async fetchArticles(maxPages: number): Promise<ScrapedArticle[]> {
    const articles: ScrapedArticle[] = [];

    for (let page = 1; page <= maxPages; page++) {
      const url =
        `${BASE_URL}/wp-json/wp/v2/posts` +
        `?categories=${EVENTS_CATEGORY}&per_page=${PER_PAGE}&page=${page}&_embed=wp:featuredmedia`;

      let posts: WpPost[];
      try {
        posts = JSON.parse(await fetchText(url)) as WpPost[];
      } catch (error) {
        // Pedir una página que no existe devuelve 400: es la señal de fin de
        // listado, no un problema.
        this.logger.debug(`Fin del listado en la página ${page}: ${(error as Error).message}`);
        break;
      }

      if (!Array.isArray(posts) || posts.length === 0) break;

      for (const post of posts) {
        const title = htmlToInlineText(post.title?.rendered ?? '');
        if (!title) continue;

        const summary = htmlToInlineText(post.excerpt?.rendered ?? '');
        const body = htmlToText(post.content?.rendered ?? '');

        articles.push({
          sourceId: String(post.id),
          url: post.link,
          title,
          summary: summary || null,
          body: [summary, body].filter(Boolean).join('\n\n'),
          imageUrl:
            post._embedded?.['wp:featuredmedia']?.[0]?.source_url ??
            post.jetpack_featured_media_url ??
            null,
          publishedAt: new Date(`${post.date_gmt}Z`),
          tags: [],
        });
      }

      if (posts.length < PER_PAGE) break;
    }

    return articles;
  }
}
