import { alinearEnElTiempo, currentSeason } from './schedules.service';

/**
 * La regla que decide cuándo el horario contesta y cuándo se calla.
 *
 * Sale de un caso concreto: el planificador anunciaba "última vuelta 03:53"
 * para la línea 52, cuyo horario publicado cierra a las 23:00. Nadie se
 * quedaría esperando a esa hora, pero la app lo decía con la misma seguridad
 * con la que dice todo lo demás, y eso es lo que hay que sacar.
 *
 * La causa: los puntos de control se ubican proyectándolos sobre el trazo del
 * recorrido, y cuando uno cae mal, el orden por trazo deja de coincidir con el
 * orden del reloj. El código de antes leía cualquier paso hacia atrás como un
 * cruce de medianoche y le sumaba un día. Un día repartido después entre todas
 * las paradas del recorrido son ómnibus de madrugada que no existen.
 */

/** Minutos desde medianoche, para escribir las pruebas en horas. */
function hm(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function puntos(...pares: Array<[number, string]>) {
  return pares.map(([along, hora]) => ({ along, min: hm(hora) }));
}

describe('alinearEnElTiempo', () => {
  it('un servicio normal queda como está', () => {
    const p = puntos([0, '06:10'], [3000, '06:25'], [8000, '06:50']);
    expect(alinearEnElTiempo(p)).toBe(true);
    expect(p.map((x) => x.min)).toEqual([370, 385, 410]);
  });

  it('el que cruza la medianoche suma un día y sigue sirviendo', () => {
    // La 17/19: sale 23:20 de la Agencia y llega 00:20 a Punta.
    const p = puntos([0, '23:20'], [5000, '23:50'], [12000, '00:20']);
    expect(alinearEnElTiempo(p)).toBe(true);
    expect(p.map((x) => x.min)).toEqual([1400, 1430, 1440 + 20]);
  });

  it('un punto mal ubicado no es una medianoche: se calla', () => {
    // Esto es la 52. Entre las 22 y las 7 no pasa una medianoche, pasa que el
    // punto de control quedó proyectado donde no va.
    const p = puntos([0, '22:00'], [4000, '07:00'], [9000, '22:40']);
    expect(alinearEnElTiempo(p)).toBe(false);
  });

  it('tampoco es medianoche un salto hacia atrás en pleno día', () => {
    const p = puntos([0, '14:00'], [3000, '11:30']);
    expect(alinearEnElTiempo(p)).toBe(false);
  });

  it('la madrugada de verdad se acepta hasta las seis', () => {
    const p = puntos([0, '23:40'], [7000, '00:35']);
    expect(alinearEnElTiempo(p)).toBe(true);
    expect(p[1].min).toBe(1440 + 35);
  });

  it('un servicio que duraría media jornada no es un servicio', () => {
    // Cada paso cierra por separado y el total igual es un disparate: son
    // nueve horas de ómnibus. El más largo que publican, la 100 a Pan de
    // Azúcar, no llega a dos y media.
    const p = puntos([0, '06:00'], [20000, '15:30']);
    expect(alinearEnElTiempo(p)).toBe(false);
  });

  it('dos puntos son el mínimo para interpolar algo', () => {
    expect(alinearEnElTiempo(puntos([0, '06:00']))).toBe(false);
    expect(alinearEnElTiempo([])).toBe(false);
  });

  it('dos medianoches seguidas no existen', () => {
    // Sumar un día una vez por paso es el tope: si con eso todavía va para
    // atrás, el desorden no era horario.
    const p = [
      { along: 0, min: hm('23:30') },
      { along: 4000, min: hm('00:10') },
      { along: 8000, min: hm('00:05') },
    ];
    expect(alinearEnElTiempo(p)).toBe(false);
  });
});

describe('currentSeason', () => {
  it('el verano de las empresas es diciembre a febrero', () => {
    expect(currentSeason(new Date('2026-12-15T12:00:00'))).toBe('verano');
    expect(currentSeason(new Date('2027-01-20T12:00:00'))).toBe('verano');
    expect(currentSeason(new Date('2027-02-28T12:00:00'))).toBe('verano');
  });

  it('y todo lo demás es invierno, incluida la primavera', () => {
    expect(currentSeason(new Date('2026-09-04T12:00:00'))).toBe('invierno');
    expect(currentSeason(new Date('2026-11-30T12:00:00'))).toBe('invierno');
    expect(currentSeason(new Date('2027-03-01T12:00:00'))).toBe('invierno');
  });
});
