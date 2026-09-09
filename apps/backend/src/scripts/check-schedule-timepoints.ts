/**
 * ¿Qué puntos de control sabemos ubicar, y le creemos al resultado?
 *
 *   npx ts-node -T src/scripts/check-schedule-timepoints.ts
 *
 * Los horarios se publican por punto de control y la hora de cada parada se
 * interpola entre dos de ellos, así que un punto sin ubicar deja mudo todo el
 * tramo que depende de él y un punto **mal** ubicado inventa horas. Este
 * script contesta las dos preguntas, en ese orden:
 *
 * 1. **Cuáles faltan y cuánto cuestan.** Lista los nombres que aparecen en los
 *    horarios cargados, cuántos servicios los usan y si `resolveTimepoint` les
 *    encuentra coordenada. Ordenado por servicios: los de arriba son los que
 *    más horario están dejando sin usar.
 *
 * 2. **Si los que están, están bien.** Corre `speedCheck`, que compara el
 *    tiempo publicado entre dos puntos contra el que sale de la velocidad
 *    medida por GPS. Es la única verificación independiente que hay: un punto
 *    proyectado en el lugar equivocado le cambia los metros al tramo y el
 *    cociente se dispara. Se ordena por cuánto se aparta de 1,00.
 *
 * Se corre después de mapear un punto nuevo y el día que entren los horarios
 * de verano, que son otros documentos.
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { currentSeason, SchedulesService } from '../modules/transporte/schedules.service';
import { StopSequenceService } from '../modules/transporte/stop-sequence.service';
import { resolveTimepoint } from '../modules/transporte/schedule-timepoints';

interface Uso {
  servicios: number;
  lineas: Set<string>;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });

  try {
    const season = currentSeason(new Date());
    const rows: Array<{ line_label: string; timepoints: Array<{ point: string }> }> = await app
      .get(DataSource)
      .query(`SELECT line_label, timepoints FROM line_schedules WHERE season = $1`, [season]);

    console.log(`temporada ${season}: ${rows.length} servicios cargados\n`);

    const uso = new Map<string, Uso>();
    for (const row of rows) {
      // Un punto se cuenta una vez por servicio aunque el nombre se repita.
      for (const nombre of new Set((row.timepoints ?? []).map((t) => t.point))) {
        const actual = uso.get(nombre) ?? { servicios: 0, lineas: new Set<string>() };
        actual.servicios += 1;
        actual.lineas.add(row.line_label);
        uso.set(nombre, actual);
      }
    }

    const ordenados = [...uso.entries()].sort((a, b) => b[1].servicios - a[1].servicios);
    const sinUbicar = ordenados.filter(([nombre]) => resolveTimepoint(nombre) === null);
    const ubicados = ordenados.filter(([nombre]) => resolveTimepoint(nombre) !== null);

    console.log(`--- sin ubicar (${sinUbicar.length} nombres) ---`);
    for (const [nombre, datos] of sinUbicar) {
      console.log(
        `  ${nombre}`.padEnd(34),
        `${String(datos.servicios).padStart(4)} servicios`,
        `· líneas ${[...datos.lineas].sort().join(' ')}`,
      );
    }

    console.log(`\n--- ubicados (${ubicados.length} nombres) ---`);
    for (const [nombre, datos] of ubicados) {
      console.log(
        `  ${nombre}`.padEnd(34),
        `${String(datos.servicios).padStart(4)} servicios`,
        `→ ${resolveTimepoint(nombre)!.place}`,
      );
    }

    // --- ¿Le creemos a los que están? ---
    const filas = app.get(SchedulesService).speedCheck(app.get(StopSequenceService).getAll());
    filas.sort((a, b) => Math.abs(1 - b.ratio) - Math.abs(1 - a.ratio));

    console.log(`\n--- horario contra velocidad medida (${filas.length} recorridos) ---`);
    console.log('    ratio 1,00 es acuerdo; 0,70 es la app creyéndose 30% más rápida que el papel\n');
    for (const fila of filas) {
      const peor = fila.worst_segment;
      console.log(
        `  ${fila.line_label} ${fila.itinerary ?? ''}`.padEnd(38),
        `ratio ${fila.ratio.toFixed(2)}`,
        `(${fila.segments} tramos, ${(fila.meters / 1000).toFixed(1)} km)`,
        peor ? `· peor: ${peor.from} → ${peor.to}` : '',
      );
    }
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
