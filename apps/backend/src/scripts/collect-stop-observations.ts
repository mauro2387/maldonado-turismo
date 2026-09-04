/**
 * Recolecta avistamientos de paradas sin levantar la API.
 *
 *   npx ts-node -T -r tsconfig-paths/register src/scripts/collect-stop-observations.ts [horas]
 *
 * Lo mismo que hace solo StopObservationsService cada hora. Sirve para la carga
 * inicial —donde conviene barrer toda la retención de vehicle_positions de una— y
 * para no esperar a la próxima corrida después de tocar el extractor.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { StopObservationsService } from '../modules/transporte/stop-observations.service';

async function main() {
  const horas = Number(process.argv[2] ?? 24);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const servicio = app.get(StopObservationsService);
    console.log('antes: ', await servicio.coverage());
    console.log('corrida:', await servicio.collect(horas));
    console.log('después:', await servicio.coverage());
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
