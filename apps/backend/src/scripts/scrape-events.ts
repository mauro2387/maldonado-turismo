/**
 * Corre la ingesta de la agenda a mano, sin levantar la app.
 *
 * Sirve para la carga inicial de la base y para ver qué está trayendo cada
 * fuente cuando un sitio cambia el HTML, que es lo que más probablemente se
 * rompa con el tiempo.
 *
 *   npx ts-node src/scripts/scrape-events.ts          # escribe en la base
 *   npx ts-node src/scripts/scrape-events.ts --dry    # sólo muestra
 */
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import 'dotenv/config';

import { EventScraperService } from '../modules/agenda/scraper/event-scraper.service';
import { CadenaDelMarSource } from '../modules/agenda/scraper/sources/cadena-del-mar.source';
import { MaldonadoGubSource } from '../modules/agenda/scraper/sources/maldonado-gub.source';
import { MaldonadoTurismoSource } from '../modules/agenda/scraper/sources/maldonado-turismo.source';

const dryRun = process.argv.includes('--dry');

async function main() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  await dataSource.initialize();

  // El scraper sólo necesita leer configuración, así que alcanza con un
  // ConfigService sobre process.env.
  const config = new ConfigService();
  const service = new EventScraperService(dataSource, config);

  if (dryRun) {
    const adapters = [new MaldonadoGubSource(), new CadenaDelMarSource(), new MaldonadoTurismoSource()];

    for (const adapter of adapters) {
      console.log(`\n=== ${adapter.name} ===`);
      const articles = await adapter.fetchArticles(3);
      console.log(`notas leídas: ${articles.length}`);

      for (const article of articles) {
        const event = service.toEvent(article, adapter.key);

        if ('rejected' in event) {
          console.log(`  ✗ [${event.rejected}] ${article.title.slice(0, 80)}`);
          continue;
        }

        console.log(
          `  ✓ ${event.startDate.toISOString().slice(0, 10)}` +
            `${event.time ? ` ${event.time}` : '      '}` +
            ` [${event.confidence}] [${event.category}] [${event.locality}] ${event.title.slice(0, 70)}`,
        );
      }
    }
  } else {
    const result = await service.run('script');
    console.log(JSON.stringify(result, null, 2));
  }

  await dataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
