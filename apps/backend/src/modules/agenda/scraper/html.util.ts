/**
 * Utilidades mínimas de HTML para los scrapers de la agenda.
 *
 * Los tres sitios que se consultan sirven HTML plano renderizado en el
 * servidor, con marcado estable y sin nada anidado que haya que resolver de
 * verdad. Alcanza con recortar bloques y limpiar etiquetas, así que no se
 * arrastra un parser DOM completo (mismo criterio que el parser del feed AVL
 * en transporte/gps-feed.service.ts).
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  deg: '°',
  ordm: 'º',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  ntilde: 'ñ',
  uuml: 'ü',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  Ntilde: 'Ñ',
};

export function decodeEntities(value: string): string {
  return value.replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return String.fromCodePoint(parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith('#')) {
      return String.fromCodePoint(parseInt(entity.slice(1), 10));
    }
    return NAMED_ENTITIES[entity] ?? NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/**
 * Convierte un fragmento de HTML en texto legible. Los cierres de bloque y los
 * <br> pasan a saltos de línea porque las notas separan ahí la fecha del lugar
 * y perder ese corte pega palabras que después el parser de fechas lee mal.
 */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<(?:br|hr)\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Texto plano de una línea, para títulos y epígrafes. */
export function htmlToInlineText(html: string): string {
  return htmlToText(html).replace(/\s*\n\s*/g, ' ').trim();
}

/**
 * Recorta los bloques que abren con `<tag class="...clase...">` hasta su cierre
 * correspondiente, contando anidamiento del mismo tag.
 */
export function extractBlocks(html: string, tag: string, className: string): string[] {
  const open = new RegExp(`<${tag}\\b[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>`, 'gi');
  const boundary = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, 'gi');
  const blocks: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = open.exec(html)) !== null) {
    const bodyStart = match.index + match[0].length;
    boundary.lastIndex = bodyStart;

    let depth = 1;
    let boundaryMatch: RegExpExecArray | null;
    while (depth > 0 && (boundaryMatch = boundary.exec(html)) !== null) {
      depth += boundaryMatch[0].startsWith('</') ? -1 : 1;
    }

    // Sin cierre el bloque está truncado: mejor descartarlo que arrastrar el
    // resto de la página adentro.
    if (depth !== 0) continue;

    const bodyEnd = boundary.lastIndex - `</${tag}>`.length;
    blocks.push(html.slice(bodyStart, bodyEnd));
    open.lastIndex = boundary.lastIndex;
  }

  return blocks;
}

/** Primer valor de un atributo dentro del fragmento (`src`, `href`, ...). */
export function attr(html: string, attribute: string): string | null {
  const match = html.match(new RegExp(`\\b${attribute}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return match ? decodeEntities(match[1].trim()) : null;
}

/** Contenido del primer `<tag ...>` del fragmento, como texto plano. */
export function textOf(html: string, tag: string, className?: string): string | null {
  const pattern = className
    ? new RegExp(`<${tag}\\b[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
    : new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i');

  const match = html.match(pattern);
  if (!match) return null;

  const text = htmlToInlineText(match[1]);
  return text || null;
}

/** Resuelve una URL relativa contra el origen del sitio. */
export function absoluteUrl(url: string | null, base: string): string | null {
  if (!url) return null;
  try {
    return new URL(url, base).toString();
  } catch {
    return null;
  }
}

const DEFAULT_TIMEOUT_MS = 20000;

/**
 * GET con timeout y User-Agent propio.
 *
 * Se identifica el bot a propósito: son sitios públicos de la Intendencia y de
 * prensa local, y si alguno quiere limitar la ingesta tiene que poder
 * reconocerla en sus logs y en su robots.txt.
 */
export async function fetchText(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'MaldonadoTurismoBot/1.0 (+https://maldonado.gub.uy; agenda de eventos)',
        Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-UY,es;q=0.9',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} en ${url}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}
