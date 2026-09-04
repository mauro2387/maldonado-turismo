/**
 * Copia las fotos de los atractivos desde Wikimedia Commons al bucket propio.
 *
 *   npx ts-node src/scripts/upload-place-images.ts
 *
 * Hay que correrlo antes que seed-places.ts, que es el que guarda en la base
 * las URLs del bucket. Es idempotente: cada foto tiene un nombre de archivo
 * derivado del lugar, así que volver a correrlo la reemplaza en lugar de
 * duplicarla.
 *
 * Necesita SUPABASE_URL y SUPABASE_SERVICE_KEY. La service key es de
 * administración: va sólo en el .env del backend y nunca en el frontend.
 */
import 'dotenv/config';

import { PLACES } from '../db/seeds/places.data';
import { STORAGE_BUCKET, storagePath } from '../db/seeds/place-images.util';

/**
 * Wikimedia exige un User-Agent que identifique la aplicación y una forma de
 * contacto; sin eso responde 429 por política de robots.
 */
const USER_AGENT = 'MaldonadoTurismoApp/1.0 (https://maldonado.gub.uy; turismo@maldonado.gub.uy)';

/** Pausa entre descargas, para no golpear Commons en ráfaga. */
const DOWNLOAD_DELAY_MS = 800;

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureBucket(): Promise<void> {
  const response = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      apikey: serviceKey!,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: STORAGE_BUCKET,
      name: STORAGE_BUCKET,
      // Público: son fotos de atractivos que la app muestra sin login.
      public: true,
      allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'],
      file_size_limit: 10 * 1024 * 1024,
    }),
  });

  if (response.ok) {
    console.log(`Bucket "${STORAGE_BUCKET}" creado.`);
    return;
  }

  // Que ya exista es el caso normal a partir de la segunda corrida.
  const body = await response.text();
  if (response.status === 409 || body.includes('already exists')) {
    console.log(`Bucket "${STORAGE_BUCKET}" ya existía.`);
    return;
  }

  throw new Error(`No se pudo crear el bucket: HTTP ${response.status} ${body}`);
}

async function download(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'image/*' },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} al descargar`);
  }

  const type = response.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) {
    throw new Error(`la respuesta no es una imagen (${type})`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function upload(path: string, data: Buffer): Promise<void> {
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey!,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'image/jpeg',
      // Las fotos no cambian; que el CDN las guarde un año.
      'Cache-Control': 'public, max-age=31536000, immutable',
      // Reemplaza si ya está, para que el script sea idempotente.
      'x-upsert': 'true',
    },
    body: new Uint8Array(data),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} al subir: ${await response.text()}`);
  }
}

async function main() {
  if (!supabaseUrl || !serviceKey) {
    console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_KEY en el .env del backend.');
    process.exit(1);
  }

  await ensureBucket();

  let uploaded = 0;
  const failures: string[] = [];

  for (const place of PLACES) {
    for (const [index, image] of place.images.entries()) {
      const path = storagePath(place.name, index);

      try {
        const data = await download(image.url);
        await upload(path, data);
        uploaded++;
        console.log(`  ✓ ${path.padEnd(46)} ${(data.length / 1024).toFixed(0)} KB  ${image.license}`);
      } catch (error) {
        const message = `${place.name} [${index}]: ${(error as Error).message}`;
        failures.push(message);
        console.log(`  ✗ ${message}`);
      }

      await sleep(DOWNLOAD_DELAY_MS);
    }
  }

  console.log(`\n${uploaded} fotos subidas al bucket "${STORAGE_BUCKET}".`);

  if (failures.length > 0) {
    console.log(`${failures.length} fallaron:`);
    failures.forEach((failure) => console.log(`  - ${failure}`));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
