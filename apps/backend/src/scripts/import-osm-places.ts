/**
 * Importa de OpenStreetMap los lugares con nombre de Maldonado, para poder
 * buscar un destino que no sea un atractivo turístico.
 *
 *   npx ts-node src/scripts/import-osm-places.ts --dry
 *   npx ts-node src/scripts/import-osm-places.ts
 *
 * Por qué: el buscador de destinos miraba las 28 fichas de `places` y los
 * nombres de las paradas. "Punta Shopping", "el hospital", "la terminal", "el
 * liceo 3" —los destinos más buscados del departamento— no daban ningún
 * resultado y la pantalla quedaba vacía. Ninguno de esos es un atractivo
 * turístico, y por eso no estaban.
 *
 * OSM tiene 2.800 lugares con nombre mapeados acá: comercios, hospitales,
 * liceos, hoteles, plazas, barrios. Es ODbL, se cita la fuente y cada fila
 * queda con su id de OSM, así que la importación es repetible y se puede
 * volver al original.
 *
 * Es idempotente: upsert por (tipo, id de OSM).
 */
import { DataSource } from 'typeorm';
import 'dotenv/config';

const dryRun = process.argv.includes('--dry');

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const USER_AGENT = 'MaldonadoMoverseApp/1.0 (contacto@pulsarmoon.com)';

/**
 * La franja poblada del departamento: de Piriápolis a José Ignacio, del mar a
 * Pan de Azúcar. Se usa una caja y no el área administrativa porque la
 * consulta por área sobre este volumen de nodos hace expirar al servidor
 * público de Overpass.
 */
const BBOX = '-35.05,-55.35,-34.70,-54.55';

const QUERY = `
[out:json][timeout:180];
(
  nwr["name"]["amenity"](${BBOX});
  nwr["name"]["shop"](${BBOX});
  nwr["name"]["tourism"](${BBOX});
  nwr["name"]["leisure"](${BBOX});
  nwr["name"]["healthcare"](${BBOX});
  nwr["name"]["office"](${BBOX});
  node["name"]["place"~"suburb|neighbourhood|village|town|city|hamlet|locality"](${BBOX});
);
out center tags;
`;

interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface GeoPlace {
  name: string;
  searchName: string;
  kind: string;
  osmTag: string;
  lat: number;
  lng: number;
  locality: string | null;
  importance: number;
  osmType: string;
  osmId: number;
}

/**
 * De la etiqueta de OSM a una palabra que la gente entienda, y a cuánto pesa
 * en el orden de los resultados.
 *
 * El peso no es popularidad -no hay con qué medirla- sino cuán probable es que
 * alguien lo escriba como destino. Quien busca "terminal" quiere la terminal
 * de ómnibus, no el "Taxi Terminal" de la esquina; quien busca "hospital"
 * quiere el hospital y no la "Farmacia Nuevo Hospital". Sin esta escala los
 * dos primeros resultados eran justamente esos.
 */
const KINDS: Record<string, { kind: string; importance: number }> = {
  'amenity=bus_station': { kind: 'terminal', importance: 1 },
  'amenity=hospital': { kind: 'hospital', importance: 0.95 },
  'amenity=university': { kind: 'universidad', importance: 0.9 },
  'amenity=college': { kind: 'instituto', importance: 0.8 },
  'amenity=school': { kind: 'escuela o liceo', importance: 0.8 },
  'amenity=townhall': { kind: 'edificio público', importance: 0.85 },
  'amenity=police': { kind: 'policía', importance: 0.75 },
  'amenity=fire_station': { kind: 'bomberos', importance: 0.7 },
  'amenity=clinic': { kind: 'policlínica', importance: 0.7 },
  'amenity=doctors': { kind: 'policlínica', importance: 0.6 },
  'amenity=pharmacy': { kind: 'farmacia', importance: 0.5 },
  'amenity=marketplace': { kind: 'feria', importance: 0.5 },
  'amenity=place_of_worship': { kind: 'iglesia', importance: 0.5 },
  'amenity=theatre': { kind: 'teatro', importance: 0.6 },
  'amenity=cinema': { kind: 'cine', importance: 0.6 },
  'amenity=library': { kind: 'biblioteca', importance: 0.6 },
  'amenity=bank': { kind: 'banco', importance: 0.5 },
  'amenity=bureau_de_change': { kind: 'cambio', importance: 0.4 },
  'amenity=restaurant': { kind: 'restaurante', importance: 0.4 },
  'amenity=cafe': { kind: 'café', importance: 0.35 },
  'amenity=bar': { kind: 'bar', importance: 0.35 },
  'amenity=fast_food': { kind: 'comida rápida', importance: 0.35 },
  'amenity=ice_cream': { kind: 'heladería', importance: 0.3 },
  'amenity=fuel': { kind: 'estación de servicio', importance: 0.45 },
  'amenity=parking': { kind: 'estacionamiento', importance: 0.2 },
  'amenity=taxi': { kind: 'parada de taxis', importance: 0.2 },
  'amenity=community_centre': { kind: 'centro comunal', importance: 0.5 },
  'amenity=kindergarten': { kind: 'jardín de infantes', importance: 0.5 },
  'amenity=veterinary': { kind: 'veterinaria', importance: 0.3 },
  'amenity=post_office': { kind: 'correo', importance: 0.5 },

  'shop=mall': { kind: 'shopping', importance: 1 },
  'shop=department_store': { kind: 'tienda', importance: 0.6 },
  'shop=supermarket': { kind: 'supermercado', importance: 0.7 },
  'shop=convenience': { kind: 'almacén', importance: 0.3 },
  'shop=*': { kind: 'comercio', importance: 0.3 },

  'tourism=hotel': { kind: 'hotel', importance: 0.6 },
  'tourism=hostel': { kind: 'hostel', importance: 0.5 },
  'tourism=apartment': { kind: 'apart', importance: 0.4 },
  'tourism=museum': { kind: 'museo', importance: 0.8 },
  'tourism=attraction': { kind: 'atractivo', importance: 0.8 },
  'tourism=viewpoint': { kind: 'mirador', importance: 0.6 },
  'tourism=information': { kind: 'informes', importance: 0.5 },
  'tourism=camp_site': { kind: 'camping', importance: 0.6 },

  'leisure=park': { kind: 'parque', importance: 0.7 },
  'leisure=sports_centre': { kind: 'club', importance: 0.6 },
  'leisure=stadium': { kind: 'estadio', importance: 0.8 },
  'leisure=pitch': { kind: 'cancha', importance: 0.3 },
  'leisure=marina': { kind: 'puerto deportivo', importance: 0.6 },
  'leisure=beach_resort': { kind: 'balneario', importance: 0.6 },

  'healthcare=*': { kind: 'salud', importance: 0.6 },
  'office=government': { kind: 'oficina pública', importance: 0.7 },
  'office=*': { kind: 'oficina', importance: 0.25 },

  'place=city': { kind: 'ciudad', importance: 1 },
  'place=town': { kind: 'ciudad', importance: 0.95 },
  'place=village': { kind: 'pueblo', importance: 0.85 },
  'place=suburb': { kind: 'barrio', importance: 0.85 },
  'place=neighbourhood': { kind: 'barrio', importance: 0.8 },
  'place=hamlet': { kind: 'paraje', importance: 0.6 },
  'place=locality': { kind: 'paraje', importance: 0.5 },
};

/** Lo que no sirve como destino aunque tenga nombre. */
const SKIP = new Set([
  'amenity=bench',
  'amenity=waste_basket',
  'amenity=recycling',
  'amenity=drinking_water',
  'amenity=bicycle_parking',
  'amenity=atm',
  'amenity=telephone',
  'amenity=toilets',
  'amenity=shelter',
  'amenity=fountain',
]);

function classify(tags: Record<string, string>): { kind: string; importance: number; tag: string } | null {
  for (const key of ['amenity', 'shop', 'tourism', 'leisure', 'healthcare', 'office', 'place']) {
    const value = tags[key];
    if (!value) continue;

    const tag = `${key}=${value}`;
    if (SKIP.has(tag)) return null;

    const match = KINDS[tag] ?? KINDS[`${key}=*`];
    if (match) return { ...match, tag };

    // Etiqueta que no está en la tabla: entra igual, con poco peso. Es
    // preferible que un lugar aparezca abajo en la lista a que no exista.
    return { kind: key === 'place' ? 'lugar' : key, importance: 0.25, tag };
  }

  return null;
}

/** Minúsculas y sin acentos: la forma en la que se compara al buscar. */
export function searchable(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchElements(): Promise<OsmElement[]> {
  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: 'data=' + encodeURIComponent(QUERY),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });

  const text = await response.text();
  if (!text.trim().startsWith('{')) {
    // Overpass devuelve el error en HTML: normalmente es que el servidor
    // público está ocupado y conviene reintentar en unos minutos.
    throw new Error(`Overpass respondió ${response.status}: ${text.slice(0, 200)}`);
  }

  return JSON.parse(text).elements ?? [];
}

function toPlace(element: OsmElement): GeoPlace | null {
  const tags = element.tags ?? {};
  const name = tags.name?.trim();
  if (!name || name.length > 200) return null;

  const classified = classify(tags);
  if (!classified) return null;

  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    name,
    searchName: searchable(name),
    kind: classified.kind,
    osmTag: classified.tag,
    lat: lat as number,
    lng: lng as number,
    locality: tags['addr:city'] ?? tags['addr:suburb'] ?? null,
    importance: classified.importance,
    osmType: element.type,
    osmId: element.id,
  };
}

async function main() {
  console.log('Consultando OpenStreetMap...');
  const elements = await fetchElements();

  const places = elements
    .map(toPlace)
    .filter((place): place is GeoPlace => place !== null);

  const byKind = new Map<string, number>();
  for (const place of places) byKind.set(place.kind, (byKind.get(place.kind) ?? 0) + 1);

  console.log(`\n${places.length} lugares con nombre, de ${elements.length} elementos.\n`);
  for (const [kind, count] of [...byKind.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    console.log(`  ${String(count).padStart(5)}  ${kind}`);
  }

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
    for (let index = 0; index < places.length; index += 200) {
      const batch = places.slice(index, index + 200);
      const values = batch
        .map((_, position) => {
          const base = position * 10;
          return (
            `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::float8, ` +
            `$${base + 6}::float8, $${base + 7}, $${base + 8}::float8, $${base + 9}, $${base + 10}::bigint)`
          );
        })
        .join(', ');

      await dataSource.query(
        `INSERT INTO geo_places
           (name, search_name, kind, osm_tag, lat, lng, locality, importance, osm_type, osm_id)
         VALUES ${values}
         ON CONFLICT (osm_type, osm_id) DO UPDATE SET
           name = EXCLUDED.name, search_name = EXCLUDED.search_name,
           kind = EXCLUDED.kind, osm_tag = EXCLUDED.osm_tag,
           lat = EXCLUDED.lat, lng = EXCLUDED.lng,
           locality = EXCLUDED.locality, importance = EXCLUDED.importance,
           updated_at = now()`,
        batch.flatMap((place) => [
          place.name,
          place.searchName,
          place.kind,
          place.osmTag,
          place.lat,
          place.lng,
          place.locality,
          place.importance,
          place.osmType,
          place.osmId,
        ]),
      );
    }

    const [{ total }] = await dataSource.query(`SELECT count(*)::int AS total FROM geo_places`);
    console.log(`\nGuardados. geo_places tiene ${total} lugares.`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
