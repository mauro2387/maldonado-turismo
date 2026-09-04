/**
 * Prueba de los feeds GPS de las empresas sin levantar la app ni tocar la base.
 *
 * Sirve para saber si un feed está caído, si cambió de formato o si una
 * empresa dejó de publicar un campo, que es lo que más probablemente se
 * rompa con el tiempo.
 *
 *   npx ts-node src/scripts/check-gps-feed.ts
 */
import { parseAvlMarkers, normalizeMarker } from '../modules/transporte/gps-feed.service';

const FEEDS = [
  { operator: 'codesa', url: 'http://ip.codesa.com.uy/pub/avl.xml' },
  { operator: 'maldonado-turismo', url: 'http://microltda.ddns.net:32495/pub/avl.xml' },
];

async function checkFeed(operator: string, url: string) {
  console.log(`\n=== ${operator} ===`);
  console.log(url);

  const started = Date.now();
  const response = await fetch(`${url}?noCache=${Date.now()}`);
  const xml = Buffer.from(await response.arrayBuffer()).toString('latin1');
  const elapsed = Date.now() - started;

  console.log(`HTTP ${response.status} · ${xml.length} bytes · ${elapsed} ms`);

  const markers = parseAvlMarkers(xml);
  const positions = markers
    .map((marker) => normalizeMarker(marker, operator, new Map()))
    .filter((position) => position !== null);

  console.log(`markers: ${markers.length} · normalizados: ${positions.length}`);

  const lines = [...new Set(positions.map((p) => p!.line_code))].sort();
  console.log(`líneas en circulación: ${lines.join(', ') || '(ninguna)'}`);

  // Si aparecen campos que no conocemos, el feed cambió y conviene mirarlo.
  const fields = new Set<string>();
  markers.forEach((marker) => Object.keys(marker).forEach((key) => fields.add(key)));
  console.log(`campos del feed: ${[...fields].sort().join(',')}`);

  if (fields.has('cnm') || fields.has('con')) {
    console.log('aviso: el feed trae datos de conductor; la ingesta los descarta');
  }

  const sample = positions[0];
  if (sample) console.log('ejemplo normalizado:', JSON.stringify(sample, null, 2));
}

async function run() {
  for (const feed of FEEDS) {
    try {
      await checkFeed(feed.operator, feed.url);
    } catch (error: any) {
      console.error(`ERROR en ${feed.operator}: ${error?.message ?? error}`);
    }
  }
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
