/**
 * Carga los horarios publicados por las empresas a la tabla `line_schedules`.
 *
 *   npx ts-node src/scripts/import-schedules.ts
 *
 * Lee los JSON normalizados que produce la herramienta de extracción
 * (apps/backend/tools/horarios/salida/<empresa>-<temporada>.json, con el
 * formato de tools/horarios/ESQUEMA.md) y los deja en la base para que el
 * planificador los use.
 *
 * Reglas que respeta -las mismas de ESQUEMA.md-:
 *
 *   - `horas` va alineado 1:1 con `puntos_control`. Si una fila no cumple, se
 *     saltea y se avisa: no se adivina el corrimiento.
 *   - `days` (qué días corre) se DERIVA de las referencias del papel, no se
 *     inventa: "S"/"MSDF"/"MSYD" sacan sábado y domingo, "D" saca domingo,
 *     "SSYD" deja sólo el fin de semana. Las referencias crudas se guardan
 *     igual, para poder auditar esa derivación.
 *   - Verano e invierno no se mezclan: cada fila lleva su `season`, y una
 *     reimportación reemplaza sólo las filas de esa empresa y esa temporada.
 *
 * Después de correrlo hay que reiniciar el backend (o llamar a
 * SchedulesService.reload()) para que tome los horarios nuevos.
 */
import { DataSource } from 'typeorm';
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

const SALIDA = path.resolve(__dirname, '../../tools/horarios/salida');

/** Lunes=1, martes=2, ... domingo=64. 127 = todos los días. */
const LUN = 1, MAR = 2, MIE = 4, JUE = 8, VIE = 16, SAB = 32, DOM = 64;
const TODOS = LUN | MAR | MIE | JUE | VIE | SAB | DOM;

interface ServicioJson {
  referencias?: string[];
  horas: (string | null)[];
}

interface LineaJson {
  linea: string;
  sentido: string;
  puntos_control: string[];
  servicios: ServicioJson[];
}

interface HorarioJson {
  empresa: string;
  temporada: string | null;
  fuente_url?: string;
  documento?: string;
  vigencia_texto?: string;
  vigencia_desde?: string | null;
  vigencia_hasta?: string | null;
  referencias?: Record<string, string>;
  lineas: LineaJson[];
}

/**
 * Los días que corre un servicio, a partir de sus referencias.
 *
 * Las referencias son exclusiones sobre "corre todos los días": el servicio
 * base corre siempre, y cada referencia le saca días. La única que suma en vez
 * de restar es "solo sábados y domingos".
 */
function daysFromRefs(refs: string[]): number {
  let days = TODOS;
  for (const raw of refs) {
    const ref = raw.trim().toUpperCase();
    if (ref === 'SSYD') return SAB | DOM; // solo fin de semana
    if (ref === 'S' || ref === 'MSDF' || ref === 'MSYD') days &= ~(SAB | DOM); // menos fin de semana
    if (ref === 'D') days &= ~DOM; // menos domingo
    // #, %, E, EC, * y demás son notas de recorrido, no de días.
  }
  return days;
}

async function importFile(dataSource: DataSource, file: string) {
  const raw = fs.readFileSync(file, 'utf8');
  const data: HorarioJson = JSON.parse(raw);

  const operator = data.empresa;
  const season = data.temporada ?? 'invierno';
  if (!data.temporada) {
    console.warn(`  ⚠ ${path.basename(file)}: sin temporada, se asume invierno`);
  }

  let insertados = 0;
  let salteados = 0;

  await dataSource.transaction(async (manager) => {
    // Una reimportación reemplaza sólo esta empresa y esta temporada.
    await manager.query(`DELETE FROM line_schedules WHERE operator = $1 AND season = $2`, [
      operator,
      season,
    ]);

    for (const linea of data.lineas) {
      for (const servicio of linea.servicios) {
        if (servicio.horas.length !== linea.puntos_control.length) {
          salteados++;
          continue; // no se adivina el corrimiento: se saltea y se cuenta
        }

        const timepoints = linea.puntos_control
          .map((point, i) => ({ point, time: servicio.horas[i] }))
          .filter((tp) => tp.time);

        if (timepoints.length < 2) {
          salteados++;
          continue;
        }

        const refs = servicio.referencias ?? [];

        await manager.query(
          `INSERT INTO line_schedules
             (operator, line_label, direction, season, valid_from, valid_to, valid_text,
              days, refs, timepoints, source_url, document)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::text[],$10::jsonb,$11,$12)`,
          [
            operator,
            linea.linea,
            linea.sentido,
            season,
            data.vigencia_desde ?? null,
            data.vigencia_hasta ?? null,
            data.vigencia_texto ?? null,
            daysFromRefs(refs),
            refs,
            JSON.stringify(timepoints),
            data.fuente_url ?? null,
            data.documento ?? null,
          ],
        );
        insertados++;
      }
    }
  });

  console.log(
    `  ${operator} (${season}): ${insertados} servicios cargados` +
      (salteados ? `, ${salteados} salteados por desalineados` : ''),
  );
}

async function main() {
  if (!fs.existsSync(SALIDA)) {
    console.error(`No existe ${SALIDA}. ¿Corrió la extracción todavía?`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(SALIDA)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(SALIDA, f));

  if (files.length === 0) {
    console.error(`No hay JSON de horarios en ${SALIDA}.`);
    process.exit(1);
  }

  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await dataSource.initialize();

  try {
    console.log(`Cargando horarios de ${files.length} archivo(s):`);
    for (const file of files) {
      try {
        await importFile(dataSource, file);
      } catch (error: any) {
        console.error(`  ✗ ${path.basename(file)}: ${error?.message ?? error}`);
      }
    }

    const total = await dataSource.query(
      `SELECT operator, season, direction, count(*) n
         FROM line_schedules GROUP BY operator, season, direction ORDER BY operator, direction`,
    );
    console.log('\nEn la base:');
    for (const row of total) {
      console.log(`  ${row.operator} ${row.season} ${row.direction}: ${row.n}`);
    }
    console.log('\nReiniciá el backend para que tome los horarios nuevos.');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
