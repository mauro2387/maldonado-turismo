/**
 * Importa las paradas de ómnibus del departamento de Maldonado desde
 * OpenStreetMap.
 *
 *   npx ts-node src/scripts/import-stops-osm.ts --dry   # sólo muestra qué haría
 *   npx ts-node src/scripts/import-stops-osm.ts         # inserta y actualiza
 *
 * Por qué desde OSM: la app ya reconstruye los recorridos reales de cada línea
 * con el GPS de las empresas, pero para calcular una llegada hace falta además
 * saber dónde para el ómnibus. En la base hay ocho filas de ejemplo que además
 * son atractivos turísticos, no paradas, así que ninguna línea puede ordenarse
 * y `Cerca tuyo` queda siempre vacío.
 *
 * No hay un GTFS público de Maldonado del cual importarlas —el catálogo
 * nacional de datos abiertos sólo publica los horarios interdepartamentales del
 * MTOP— y OpenStreetMap sí tiene las paradas mapeadas, con licencia ODbL y
 * fuente citable. Cada parada queda guardada con su id de OSM, así que se puede
 * volver a la fuente de cualquier fila.
 *
 * Es idempotente: hace upsert por id de OSM, se puede correr de nuevo para
 * traer altas y correcciones sin duplicar ni perder ids internos.
 */
import { DataSource } from 'typeorm';
import 'dotenv/config';

const dryRun = process.argv.includes('--dry');

/**
 * Instancia pública de Overpass. Pide un User-Agent que identifique a quien
 * consulta y desaconseja las ráfagas: este script hace una sola consulta.
 */
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const USER_AGENT = 'MaldonadoMoverseApp/1.0 (contacto@pulsarmoon.com)';

/**
 * Área administrativa del departamento de Maldonado en OSM.
 * `area["name"="Maldonado"]["admin_level"="4"]` la resuelve por nombre, sin
 * clavar un id que puede cambiar si alguien rehace el relation.
 */
const QUERY = `
[out:json][timeout:180];
area["name"="Maldonado"]["admin_level"="4"]["boundary"="administrative"]->.depto;
(
  node["highway"="bus_stop"](area.depto);
  node["public_transport"="platform"]["bus"="yes"](area.depto);
);
out body;
`;

interface OsmNode {
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface StopImport {
  osmId: number;
  code: string;
  name: string;
  lat: number;
  lng: number;
  zone: string | null;
  hasShelter: boolean;
  hasBench: boolean;
  hasLighting: boolean;
  accessible: boolean;
}

/** "yes" es el valor afirmativo de OSM; el resto ("no", ausente) no lo es. */
function isYes(value?: string): boolean {
  return value === 'yes';
}

/**
 * Una parada sin nombre en OSM es lo más común: se mapea el punto pero no el
 * cartel. Se le arma un nombre con la calle, que es como la gente la
 * identifica, y si tampoco hay calle queda genérico con su código.
 */
function stopName(tags: Record<string, string>, osmId: number): string {
  const explicit = tags.name ?? tags['name:es'] ?? tags.ref_name;
  if (explicit) return explicit;

  const street = tags['addr:street'] ?? tags.street;
  if (street) return `Parada ${street}`;

  return `Parada OSM-${osmId}`;
}

function toStopImport(node: OsmNode): StopImport | null {
  if (!Number.isFinite(node.lat) || !Number.isFinite(node.lon)) return null;

  const tags = node.tags ?? {};

  return {
    osmId: node.id,
    // El código lleva el id de OSM para que la fila siempre se pueda rastrear
    // hasta su origen, y para que el upsert tenga una clave estable.
    code: `OSM-${node.id}`,
    name: stopName(tags, node.id),
    lat: node.lat,
    lng: node.lon,
    zone: tags['addr:suburb'] ?? tags['addr:city'] ?? tags.operator ?? null,
    hasShelter: isYes(tags.shelter),
    hasBench: isYes(tags.bench),
    hasLighting: isYes(tags.lit),
    accessible: isYes(tags.wheelchair),
  };
}

async function fetchStops(): Promise<StopImport[]> {
  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: `data=${encodeURIComponent(QUERY)}`,
  });

  if (!response.ok) {
    throw new Error(`Overpass respondió ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const elements: OsmNode[] = data?.elements ?? [];

  const stops = elements
    .map(toStopImport)
    .filter((stop): stop is StopImport => stop !== null);

  // Una parada puede estar mapeada dos veces (el poste y la plataforma).
  const byId = new Map<number, StopImport>();
  for (const stop of stops) byId.set(stop.osmId, stop);

  return [...byId.values()];
}

/**
 * Comprueba qué columnas tiene realmente `bus_stops`. La base todavía puede
 * estar con el esquema viejo, sin `code` ni los servicios de la parada: en ese
 * caso se importa lo que sí entra y se avisa qué se está perdiendo.
 */
async function availableColumns(dataSource: DataSource): Promise<Set<string>> {
  const rows = await dataSource.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'bus_stops' AND table_schema = current_schema()`,
  );
  return new Set(rows.map((row: any) => row.column_name));
}

async function upsert(
  dataSource: DataSource,
  columns: Set<string>,
  stop: StopImport,
): Promise<'creado' | 'actualizado'> {
  const hasCode = columns.has('code');

  const [existing] = hasCode
    ? await dataSource.query('SELECT id FROM bus_stops WHERE code = $1', [stop.code])
    : // Sin columna `code` la única forma de reconocer la misma parada es su
      // posición: dos paradas distintas nunca están a menos de diez metros.
      await dataSource.query(
        `SELECT id FROM bus_stops
         WHERE abs(lat - $1) < 0.0001 AND abs(lng - $2) < 0.0001
         LIMIT 1`,
        [stop.lat, stop.lng],
      );

  const fields: Array<[string, unknown]> = [
    ['name', stop.name],
    ['lat', stop.lat],
    ['lng', stop.lng],
  ];

  if (hasCode) fields.push(['code', stop.code]);
  if (columns.has('zone')) fields.push(['zone', stop.zone]);
  if (columns.has('address')) fields.push(['address', stop.zone]);
  if (columns.has('has_shelter')) fields.push(['has_shelter', stop.hasShelter]);
  if (columns.has('has_bench')) fields.push(['has_bench', stop.hasBench]);
  if (columns.has('has_lighting')) fields.push(['has_lighting', stop.hasLighting]);
  if (columns.has('accessibility')) fields.push(['accessibility', stop.accessible]);
  if (columns.has('is_active')) fields.push(['is_active', true]);

  const names = fields.map(([name]) => name);
  const values = fields.map(([, value]) => value);

  if (existing) {
    const assignments = names.map((name, index) => `${name} = $${index + 1}`).join(', ');
    await dataSource.query(`UPDATE bus_stops SET ${assignments} WHERE id = $${names.length + 1}`, [
      ...values,
      existing.id,
    ]);
    return 'actualizado';
  }

  const placeholders = names.map((_, index) => `$${index + 1}`).join(', ');
  await dataSource.query(
    `INSERT INTO bus_stops (${names.join(', ')}) VALUES (${placeholders})`,
    values,
  );
  return 'creado';
}

async function main() {
  console.log('Consultando OpenStreetMap (Overpass)...');
  const stops = await fetchStops();
  console.log(`Paradas encontradas en el departamento: ${stops.length}`);

  if (stops.length === 0) {
    console.log('\nOverpass no devolvió paradas. Puede ser una caída temporal del');
    console.log('servicio: volvé a intentar en unos minutos antes de dar por hecho');
    console.log('que no están mapeadas.');
    return;
  }

  const withShelter = stops.filter((stop) => stop.hasShelter).length;
  const accessible = stops.filter((stop) => stop.accessible).length;
  const named = stops.filter((stop) => !stop.name.startsWith('Parada OSM-')).length;

  console.log(`  con nombre propio: ${named}`);
  console.log(`  con refugio: ${withShelter}`);
  console.log(`  accesibles: ${accessible}`);

  if (dryRun) {
    console.log('\nPrimeras diez:');
    for (const stop of stops.slice(0, 10)) {
      console.log(`  ${stop.code}  ${stop.name}  (${stop.lat}, ${stop.lng})`);
    }
    console.log('\n--dry: no se escribió nada.');
    return;
  }

  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  await dataSource.initialize();

  try {
    const columns = await availableColumns(dataSource);
    const missing = ['code', 'zone', 'has_shelter', 'accessibility'].filter(
      (column) => !columns.has(column),
    );

    if (missing.length > 0) {
      console.log(
        `\nAviso: bus_stops no tiene ${missing.join(', ')}. Se importa lo que entra en el esquema actual;`,
      );
      console.log('corré la migración del módulo de transporte para guardar todo el detalle.');
    }

    let created = 0;
    let updated = 0;

    for (const stop of stops) {
      const outcome = await upsert(dataSource, columns, stop);
      if (outcome === 'creado') created++;
      else updated++;
    }

    console.log(`\nListo: ${created} paradas nuevas, ${updated} actualizadas.`);
    console.log('Fuente: OpenStreetMap, licencia ODbL. Cada parada guarda su id de OSM.');
    console.log('\nAhora reiniciá el backend para que recalcule el orden de paradas de');
    console.log('cada línea, o llamá a POST /api/v1/transport/shapes/rebuild.');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
