/**
 * Importa los recorridos que publican las empresas de ómnibus.
 *
 *   npx ts-node src/scripts/import-official-routes.ts --dry        # sólo muestra
 *   npx ts-node src/scripts/import-official-routes.ts              # importa
 *   npx ts-node src/scripts/import-official-routes.ts --operator=micro
 *
 * Por qué: hasta ahora el trazo de cada línea salía de reconstruir el GPS con
 * un ruteador. Entre dos posiciones del feed hay 30 s —unos 300 m de calle—
 * que el ruteador completa por su cuenta, y cuando elige mal el mapa dibuja
 * vueltas que el ómnibus no hace. Once itinerarios ni siquiera llegaban al
 * corte de calidad y quedaban sin dibujar.
 *
 * Y no hacía falta deducirlo: las tres empresas publican sus recorridos
 * dibujados en Google My Maps, y esos mapas se bajan en KML con un pedido.
 *
 *   CODESA              www.codesa.com.uy/p/recorridos.html
 *   Maldonado Turismo   maldonadoturismo.com/recorridos/
 *   Micro Ltda          microltda.com/recorridos
 *
 * Cada mapa es la polilínea sobre las calles reales, con 400 a 950 puntos, y
 * lleva el nombre que le puso la empresa: "Línea 24 (ida desde agencia por
 * Lavagna) CODESA", "16 IDA HORA PAR INVIERNO". Eso resuelve de paso el
 * problema de los itinerarios —una línea hace hasta seis recorridos distintos
 * y acá vienen separados y nombrados por quien los opera.
 *
 * CODESA y Maldonado Turismo publican además el recorrido calle por calle en
 * texto y las "pasadas de interés". Se guarda tal cual: es lo que permite
 * decir "va por Roosevelt" sin inventarlo, y sirve para controlar el trazo.
 *
 * El script es idempotente: hace upsert por (empresa, línea, variante) y se
 * puede correr cada vez que una empresa actualiza un recorrido.
 */
import { DataSource } from 'typeorm';
import 'dotenv/config';

// El mismo recortador de HTML que usan los scrapers de la agenda. Los tres
// sitios sirven HTML plano y estable; no hace falta un parser DOM (mismo
// criterio que el parser del feed AVL en transporte/gps-feed.service.ts).
import { decodeEntities, htmlToText } from '../modules/agenda/scraper/html.util';
import { distanceMeters, LngLat } from '../modules/transporte/geo.util';

const dryRun = process.argv.includes('--dry');
const onlyOperator = process.argv
  .find((arg) => arg.startsWith('--operator='))
  ?.split('=')[1];

const USER_AGENT =
  'MaldonadoMoverseApp/1.0 (+https://pulsarmoon.com; contacto@pulsarmoon.com)';

/** Entre pedido y pedido, para no golpear los sitios de las empresas. */
const REQUEST_DELAY_MS = 350;

/**
 * Dos trazos separados del mismo mapa se unen si sus extremos están más cerca
 * que esto. Google My Maps parte un recorrido en varios tramos cuando quien lo
 * dibujó cortó y siguió; el corte queda en el mismo punto, no a 400 m.
 */
const JOIN_TOLERANCE_M = 400;

// ---------------------------------------------------------------------------
// Lo que devuelve cada scraper: un recorrido publicado, todavía sin geometría.
// ---------------------------------------------------------------------------
interface ScrapedRoute {
  operator: string;
  lineCode: string;
  /** Hacia dónde va, tal como lo titula la empresa. */
  headsign: string | null;
  /** El recorrido calle por calle, como lo publica. Null cuando no lo publica. */
  streetText: string | null;
  /** "Pasadas de Interés". */
  highlights: string[];
  sourceUrl: string;
  /** Identificador del mapa de Google My Maps. Null si esa línea no tiene mapa. */
  mapId: string | null;
  /** Nombre de respaldo cuando el mapa no trae uno propio. */
  fallbackName: string;
}

interface OfficialRoute extends ScrapedRoute {
  name: string;
  variant: string;
  geometry: LngLat[] | null;
  distanceM: number | null;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url: string, attempt = 1): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xml,*/*' },
      redirect: 'follow',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await sleep(REQUEST_DELAY_MS);
    return await response.text();
  } catch (error: any) {
    if (attempt >= 3) throw new Error(`${url}: ${error?.message ?? error}`);
    await sleep(attempt * 1500);
    return fetchText(url, attempt + 1);
  }
}

// ---------------------------------------------------------------------------
// KML de Google My Maps
//
// El KML que sirve Google con `forcekml=1` es texto generado por máquina y
// siempre igual: un <Document> con su <name>, varios <Placemark> y, en los que
// son recorrido, un <LineString> con las coordenadas separadas por espacios en
// orden "lng,lat,alt". Se lee con expresiones regulares por la misma razón que
// el feed AVL: es un formato fijo y no vale la pena arrastrar un parser XML.
// ---------------------------------------------------------------------------

function kmlUrl(mapId: string): string {
  return `https://www.google.com/maps/d/kml?mid=${mapId}&forcekml=1`;
}

function kmlName(kml: string): string | null {
  const match = kml.match(/<Document>[\s\S]*?<name>([\s\S]*?)<\/name>/);
  return match ? decodeEntities(match[1]).replace(/\s+/g, ' ').trim() : null;
}

function kmlLineStrings(kml: string): LngLat[][] {
  return [...kml.matchAll(/<LineString>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/g)]
    .map((match) =>
      match[1]
        .trim()
        .split(/\s+/)
        .map((triple) => {
          const [lng, lat] = triple.split(',').map(Number);
          return [lng, lat] as LngLat;
        })
        .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat)),
    )
    .filter((points) => points.length >= 2);
}

const endpointDistance = (a: LngLat, b: LngLat) => distanceMeters(a[1], a[0], b[1], b[0]);

/**
 * Une los tramos de un mapa en una sola polilínea.
 *
 * Se arranca por el más largo y se le van pegando los que continúan en alguno
 * de sus extremos, dándolos vuelta si hace falta. Los que no continúan en
 * ningún lado se descartan: en estos mapas son marcas sueltas —un tramo de
 * prueba, una calle marcada aparte— y pegarlas igual dibujaría un salto de
 * kilómetros entre dos puntos por los que el ómnibus no pasó.
 */
function joinSegments(segments: LngLat[][]): { geometry: LngLat[]; dropped: number } {
  if (segments.length === 0) return { geometry: [], dropped: 0 };

  const pending = [...segments].sort((a, b) => b.length - a.length);
  let geometry = pending.shift() as LngLat[];

  let joined = true;
  while (joined && pending.length > 0) {
    joined = false;

    for (let i = 0; i < pending.length; i++) {
      const candidate = pending[i];
      const head = geometry[0];
      const tail = geometry[geometry.length - 1];
      const candidateHead = candidate[0];
      const candidateTail = candidate[candidate.length - 1];

      if (endpointDistance(tail, candidateHead) <= JOIN_TOLERANCE_M) {
        geometry = [...geometry, ...candidate.slice(1)];
      } else if (endpointDistance(tail, candidateTail) <= JOIN_TOLERANCE_M) {
        geometry = [...geometry, ...[...candidate].reverse().slice(1)];
      } else if (endpointDistance(head, candidateTail) <= JOIN_TOLERANCE_M) {
        geometry = [...candidate.slice(0, -1), ...geometry];
      } else if (endpointDistance(head, candidateHead) <= JOIN_TOLERANCE_M) {
        geometry = [...[...candidate].reverse().slice(0, -1), ...geometry];
      } else {
        continue;
      }

      pending.splice(i, 1);
      joined = true;
      break;
    }
  }

  return { geometry, dropped: pending.length };
}

function polylineLength(points: LngLat[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += endpointDistance(points[i - 1], points[i]);
  }
  return Math.round(total);
}

// ---------------------------------------------------------------------------
// Nombres y variantes
// ---------------------------------------------------------------------------

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Qué recorrido de la línea es, a partir del nombre que le puso la empresa.
 *
 * "Línea 24 (ida desde agencia por Lavagna) CODESA" -> ida-desde-agencia-por-lavagna
 * "16 IDA HORA PAR INVIERNO"                        -> ida-hora-par-invierno
 * "La Fortuna - Punta del Este"                     -> la-fortuna-punta-del-este
 *
 * Se le sacan el número de línea, la palabra "línea", "recorrido" y el nombre
 * de la empresa, que están en las tres y no distinguen nada. "Regreso" se
 * unifica en "vuelta" para que las tres empresas nombren igual lo mismo: es la
 * única normalización que se hace sobre lo publicado.
 */
function variantSlug(name: string, lineCode: string): string {
  const cleaned = name
    .replace(/codesa|micro\s*ltda\.?|maldonado\s*turismo(\s*ltda\.?)?/gi, ' ')
    .replace(/l[ií]nea|recorrido/gi, ' ')
    .replace(new RegExp(`\\b${lineCode.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\b`, 'gi'), ' ')
    .replace(/\b\d{1,3}(\s*\/\s*\d{1,3})?\b/g, ' ')
    .replace(/\bregreso\b/gi, 'vuelta');

  return slug(cleaned) || 'principal';
}

// ---------------------------------------------------------------------------
// CODESA — www.codesa.com.uy
//
// Blog de Blogger: una página por línea y sentido, con el recorrido en texto,
// las pasadas de interés y el mapa embebido. La página de ida enlaza la de
// vuelta, así que alcanza con arrancar del índice y seguir los enlaces.
// ---------------------------------------------------------------------------

const CODESA_INDEX = 'https://www.codesa.com.uy/p/recorridos.html';

/** Dónde termina el contenido y empieza el pie del blog. */
const CODESA_TAIL = /Comentarios|All rights reserved|Publicidad|Entradas populares/i;

function codesaLinks(html: string): string[] {
  return [
    ...new Set(
      [...html.matchAll(/href="([^"]*\/p\/linea[^"]*)"/gi)].map((match) =>
        match[1].replace(/^http:/, 'https:'),
      ),
    ),
  ];
}

async function scrapeCodesa(): Promise<ScrapedRoute[]> {
  const index = await fetchText(CODESA_INDEX);
  const queue = codesaLinks(index);
  const visited = new Set<string>();
  const routes: ScrapedRoute[] = [];

  while (queue.length > 0) {
    const url = queue.shift() as string;
    if (visited.has(url)) continue;
    visited.add(url);

    const html = await fetchText(url);

    // La página de ida enlaza la de vuelta y viceversa.
    for (const link of codesaLinks(html)) {
      if (!visited.has(link)) queue.push(link);
    }

    const title = decodeEntities(
      html.match(/<meta content='([^']*)' property='og:title'\/>/)?.[1] ?? '',
    );
    const lineCode = title.match(/L[ií]nea\s+(L?\d+(?:\s*\/\s*\d+)?|[A-Z])\b/i)?.[1]
      ?.replace(/\s+/g, '');
    if (!lineCode) {
      console.warn(`  ! ${url}: no se pudo leer el número de línea de "${title}"`);
      continue;
    }

    const mapId =
      html.match(/maps\/d\/(?:u\/\d+\/)?embed\?mid=([A-Za-z0-9_-]+)/)?.[1] ?? null;

    // Se aplana la página entera y el recorte se hace sobre el texto: el
    // título del recorrido no siempre está en un <b> —la página de vuelta de
    // la L49 lo pone en un <span>— y buscar el marcado dejaba esas afuera.
    //
    // El <head> se saca antes: el <title> de la página es "Línea 12 - ida |
    // CODESA" y engancha con el mismo patrón que el título del recorrido, con
    // lo cual lo que se guardaba como recorrido era el menú del blog.
    const flat = htmlToText(html.replace(/<head[\s\S]*?<\/head>/i, ' ')).replace(/\s+/g, ' ');

    routes.push({
      operator: 'codesa',
      lineCode,
      headsign: title.replace(/\s*\|\s*CODESA\s*$/i, '').trim() || null,
      streetText: codesaStreetText(flat),
      highlights: highlightsFrom(flat),
      sourceUrl: url,
      mapId,
      fallbackName: title || `Línea ${lineCode}`,
    });

    console.log(
      `  · ${title.padEnd(34)} ${mapId ? 'mapa' : 'sin mapa'}` +
        `${routes[routes.length - 1].streetText ? ' + texto' : ''}`,
    );
  }

  return routes;
}

/**
 * El recorrido calle por calle de una página de CODESA.
 *
 * Una misma página puede publicar dos versiones —invierno y verano, que van
 * por avenidas distintas— y las dos se guardan con su etiqueta. Elegir una
 * sería decidir por la empresa; mostrarlas juntas es lo que ella publica.
 */
function codesaStreetText(flat: string): string | null {
  // El título lleva el número de línea y a veces una aclaración entre
  // paréntesis con puntos adentro: "Línea 15 (Balneario Bs. As.) - IDA
  // (invierno...)", "Línea 6 (Pda. 16) - IDA". Y no siempre dice IDA: la L48
  // es circular.
  const heading = /L[ií]nea\s+[^;]{0,45}?\b(IDA|VUELTA|REGRESO|Circular)\b\s*(\([^)]*\))?/gi;
  const found = [...flat.matchAll(heading)];
  if (found.length === 0) return null;

  // Lo que sigue al último recorrido es el pie del blog. Los cortes se buscan
  // *después* del primer título, porque el menú de arriba repite palabras que
  // también marcan el final.
  const first = found[0].index as number;
  const limit = ['Pasadas de Inter', 'Comentarios', 'All rights reserved', 'Entradas populares']
    .map((marker) => flat.indexOf(marker, first))
    .filter((index) => index > first)
    .reduce((min, index) => Math.min(min, index), flat.length);

  const blocks: string[] = [];
  for (let i = 0; i < found.length; i++) {
    const from = (found[i].index as number) + found[i][0].length;
    const to = Math.min(found[i + 1]?.index ?? limit, limit);
    if (to <= from) continue;

    const streets = flat.slice(from, to).replace(/^[\s–—:-]+/, '').trim();
    if (streets.length < 20) continue;
    // Un recorrido es una lista de calles separadas por comas. Sin comas, lo
    // que se agarró es el menú del blog o un epígrafe suelto.
    if ((streets.match(/,/g) ?? []).length < 3) continue;

    const label = [found[i][1].toUpperCase(), found[i][2] ?? '']
      .filter(Boolean)
      .join(' ')
      .trim();
    blocks.push(`${label}: ${streets}`);
  }

  return blocks.length > 0 ? blocks.join('\n') : null;
}

/** "Pasadas de Interés": los lugares con los que la gente reconoce la línea. */
function highlightsFrom(flat: string): string[] {
  const match = flat.match(/Pasadas de Inter[ée]s\s*:?\s*([\s\S]*)$/i);
  if (!match) return [];

  // Después de la última pasada arranca el pie del blog, que no es contenido.
  return match[1].split(CODESA_TAIL)[0]
    .split(/[,.]\s*/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item.length > 2 && item.length < 60)
    .slice(0, 40);
}

// ---------------------------------------------------------------------------
// Maldonado Turismo — maldonadoturismo.com
//
// Una página por línea con un título por recorrido ("Recorrido de la línea 19
// – Maldonado a Punta del Este.") seguido del recorrido en texto y del mapa.
// Cada título manda sobre los mapas que vienen abajo hasta el título
// siguiente: la 16 y la 51 publican dos mapas por sentido (hora par y hora
// impar, invierno y verano).
// ---------------------------------------------------------------------------

const MT_INDEX = 'https://maldonadoturismo.com/recorridos/';

async function scrapeMaldonadoTurismo(): Promise<ScrapedRoute[]> {
  const index = await fetchText(MT_INDEX);
  const pages = [
    ...new Set(
      [...index.matchAll(/href="(https:\/\/maldonadoturismo\.com\/recorrido-linea-[^"]+)"/gi)].map(
        (match) => match[1],
      ),
    ),
  ];

  const routes: ScrapedRoute[] = [];

  for (const url of pages) {
    const html = await fetchText(url);

    // Títulos y mapas, en el orden en que aparecen en la página.
    const marks: Array<{ at: number; kind: 'heading' | 'map'; value: string }> = [];
    for (const match of html.matchAll(/Recorrido de la l[ií]nea[^<]{0,140}/gi)) {
      marks.push({
        at: match.index as number,
        kind: 'heading',
        value: decodeEntities(match[0]).replace(/\s+/g, ' ').trim(),
      });
    }
    for (const match of html.matchAll(/maps\/d\/(?:u\/\d+\/)?embed\?mid=([A-Za-z0-9_-]+)/g)) {
      marks.push({ at: match.index as number, kind: 'map', value: match[1] });
    }
    marks.sort((a, b) => a.at - b.at);

    const flat = htmlToText(html).replace(/\s+/g, ' ');

    let heading: string | null = null;
    for (const mark of marks) {
      if (mark.kind === 'heading') {
        heading = mark.value;
        continue;
      }
      if (!heading) continue;

      const lineCode =
        heading.match(/l[ií]nea\s+(\d+(?:\s*\/\s*\d+)?)/i)?.[1]?.replace(/\s+/g, '') ??
        url.match(/linea-([\d-]+)/)?.[1]?.replace(/-/g, '/');
      if (!lineCode) continue;

      routes.push({
        operator: 'maldonado-turismo',
        lineCode,
        headsign: heading.replace(/^Recorrido de la l[ií]nea\s*/i, '').replace(/\.$/, '').trim(),
        streetText: mtStreetText(flat, heading),
        highlights: [],
        sourceUrl: url,
        mapId: mark.value,
        fallbackName: heading,
      });
    }

    console.log(`  · ${url.split('/').filter(Boolean).pop()}: ${marks.filter((m) => m.kind === 'map').length} mapas`);
  }

  return routes;
}

/**
 * El párrafo que sigue al título del recorrido. Los cuatro recorridos de la
 * 19 comparten página, así que se corta en el título siguiente.
 */
function mtStreetText(flat: string, heading: string): string | null {
  const start = flat.indexOf(heading);
  if (start < 0) return null;

  const from = start + heading.length;
  const next = flat.slice(from).search(/Recorrido de la l[ií]nea/i);
  const streets = flat
    .slice(from, next >= 0 ? from + next : from + 1200)
    .replace(/©[\s\S]*$/, '')
    .replace(/^[\s–—:-]+/, '')
    .trim();

  return streets.length >= 20 ? streets : null;
}

// ---------------------------------------------------------------------------
// Micro Ltda — microltda.com
//
// Una página por línea con los dos mapas (ida y vuelta). No publica el
// recorrido en texto: queda la geometría, que es lo que se dibuja.
// ---------------------------------------------------------------------------

const MICRO_INDEX = 'https://microltda.com/recorridos';

async function scrapeMicro(): Promise<ScrapedRoute[]> {
  const index = await fetchText(MICRO_INDEX);

  // Las líneas de Rivera están en el mismo índice y no son de Maldonado. Se
  // filtran por los códigos que efectivamente circulan acá, que son los que
  // publica el feed AVL de la empresa.
  const maldonadoLines = new Set(['18', '20', '22', '42', '62', '100']);

  const pages = [
    ...new Set(
      [...index.matchAll(/href="(\/recorrido-l[^"]*?(\d+))"/gi)]
        .filter((match) => maldonadoLines.has(match[2]))
        .map((match) => new URL(match[1], MICRO_INDEX).toString()),
    ),
  ];

  const routes: ScrapedRoute[] = [];

  for (const url of pages) {
    const html = await fetchText(url);
    const lineCode = decodeURIComponent(url).match(/l[ií]nea-(\d+)/i)?.[1];
    if (!lineCode) continue;

    const mapIds = [
      ...new Set(
        [...html.matchAll(/maps\/d\/(?:u\/\d+\/)?embed\?mid=([A-Za-z0-9_-]+)/g)].map((m) => m[1]),
      ),
    ];

    for (const mapId of mapIds) {
      routes.push({
        operator: 'micro',
        lineCode,
        headsign: null,
        streetText: null,
        highlights: [],
        sourceUrl: url,
        mapId,
        fallbackName: `Línea ${lineCode}`,
      });
    }

    console.log(`  · línea ${lineCode}: ${mapIds.length} mapas`);
  }

  return routes;
}

// ---------------------------------------------------------------------------
// Geometría
// ---------------------------------------------------------------------------

async function withGeometry(scraped: ScrapedRoute[]): Promise<OfficialRoute[]> {
  const routes: OfficialRoute[] = [];
  const used = new Map<string, number>();

  for (const route of scraped) {
    let name = route.fallbackName;
    let geometry: LngLat[] | null = null;

    if (route.mapId) {
      try {
        const kml = await fetchText(kmlUrl(route.mapId));
        name = kmlName(kml) ?? name;

        const segments = kmlLineStrings(kml);
        const joined = joinSegments(segments);
        if (joined.geometry.length >= 2) geometry = joined.geometry;
        if (joined.dropped > 0) {
          console.warn(
            `  ! ${name}: ${joined.dropped} tramo(s) del mapa no continúan el recorrido y se descartan`,
          );
        }
      } catch (error: any) {
        console.warn(`  ! ${route.fallbackName}: no se pudo bajar el mapa (${error?.message})`);
      }
    }

    // La variante identifica el recorrido dentro de la línea. Si dos mapas de
    // la misma línea se llamaran igual, el segundo llevaría sufijo en vez de
    // pisar al primero.
    const base = variantSlug(name, route.lineCode);
    const key = `${route.operator}|${route.lineCode}|${base}`;
    const seen = used.get(key) ?? 0;
    used.set(key, seen + 1);

    routes.push({
      ...route,
      name,
      variant: seen === 0 ? base : `${base}-${seen + 1}`,
      geometry,
      distanceM: geometry ? polylineLength(geometry) : null,
    });
  }

  return routes;
}

// ---------------------------------------------------------------------------
// Persistencia
// ---------------------------------------------------------------------------

async function save(dataSource: DataSource, routes: OfficialRoute[]): Promise<void> {
  for (const route of routes) {
    await dataSource.query(
      `
      INSERT INTO official_routes
        (operator, line_code, variant, name, headsign, geometry, distance_m,
         street_text, highlights, source_url, map_id, imported_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, now())
      ON CONFLICT (operator, line_code, variant) DO UPDATE SET
        name        = EXCLUDED.name,
        headsign    = EXCLUDED.headsign,
        -- Un mapa que hoy no se pudo bajar no borra el que ya estaba.
        geometry    = COALESCE(EXCLUDED.geometry, official_routes.geometry),
        distance_m  = COALESCE(EXCLUDED.distance_m, official_routes.distance_m),
        street_text = COALESCE(EXCLUDED.street_text, official_routes.street_text),
        highlights  = CASE WHEN cardinality(EXCLUDED.highlights) > 0
                           THEN EXCLUDED.highlights ELSE official_routes.highlights END,
        source_url  = EXCLUDED.source_url,
        map_id      = COALESCE(EXCLUDED.map_id, official_routes.map_id),
        imported_at = now()
      `,
      [
        route.operator,
        route.lineCode,
        route.variant,
        route.name,
        route.headsign,
        route.geometry ? JSON.stringify(route.geometry) : null,
        route.distanceM,
        route.streetText,
        route.highlights,
        route.sourceUrl,
        route.mapId,
      ],
    );
  }
}

// ---------------------------------------------------------------------------

async function main() {
  const scrapers: Array<[string, () => Promise<ScrapedRoute[]>]> = [
    ['codesa', scrapeCodesa],
    ['maldonado-turismo', scrapeMaldonadoTurismo],
    ['micro', scrapeMicro],
  ];

  const scraped: ScrapedRoute[] = [];
  for (const [operator, scrape] of scrapers) {
    if (onlyOperator && operator !== onlyOperator) continue;
    console.log(`\n${operator}`);
    try {
      scraped.push(...(await scrape()));
    } catch (error: any) {
      console.error(`  ! ${operator}: ${error?.message ?? error}`);
    }
  }

  console.log(`\nBajando los mapas de ${scraped.filter((r) => r.mapId).length} recorridos...`);
  const routes = await withGeometry(scraped);

  console.log('\nRecorridos publicados:\n');
  for (const route of routes) {
    const geometry = route.geometry
      ? `${route.geometry.length} puntos, ${(route.distanceM / 1000).toFixed(1)} km`
      : 'sin mapa';
    console.log(
      `  ${route.operator.padEnd(18)} ${route.lineCode.padEnd(5)} ${route.variant.padEnd(28)} ` +
        `${geometry.padEnd(24)} ${route.streetText ? 'texto' : '—'}`,
    );
  }

  const conMapa = routes.filter((route) => route.geometry).length;
  const conTexto = routes.filter((route) => route.streetText).length;
  console.log(
    `\n${routes.length} recorridos | ${conMapa} con trazo oficial | ${conTexto} con recorrido en texto`,
  );

  if (dryRun) {
    console.log('\n--dry: no se escribió nada.');
    return;
  }

  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  await dataSource.initialize();
  try {
    await save(dataSource, routes);
    const [{ total }] = await dataSource.query(
      `SELECT count(*)::int AS total FROM official_routes`,
    );
    console.log(`\nGuardados. La tabla official_routes tiene ${total} recorridos.`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
