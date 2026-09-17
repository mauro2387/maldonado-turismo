import {
  ANTES_DE_LLEGAR_MIN,
  corrida,
  llegaATiempo,
  momentosDePrueba,
  ordenadasParaLlegar,
  salidaDelPrimerOmnibus,
} from './arrive-by.rules';
import { PlannerPoint, TripOption, TripPlannerService } from './trip-planner.service';

/**
 * Las reglas de "llegar a las", congeladas.
 *
 * Igual que en `trip-planner.rules.spec.ts`: no se prueba contra el servidor
 * levantado -el horario cambia con el día y el GPS con el minuto- sino sobre
 * funciones puras y sobre `planArriveBy` con un `plan` de mentira que
 * representa una línea que pasa cada tanto. Lo que se congela:
 *
 *   1. Se prueba de la salida más tarde a la más temprana, nunca en el pasado,
 *      y el presente se prueba en vivo.
 *   2. Llegar a tiempo es llegar a la hora pedida o antes, sin margen oculto.
 *   3. Al juntar respuestas de distintas horas, los instantes se corren y las
 *      duraciones no.
 *   4. Se devuelve el **último** ómnibus que llega, no el primero que se
 *      encontró; y las opciones van por hora de salida, la más tarde primero.
 */

const hora = (hhmm: string, dia = '2026-09-17'): Date => new Date(`${dia}T${hhmm}:00-03:00`);

const hhmm = (date: Date): string =>
  date.toLocaleTimeString('es-UY', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Montevideo',
  });

/** Una opción de ómnibus como la devuelve el planificador, con lo que importa acá. */
function opcion(
  id: string,
  partes: { total: number; salir: number; pasa?: number; caminata?: number },
): TripOption {
  return {
    id,
    total_minutes: partes.total,
    walk_minutes: partes.caminata ?? 5,
    transfers: 0,
    leave_in_minutes: partes.salir,
    legs:
      partes.pasa === undefined
        ? [{ type: 'walk', duration_minutes: partes.total, from: 'A', to: 'B' }]
        : [
            { type: 'walk', duration_minutes: 5, from: 'A', to: 'Parada' },
            {
              type: 'wait',
              duration_minutes: partes.pasa - partes.salir - 5,
              from: 'Parada',
              to: 'Parada',
              departs_in_minutes: partes.pasa,
            },
            { type: 'bus', duration_minutes: partes.total - partes.pasa, from: 'Parada', to: 'B' },
          ],
  };
}

describe('regla: se prueba de la salida más tarde a la más temprana', () => {
  it('con la llegada lejos prueba las nueve horas, todas antes de llegar y ninguna en vivo', () => {
    const pruebas = momentosDePrueba(hora('18:30'), hora('12:00'));

    expect(pruebas.map(({ at }) => hhmm(at))).toEqual([
      '18:25',
      '18:20',
      '18:10',
      '18:00',
      '17:45',
      '17:30',
      '17:00',
      '16:30',
      '15:30',
    ]);
    expect(pruebas.every(({ ahora }) => !ahora)).toBe(true);
    expect(pruebas).toHaveLength(ANTES_DE_LLEGAR_MIN.length);
  });

  it('cuando una prueba cae en el presente, se prueba el presente en vivo y se para', () => {
    // Son las 15:00 y hay que llegar 15:25: se prueba 15:20, 15:15, 15:05 y
    // después "ahora" con el GPS. Nada de 14:55: ya pasó.
    const pruebas = momentosDePrueba(hora('15:25'), hora('15:00'));

    expect(pruebas.map(({ at, ahora }) => `${hhmm(at)}${ahora ? ' vivo' : ''}`)).toEqual([
      '15:20',
      '15:15',
      '15:05',
      '15:00 vivo',
    ]);
  });

  it('con la llegada encima sólo queda el presente', () => {
    const pruebas = momentosDePrueba(hora('15:04'), hora('15:00'));
    expect(pruebas).toEqual([{ at: hora('15:00'), ahora: true }]);
  });

  it('la tolerancia manda al presente una prueba que cae un minuto adelante', () => {
    // 15:21 - 20 = 15:01, que está dentro de los dos minutos de tolerancia:
    // no vale la pena un horario para dentro de un minuto, se mira la calle.
    const pruebas = momentosDePrueba(hora('15:21'), hora('15:00'));
    expect(pruebas.map(({ at, ahora }) => `${hhmm(at)}${ahora ? ' vivo' : ''}`)).toEqual([
      '15:16',
      '15:11',
      '15:00 vivo',
    ]);
  });
});

describe('regla: llegar a tiempo es llegar a la hora pedida o antes', () => {
  const treinta = opcion('x', { total: 30, salir: 0, pasa: 5 });

  it('llegar justo cuenta como llegar', () => {
    expect(llegaATiempo(treinta, hora('18:00'), hora('18:30'))).toBe(true);
  });

  it('un minuto tarde no', () => {
    expect(llegaATiempo(treinta, hora('18:01'), hora('18:30'))).toBe(false);
  });

  it('no hay margen escondido', () => {
    expect(llegaATiempo(treinta, hora('17:58'), hora('18:30'))).toBe(true);
    expect(llegaATiempo(treinta, hora('18:00'), hora('18:29'))).toBe(false);
  });
});

describe('regla: al correr una opción se corren los instantes, no las duraciones', () => {
  it('corre salida, llegada y la pasada del ómnibus; deja la caminata y el viaje', () => {
    const original = opcion('x', { total: 40, salir: 3, pasa: 8 });
    const corrida15 = corrida(original, 15);

    expect(corrida15.leave_in_minutes).toBe(18);
    expect(corrida15.total_minutes).toBe(55);
    expect(salidaDelPrimerOmnibus(corrida15)).toBe(23);
    expect(corrida15.legs.map((leg) => leg.duration_minutes)).toEqual(
      original.legs.map((leg) => leg.duration_minutes),
    );
    expect(corrida15.walk_minutes).toBe(original.walk_minutes);
  });

  it('con cero no toca nada', () => {
    const original = opcion('x', { total: 40, salir: 3, pasa: 8 });
    expect(corrida(original, 0)).toBe(original);
  });

  it('la opción a pie no tiene ómnibus que correr', () => {
    expect(salidaDelPrimerOmnibus(opcion('a-pie', { total: 20, salir: 0 }))).toBeNull();
  });
});

describe('regla: las opciones van por hora de salida, la más tarde primero', () => {
  it('junta respuestas de distintas horas sobre el reloj más temprano', () => {
    const { desde, options } = ordenadasParaLlegar([
      { option: opcion('rapida', { total: 30, salir: 5, pasa: 10 }), at: hora('18:00') },
      { option: opcion('lenta', { total: 40, salir: 0, pasa: 3, caminata: 2 }), at: hora('17:45') },
    ]);

    expect(desde).toEqual(hora('17:45'));
    expect(options.map((option) => option.id)).toEqual(['rapida', 'lenta']);
    // La rápida sale 18:05 -contado desde 17:45 son veinte- y llega 18:30.
    expect(options[0].leave_in_minutes).toBe(20);
    expect(options[0].total_minutes).toBe(45);
    expect(salidaDelPrimerOmnibus(options[0])).toBe(25);
    // La lenta no se corre: es la que fija el reloj.
    expect(options[1].leave_in_minutes).toBe(0);
    expect(options[1].total_minutes).toBe(40);
  });

  it('etiqueta la que sale más tarde, y "más rápido" es la más corta de puerta a puerta', () => {
    const { options } = ordenadasParaLlegar([
      { option: opcion('corta', { total: 30, salir: 5, pasa: 10, caminata: 3 }), at: hora('17:50') },
      { option: opcion('tarde', { total: 20, salir: 2, pasa: 6, caminata: 8 }), at: hora('18:05') },
      // Diez minutos de puerta a puerta, pero sale temprano: no es la que
      // sale más tarde, y sí es la más rápida.
      { option: opcion('veloz', { total: 22, salir: 12, pasa: 17, caminata: 4 }), at: hora('17:40') },
      { option: opcion('a-pie', { total: 60, salir: 0, caminata: 60 }), at: hora('17:30') },
    ]);

    expect(options.map((option) => option.id)).toEqual(['tarde', 'corta', 'veloz', 'a-pie']);

    const etiquetas = Object.fromEntries(options.map((option) => [option.id, option.label]));
    expect(etiquetas.tarde).toBe('Salís más tarde');
    expect(etiquetas.veloz).toBe('Más rápido');
    expect(etiquetas.corta).toBe('Menos caminata');
    expect(etiquetas['a-pie']).toBe('A pie');
  });

  it('sin opciones no hay reloj', () => {
    expect(ordenadasParaLlegar([])).toEqual({ desde: null, options: [] });
  });
});

/**
 * Un planificador cuyo `plan` es una línea imaginaria.
 *
 * La 24 pasa por la parada cada `cadaMin` minutos en punto, el viaje dura
 * treinta y hay cinco de caminata hasta la parada. Con eso `planArriveBy` se
 * puede probar entero -las pruebas, el avance al siguiente ómnibus, la
 * mezcla con la opción a pie- sin base, sin GPS y sin horario cargado.
 */
function planificadorDeMentira(cadaMin: number, conAPie = false) {
  const planner = Object.create(TripPlannerService.prototype) as TripPlannerService;
  (planner as unknown as { stopSequences: unknown }).stopSequences = { isReady: () => true };

  const llamadas: Array<Date | undefined> = [];

  planner.plan = jest.fn(async (_o: PlannerPoint, _d: PlannerPoint, departAt?: Date) => {
    llamadas.push(departAt);
    const at = departAt ?? hora('15:00');
    const minutoDelDia = at.getHours() * 60 + at.getMinutes();
    const pasa = (cadaMin - (minutoDelDia % cadaMin)) % cadaMin;

    const options: TripOption[] = [
      opcion('101-24-202', { total: pasa + 30, salir: Math.max(0, pasa - 5), pasa }),
    ];
    if (conAPie) options.push(opcion('a-pie', { total: 90, salir: 0, caminata: 90 }));
    return options;
  });

  return { planner, llamadas };
}

const punto = { lat: 0, lng: 0 };

describe('regla: se devuelve el último ómnibus que llega, no el primero encontrado', () => {
  it('avanza desde la primera prueba que llega hasta el ómnibus más tarde que todavía llega', async () => {
    // Cada diez minutos, viaje de treinta, hay que estar 18:35. El último que
    // llega es el de las 18:00 (llega 18:30). La primera prueba que llega es
    // 17:50 -el de las 17:50, que llega 18:20-; desde ahí se avanza al de
    // las 18:00 y se para en el de las 18:10, que llegaría 18:40.
    const { planner, llamadas } = planificadorDeMentira(10);
    const { desde, options } = await planner.planArriveBy(punto, punto, hora('18:35'), hora('12:00'));

    expect(options).toHaveLength(1);
    expect(desde).not.toBeNull();
    const pasaA = new Date(desde!.getTime() + salidaDelPrimerOmnibus(options[0])! * 60_000);
    expect(hhmm(pasaA)).toBe('18:00');
    expect(hhmm(new Date(desde!.getTime() + options[0].total_minutes * 60_000))).toBe('18:30');
    // Y no se probó ni una hora del pasado ni una en vivo.
    expect(llamadas.every((at) => at !== undefined && at.getTime() >= hora('12:00').getTime())).toBe(
      true,
    );
  });

  it('cuando la primera prueba ya da el último ómnibus, no avanza de más', async () => {
    // Cada veinte, hay que estar 18:30: el de las 18:00 llega justo. Las
    // pruebas 18:25/18:20/18:10 dan el de las 18:20 (llega 18:50); la de las
    // 18:00 da el de las 18:00. Avanzar da el de las 18:20, que no llega.
    const { planner } = planificadorDeMentira(20);
    const { desde, options } = await planner.planArriveBy(punto, punto, hora('18:30'), hora('12:00'));

    expect(options).toHaveLength(1);
    expect(hhmm(new Date(desde!.getTime() + salidaDelPrimerOmnibus(options[0])! * 60_000))).toBe(
      '18:00',
    );
  });

  it('con la llegada cerca, el presente se pregunta en vivo y sobre él no se avanza', async () => {
    // Son las 15:00, hay que estar 15:25, la línea pasa cada veinte: 15:20
    // llega 15:50, no. La prueba en vivo (departAt undefined) da el de las
    // 15:00, que llega 15:30 y tampoco. No hay opción, y `plan` recibió
    // `undefined` para el presente: es la única llamada que puede mirar la
    // calle.
    const { planner, llamadas } = planificadorDeMentira(20);
    const { options } = await planner.planArriveBy(punto, punto, hora('15:25'), hora('15:00'));

    expect(options).toHaveLength(0);
    expect(llamadas[llamadas.length - 1]).toBeUndefined();
    expect(llamadas.filter((at) => at === undefined)).toHaveLength(1);
  });

  it('caminando se sale justo para llegar, y no se ofrece si ya es tarde para eso', async () => {
    const { planner } = planificadorDeMentira(10, true);

    const lejos = await planner.planArriveBy(punto, punto, hora('18:35'), hora('12:00'));
    const aPie = lejos.options.find((option) => option.id === 'a-pie')!;
    expect(aPie).toBeDefined();
    // Noventa minutos de caminata para llegar 18:35: salís 17:05.
    expect(hhmm(new Date(lejos.desde!.getTime() + aPie.leave_in_minutes * 60_000))).toBe('17:05');
    // El ómnibus sale después que la caminata, así que va primero.
    expect(lejos.options[0].id).toBe('101-24-202');

    const cerca = await planner.planArriveBy(punto, punto, hora('18:35'), hora('17:30'));
    expect(cerca.options.find((option) => option.id === 'a-pie')).toBeUndefined();
  });
});
