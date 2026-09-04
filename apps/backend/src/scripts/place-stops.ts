/**
 * Apoya las paradas sobre el recorrido de su línea y arma el orden de paradas
 * de cada recorrido.
 *
 *   npx ts-node src/scripts/place-stops.ts
 *
 * Corre solo cada vez que se reconstruyen los recorridos; como script sirve
 * para aplicarlo enseguida después de importar los recorridos oficiales, sin
 * esperar el ciclo de seis horas.
 *
 * Qué hace, en una línea: en vez de estimar dónde está una parada promediando
 * dos posiciones en el plano —que cae adentro de la manzana—, proyecta esas
 * posiciones sobre el trazo publicado y promedia la distancia recorrida, que
 * devuelve un punto sobre la calle. Ver stop-placement.service.ts.
 */
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import 'dotenv/config';

import { OfficialRoutesService } from '../modules/transporte/official-routes.service';
import { RouteShapesService } from '../modules/transporte/route-shapes.service';
import { StopPlacementService } from '../modules/transporte/stop-placement.service';

async function main() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  await dataSource.initialize();

  try {
    // Los servicios sólo necesitan la conexión y la configuración: se los
    // puede armar a mano, sin levantar Nest entero.
    const official = new OfficialRoutesService(dataSource);
    const shapes = new RouteShapesService(new ConfigService(), official, dataSource);
    await shapes.loadShapes();

    const result = await new StopPlacementService(dataSource, shapes).place();

    console.log(
      `\n${result.colocadas} paradas apoyadas sobre el recorrido ` +
        `(${result.sinRecorrido} sin cruces suficientes).\n` +
        `${result.paradasDeRecorrido} paradas asignadas a ${result.recorridos} recorridos.`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
