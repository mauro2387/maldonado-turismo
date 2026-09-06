import { avisoPorMetros, enCuadras, RideService } from './ride.service';
import { StopOnRoute } from './stop-sequence.service';

/**
 * Las reglas de "ya te subiste", congeladas.
 *
 * Igual que `trip-planner.rules.spec`: no prueban que el servicio funcione
 * -para eso hay que levantarlo con base y GPS- sino que **las decisiones que
 * se tomaron a mano sigan tomadas**. Son las que no se deducen del código:
 * alguien eligió tres cuadras para el timbre y bajada-más-caminata como
 * criterio, y dentro de un mes nadie se va a acordar de por qué.
 *
 * Lo que se congela:
 *
 *   1. La bajada es la que te deja **llegando antes**, no la más cercana al
 *      destino.
 *   2. Esa elección no cambia mientras el coche avanza.
 *   3. Una parada que el coche ya pasó no se ofrece.
 *   4. Si ninguna parada deja a distancia de caminar, no hay bajada.
 *   5. `stops_away` cuenta lo que se ve por la ventanilla, no lo que quedó
 *      después de filtrar.
 *   6. Los umbrales del aviso.
 *
 * Todo sobre funciones puras y sobre `best`, que recibe lo que necesita: no se
 * toca la API en vivo, porque el ómnibus se mueve entre una llamada y la
 * siguiente y una tabla de resultados esperados contra el servidor levantado
 * no es reproducible.
 */

/** Un grado de latitud son 110.574 m. Alcanza para ubicar paradas a mano. */
const METROS_POR_GRADO = 110_574;

const DESTINO = { lat: -34.9, lng: -54.95 };

/** Una parada a tantos metros del destino y a tantos metros sobre el recorrido. */
function parada(
  stopId: number,
  alongMeters: number,
  metrosAlDestino: number,
  opciones: { ubicada?: boolean } = {},
): StopOnRoute {
  const ubicada = opciones.ubicada ?? true;

  return {
    stopId,
    code: String(stopId),
    name: `Parada ${stopId}`,
    lat: DESTINO.lat + metrosAlDestino / METROS_POR_GRADO,
    lng: DESTINO.lng,
    alongMeters,
    sequence: stopId,
    reliable: ubicada,
    // Una parada que nunca se pudo ubicar es la única que se descarta: sin
    // coordenada medida no hay a dónde mandar a nadie.
    accuracyM: ubicada ? null : null,
    fixSource: ubicada ? 'osm' : null,
  };
}

/**
 * El servicio con lo mínimo para que `best` corra.
 *
 * Un ómnibus a 300 m/min -18 km/h, que es lo que anda una línea urbana de acá
 * parando en cada parada- y alguien caminando a los 80 m/min de
 * `WalkingService`. Los números están elegidos para que las cuentas del test
 * se puedan hacer de cabeza.
 */
function servicio(): RideService {
  const nada = {} as never;
  const velocidades = {
    travelMinutes: (
      _operator: string,
      _lineCode: string,
      _itineraryKey: string,
      _polyline: unknown,
      _cumulative: unknown,
      fromM: number,
      toM: number,
    ) => Math.max(0, toM - fromM) / 300,
  } as never;
  const caminata = { speedMPerMin: 80 } as never;

  return new RideService(nada, nada, nada, nada, velocidades, caminata);
}

/** `best` es privado: acá interesa la regla, no por dónde se la llama. */
function mejorBajada(
  paradas: StopOnRoute[],
  busAlong: number,
): { stopId: number; stopsAway: number } | null {
  const interno = servicio() as unknown as {
    best(
      stops: StopOnRoute[],
      sequence: unknown,
      shape: unknown,
      busAlong: number,
      destination: { lat: number; lng: number },
    ): { stop: StopOnRoute; stopsAway: number } | null;
  };

  const secuencia = { operator: 'codesa', lineCode: '16', itineraryKey: 'ida' };
  const trazo = { geometry: [], cumulative: [] };

  const elegida = interno.best(paradas, secuencia, trazo, busAlong, DESTINO);
  return elegida ? { stopId: elegida.stop.stopId, stopsAway: elegida.stopsAway } : null;
}

describe('regla: te bajás donde llegás antes, no donde estás más cerca', () => {
  // A: 1000 m de recorrido y 600 del destino -> 3,3 de ómnibus + 7,5 a pie.
  // B: 2000 m de recorrido y 200 del destino -> 6,7 de ómnibus + 2,5 a pie.
  // C: 3000 m de recorrido y 150 del destino -> 10 de ómnibus + 1,9 a pie.
  const paradas = [parada(1, 1000, 600), parada(2, 2000, 200), parada(3, 3000, 150)];

  it('elige la que suma menos ómnibus más caminata', () => {
    expect(mejorBajada(paradas, 0)?.stopId).toBe(2);
  });

  it('no elige la más cercana al destino si cuesta seguir viajando', () => {
    // La 3 está 50 m más cerca del destino y es la que elegiría un criterio
    // de "parada más cercana". Cuesta tres minutos de ómnibus para ahorrar
    // medio de caminata.
    expect(mejorBajada(paradas, 0)?.stopId).not.toBe(3);
  });

  it('no cambia de idea mientras el coche avanza', () => {
    // Es la propiedad que permite mostrarla sin que parpadee: los minutos de
    // ómnibus hasta todas las paradas de adelante bajan por igual, así que la
    // diferencia entre dos candidatas no depende de dónde está el coche.
    for (const busAlong of [0, 250, 500, 900, 1500, 1900]) {
      expect(mejorBajada(paradas, busAlong)?.stopId).toBe(2);
    }
  });

  it('deja de ofrecer la parada que el coche ya pasó', () => {
    // Pasada la 2, la única que queda es la 3, aunque sea la peor de las tres.
    expect(mejorBajada(paradas, 2100)?.stopId).toBe(3);
    // Y pasadas todas, no hay bajada: a un ómnibus no se le pide que vuelva.
    expect(mejorBajada(paradas, 3100)).toBeNull();
  });

  it('con el coche frenando en la parada, la parada sigue siendo la tuya', () => {
    // Medio margen de PASSED_MARGIN_M: el GPS del feed cae a decenas de metros
    // y la parada tiene su propio error. Con el corte en cero, el coche que
    // está frenando en tu parada ya la habría "pasado".
    expect(mejorBajada([parada(2, 2000, 200)], 2025)?.stopId).toBe(2);
  });
});

describe('regla: si no te deja cerca, no te deja', () => {
  it('no hay bajada cuando todas quedan a más de 900 m del destino', () => {
    // 900 m es el mismo tope que el planificador. Ofrecer una bajada a un
    // kilómetro y medio es mandar a alguien a caminar veinte minutos sin
    // avisarle.
    expect(mejorBajada([parada(1, 1000, 1200), parada(2, 2000, 2500)], 0)).toBeNull();
  });

  it('la parada que nunca se pudo ubicar no se ofrece', () => {
    const paradas = [parada(1, 1000, 100, { ubicada: false }), parada(2, 2000, 300)];
    expect(mejorBajada(paradas, 0)?.stopId).toBe(2);
  });
});

describe('regla: stops_away es lo que se ve por la ventanilla', () => {
  it('cuenta también las paradas que se descartaron para elegir', () => {
    // La 1 no sirve como bajada -no está ubicada- pero el coche igual va a
    // parar ahí, y la persona la va a ver pasar. Contarla es la diferencia
    // entre "faltan dos" y bajarse una parada antes.
    const paradas = [parada(1, 1000, 100, { ubicada: false }), parada(2, 2000, 200)];
    expect(mejorBajada(paradas, 0)?.stopsAway).toBe(1);
  });

  it('cero es "la próxima es la tuya"', () => {
    expect(mejorBajada([parada(2, 2000, 200)], 0)?.stopsAway).toBe(0);
  });
});

describe('regla: el aviso se da por metros', () => {
  it('tres cuadras antes hay que tocar el timbre', () => {
    expect(avisoPorMetros(270)).toBe('bajate');
    expect(avisoPorMetros(80)).toBe('bajate');
    expect(avisoPorMetros(0)).toBe('bajate');
  });

  it('ocho cuadras antes conviene ir juntando las cosas', () => {
    expect(avisoPorMetros(720)).toBe('preparate');
    expect(avisoPorMetros(300)).toBe('preparate');
  });

  it('más lejos que eso, quedate tranquilo', () => {
    expect(avisoPorMetros(721)).toBe('viaja');
    expect(avisoPorMetros(4000)).toBe('viaja');
  });

  it('el coche frenando en la parada todavía no es "te pasaste"', () => {
    // Media cuadra de margen para el error del GPS y el de la parada. Decirle
    // a alguien que se pasó mientras el ómnibus está frenando es el peor
    // momento posible.
    expect(avisoPorMetros(-40)).toBe('bajate');
    expect(avisoPorMetros(-60)).toBe('te_pasaste');
  });
});

describe('las cuadras son la unidad en la que se piensa el viaje', () => {
  it('traduce metros a cuadras de 90 m', () => {
    expect(enCuadras(270)).toBe(3);
    expect(enCuadras(90)).toBe(1);
    expect(enCuadras(720)).toBe(8);
  });

  it('menos de media cuadra es "acá nomás", no media cuadra', () => {
    expect(enCuadras(30)).toBe(0);
    expect(enCuadras(0)).toBe(0);
  });
});
