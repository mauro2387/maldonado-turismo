/**
 * Recoloca las paradas con toda la evidencia disponible, sin levantar la API.
 *
 *   npx ts-node -T src/scripts/place-stops-now.ts
 *
 * Es lo mismo que POST /transport/stops/place, para poder correrlo desde una
 * consola y ver el detalle. Ver StopPlacementService.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { StopPlacementService } from '../modules/transporte/stop-placement.service';
import { StopObservationsService } from '../modules/transporte/stop-observations.service';
import { RouteShapesService } from '../modules/transporte/route-shapes.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  try {
    const shapes = app.get(RouteShapesService);
    console.log('recorridos cargados:', shapes.getShapes().length);
    const observaciones = app.get(StopObservationsService);
    console.log('avistamientos:', await observaciones.coverage());
    const resultado = await app.get(StopPlacementService).place();
    console.log(JSON.stringify(resultado, null, 2));
  } finally {
    await app.close();
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
