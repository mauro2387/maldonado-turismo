/**
 * Contrato que cumple cada fuente de la agenda.
 *
 * Un scraper sólo se ocupa de traer notas crudas: título, texto completo,
 * imagen, enlace y fecha de publicación. Todo lo que viene después —parsear la
 * fecha del evento, clasificarlo, decidir si se publica— lo hace
 * EventScraperService, que es común a todas las fuentes. Así, agregar un sitio
 * nuevo es escribir un archivo que devuelva ScrapedArticle[] y nada más.
 */

export interface ScrapedArticle {
  /** Identificador estable dentro de la fuente (nodo, id de nota, id de post). */
  sourceId: string;
  url: string;
  title: string;
  /** Bajada o resumen, si la fuente lo trae aparte. */
  summary: string | null;
  /** Texto completo de la nota, ya en texto plano. De acá sale la fecha. */
  body: string;
  imageUrl: string | null;
  publishedAt: Date;
  /** Etiquetas de la fuente, útiles para descartar lo que no es agenda. */
  tags: string[];
}

export interface EventSourceAdapter {
  /** Clave estable; es la que va en events.source. */
  readonly key: string;
  readonly name: string;
  /**
   * @param maxPages páginas del listado a recorrer, de más nueva a más vieja.
   */
  fetchArticles(maxPages: number): Promise<ScrapedArticle[]>;
}
