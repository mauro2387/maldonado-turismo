import { DataSource } from 'typeorm';
import { LineSpeedService } from './line-speed.service';
import { cumulativeDistances, LngLat } from './geo.util';

/**
 * Lo que se prueba acá es una sola idea: **un recorrido no anda parejo**, y
 * cobrarle a un tramo la velocidad promedio de toda la línea da un número que
 * no es el de ese tramo.
 *
 * El caso que lo destapó es real. Alguien tocó un ómnibus de la 15 en el mapa
 * y la app le dijo "no llegás" con el coche a dos kilómetros. La 15 promedia
 * 30 km/h porque son treinta kilómetros de Ruta 10 e Interbalnearia, pero las
 * paradas donde alguien la alcanza están en el centro de Maldonado, donde
 * anda a 20. El horario que publica CODESA lo confirma: quince minutos entre
 * la Terminal y la Agencia, 5.065 metros, en los dos sentidos.
 */

/** Un meridiano: la distancia sobre él es lineal en la latitud. */
const SUR = -34.95;
const NORTE = -34.9;
const LNG = -54.95;
const RECORRIDO: LngLat[] = [
  [LNG, SUR],
  [LNG, NORTE],
];
const ACUMULADAS = cumulativeDistances(RECORRIDO);
const LARGO = ACUMULADAS[1];

/** El lado del cuadro, en grados, tal como lo parte el servicio. */
const CUADRO = 0.005;

/**
 * Una fila de las que devuelve la consulta, con la velocidad que se quiere que
 * tenga ese cuadro.
 */
function celda(indice: number, kmh: number, tramos = 40) {
  // El medio del cuadro, no su borde: `SUR` cae justo sobre un límite y en
  // punto flotante los bordes de dos cuadros vecinos redondean al mismo.
  const lat = SUR + (indice + 0.5) * CUADRO;
  const metros = 11_132;
  return {
    operator: 'codesa',
    line_code: '15',
    itinerary_key: 'MALDONADO',
    celda_lat: Math.floor(lat / CUADRO),
    celda_lng: Math.floor(LNG / CUADRO),
    metros,
    segundos: metros / (kmh / 3.6),
    tramos,
  };
}

function servicio(rows: unknown[]) {
  const dataSource = { query: async () => rows } as unknown as DataSource;
  return new LineSpeedService(dataSource);
}

/**
 * El recorrido de la prueba: ocho cuadros de ruta a 45 y dos de centro a 20.
 * El promedio de todo da 36 km/h, que no es la velocidad de ninguno de los
 * dos tramos.
 */
const RUTA_Y_CENTRO = [
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => celda(i, 45)),
  ...[8, 9].map((i) => celda(i, 20)),
];

/** Dónde empieza el tramo lento: los dos últimos cuadros. */
const CENTRO_DESDE = LARGO * 0.8;

describe('LineSpeedService', () => {
  it('sin nada medido contesta la constante declarada, no un silencio', async () => {
    const velocidades = servicio([]);
    await velocidades.warm();

    expect(velocidades.kmh('codesa', '15', 'MALDONADO')).toBe(18);
    expect(velocidades.metersPerMinuteAt('codesa', '15', 'MALDONADO', NORTE, LNG)).toBeCloseTo(
      (18 * 1000) / 60,
      3,
    );
  });

  it('el promedio del recorrido sale de sumar sus cuadros', async () => {
    const velocidades = servicio(RUTA_Y_CENTRO);
    await velocidades.warm();

    // 111.320 metros en 11.132 segundos.
    expect(velocidades.kmh('codesa', '15', 'MALDONADO')).toBeCloseTo(36, 1);
  });

  it('cada cuadro contesta su propia velocidad, no la del recorrido', async () => {
    const velocidades = servicio(RUTA_Y_CENTRO);
    await velocidades.warm();

    const enLaRuta = velocidades.metersPerMinuteAt('codesa', '15', 'MALDONADO', SUR + 0.002, LNG);
    const enElCentro = velocidades.metersPerMinuteAt('codesa', '15', 'MALDONADO', NORTE - 0.002, LNG);

    expect(enLaRuta).toBeCloseTo((45 * 1000) / 60, 1);
    expect(enElCentro).toBeCloseTo((20 * 1000) / 60, 1);
  });

  it('el tramo urbano se cobra a 20, no al promedio de 36: es el bug de la 15', async () => {
    const velocidades = servicio(RUTA_Y_CENTRO);
    await velocidades.warm();

    const metros = LARGO - CENTRO_DESDE;
    const minutos = velocidades.travelMinutes(
      'codesa',
      '15',
      'MALDONADO',
      RECORRIDO,
      ACUMULADAS,
      CENTRO_DESDE,
      LARGO,
    );

    // Lo que corresponde: esos metros a 20 km/h.
    expect(minutos).toBeCloseTo(metros / ((20 * 1000) / 60), 1);

    // Y lo que contestaba antes, con el promedio del recorrido. La diferencia
    // no es un detalle de redondeo: es casi el doble.
    const conElPromedio = metros / ((36 * 1000) / 60);
    expect(minutos).toBeGreaterThan(conElPromedio * 1.7);
  });

  it('un tramo que cruza los dos mundos paga cada parte a su precio', async () => {
    const velocidades = servicio(RUTA_Y_CENTRO);
    await velocidades.warm();

    const minutos = velocidades.travelMinutes(
      'codesa',
      '15',
      'MALDONADO',
      RECORRIDO,
      ACUMULADAS,
      0,
      LARGO,
    );

    const esperado =
      CENTRO_DESDE / ((45 * 1000) / 60) + (LARGO - CENTRO_DESDE) / ((20 * 1000) / 60);

    // Con una banda y no con una igualdad: el trazo se recorre de a pasos de
    // 150 metros, y el paso que cae sobre el límite entre la ruta y el centro
    // se cobra entero al lado donde cae su punto medio. El error máximo es
    // medio paso mal asignado -acá, un 1%-, y es el precio de no tener que
    // partir el recorrido en los bordes exactos de cada cuadro.
    expect(minutos).toBeGreaterThan(esperado * 0.98);
    expect(minutos).toBeLessThan(esperado * 1.02);
  });

  it('un cuadro con cuatro muestras no manda: manda el promedio del recorrido', async () => {
    // Un semáforo largo visto tres veces no es la velocidad de un lugar.
    const conRuido = [
      ...RUTA_Y_CENTRO.slice(0, 9),
      celda(9, 8, 4), // apenas cuatro tramos, y lentísimo
    ];
    const velocidades = servicio(conRuido);
    await velocidades.warm();

    const promedio = velocidades.kmh('codesa', '15', 'MALDONADO');
    const enEseCuadro = velocidades.metersPerMinuteAt(
      'codesa',
      '15',
      'MALDONADO',
      SUR + 9 * CUADRO + 0.002,
      LNG,
    );

    expect(enEseCuadro).toBeCloseTo((promedio * 1000) / 60, 3);
  });

  it('un recorrido con pocas muestras hereda la velocidad de su línea', async () => {
    const otroSentido = RUTA_Y_CENTRO.map((fila) => ({
      ...fila,
      itinerary_key: 'PUNTA DEL ESTE',
      tramos: 2,
    }));
    const velocidades = servicio([...RUTA_Y_CENTRO, ...otroSentido]);
    await velocidades.warm();

    expect(velocidades.kmh('codesa', '15', 'PUNTA DEL ESTE')).toBeCloseTo(36, 1);
  });

  it('las cotas siguen puestas: nadie mide un ómnibus a 200', async () => {
    const velocidades = servicio([celda(0, 200), celda(1, 1)]);
    await velocidades.warm();

    expect(velocidades.metersPerMinuteAt('codesa', '15', 'MALDONADO', SUR + 0.002, LNG)).toBeCloseTo(
      (60 * 1000) / 60,
      1,
    );
    expect(
      velocidades.metersPerMinuteAt('codesa', '15', 'MALDONADO', SUR + CUADRO + 0.002, LNG),
    ).toBeCloseTo((8 * 1000) / 60, 1);
  });

  it('hacia atrás no hay minutos: un ómnibus no vuelve sobre su recorrido', async () => {
    const velocidades = servicio(RUTA_Y_CENTRO);
    await velocidades.warm();

    expect(
      velocidades.travelMinutes('codesa', '15', 'MALDONADO', RECORRIDO, ACUMULADAS, LARGO, 0),
    ).toBe(0);
    expect(
      velocidades.travelMinutes('codesa', '15', 'MALDONADO', RECORRIDO, ACUMULADAS, 100, 100),
    ).toBe(0);
  });

  it('si la consulta falla se sigue contestando, con la constante', async () => {
    const dataSource = {
      query: async () => {
        throw new Error('no hay base');
      },
    } as unknown as DataSource;
    const velocidades = new LineSpeedService(dataSource);

    await expect(velocidades.warm()).resolves.toBeUndefined();
    expect(velocidades.kmh('codesa', '15', 'MALDONADO')).toBe(18);
  });
});
