import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { distanceMeters } from './geo.util';

/**
 * "¿A dónde vas?"
 *
 * El buscador de destinos miraba dos cosas: las 28 fichas turísticas de
 * `places` y los nombres de las paradas. Con eso, "punta shopping", "el
 * hospital", "la terminal" o "liceo 3" no encontraban nada —ninguno es un
 * atractivo turístico— y la pantalla quedaba en blanco justo con los destinos
 * más buscados del departamento.
 *
 * Ahora busca sobre tres catálogos a la vez:
 *
 *   turismo   las fichas de `places`, con foto y descripción
 *   lugar     2.800 lugares con nombre de OpenStreetMap: comercios,
 *             hospitales, liceos, hoteles, plazas, barrios
 *   parada    las paradas del feed de las empresas
 *
 * Los tres caben en memoria de sobra -unos cuatro mil registros- así que se
 * cargan una vez y la búsqueda es un barrido en JavaScript. Es más rápido que
 * ir a la base y, sobre todo, permite comparar como escribe la gente: sin
 * acentos, sin importar el orden de las palabras y sin exigir la palabra
 * entera. "tnal maldonado" tiene que encontrar "TERMINAL MALDONADO".
 */

export type DestinationKind = 'turismo' | 'lugar' | 'parada';

export interface Destination {
  id: string;
  name: string;
  /** Qué es, en castellano: "hospital", "barrio", "parada de ómnibus". */
  kind: string;
  source: DestinationKind;
  lat: number;
  lng: number;
  /** Barrio o localidad, para distinguir dos lugares que se llaman igual. */
  locality: string | null;
  /** Metros hasta el punto que se pasó como referencia, si se pasó alguno. */
  distanceM?: number;
  /** Las líneas que paran ahí. Sólo en las paradas. */
  lines?: string[];
}

interface Indexed extends Destination {
  /** El nombre en minúsculas y sin acentos, que es contra lo que se compara. */
  search: string;
  /** Cuánto pesa en el orden, de 0 a 1. */
  importance: number;
}

/** Cada cuánto se releen los catálogos. Cambian de a días, no de a minutos. */
const RELOAD_INTERVAL_MS = 30 * 60 * 1000;

/** Palabras que la gente escribe y no distinguen nada. */
const NOISE = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'a', 'al', 'en', 'y']);

/**
 * Abreviaturas de los carteles de las empresas, para que lo que la gente
 * escribe encuentre lo que la empresa publicó. El catálogo de paradas viene en
 * mayúsculas y abreviado: "TNAL MALDONADO", "P. DEL ESTE", "BAL. BS. AS.".
 */
const SYNONYMS: Record<string, string[]> = {
  terminal: ['tnal'],
  maldonado: ['mldo', 'mdo'],
  punta: ['pta', 'pde'],
  este: [],
  balneario: ['bal', 'baln'],
  piriapolis: ['piria'],
  agencia: ['ag'],
  avenida: ['av', 'avda'],
  rambla: ['rbla'],
  doctor: ['dr'],
  cerro: [],
  hospital: [],
};

/** Minúsculas, sin acentos y sin puntuación. */
export function searchable(value: string): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Las formas alternativas de una palabra: ella misma y sus abreviaturas. */
function variants(word: string): string[] {
  const forms = [word];
  for (const [full, short] of Object.entries(SYNONYMS)) {
    if (word === full) forms.push(...short);
    else if (short.includes(word)) forms.push(full);
  }
  return forms;
}

@Injectable()
export class DestinationsService implements OnModuleInit {
  private readonly logger = new Logger(DestinationsService.name);

  private catalog: Indexed[] = [];
  private loadedAt = 0;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onModuleInit() {
    await this.load();
  }

  async load(): Promise<number> {
    const catalog: Indexed[] = [];

    // --- Atractivos turísticos, los que tienen ficha propia ---
    try {
      const rows = await this.dataSource.query(
        `SELECT id, name, category, lat, lng FROM places
          WHERE lat IS NOT NULL AND lng IS NOT NULL`,
      );
      for (const row of rows) {
        catalog.push({
          id: `turismo:${row.id}`,
          name: row.name,
          kind: row.category ?? 'atractivo',
          source: 'turismo',
          lat: Number(row.lat),
          lng: Number(row.lng),
          locality: null,
          search: searchable(row.name),
          // Los atractivos con ficha pesan alto: alguien los cargó a mano
          // justamente porque son destino.
          importance: 0.9,
        });
      }
    } catch (error: any) {
      this.logger.warn(`No se pudieron leer los atractivos: ${error?.message ?? error}`);
    }

    // --- Lugares con nombre de OpenStreetMap ---
    try {
      const rows = await this.dataSource.query(
        `SELECT id, name, search_name, kind, lat, lng, locality, importance FROM geo_places`,
      );
      for (const row of rows) {
        catalog.push({
          id: `lugar:${row.id}`,
          name: row.name,
          kind: row.kind,
          source: 'lugar',
          lat: Number(row.lat),
          lng: Number(row.lng),
          locality: row.locality,
          search: row.search_name,
          importance: Number(row.importance),
        });
      }
    } catch (error: any) {
      this.logger.warn(
        `No se pudieron leer los lugares de OSM (¿falta importarlos?): ${error?.message ?? error}`,
      );
    }

    // --- Paradas ---
    try {
      const rows = await this.dataSource.query(
        `SELECT p.id, p.name, p.code, p.lat, p.lng,
                array_remove(array_agg(DISTINCT i.line_code), NULL) AS lines
           FROM bus_stops p
           LEFT JOIN itinerary_stops i ON i.stop_id = p.id
          WHERE p.is_active AND p.lat IS NOT NULL AND p.lng IS NOT NULL
          GROUP BY p.id`,
      );
      for (const row of rows) {
        catalog.push({
          id: `parada:${row.id}`,
          name: row.name,
          kind: 'parada de ómnibus',
          source: 'parada',
          lat: Number(row.lat),
          lng: Number(row.lng),
          locality: null,
          lines: (row.lines ?? []).sort(),
          search: searchable(row.name),
          // Una parada es un destino intermedio: quien busca "shopping"
          // quiere el shopping, no la parada que se llama igual. Pero pesa
          // más si tiene líneas asignadas, porque entonces sirve de verdad.
          importance: (row.lines ?? []).length > 0 ? 0.55 : 0.4,
        });
      }
    } catch (error: any) {
      this.logger.warn(`No se pudieron leer las paradas: ${error?.message ?? error}`);
    }

    this.catalog = catalog;
    this.loadedAt = Date.now();
    this.logger.log(`Destinos buscables: ${catalog.length}`);

    return catalog.length;
  }

  /**
   * Los destinos que coinciden con lo escrito.
   *
   * Todas las palabras tienen que aparecer, en cualquier orden y como
   * comienzo de palabra: "punta shop" encuentra "Punta Shopping" y "shopping
   * punta" también. Se compara por comienzo y no por contenido para que
   * "san" no traiga todo lo que tenga "san" en el medio de una palabra.
   */
  async search(
    query: string,
    reference?: { lat: number; lng: number },
    limit = 8,
  ): Promise<Destination[]> {
    if (Date.now() - this.loadedAt > RELOAD_INTERVAL_MS) await this.load();

    // El texto entero normalizado, para reconocer cuando alguien escribió el
    // nombre completo de un lugar: "la barra" es el balneario, no el shopping
    // "Oh! La Barra". Las palabras sueltas se usan para el resto.
    const full = searchable(query);
    const words = full.split(' ').filter((word) => word.length > 0 && !NOISE.has(word));
    if (words.length === 0) return [];

    const scored: Array<{ item: Indexed; score: number }> = [];

    for (const item of this.catalog) {
      const words2 = item.search.split(' ');

      let matched = 0;
      let exactWords = 0;
      for (const word of words) {
        const forms = variants(word);
        const hit = words2.find((candidate) =>
          forms.some((form) => candidate.startsWith(form)),
        );
        if (!hit) break;
        matched++;
        if (forms.includes(hit)) exactWords++;
      }
      if (matched < words.length) continue;

      let score = item.importance;

      // El nombre exacto gana. Sin esto, cualquier comercio que incluya el
      // nombre de un balneario le pasa por arriba al balneario.
      //
      // En las paradas cuenta menos: el nombre de una parada es el del lugar
      // que tiene al lado, no el del lugar. Quien escribe "hospital" quiere el
      // hospital, y la parada "HOSPITAL" es la consecuencia, no el destino.
      if (item.search === full) score += item.source === 'parada' ? 0.2 : 0.5;

      // Que empiece con lo escrito vale más que que lo tenga en el medio:
      // "punta shopping" antes que "Abitab Punta Shopping".
      if (item.search.startsWith(words[0])) score += 0.25;
      // Palabras completas antes que comienzos sueltos.
      score += 0.1 * (exactWords / words.length);
      // Cuantas menos palabras de más tenga el nombre, más se parece a lo
      // que se buscó.
      score += 0.15 * (words.length / Math.max(words.length, words2.length));

      if (reference) {
        const distance = distanceMeters(reference.lat, reference.lng, item.lat, item.lng);
        // Lo cercano primero, pero sin que la distancia decida sola: a 20 km
        // el ajuste se agota. Maldonado y Punta del Este están a 8 km.
        score += 0.35 * Math.max(0, 1 - distance / 20000);
      }

      scored.push({ item, score });
    }

    scored.sort((a, b) => b.score - a.score);

    // Dos filas con el mismo nombre en la misma zona son el mismo lugar
    // anotado dos veces: la parada de ida y la de vuelta, el balneario como
    // ficha turística y como localidad de OSM, el local y su edificio. Se
    // muestra una sola. El radio es generoso -un balneario mide más que una
    // cuadra- pero no tanto como para juntar dos escuelas homónimas de
    // ciudades distintas.
    const results: Destination[] = [];
    for (const { item } of scored) {
      const duplicate = results.some(
        (other) =>
          searchable(other.name) === item.search &&
          distanceMeters(other.lat, other.lng, item.lat, item.lng) < 1500,
      );
      if (duplicate) continue;

      const { search, importance, ...destination } = item;
      void search;
      void importance;

      results.push(
        reference
          ? {
              ...destination,
              distanceM: Math.round(
                distanceMeters(reference.lat, reference.lng, item.lat, item.lng),
              ),
            }
          : destination,
      );

      if (results.length >= limit) break;
    }

    return results;
  }

  /**
   * Cómo se llama este punto del mapa.
   *
   * Cuando alguien marca un destino tocando el mapa, la app tiene una
   * coordenada y ningún nombre. Mostrar "-34.90812, -54.95003" no le sirve a
   * nadie para confirmar que marcó bien: lo que confirma es el lugar de al
   * lado.
   *
   * No se inventa un nombre ni se le pone el del lugar más cercano como si
   * fuera ese lugar. Se contesta **de qué está cerca**, y sólo si hay algo lo
   * bastante cerca como para que la frase sea cierta. Si no hay nada, no hay
   * nombre: la pantalla dirá "punto en el mapa", que es exactamente lo que es.
   *
   * Las paradas quedan para el final aunque estén más cerca: "cerca de la
   * parada 412" no ubica a nadie, y hay una parada cada dos cuadras, así que
   * con las paradas compitiendo por distancia ganarían casi siempre.
   */
  async nearest(
    point: { lat: number; lng: number },
    maxMeters = 200,
  ): Promise<{ destination: Destination; distanceM: number } | null> {
    if (this.catalog.length === 0) await this.load();

    let best: { item: Indexed; distance: number } | null = null;

    for (const item of this.catalog) {
      const distance = distanceMeters(point.lat, point.lng, item.lat, item.lng);
      if (distance > maxMeters) continue;

      if (!best) {
        best = { item, distance };
        continue;
      }

      const eraParada = best.item.source === 'parada';
      const esParada = item.source === 'parada';
      if (eraParada !== esParada) {
        if (eraParada) best = { item, distance };
        continue;
      }

      if (distance < best.distance) best = { item, distance };
    }

    if (!best) return null;

    const { search, importance, ...destination } = best.item;
    void search;
    void importance;

    return { destination, distanceM: Math.round(best.distance) };
  }

  /** Un destino por su identificador ("lugar:412", "parada:87"). */
  async byId(id: string): Promise<Destination | null> {
    if (this.catalog.length === 0) await this.load();

    const item = this.catalog.find((candidate) => candidate.id === id);
    if (!item) return null;

    const { search, importance, ...destination } = item;
    void search;
    void importance;
    return destination;
  }
}
