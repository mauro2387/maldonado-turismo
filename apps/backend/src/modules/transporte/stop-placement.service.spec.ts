import * as fs from 'fs';
import * as path from 'path';
import { estimateAlong, Placement, PRECISE_ENOUGH_M } from './stop-placement.service';

/**
 * El estimador de paradas, medido contra una foto congelada.
 *
 * Este test existe porque el estimador es la clase de código que se puede
 * romper sin que nada se rompa: un umbral mal tocado no tira ninguna excepción
 * ni falla ningún tipo, sólo mueve mil paradas unas cuadras y la app empieza a
 * mandar gente a esperar donde el ómnibus no para. El síntoma aparece semanas
 * después y del otro lado de la ciudad.
 *
 * La única defensa es medir, y medir contra algo que **no sea el propio
 * estimador**. Acá la verdad de campo son los nodos de parada relevados en
 * OpenStreetMap: gente que estuvo parada ahí y lo marcó. El emparejamiento
 * entre una parada del feed y su nodo se hace con la ventana de los cruces, no
 * con la coordenada que el estimador propone, justamente para que el test no
 * termine midiendo el estimador contra sí mismo.
 *
 * La foto está en `__fixtures__/calibracion-paradas.json` y se rearma con
 * `src/scripts/freeze-stop-calibration.ts`. Todo en metros **sobre el
 * recorrido**: el error transversal es una propiedad del trazo que publica la
 * empresa, no del estimador, y meterlo agrega ruido que no depende de lo que
 * se está probando.
 *
 * ## Qué hacer si este test falla
 *
 * No subir los números. Los de abajo son los medidos el 2026-09-04 con el
 * método de detenciones, y el método anterior -interpolar entre dos
 * posiciones- daba 56 m de error mediano contra los mismos nodos. Si un cambio
 * los empeora, el cambio está mal, aunque parezca más prolijo.
 *
 * La excepción es haber vuelto a congelar la foto: ahí el que se movió puede
 * ser el mundo (una empresa republicó un recorrido, OSM corrigió un nodo) y no
 * el código. En ese caso, revisar la foto nueva a mano antes de tocar nada.
 */

interface ParadaCongelada {
  code: string;
  name: string;
  operator: string;
  lineCode: string;
  itineraryKey: string;
  intervals: Array<[number, number]>;
  halts: Array<[number, number, number]>;
  gtAlong: number;
  osmId: number;
}

const FOTO = JSON.parse(
  fs.readFileSync(path.join(__dirname, '__fixtures__', 'calibracion-paradas.json'), 'utf8'),
) as { congeladoEl: string; paradas: ParadaCongelada[] };

/**
 * Techos, no objetivos: el test pasa si el estimador es **igual o mejor**.
 *
 * Salen de correr esta misma foto el 2026-09-04, con ~15 % de aire para que un
 * refactor que reordene un cuantil no rompa el build por un metro de redondeo.
 * Medido ese día, sobre 302 paradas con nodo de OSM:
 *
 *     error sobre el trazo    p50 28 m · p75 88 m · p90 152 m
 *     por detenciones (160)   p50 13 m
 *     por intervalo   (142)   p50 57 m
 *     declara esquina nombrable en 84; 2 de ésas están a más de 100 m
 *
 * Los 57 m del método por intervalos son, además, el número contra el que hay
 * que comparar cualquier idea nueva: es lo que había antes de las detenciones.
 */
const TECHO = {
  errorMedianoM: 32,
  errorP75M: 100,
  errorP90M: 175,
  /** Cuántas de las que el estimador declara "esquina nombrable" están mal. */
  malUbicadasDeclarandoPrecisionMax: 6,
  /** Piso de cobertura: si declara precisión en muchas menos, algo se rompió. */
  declaraPrecisionMin: 70,
};

function placement(parada: ParadaCongelada): Placement {
  return {
    operator: parada.operator,
    lineCode: parada.lineCode,
    itineraryKey: parada.itineraryKey,
    intervals: parada.intervals,
    halts: parada.halts.map(([alongMeters, speedKmh, sinceChange]) => ({
      alongMeters,
      speedKmh,
      sinceChange,
    })),
  };
}

function cuantil(valores: number[], q: number): number {
  const orden = [...valores].sort((a, b) => a - b);
  return orden[Math.min(orden.length - 1, Math.max(0, Math.round((orden.length - 1) * q)))];
}

/** Corre el estimador sobre toda la foto y devuelve el error de cada parada. */
function medir() {
  return FOTO.paradas.map((parada) => {
    const salida = estimateAlong(placement(parada));
    return {
      parada,
      salida,
      errorM: Math.abs(salida.alongMeters - parada.gtAlong),
    };
  });
}

describe('estimador de paradas, contra los nodos relevados en OpenStreetMap', () => {
  const resultados = medir();

  it('la foto tiene suficientes paradas como para que los cuantiles signifiquen algo', () => {
    expect(FOTO.paradas.length).toBeGreaterThanOrEqual(150);
    expect(resultados.every((r) => Number.isFinite(r.errorM))).toBe(true);
  });

  it('el error contra la verdad de campo no empeora', () => {
    const errores = resultados.map((r) => r.errorM);
    const medido = {
      p50: Math.round(cuantil(errores, 0.5)),
      p75: Math.round(cuantil(errores, 0.75)),
      p90: Math.round(cuantil(errores, 0.9)),
    };

    // Se imprime siempre: cuando este test falla, lo primero que hace falta es
    // el número nuevo, no sólo saber que se pasó del techo.
    console.log(
      `error sobre el trazo contra OSM (n=${errores.length}): ` +
        `p50=${medido.p50}m p75=${medido.p75}m p90=${medido.p90}m`,
    );

    expect(medido.p50).toBeLessThanOrEqual(TECHO.errorMedianoM);
    expect(medido.p75).toBeLessThanOrEqual(TECHO.errorP75M);
    expect(medido.p90).toBeLessThanOrEqual(TECHO.errorP90M);
  });

  it('cuando declara que puede nombrar la esquina, casi siempre puede', () => {
    // El error declarado es una promesa que la app le hace a la persona: con
    // 60 m o menos dice "esperá acá" en vez de "por acá cerca". Si esa promesa
    // no se cumple, es peor que no declarar nada, porque manda a alguien a una
    // esquina equivocada con toda seguridad.
    const declaradas = resultados.filter((r) => r.salida.accuracyMeters <= PRECISE_ENOUGH_M);
    const malUbicadas = declaradas.filter((r) => r.errorM > 100);

    console.log(
      `declara esquina nombrable en ${declaradas.length} paradas; ` +
        `de ésas, ${malUbicadas.length} están a más de 100 m`,
    );

    expect(declaradas.length).toBeGreaterThanOrEqual(TECHO.declaraPrecisionMin);
    expect(malUbicadas.length).toBeLessThanOrEqual(TECHO.malUbicadasDeclarandoPrecisionMax);
  });

  it('las detenciones le ganan al intervalo, que es la razón de todo esto', () => {
    const porDetenciones = resultados.filter((r) => r.salida.source === 'detenciones');
    const porIntervalo = resultados.filter((r) => r.salida.source === 'intervalo');

    expect(porDetenciones.length).toBeGreaterThan(50);
    expect(porIntervalo.length).toBeGreaterThan(10);

    const p50 = (grupo: typeof resultados) => cuantil(grupo.map((r) => r.errorM), 0.5);
    console.log(
      `detenciones (n=${porDetenciones.length}): p50=${Math.round(p50(porDetenciones))}m | ` +
        `intervalo (n=${porIntervalo.length}): p50=${Math.round(p50(porIntervalo))}m`,
    );

    expect(p50(porDetenciones)).toBeLessThan(p50(porIntervalo));
  });
});

describe('estimador de paradas, reglas sueltas', () => {
  const intervalosLimpios: Array<[number, number]> = [
    [900, 1100],
    [910, 1090],
    [890, 1120],
    [905, 1095],
  ];

  it('sin detenciones suficientes cae al intervalo y lo dice', () => {
    const salida = estimateAlong({
      operator: 'codesa',
      lineCode: '12',
      itineraryKey: 'PUNTA DEL ESTE',
      intervals: intervalosLimpios,
      halts: [{ alongMeters: 1000, speedKmh: 2, sinceChange: 1 }],
    });

    expect(salida.source).toBe('intervalo');
    expect(salida.accuracyMeters).toBeGreaterThan(PRECISE_ENOUGH_M);
  });

  it('con tres ómnibus detenidos en el mismo lugar, ahí está la parada', () => {
    const salida = estimateAlong({
      operator: 'codesa',
      lineCode: '12',
      itineraryKey: 'PUNTA DEL ESTE',
      intervals: intervalosLimpios,
      halts: [
        { alongMeters: 1002, speedKmh: 0, sinceChange: 1 },
        { alongMeters: 1006, speedKmh: 3, sinceChange: 1 },
        { alongMeters: 1010, speedKmh: 4, sinceChange: 2 },
      ],
    });

    expect(salida.source).toBe('detenciones');
    expect(salida.alongMeters).toBeGreaterThanOrEqual(1000);
    expect(salida.alongMeters).toBeLessThanOrEqual(1012);
    expect(salida.accuracyMeters).toBeLessThanOrEqual(PRECISE_ENOUGH_M);
  });

  it('un ómnibus frenado en el semáforo de la otra cuadra no mueve la parada', () => {
    // Las tres detenciones están fuera de la ventana del intervalo. Aceptarlas
    // sería poner la parada donde para el tránsito, no donde para el ómnibus.
    const salida = estimateAlong({
      operator: 'codesa',
      lineCode: '12',
      itineraryKey: 'PUNTA DEL ESTE',
      intervals: intervalosLimpios,
      halts: [
        { alongMeters: 1600, speedKmh: 0, sinceChange: 1 },
        { alongMeters: 1605, speedKmh: 0, sinceChange: 1 },
        { alongMeters: 1610, speedKmh: 2, sinceChange: 2 },
      ],
    });

    expect(salida.source).toBe('intervalo');
  });

  it('si los dos estimadores se contradicen, el error declarado lo refleja', () => {
    // Las detenciones caen dentro de la ventana pero lejos del centro del
    // intervalo. La respuesta puede estar bien, pero no se puede afirmar con
    // la misma cara que cuando los dos coinciden.
    const juntos = estimateAlong({
      operator: 'codesa',
      lineCode: '12',
      itineraryKey: 'PUNTA DEL ESTE',
      intervals: intervalosLimpios,
      halts: [
        { alongMeters: 1000, speedKmh: 0, sinceChange: 1 },
        { alongMeters: 1004, speedKmh: 1, sinceChange: 1 },
        { alongMeters: 1008, speedKmh: 2, sinceChange: 2 },
      ],
    });

    const separados = estimateAlong({
      operator: 'codesa',
      lineCode: '12',
      itineraryKey: 'PUNTA DEL ESTE',
      intervals: intervalosLimpios,
      halts: [
        { alongMeters: 1190, speedKmh: 0, sinceChange: 1 },
        { alongMeters: 1194, speedKmh: 1, sinceChange: 1 },
        { alongMeters: 1198, speedKmh: 2, sinceChange: 2 },
      ],
    });

    expect(separados.source).toBe('detenciones');
    expect(separados.accuracyMeters).toBeGreaterThan(juntos.accuracyMeters);
  });

  it('el error declarado nunca baja de lo que vale la fuente', () => {
    // Aunque las muestras estén pegadas, el método de intervalos no puede
    // afirmar una esquina: medido, su p75 contra OSM ronda los 110 m.
    const salida = estimateAlong({
      operator: 'codesa',
      lineCode: '12',
      itineraryKey: 'PUNTA DEL ESTE',
      intervals: [
        [1000, 1002],
        [1000, 1001],
        [999, 1002],
      ],
      halts: [],
    });

    expect(salida.source).toBe('intervalo');
    expect(salida.accuracyMeters).toBeGreaterThanOrEqual(100);
  });
});
