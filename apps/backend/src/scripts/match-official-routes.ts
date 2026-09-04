/**
 * Decide qué recorrido publicado hace cada itinerario del feed GPS y lo deja
 * en `route_shapes`, que es de donde lee la app.
 *
 *   npx ts-node src/scripts/match-official-routes.ts
 *   npx ts-node src/scripts/match-official-routes.ts --horas=168
 *
 * Corre solo cada vez que se reconstruyen los recorridos (ver
 * RouteShapesService), pero como script sirve para dos cosas: aplicarlo
 * enseguida después de importar los recorridos, sin esperar el ciclo, y sobre
 * todo **revisar el resultado**, que es una decisión medida y conviene mirarla.
 *
 * Qué mirar en la salida:
 *
 *   cob  cuántas de las posiciones reales caen sobre el recorrido elegido
 *   dir  si las posiciones lo recorren en el sentido que el recorrido dibuja
 *   fid  cuánto del recorrido dibujado se recorrió de verdad
 *   fin  a qué distancia terminan los viajes de la punta del recorrido
 *
 * Una cobertura alta con fidelidad baja es normal en una línea con poco
 * movimiento en la ventana mirada: el trazo está bien, lo que falta son
 * viajes. Al revés -fidelidad alta y cobertura baja- es la señal de que el
 * itinerario hace algo que el recorrido publicado no contempla.
 */
import { DataSource } from 'typeorm';
import 'dotenv/config';

import { OfficialRoutesService } from '../modules/transporte/official-routes.service';

const hours = Number(
  process.argv.find((arg) => arg.startsWith('--horas='))?.split('=')[1] ?? 72,
);

async function main() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  await dataSource.initialize();

  try {
    // El servicio sólo necesita la conexión: se lo puede usar fuera de Nest.
    const service = new OfficialRoutesService(dataSource);
    await service.load();

    const reports = await service.matchAll(hours);

    console.log(
      `\n${'itinerario'.padEnd(42)} ${'recorrido publicado'.padEnd(38)} cob  dir  fid  fin`,
    );
    for (const report of reports) {
      const itinerary = `${report.lineCode} ${report.itineraryKey}`.slice(0, 41);

      if (!report.route) {
        console.log(`${itinerary.padEnd(42)} ${(report.reason ?? '—').padEnd(38)}`);
        continue;
      }

      console.log(
        `${itinerary.padEnd(42)} ${report.route.slice(0, 37).padEnd(38)} ` +
          `${report.coverage.toFixed(2)} ${report.progress.toFixed(2)} ` +
          `${report.fidelity.toFixed(2)} ${Math.round(report.endpointMeters)}m`,
      );
    }

    const conRecorrido = reports.filter((report) => report.route).length;
    console.log(
      `\n${conRecorrido} de ${reports.length} itinerarios con recorrido publicado. ` +
        `El resto se reconstruye con el GPS.`,
    );
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
