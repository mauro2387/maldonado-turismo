/**
 * Baja las paradas relevadas en OpenStreetMap y las guarda en `osm_bus_stops`.
 *
 *   npx ts-node src/scripts/import-osm-stops.ts --dry
 *   npx ts-node src/scripts/import-osm-stops.ts
 *
 * **No son el catálogo.** El catálogo -qué paradas existen, con qué código y
 * qué nombre- lo publica la empresa en el feed AVL y de ahí sale (ver
 * `StopCatalogService`). OSM no tiene los códigos y tiene menos de la mitad de
 * las paradas. Lo que sí tiene, y no tiene ninguna otra fuente, es **una
 * coordenada relevada por alguien que estuvo parado ahí**, más si esa parada
 * tiene refugio, banco o iluminación.
 *
 * Sirve para dos cosas y las dos importan:
 *
 * 1. **Medir.** Es la única verdad de campo independiente que hay, así que es
 *    contra estos nodos que se calibra el estimador. Los números del error
 *    -57 m el método viejo, 15 m el nuevo- salieron de acá.
 * 2. **Corregir.** Donde el nodo de OSM y lo medido por el feed coinciden, se
 *    usa el nodo: está sobre la vereda, no sobre el eje de la calle, y lo puso
 *    una persona. Donde no coinciden, gana lo medido y la parada queda marcada
 *    para revisar: OSM también se equivoca, y una sola fuente que contradice a
 *    veinte ómnibus no alcanza para mover una parada.
 *
 * Licencia: ODbL. Cada fila guarda su `osm_id`, así que se puede volver a la
 * fuente de cualquier dato (`https://www.openstreetmap.org/node/<id>`).
 *
 * Es idempotente: hace upsert por id de OSM.
 */
import { DataSource } from 'typeorm';
import 'dotenv/config';

const dryRun = process.argv.includes('--dry');

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/**
 * Overpass rechaza con 406 los pedidos sin User-Agent, y su política pide que
 * identifique a quien consulta. Este script hace una sola consulta por corrida.
 */
const USER_AGENT = 'MaldonadoMoverseApp/1.0 (contacto@pulsarmoon.com)';

/**
 * El departamento por su relación administrativa y no por una caja de
 * coordenadas: una caja que cubra Piriápolis y José Ignacio entra en Rocha y en
 * Canelones, y traería paradas de otro sistema.
 *
 * Se piden las tres etiquetas con las que se mapea una parada de ómnibus. Las
 * tres conviven en la misma zona porque el esquema cambió con los años, y
 * quedarse sólo con `highway=bus_stop` pierde las mapeadas con el esquema nuevo.
 */
const QUERY = `
[out:json][timeout:180];
area["name"="Maldonado"]["admin_level"="4"]["boundary"="administrative"]->.depto;
(
  node["highway"="bus_stop"](area.depto);
  node["public_transport"="platform"]["bus"="yes"](area.depto);
  node["public_transport"="stop_position"]["bus"="yes"](area.depto);
);
out body;
`;

interface OsmNode {
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

/** "yes"/"no" de OSM a booleano; cualquier otra cosa queda sin dato. */
function siNo(value: string | undefined): boolean | null {
  if (value === 'yes') return true;
  if (value === 'no') return false;
  return null;
}

async function main(): Promise<void> {
  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: `data=${encodeURIComponent(QUERY)}`,
  });

  if (!response.ok) {
    throw new Error(`Overpass respondió ${response.status}: ${await response.text()}`);
  }

  const { elements } = (await response.json()) as { elements: OsmNode[] };
  const nodos = elements.filter((nodo) => nodo.lat != null && nodo.lon != null);

  console.log(`OpenStreetMap: ${nodos.length} paradas en el departamento`);
  console.log(`  con nombre:  ${nodos.filter((n) => n.tags?.name).length}`);
  console.log(`  con refugio: ${nodos.filter((n) => n.tags?.shelter === 'yes').length}`);

  if (dryRun) {
    for (const nodo of nodos.slice(0, 10)) {
      console.log(`  ${nodo.id}  ${nodo.lat},${nodo.lon}  ${nodo.tags?.name ?? '(sin nombre)'}`);
    }
    console.log('\n--dry: no se escribió nada');
    return;
  }

  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await dataSource.initialize();

  try {
    let guardados = 0;

    for (const nodo of nodos) {
      const tags = nodo.tags ?? {};
      await dataSource.query(
        `INSERT INTO osm_bus_stops
           (osm_id, name, ref, latitude, longitude, shelter, bench, lighting, tags, imported_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
         ON CONFLICT (osm_id) DO UPDATE SET
           name = EXCLUDED.name,
           ref = EXCLUDED.ref,
           latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude,
           shelter = EXCLUDED.shelter,
           bench = EXCLUDED.bench,
           lighting = EXCLUDED.lighting,
           tags = EXCLUDED.tags,
           imported_at = now()`,
        [
          nodo.id,
          tags.name ?? null,
          tags.ref ?? null,
          nodo.lat,
          nodo.lon,
          siNo(tags.shelter),
          siNo(tags.bench),
          siNo(tags.lit),
          JSON.stringify(tags),
        ],
      );
      guardados++;
    }

    console.log(`\nGuardadas ${guardados} paradas de OpenStreetMap.`);
    console.log('Ahora corré la colocación para que la coordenada llegue al catálogo:');
    console.log('  curl -X POST http://localhost:3000/api/v1/transport/stops/place');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
