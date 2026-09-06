import { admiteTransbordo, TripOption, TripPlannerService } from './trip-planner.service';

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

/** El planificador sin ninguna dependencia: `rank` y `label` no las usan. */
function planificador(): TripPlannerService {
  const nada = {} as never;
  return new TripPlannerService(nada, nada, nada, nada, nada, nada, nada, nada, nada);
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
