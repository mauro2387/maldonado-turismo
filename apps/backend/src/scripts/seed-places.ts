/**
 * Carga los atractivos turísticos verificados en la tabla places.
 *
 *   npx ts-node src/scripts/seed-places.ts          # inserta y actualiza
 *   npx ts-node src/scripts/seed-places.ts --dry    # sólo muestra qué haría
 *   npx ts-node src/scripts/seed-places.ts --check  # verifica que las fotos respondan
 *
 * Es idempotente: hace upsert por nombre, así que se puede volver a correr para
 * actualizar horarios o fotos sin duplicar filas ni perder ids.
 */
import { DataSource } from 'typeorm';
import 'dotenv/config';

import { PLACES, PlaceSeed } from '../db/seeds/places.data';
import { publicImageUrl } from '../db/seeds/place-images.util';

const dryRun = process.argv.includes('--dry');
const checkImages = process.argv.includes('--check');

/** Verifica que cada foto siga estando donde dice el seed. */
async function verifyImages(): Promise<number> {
  let broken = 0;

  for (const place of PLACES) {
    for (const image of place.images) {
      try {
        const response = await fetch(image.url, {
          method: 'HEAD',
          headers: { 'User-Agent': 'MaldonadoTurismoApp/1.0 (turismo@maldonado.gub.uy)' },
        });
        const type = response.headers.get('content-type') ?? '';

        if (!response.ok || !type.startsWith('image/')) {
          console.log(`  ✗ ${place.name}: HTTP ${response.status} ${type} · ${image.url}`);
          broken++;
        } else {
          console.log(`  ✓ ${place.name} · ${image.license}`);
        }
      } catch (error) {
        console.log(`  ✗ ${place.name}: ${(error as Error).message}`);
        broken++;
      }

      // Wikimedia pide no golpear en ráfaga; con esta pausa la verificación
      // completa pasa sin recibir 429.
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  return broken;
}

async function upsert(dataSource: DataSource, place: PlaceSeed): Promise<'creado' | 'actualizado'> {
  const [existing] = await dataSource.query('SELECT id FROM places WHERE name = $1', [place.name]);

  const values = [
    place.name,
    place.description,
    place.lat,
    place.lng,
    place.address,
    place.phone,
    place.website,
    place.category,
    place.locality,
    // Se guarda la copia propia del bucket, no el enlace a Commons: ver el
    // comentario de place-images.util.ts.
    JSON.stringify(place.images.map((image, i) => publicImageUrl(place.name, i, image.url))),
    JSON.stringify(
      place.images.map((image, i) => ({
        url: publicImageUrl(place.name, i, image.url),
        author: image.author,
        license: image.license,
        license_url: image.licenseUrl,
        // Página del archivo en Commons: es el enlace a la obra original que
        // pide la atribución de CC BY / CC BY-SA.
        source: image.source,
      })),
    ),
    place.schedule ? JSON.stringify(place.schedule) : null,
    place.priceRange,
    place.facilities,
    place.activities,
    place.tips,
    place.highlights,
    place.isFeatured,
    // Las fuentes de cada dato viajan en `contact` junto al teléfono y el sitio:
    // es el único jsonb libre que ya tenía la tabla y sirve para poder auditar
    // de dónde salió cada ficha.
    JSON.stringify({ phone: place.phone, website: place.website, sources: place.sources }),
  ];

  if (existing) {
    await dataSource.query(
      `UPDATE places SET
         description = $2, lat = $3, lng = $4, address = $5, phone = $6, website = $7,
         category = $8, locality = $9, images = $10, image_credits = $11, schedule = $12,
         price_range = $13, facilities = $14, activities = $15, tips = $16, highlights = $17,
         is_featured = $18, contact = $19, updated_at = CURRENT_TIMESTAMP
       WHERE name = $1`,
      values,
    );
    return 'actualizado';
  }

  await dataSource.query(
    `INSERT INTO places (
       name, description, lat, lng, address, phone, website, category, locality,
       images, image_credits, schedule, price_range, facilities, activities, tips,
       highlights, is_featured, contact
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
    values,
  );
  return 'creado';
}

async function main() {
  if (checkImages) {
    console.log(`Verificando ${PLACES.reduce((n, p) => n + p.images.length, 0)} fotos...\n`);
    const broken = await verifyImages();
    console.log(broken === 0 ? '\nTodas las fotos responden.' : `\n${broken} fotos rotas.`);
    process.exit(broken === 0 ? 0 : 1);
  }

  if (dryRun) {
    console.log(`${PLACES.length} lugares en el seed:\n`);
    for (const place of PLACES) {
      console.log(
        `  ${place.locality.padEnd(16)} ${place.category.padEnd(12)} ` +
          `${place.images.length} fotos  ${place.schedule ? 'con horario' : 'sin horario '}  ${place.name}`,
      );
    }
    return;
  }

  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  await dataSource.initialize();

  let created = 0;
  let updated = 0;

  for (const place of PLACES) {
    const outcome = await upsert(dataSource, place);
    if (outcome === 'creado') created++;
    else updated++;
    console.log(`  ${outcome === 'creado' ? '+' : '~'} ${place.name}`);
  }

  console.log(`\n${created} creados, ${updated} actualizados, ${PLACES.length} en total.`);
  await dataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
