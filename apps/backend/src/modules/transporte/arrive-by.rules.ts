import type { TripOption } from './trip-planner.service';

/**
 * Llegar a las: las reglas puras.
 *
 * El planificador contesta una sola pregunta —"salgo a tal hora, ¿cómo
 * llego?"— y la contesta mirando hacia adelante desde esa hora: para cada
 * línea, el próximo ómnibus. "Tengo que estar en el hospital a las 18:30" es
 * la otra mitad de la pregunta y no se resuelve moviendo el reloj: hay que
 * buscar **hacia atrás**, probando horas de salida hasta encontrar la más
 * tarde que todavía llegue a tiempo.
 *
 * No se reescribe el planificador al revés. Se lo llama varias veces con
 * distintas horas de salida y se eligen, entre todas las respuestas, las
 * salidas más tarde que llegan antes de la hora pedida. Es más caro que una
 * sola búsqueda -unas diez llamadas en vez de una- y es barato igual: para
 * una hora futura el planificador no consulta el GPS, y los caminos a pie se
 * calculan una sola vez y quedan en caché, así que cada llamada de más son
 * cuentas en memoria sobre el horario publicado.
 *
 * Lo que está en este archivo son las decisiones que no salen del código: a
 * qué horas se prueba, qué es "llegar a tiempo", cómo se juntan respuestas
 * contadas desde relojes distintos y en qué orden se muestran. Están
 * separadas del servicio para poder congelarlas en `arrive-by.rules.spec.ts`
 * sin levantar base ni GPS.
 */

/**
 * Cuánto antes de la hora de llegada se prueba cada salida, en minutos.
 *
 * Más denso cerca de la llegada y más ralo lejos, porque la mayoría de los
 * viajes de Maldonado dura entre diez y cuarenta minutos: un salto fijo de
 * quince minutos hubiera probado tres veces antes de acertarle al viaje
 * típico y ninguna al de tres horas. Tres horas es el tope: más lejos, la
 * respuesta ya no es "salí a tal hora" sino "no se puede", y un viaje de
 * ómnibus de más de tres horas dentro del departamento no existe.
 *
 * La búsqueda para en cuanto encuentra salidas que llegan: no se prueban las
 * nueve siempre.
 */
export const ANTES_DE_LLEGAR_MIN = [5, 10, 20, 30, 45, 60, 90, 120, 180];

/**
 * Cuántas opciones distintas alcanzan para dejar de buscar más atrás.
 *
 * Con tres líneas que llegan a tiempo ya hay con qué elegir; seguir probando
 * horas más tempranas sólo agregaría salidas peores de líneas más lentas.
 */
export const OPCIONES_SUFICIENTES = 3;

/**
 * Cuántas veces se avanza buscando un ómnibus más tarde de la misma opción.
 *
 * Las horas de prueba van de a saltos, y la primera respuesta que llega a
 * tiempo puede no ser el último ómnibus que llega: entre esa prueba y la
 * anterior pudo haber pasado otro. Así que desde el ómnibus encontrado se
 * pregunta por el siguiente, y por el siguiente, hasta que uno ya no llegue.
 * Ocho cubre una línea que pase cada cinco minutos en un salto de cuarenta
 * y cinco; en Maldonado ninguna pasa tan seguido.
 */
export const MAX_AVANCES = 8;

/**
 * Un momento en el que se le pregunta al planificador cómo salir.
 *
 * `ahora` marca la prueba sobre el presente, que es la única que puede usar
 * los coches en la calle además del papel: si la hora de llegada está cerca,
 * la respuesta correcta es "salí ya, viene el 1234", no un horario.
 */
export interface Prueba {
  at: Date;
  ahora: boolean;
}

/**
 * A qué horas de salida se prueba, de la más tarde a la más temprana.
 *
 * Todas antes de la llegada y ninguna antes de ahora: una salida que ya pasó
 * no le sirve a nadie. Si una prueba cae en el presente -dentro de la
 * tolerancia- se prueba el presente en vivo y ahí termina: más atrás de ahora
 * no hay nada que probar.
 */
export function momentosDePrueba(arriveBy: Date, now: Date, toleranciaMin = 2): Prueba[] {
  const pruebas: Prueba[] = [];
  const limite = now.getTime() + toleranciaMin * 60_000;

  for (const antes of ANTES_DE_LLEGAR_MIN) {
    const at = new Date(arriveBy.getTime() - antes * 60_000);

    if (at.getTime() <= limite) {
      if (now.getTime() < arriveBy.getTime()) pruebas.push({ at: now, ahora: true });
      break;
    }

    pruebas.push({ at, ahora: false });
  }

  return pruebas;
}

/**
 * Si saliendo en `at` esta opción llega antes de la hora pedida.
 *
 * `total_minutes` son minutos desde `at` hasta estar en el destino, así que
 * la cuenta es directa. Sin margen: el margen lo pone quien elige la hora, y
 * meter cinco minutos escondidos acá haría que "llegar 18:30" descarte el
 * ómnibus que llega 18:28.
 */
export function llegaATiempo(option: TripOption, at: Date, arriveBy: Date): boolean {
  return at.getTime() + option.total_minutes * 60_000 <= arriveBy.getTime();
}

/**
 * En qué minuto, contado desde la salida de la prueba, pasa el primer
 * ómnibus de esta opción. Null para la opción a pie, que no tiene ómnibus.
 */
export function salidaDelPrimerOmnibus(option: TripOption): number | null {
  const espera = option.legs.find((leg) => leg.type === 'wait');
  return espera?.departs_in_minutes ?? null;
}

/**
 * La misma opción, contada desde `deltaMin` minutos antes.
 *
 * Cada llamada al planificador cuenta sus minutos desde su propia hora de
 * salida, y una respuesta a "llegar a las" junta opciones de varias llamadas.
 * Para que la pantalla pueda sumarlos todos al mismo `planned_for`, se corren
 * todos al mismo origen: el más temprano de los que quedaron. Se corre lo que
 * es un instante -cuándo salir, cuándo pasa el ómnibus, cuándo se llega- y no
 * lo que es una duración: caminar cuatro minutos sigue siendo caminar cuatro.
 */
export function corrida(option: TripOption, deltaMin: number): TripOption {
  if (deltaMin === 0) return option;

  return {
    ...option,
    total_minutes: option.total_minutes + deltaMin,
    leave_in_minutes: option.leave_in_minutes + deltaMin,
    legs: option.legs.map((leg) =>
      leg.departs_in_minutes === undefined
        ? leg
        : { ...leg, departs_in_minutes: leg.departs_in_minutes + deltaMin },
    ),
  };
}

/** Una opción con la hora de salida desde la que están contados sus minutos. */
export interface OpcionConSalida {
  option: TripOption;
  at: Date;
}

/**
 * Las opciones elegidas, contadas desde un mismo reloj y ordenadas para la
 * pregunta que se hizo.
 *
 * Devuelve desde qué momento cuentan los minutos -que pasa a ser el
 * `planned_for` de la respuesta- y las opciones ya corridas y etiquetadas.
 *
 * **El orden es por hora de salida, la más tarde primero.** Quien pregunta
 * "¿a qué hora tengo que salir para llegar a las seis?" quiere la salida más
 * tarde que llega; "más rápido" es la segunda pregunta y va en la etiqueta.
 * Y a diferencia del planificador de ida, acá "más rápido" es el viaje más
 * corto de puerta a puerta y no el que llega antes: llegan todos antes de la
 * misma hora, y llegar más antes no es una virtud.
 */
export function ordenadasParaLlegar(elegidas: OpcionConSalida[]): {
  desde: Date | null;
  options: TripOption[];
} {
  if (elegidas.length === 0) return { desde: null, options: [] };

  const desde = new Date(Math.min(...elegidas.map(({ at }) => at.getTime())));

  const options = elegidas
    .map(({ option, at }) =>
      corrida(option, Math.round((at.getTime() - desde.getTime()) / 60_000)),
    )
    .sort((a, b) => b.leave_in_minutes - a.leave_in_minutes)
    .map((option) => ({ ...option, label: undefined }));

  options[0].label = 'Salís más tarde';

  const onFoot = options.find((option) => option.id === 'a-pie');
  if (onFoot && !onFoot.label) onFoot.label = 'A pie';

  const duracion = (option: TripOption) => option.total_minutes - option.leave_in_minutes;
  const masRapida = options.reduce((best, option) =>
    duracion(option) < duracion(best) ? option : best,
  );
  if (!masRapida.label) masRapida.label = 'Más rápido';

  const menosCaminata = options.reduce((best, option) =>
    option.walk_minutes < best.walk_minutes ? option : best,
  );
  if (!menosCaminata.label) menosCaminata.label = 'Menos caminata';

  return { desde, options };
}
