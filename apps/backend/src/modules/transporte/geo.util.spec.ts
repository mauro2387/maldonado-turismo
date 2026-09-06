import {
  cumulativeDistances,
  distanceAlongPolyline,
  distanceMeters,
  LngLat,
  pointAtDistance,
} from './geo.util';

/**
 * `pointAtDistance` es la inversa de `distanceAlongPolyline`, y de eso se
 * aprovecha la prueba: ir y volver tiene que caer en el mismo lugar. Lo usa el
 * cálculo de velocidad por tramo, que recorre el trazo de a pasos preguntando
 * por dónde va.
 */

/** Un meridiano, donde la distancia es lineal en la latitud. */
const MERIDIANO: LngLat[] = [
  [-54.95, -34.95],
  [-54.95, -34.9],
];
const ACUMULADAS = cumulativeDistances(MERIDIANO);
const LARGO = ACUMULADAS[1];

/** Una ele: dos tramos con un quiebre, para que no sea todo recta. */
const ELE: LngLat[] = [
  [-54.95, -34.95],
  [-54.95, -34.94],
  [-54.94, -34.94],
];
const ELE_ACUMULADAS = cumulativeDistances(ELE);

describe('pointAtDistance', () => {
  it('el medio del trazo está a la mitad de los metros', () => {
    const punto = pointAtDistance(MERIDIANO, ACUMULADAS, LARGO / 2);
    expect(punto).not.toBeNull();
    expect(punto![1]).toBeCloseTo(-34.925, 5);
  });

  it('ir y volver cae en el mismo metro', () => {
    const largoDeLaEle = ELE_ACUMULADAS[ELE_ACUMULADAS.length - 1];
    for (const metros of [0, 137, largoDeLaEle / 3, largoDeLaEle - 12]) {
      const punto = pointAtDistance(ELE, ELE_ACUMULADAS, metros)!;
      const vuelta = distanceAlongPolyline(punto[1], punto[0], ELE, ELE_ACUMULADAS)!;
      expect(vuelta.alongMeters).toBeCloseTo(metros, 0);
    }
  });

  it('encuentra el quiebre de la ele en su metro exacto', () => {
    const quiebre = pointAtDistance(ELE, ELE_ACUMULADAS, ELE_ACUMULADAS[1])!;
    expect(distanceMeters(quiebre[1], quiebre[0], -34.94, -54.95)).toBeLessThan(1);
  });

  it('fuera de los extremos devuelve la punta, no null ni un disparate', () => {
    // Pedir el metro -3 de un recorrido es preguntar por dónde empieza.
    expect(pointAtDistance(MERIDIANO, ACUMULADAS, -3)).toEqual(MERIDIANO[0]);
    expect(pointAtDistance(MERIDIANO, ACUMULADAS, 0)).toEqual(MERIDIANO[0]);
    expect(pointAtDistance(MERIDIANO, ACUMULADAS, LARGO + 5000)).toEqual(MERIDIANO[1]);
  });

  it('un trazo vacío no tiene puntos y uno solo es siempre el mismo', () => {
    expect(pointAtDistance([], [], 10)).toBeNull();
    expect(pointAtDistance([MERIDIANO[0]], [0], 10)).toEqual(MERIDIANO[0]);
  });
});
