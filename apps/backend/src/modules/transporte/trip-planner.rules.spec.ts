import { admiteTransbordo, TripOption, TripPlannerService } from './trip-planner.service';
import { SchedulesService } from './schedules.service';

/**
 * Las reglas de producto del planificador, congeladas.
 *
 * No prueban que el planificador funcione -para eso hay que levantarlo entero
 * con base y GPS- sino que **las decisiones que se tomaron a mano sigan
 * tomadas**. Son reglas que no se deducen del código: alguien las eligió
 * mirando cómo se viaja en Maldonado, y dentro de un mes nadie va a acordarse
 * de por qué.
 *
 * Lo que se congela acá:
 *
 *   1. Abajo de 11 km no hay transbordo, haya o no una línea directa.
 *   2. Se muestran al menos cinco líneas aunque alguna pase mucho después.
 *   3. Una opción por línea: doce variantes de la misma línea no son opciones.
 *   4. Para una hora futura, la única fuente es el horario publicado.
 *
 * Y una advertencia para el que venga: **no se testea contra la API en vivo.**
 * El ómnibus se mueve entre una llamada y la siguiente, así que una tabla de
 * resultados esperados contra el servidor levantado no es reproducible: da
 * distinto según la hora y según qué coches haya en la calle. Estas pruebas son
 * sobre funciones puras y sobre `rank`, que recibe todo lo que necesita.
 */

/** `rank` sólo mira el costo, los minutos y de qué línea es cada tramo. */
function opcion(linea: string, minutos: number, costo = minutos, transbordo?: string) {
  const tramo = (codigo: string) => ({
    sequence: { operator: 'codesa', lineCode: codigo },
  });

  return {
    rides: transbordo ? [tramo(linea), tramo(transbordo)] : [tramo(linea)],
    estimatedMinutes: minutos,
    cost: costo,
  } as never;
}

/**
 * El planificador con las dependencias que el caso necesita, y nada más.
 *
 * Las que no se pasan quedan en un objeto vacío: si un método las llega a
 * tocar, la prueba explota en vez de pasar por casualidad, que es exactamente
 * lo que se quiere verificar en las reglas de la hora futura -que las fuentes
 * en vivo **no** se consulten-.
 */
function planificadorCon(partes: {
  routeShapes?: unknown;
  walking?: unknown;
  lineSpeeds?: unknown;
  schedules?: unknown;
}): TripPlannerService {
  const nada = {} as never;
  return new TripPlannerService(
    nada, // stopSequences
    nada, // arrivals
    nada, // stopsReader
    (partes.routeShapes ?? nada) as never,
    nada, // vehiclePositions
    nada, // officialRoutes
    (partes.walking ?? nada) as never,
    (partes.lineSpeeds ?? nada) as never,
    (partes.schedules ?? nada) as never,
  );
}

/** El planificador sin ninguna dependencia: `rank` y `label` no las usan. */
function planificador(): TripPlannerService {
  return planificadorCon({});
}

function rankear(opciones: ReturnType<typeof opcion>[]): Array<{ linea: string }> {
  const servicio = planificador() as unknown as {
    rank(o: unknown[]): Array<{ rides: Array<{ sequence: { lineCode: string } }> }>;
  };

  return servicio.rank(opciones).map((o) => ({ linea: o.rides[0].sequence.lineCode }));
}

describe('regla: abajo de 11 km no se combina', () => {
  it('un viaje corto no admite transbordo aunque no haya directo', () => {
    // Centro → Punta Shopping son 2,9 km; Centro → Punta del Este, 5,8.
    expect(admiteTransbordo(2_900)).toBe(false);
    expect(admiteTransbordo(5_800)).toBe(false);
    expect(admiteTransbordo(9_900)).toBe(false);
  });

  it('los viajes largos y atravesados sí lo admiten', () => {
    // San Carlos → Balneario Buenos Aires son 16,5 km, que es el caso real que
    // motivó la regla: ahí no hay una línea que te deje a cualquier hora.
    expect(admiteTransbordo(16_500)).toBe(true);
    expect(admiteTransbordo(18_800)).toBe(true);
  });

  it('el corte está en 11 km, no en otro número', () => {
    expect(admiteTransbordo(10_999)).toBe(false);
    expect(admiteTransbordo(11_000)).toBe(true);
  });
});

describe('regla: se muestran al menos cinco líneas', () => {
  it('llega a cinco aunque las últimas tarden mucho más que la primera', () => {
    // Lo que se pidió es ver todas las líneas que sirven, de las tres
    // empresas, aunque una pase bastante después: alguien sin apuro prefiere
    // saber que existe, y alguien apurado ya vio la primera de la lista.
    const opciones = [
      opcion('24', 20),
      opcion('12', 45),
      opcion('9', 70),
      opcion('14', 95),
      opcion('8', 120),
    ];

    expect(rankear(opciones).map((o) => o.linea)).toEqual(['24', '12', '9', '14', '8']);
  });

  it('pasado el piso sí descarta las que llegan absurdamente más tarde', () => {
    const opciones = [
      opcion('24', 20),
      opcion('12', 22),
      opcion('9', 24),
      opcion('14', 26),
      opcion('8', 28),
      // La sexta ya no entra: hay cinco que compiten y ésta llega una hora
      // después de la mejor.
      opcion('61', 200),
    ];

    expect(rankear(opciones)).toHaveLength(5);
  });

  it('no devuelve más de ocho: una lista de veinte no es una lista', () => {
    const opciones = Array.from({ length: 20 }, (_, i) => opcion(`L${i}`, 20 + i));
    expect(rankear(opciones).length).toBeLessThanOrEqual(8);
  });
});

describe('regla: una opción por línea', () => {
  it('doce variantes de la 24 son una sola opción', () => {
    const opciones = [
      opcion('24', 20),
      opcion('24', 22),
      opcion('24', 25),
      opcion('12', 30),
    ];

    expect(rankear(opciones).map((o) => o.linea)).toEqual(['24', '12']);
  });

  it('ordena por costo y no por minutos: el costo lleva las penalizaciones', () => {
    // La 12 llega antes en el reloj pero sale más cara -camina más, o combina-.
    // El orden lo manda el costo; los minutos que se muestran son los reales.
    const opciones = [opcion('12', 20, 60), opcion('24', 30, 30)];
    expect(rankear(opciones).map((o) => o.linea)).toEqual(['24', '12']);
  });
});

describe('etiqueta "Sin transbordo"', () => {
  function etiquetar(opciones: Array<Partial<TripOption>>): Array<string | undefined> {
    const servicio = planificador() as unknown as {
      label(o: unknown[]): Array<{ label?: string }>;
    };
    return servicio.label(opciones).map((o) => o.label);
  }

  it('no se pone cuando todas son directas: no distingue nada', () => {
    // Es lo normal desde que el transbordo sólo aparece si no hay directo.
    // Puesta ahí, sugiere que las otras sí combinan.
    const etiquetas = etiquetar([
      { id: 'a', total_minutes: 20, walk_minutes: 5, transfers: 0 },
      { id: 'b', total_minutes: 30, walk_minutes: 8, transfers: 0 },
    ]);

    expect(etiquetas).not.toContain('Sin transbordo');
    expect(etiquetas[0]).toBe('Más rápido');
  });

  it('sí se pone cuando hay con qué comparar', () => {
    // Cada etiqueta se pone una sola vez y sobre una opción que no tenga otra,
    // así que para ver "Sin transbordo" la directa no puede ser además la más
    // rápida ni la que menos camina: si no, ya se llevó una etiqueta.
    const etiquetas = etiquetar([
      { id: 'a', total_minutes: 20, walk_minutes: 5, transfers: 1 },
      { id: 'b', total_minutes: 30, walk_minutes: 12, transfers: 0 },
    ]);

    expect(etiquetas).toContain('Sin transbordo');
  });
});

/**
 * Planificar para más tarde.
 *
 * La regla es una sola y es de producto: **a una hora que todavía no llegó se
 * le contesta con el horario publicado y con nada más**. Las otras dos fuentes
 * del planificador hablan del presente —las ETAs salen de posiciones de GPS de
 * este momento y la frecuencia se cuenta con los coches que están dando la
 * vuelta ahora— y usarlas para mañana a las 18:30 es contestar con el tránsito
 * de hoy una pregunta sobre otro día.
 *
 * Es la clase de error que no se ve: la respuesta sale igual de prolija, con
 * su hora y su coche, y sólo se descubre en la parada.
 */

/** Un recorrido cualquiera; lo único que importa es su identidad. */
const RECORRIDO = {
  operator: 'codesa',
  lineCode: '9',
  itineraryKey: 'ida',
  stops: [],
} as never;

const SUBIDA = {
  stopId: 1,
  code: '1',
  name: 'A',
  sequence: 1,
  alongMeters: 0,
  lat: -34.9,
  lng: -54.95,
  accuracyM: 20,
  reliable: true,
} as never;

const BAJADA = {
  stopId: 9,
  code: '9',
  name: 'B',
  sequence: 9,
  alongMeters: 4000,
  lat: -34.93,
  lng: -54.95,
  accuracyM: 20,
  reliable: true,
} as never;

/** Cuatrocientos metros de caminata: cinco minutos hasta la parada. */
const CAMINATA = { stop: { id: 1 }, walkMeters: 400, huntingMeters: 0 } as never;

/** Mañana a las seis y media de la tarde, que es el caso de la tarea. */
const MANANA = new Date('2026-09-10T18:30:00');

describe('regla: para una hora futura sólo contesta el horario publicado', () => {
  interface ConIsOfferable {
    isOfferable(
      sequence: unknown,
      boarding: unknown,
      from: unknown,
      running: Map<string, number>,
      reloj: { now: Date; futuro: boolean },
    ): boolean;
  }

  it('que la línea esté circulando ahora no la habilita para mañana', () => {
    // Tres coches de la 9 en la calle en este momento y ninguna salida
    // publicada que sirva para mañana a las 18:30.
    const planner = planificadorCon({
      walking: { minutes: (metros: number) => Math.round(metros / 80) },
      schedules: { nextDeparture: () => null },
    }) as unknown as ConIsOfferable;

    const circulando = new Map([['codesa|9|ida', 3]]);

    expect(
      planner.isOfferable(RECORRIDO, SUBIDA, CAMINATA, circulando, {
        now: MANANA,
        futuro: true,
      }),
    ).toBe(false);

    // Y con los mismos tres coches, para ahora, sí se ofrece.
    expect(
      planner.isOfferable(RECORRIDO, SUBIDA, CAMINATA, circulando, {
        now: new Date(),
        futuro: false,
      }),
    ).toBe(true);
  });

  it('le pregunta al horario por la hora pedida y no por la de ahora', () => {
    // El filtro que decide qué líneas entran al ranking se llamaba sin reloj y
    // caía al `new Date()` por defecto: para un viaje de mañana dejaba pasar
    // las líneas que salen dentro de las próximas tres horas de **hoy**.
    const nextDeparture = jest.fn(() => null);
    const planner = planificadorCon({
      walking: { minutes: (metros: number) => Math.round(metros / 80) },
      schedules: { nextDeparture },
    }) as unknown as ConIsOfferable;

    planner.isOfferable(RECORRIDO, SUBIDA, CAMINATA, new Map(), {
      now: MANANA,
      futuro: true,
    });

    expect(nextDeparture).toHaveBeenCalledWith(RECORRIDO, SUBIDA, 5, MANANA);
  });

  interface ConBuildOption {
    buildOption(input: unknown): {
      rides: Array<{ departure: { atMinute: number; live: boolean; scheduled?: boolean } }>;
    } | null;
  }

  /**
   * Un viaje de una sola línea, con un coche en la calle que llega en 12
   * minutos, tres unidades dando la vuelta y la salida publicada que se le
   * pase.
   */
  function viaje(
    reloj: { now: Date; futuro: boolean },
    horario: { atMinute: number; live: false; scheduled: true } | null,
  ) {
    const planner = planificadorCon({
      // Sin trazo: la duración del tramo sale de la velocidad promedio.
      routeShapes: { getShapes: () => [] },
      lineSpeeds: { kmh: () => 18 },
      walking: {
        minutes: (metros: number) => Math.max(1, Math.round(metros / 80)),
        // Caminar el mismo tramo son 75 minutos: el ómnibus sirve.
        estimate: () => ({ distanceM: 6000 }),
        speedMPerMin: 80,
      },
      schedules: { nextDeparture: () => horario },
    }) as unknown as ConBuildOption;

    return planner.buildOption({
      walkIn: CAMINATA,
      walkOut: CAMINATA,
      rides: [{ sequence: RECORRIDO, boarding: SUBIDA, alighting: BAJADA }],
      etas: new Map([
        ['codesa|9|ida', [{ eta_minutes: 12, live: true, vehicle_id: 'codesa-303' }]],
      ]),
      running: new Map([['codesa|9|ida', 3]]),
      reloj,
    });
  }

  it('ignora el coche que viene en camino: mañana ese coche no existe', () => {
    const option = viaje(
      { now: MANANA, futuro: true },
      { atMinute: 40, live: false, scheduled: true },
    );

    expect(option?.rides[0].departure).toEqual({ atMinute: 40, live: false, scheduled: true });
  });

  it('sin horario publicado no hay viaje, aunque la línea esté circulando', () => {
    // Es el caso que separa las dos ramas: hay un coche que se alcanza y hay
    // tres dando la vuelta, así que tanto el vivo como la frecuencia tendrían
    // algo que contestar. Para mañana, no se les pregunta.
    expect(viaje({ now: MANANA, futuro: true }, null)).toBeNull();
  });

  it('y para ahora sigue ganando el coche que viene en camino', () => {
    const option = viaje(
      { now: new Date(), futuro: false },
      { atMinute: 40, live: false, scheduled: true },
    );

    expect(option?.rides[0].departure.atMinute).toBe(12);
    expect(option?.rides[0].departure.live).toBe(true);
  });
});

/**
 * El horizonte del horario publicado, y la temporada.
 *
 * `nextDeparture` sólo ofrece salidas dentro de las tres horas siguientes. Con
 * el planificador aceptando una hora de salida, ese horizonte tiene que
 * moverse con la hora pedida: anclado al reloj del servidor, un viaje de
 * mañana a la tarde se contestaría con las salidas de esta tarde.
 */
describe('el horizonte de tres horas se mueve con la hora pedida', () => {
  /**
   * Un `SchedulesService` con un solo servicio cargado a mano.
   *
   * Se le inyecta la caché de puntos ya proyectados (`alongCache`) en vez de
   * darle un trazo: proyectar los puntos de control sobre la polilínea es otro
   * problema, probado aparte, y acá lo único que se mira es la ventana de
   * tiempo.
   */
  function horarios(): SchedulesService {
    const nada = {} as never;
    const servicio = new SchedulesService(nada, nada, { lineLabel: () => '9' } as never, nada);

    const interno = servicio as unknown as {
      byLine: Map<string, unknown[]>;
      alongCache: Map<string, Map<string, number>>;
    };

    // Un servicio que sale 18:00 de A y llega 18:40 a B, todos los días.
    interno.byLine.set('codesa|9', [
      {
        operator: 'codesa',
        lineLabel: '9',
        direction: 'ida',
        days: 0b1111111,
        timepoints: [
          { point: 'A', time: '18:00' },
          { point: 'B', time: '18:40' },
        ],
      },
    ]);
    interno.alongCache.set(
      'codesa|9|ida',
      new Map([
        ['A', 0],
        ['B', 12000],
      ]),
    );

    return servicio;
  }

  it('a las 16:00 la salida de las 18:00 entra, y a las 14:00 todavía no', () => {
    const servicio = horarios();

    expect(
      servicio.nextDeparture(RECORRIDO, SUBIDA, 0, new Date('2026-09-10T16:00:00'))?.atMinute,
    ).toBe(120);

    expect(
      servicio.nextDeparture(RECORRIDO, SUBIDA, 0, new Date('2026-09-10T14:00:00')),
    ).toBeNull();
  });

  it('la ventana es la de la fecha pedida, no la de hoy', () => {
    // La semana que viene a la misma hora contesta lo mismo: el horizonte
    // cuelga del reloj recibido y no del del servidor.
    expect(
      horarios().nextDeparture(RECORRIDO, SUBIDA, 0, new Date('2026-09-17T16:00:00'))?.atMinute,
    ).toBe(120);
  });

  it('una fecha de la otra temporada no se contesta, y sobre todo no recarga', () => {
    // Recargar con la fecha **pedida** cambiaba la temporada cargada para todos
    // los demás: alguien preguntando por el 2 de enero dejaba al servicio con
    // el horario de verano, y los que preguntaban por hoy pasaban a recibir el
    // horario de otra época.
    jest.useFakeTimers().setSystemTime(new Date('2026-09-09T12:00:00'));

    const servicio = horarios();
    (servicio as unknown as { loadedSeason: string }).loadedSeason = 'invierno';
    const reload = jest.spyOn(servicio, 'reload').mockResolvedValue();

    expect(
      servicio.nextDeparture(RECORRIDO, SUBIDA, 0, new Date('2026-09-10T16:00:00')),
    ).not.toBeNull();

    expect(
      servicio.nextDeparture(RECORRIDO, SUBIDA, 0, new Date('2027-01-14T16:00:00')),
    ).toBeNull();

    expect(reload).not.toHaveBeenCalled();

    jest.useRealTimers();
  });
});
