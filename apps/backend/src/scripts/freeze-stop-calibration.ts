/**
 * Congela la foto contra la que se mide el estimador de paradas.
 *
 *   npx ts-node -T -r tsconfig-paths/register src/scripts/freeze-stop-calibration.ts
 *
 * **Por qué hace falta una foto.** El estimador se calibró midiendo su error
 * contra los nodos relevados de OpenStreetMap, y ese número -28 m de error
 * mediano, contra 56 m del método anterior- es la única razón para creerle. El
 * problema es que la medición se hacía a mano, contra la base en vivo, y la
 * base en vivo cambia: `vehicle_positions` se poda a las 24 h y los
 * avistamientos se siguen acumulando. Dos corridas del mismo código dan
 * números distintos, así que el número no servía para decidir si un cambio
 * mejoró o empeoró las cosas.
 *
 * Esto guarda las entradas del estimador -los intervalos y las detenciones, ya
 * proyectados sobre el recorrido- junto con la respuesta correcta, que es
 * dónde cae el nodo de OSM sobre ese mismo recorrido. Con eso,
 * `stop-placement.service.spec.ts` puede correr el estimador de verdad, sin
 * base y sin red, y comparar contra un número fijo.
 *
 * **Todo se guarda en metros sobre el trazo, no en coordenadas.** El error que
 * le importa al estimador es a lo largo del recorrido; el que queda de costado
 * es una propiedad del trazo dibujado por la empresa, no del estimador, y
 * meterlo adentro sólo agrega ruido que no depende de lo que se está probando.
 *
 * Volver a correrlo cambia el baseline y hay que mirarlo: si la foto nueva es
 * peor, el que se movió puede ser el mundo (una empresa republicó un recorrido)
 * y no el código.
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../app.module';
import { RouteShapesService } from '../modules/transporte/route-shapes.service';
import { LngLat, PolylineIndex } from '../modules/transporte/geo.util';

/** Los mismos cortes que usa la colocación en producción. */
const MAX_OFFSET_M = 60;
const MAX_STEP_M = 900;

/** Cuán cerca del trazo tiene que estar un nodo de OSM para ser de esta línea. */
const OSM_MAX_OFFSET_M = 30;

const SALIDA = path.join(
  __dirname,
  '..',
  'modules',
  'transporte',
  '__fixtures__',
  'calibracion-paradas.json',
);

const CRUCES = `
WITH ordenadas AS (
  SELECT operator, line_code, line_name, recorded_at, latitude, longitude,
         prev_stop_code, prev_stop_name,
         LAG(latitude)       OVER w AS lat_anterior,
         LAG(longitude)      OVER w AS lng_anterior,
         LAG(prev_stop_code) OVER w AS codigo_anterior,
         LAG(line_name)      OVER w AS cartel_anterior,
         LAG(recorded_at)    OVER w AS momento_anterior
  FROM vehicle_positions
  WHERE prev_stop_code IS NOT NULL AND btrim(coalesce(prev_stop_name, '')) <> ''
    AND line_code IS NOT NULL AND btrim(coalesce(line_name, '')) <> ''
  WINDOW w AS (PARTITION BY operator, vehicle_id ORDER BY recorded_at)
)
SELECT operator, line_code, upper(btrim(line_name)) AS itinerary_key,
       btrim(prev_stop_code) AS code,
       upper(btrim(regexp_replace(prev_stop_name, '\\s+', ' ', 'g'))) AS name,
       lat_anterior::float8 AS lat_from, lng_anterior::float8 AS lng_from,
       latitude::float8 AS lat_to, longitude::float8 AS lng_to
FROM ordenadas
WHERE codigo_anterior IS NOT NULL AND codigo_anterior <> prev_stop_code
  AND line_name = cartel_anterior
  AND recorded_at - momento_anterior <= interval '45 seconds'`;

interface EntradaCongelada {
  code: string;
  name: string;
  operator: string;
  lineCode: string;
  itineraryKey: string;
  /** Los intervalos de cruce, en metros sobre el trazo. */
  intervals: Array<[number, number]>;
  /** Las detenciones: [metro sobre el trazo, km/h, muestras desde el cambio]. */
  halts: Array<[number, number, number]>;
  /** La respuesta correcta: dónde cae el nodo de OSM sobre este mismo trazo. */
  gtAlong: number;
  osmId: number;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });

  try {
    const dataSource = app.get(DataSource);
    const shapes = app.get(RouteShapesService).getShapes();

    const indexes = new Map<string, PolylineIndex>();
    for (const shape of shapes) {
      if (!shape.geometry || shape.geometry.length < 2) continue;
      indexes.set(
        `${shape.operator}|${shape.lineCode}|${shape.itineraryKey}`,
        new PolylineIndex(shape.geometry as LngLat[]),
      );
    }
    console.log(`recorridos: ${indexes.size}`);

    // --- intervalos, proyectados ---
    const porParada = new Map<string, Map<string, EntradaCongelada>>();
    const cruces: any[] = await dataSource.query(CRUCES);

    for (const cruce of cruces) {
      const routeKey = `${cruce.operator}|${cruce.line_code}|${cruce.itinerary_key}`;
      const index = indexes.get(routeKey);
      if (!index) continue;

      const desde = index.locate(cruce.lat_from, cruce.lng_from);
      const hasta = index.locate(cruce.lat_to, cruce.lng_to);
      if (!desde || !hasta) continue;
      if (desde.offsetMeters > MAX_OFFSET_M || hasta.offsetMeters > MAX_OFFSET_M) continue;

      const paso = hasta.alongMeters - desde.alongMeters;
      if (paso < 0 || paso > MAX_STEP_M) continue;

      const stopKey = `${cruce.code}|${cruce.name}`;
      if (!porParada.has(stopKey)) porParada.set(stopKey, new Map());
      const rutas = porParada.get(stopKey)!;

      if (!rutas.has(routeKey)) {
        rutas.set(routeKey, {
          code: cruce.code,
          name: cruce.name,
          operator: cruce.operator,
          lineCode: cruce.line_code,
          itineraryKey: cruce.itinerary_key,
          intervals: [],
          halts: [],
          gtAlong: 0,
          osmId: 0,
        });
      }
      rutas.get(routeKey)!.intervals.push([
        Math.round(desde.alongMeters),
        Math.round(hasta.alongMeters),
      ]);
    }

    // --- detenciones, proyectadas ---
    const observaciones: any[] = await dataSource.query(
      `SELECT code, name, operator, line_code, itinerary_key,
              latitude::float8 AS lat, longitude::float8 AS lng,
              speed_kmh::float8 AS speed, since_change
         FROM stop_observations`,
    );

    for (const obs of observaciones) {
      const rutas = porParada.get(`${obs.code}|${obs.name}`);
      if (!rutas) continue;
      const routeKey = `${obs.operator}|${obs.line_code}|${obs.itinerary_key}`;
      const entrada = rutas.get(routeKey);
      if (!entrada) continue;

      const ubicada = indexes.get(routeKey)!.locate(obs.lat, obs.lng);
      if (!ubicada || ubicada.offsetMeters > MAX_OFFSET_M) continue;

      entrada.halts.push([
        Math.round(ubicada.alongMeters),
        Math.round(obs.speed * 10) / 10,
        obs.since_change,
      ]);
    }

    // --- la respuesta correcta: el nodo de OSM que cae dentro de la ventana ---
    //
    // El emparejamiento es a propósito **independiente del punto estimado**: se
    // usa sólo la ventana de los cruces. Si se emparejara por cercanía a la
    // coordenada que puso el estimador, el test estaría midiendo el estimador
    // contra sí mismo y daría bien siempre.
    const osm: any[] = await dataSource.query(
      `SELECT osm_id, latitude::float8 AS lat, longitude::float8 AS lng FROM osm_bus_stops`,
    );

    const congeladas: EntradaCongelada[] = [];

    for (const rutas of porParada.values()) {
      let mejor: { entrada: EntradaCongelada; ventana: number } | null = null;

      for (const [routeKey, entrada] of rutas) {
        if (entrada.intervals.length < 2) continue;
        const index = indexes.get(routeKey)!;

        const inicios = entrada.intervals.map(([a]) => a).sort((x, y) => x - y);
        const finales = entrada.intervals.map(([, b]) => b).sort((x, y) => x - y);
        const lo = inicios[Math.floor(inicios.length / 2)];
        const hi = finales[Math.floor(finales.length / 2)];

        const dentro: Array<{ osmId: number; along: number }> = [];
        for (const nodo of osm) {
          const ubicado = index.locate(nodo.lat, nodo.lng);
          if (!ubicado || ubicado.offsetMeters > OSM_MAX_OFFSET_M) continue;
          if (ubicado.alongMeters < lo || ubicado.alongMeters > hi) continue;
          dentro.push({ osmId: Number(nodo.osm_id), along: ubicado.alongMeters });
        }

        // Con dos nodos adentro no se sabe cuál es la parada: no sirve de verdad.
        if (dentro.length !== 1) continue;

        const ventana = hi - lo;
        if (!mejor || ventana < mejor.ventana) {
          mejor = {
            ventana,
            entrada: {
              ...entrada,
              gtAlong: Math.round(dentro[0].along),
              osmId: dentro[0].osmId,
            },
          };
        }
      }

      if (mejor) congeladas.push(mejor.entrada);
    }

    congeladas.sort((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name));

    fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
    fs.writeFileSync(
      SALIDA,
      JSON.stringify(
        {
          congeladoEl: new Date().toISOString().slice(0, 10),
          comoSeArma: 'src/scripts/freeze-stop-calibration.ts',
          queEs:
            'Entradas del estimador de paradas (intervalos y detenciones sobre el trazo) ' +
            'y la respuesta correcta, que es dónde cae el nodo relevado de OpenStreetMap ' +
            'sobre ese mismo trazo. Todo en metros a lo largo del recorrido.',
          paradas: congeladas,
        },
        null,
        1,
      ),
    );

    const conDetenciones = congeladas.filter((e) => e.halts.length >= 3).length;
    console.log(`paradas congeladas: ${congeladas.length} (${conDetenciones} con detenciones)`);
    console.log(`${SALIDA}  ${(fs.statSync(SALIDA).size / 1024).toFixed(0)} kB`);
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
