/**
 * Los puntos de control de los horarios, ubicados en el mapa.
 *
 * Las empresas publican los horarios por punto de control -"Terminal Mldo.",
 * "Punta Shopping", "Hospital"-, no parada por parada. Para poder usar esas
 * horas, cada punto tiene que tener una ubicación: con ella se lo proyecta
 * sobre el recorrido de la línea y se sabe a qué altura del trazo cae, que es
 * lo que permite interpolar la hora de las paradas intermedias.
 *
 * Esta tabla se hace y se revisa a mano contra el catálogo de paradas. Es
 * chica -unas dos docenas de nombres- y es el único lugar donde un error de
 * traducción se propaga a todos los horarios de una línea, así que acá **no se
 * adivina**: un punto sin ubicación confiable se deja sin mapear y su horario
 * simplemente no se usa hasta que alguien lo complete. Es la misma regla que
 * rige las paradas de subida: mejor no ofrecer una hora que ofrecer una hora
 * de un lugar equivocado.
 *
 * Cada empresa escribe los nombres a su manera ("Terminal Mldo." / "TERM.
 * MLDO." / "Tnal."), así que un punto acepta varios alias. El emparejamiento
 * normaliza mayúsculas, tildes y puntuación antes de comparar.
 */

export interface Timepoint {
  /** Nombre legible del lugar, para logs y para la ficha de la línea. */
  place: string;
  lat: number;
  lng: number;
  /** Cómo lo escribe cada empresa. Normalizados al comparar. */
  aliases: string[];
}

/**
 * Los puntos con ubicación **verificada**.
 *
 * Verificada quiere decir dos cosas concretas, y las dos se pueden repetir:
 *
 * 1. **La coordenada sale de los datos de la app**, no de la memoria de
 *    nadie: del catálogo de paradas —que son posiciones medidas, ver
 *    `StopPlacementService`— o de un nodo de OpenStreetMap ya importado. Se
 *    prefiere la parada cuando existe: es la que está donde para el ómnibus.
 * 2. **Cae sobre el recorrido de las líneas que lo nombran.** Un punto se usa
 *    proyectándolo sobre el trazo y la proyección se descarta a más de 250 m
 *    (`MAX_TIMEPOINT_OFFSET_M`), así que el recorrido es un juez y no una
 *    opinión: entre dos lugares con el mismo nombre, gana el que la línea
 *    efectivamente pasa. Los metros anotados en cada punto son ese offset
 *    medido contra los recorridos reconstruidos.
 *
 * Ese segundo criterio decidió los casos que a ojo se erraban: la 18 no pasa
 * por el pueblo Las Flores —queda a 2,2 km del trazo— sino por Estación Las
 * Flores; "Cantegril" es el sanatorio y no el Country Club, que cae a 280 m y
 * queda afuera; y la parada PAN DE AZUCAR del catálogo, que está en San
 * Carlos, no tiene nada que ver con el pueblo de Pan de Azúcar, a 12,7 km.
 *
 * Lo que sigue sin ubicarse está en PENDIENTES abajo, y se saca corriendo
 * `src/scripts/check-schedule-timepoints.ts`, que lista los nombres que
 * aparecen en los horarios cargados y cuántos servicios deja mudo cada uno.
 * Un servicio cuyo tramo dependa de un punto no mapeado no se usa: la app cae
 * a la frecuencia en vivo, que es preferible a una hora inventada.
 */
export const TIMEPOINTS: Timepoint[] = [
  {
    place: 'Terminal Maldonado',
    lat: -34.91697,
    lng: -54.95815,
    // 'ter mldo' es como la escribe la 11 y por sí solo no emparejaba con
    // ninguno de los otros: eran 30 servicios que quedaban sin la terminal.
    aliases: [
      'terminal mldo',
      'terminal maldonado',
      'tnal mldo',
      'tnal maldonado',
      'term mldo',
      'term maldo',
      'ter mldo',
    ],
  },
  {
    place: 'Terminal Punta del Este',
    lat: -34.95544,
    lng: -54.93859,
    // 'tnal punta del este' va explícito: sin él caía por inclusión en "Punta
    // del Este", que es otro punto a un kilómetro. Son 16 servicios.
    aliases: [
      'terminal p del este',
      'tnal p del este',
      'term p del este',
      'terminal punta del este',
      'tnal punta del este',
    ],
  },
  {
    place: 'Terminal San Carlos',
    lat: -34.79291,
    lng: -54.92218,
    aliases: ['terminal san carlos', 'tnal san carlos', 'term san carlos'],
  },
  {
    place: 'Punta del Este',
    lat: -34.96203,
    lng: -54.94477,
    aliases: ['punta del este', 'p del este', 'p.del este', 'punta'],
  },
  {
    place: 'Punta Shopping',
    lat: -34.94062,
    lng: -54.93351,
    aliases: ['punta shopping', 'shopping', 'p shopping'],
  },
  {
    place: 'Hospital de Maldonado',
    lat: -34.90559,
    lng: -54.96698,
    aliases: ['hospital', 'hospital de maldonado', 'hospital mldo'],
  },
  {
    place: 'Centro de Maldonado',
    lat: -34.9011,
    lng: -54.9497,
    aliases: ['centro mldo', 'centro maldonado', 'centro'],
  },
  {
    place: 'Agencia San Carlos',
    lat: -34.79237,
    lng: -54.91012,
    aliases: ['ag san carlos', 'agencia san carlos', 'agencia s carlos', 'ag s carlos', 'san carlos'],
  },
  {
    place: 'La Barra',
    lat: -34.90874,
    lng: -54.8721,
    aliases: ['la barra', 'barra'],
  },
  {
    place: 'Manantiales',
    lat: -34.9062,
    lng: -54.82321,
    // "Manantial es" es un error de tipeo del PDF de la 5, y son 5 servicios.
    aliases: ['manantiales', 'manantial es'],
  },
  {
    place: 'La Fortuna',
    lat: -34.88646,
    lng: -54.98631,
    aliases: ['la fortuna', 'fortuna', 'los guayabos'],
  },
  {
    place: 'La Capuera',
    lat: -34.86445,
    lng: -55.13751,
    aliases: ['la capuera', 'capuera'],
  },
  {
    place: 'Puerto de Piriápolis',
    lat: -34.877,
    lng: -55.2796,
    aliases: ['piriapolis', 'piriápolis', 'pto piriapolis'],
  },

  // ---------------------------------------------------------------------
  // Ubicados el 2026-09-09 contra el catálogo y los recorridos. El offset
  // anotado es la distancia al trazo de las líneas que nombran el punto: es
  // lo que decide si la proyección se acepta (tope 250 m).
  // ---------------------------------------------------------------------

  {
    // El punto de control más usado de todos: 434 servicios de doce líneas de
    // CODESA arrancan o pasan por acá, y sin él esas líneas no tenían hora en
    // ninguna parada anterior al primer punto que sí estuviera ubicado.
    // Parada medida del catálogo, a 4-37 m del trazo en los 25 recorridos.
    place: 'Agencia Maldonado',
    lat: -34.89425,
    lng: -54.95102,
    aliases: ['ag mldo', 'ag maldonado', 'agencia maldonado', 'agencia mldo', 'agencia maldo'],
  },
  {
    // Cabecera en San Carlos, distinta de la Agencia: 89 servicios llevan las
    // dos como columnas separadas, así que hacerlas caer en el mismo lugar
    // rompía el orden del recorrido. Barrio de OSM, a 159 m del trazo en 14
    // de 17 recorridos.
    place: 'Vialidad',
    lat: -34.774,
    lng: -54.91801,
    aliases: ['vialidad', 'san carlos vialidad'],
  },
  {
    // Punto intermedio San Carlos - Maldonado. Barrio de OSM, a 21 m del
    // trazo en los recorridos que pasan por ahí; los otros lo descartan
    // solos, que es lo correcto porque no todos los itinerarios entran.
    place: 'Lavagna',
    lat: -34.79122,
    lng: -54.93144,
    aliases: ['lavagna'],
  },
  {
    // El sanatorio, no el Country Club: el club cae a 280 m del trazo de la
    // 19 y queda afuera de tolerancia; el sanatorio, a 61 m.
    place: 'Sanatorio Cantegril',
    lat: -34.92998,
    lng: -54.94338,
    aliases: ['cantegril', 'sanatorio cantegril'],
  },
  {
    // Parada medida, a 14-31 m del trazo de la 100.
    place: 'Solanas',
    lat: -34.88104,
    lng: -55.04813,
    aliases: ['solanas'],
  },
  {
    // **Estación** Las Flores y no el pueblo Las Flores: el pueblo queda a
    // 2,2 km del trazo de la 18 y la estación a 116 m. Es exactamente el
    // error que se comete eligiendo por nombre.
    place: 'Estación Las Flores',
    lat: -34.78931,
    lng: -55.32766,
    aliases: ['las flores', 'estacion las flores'],
  },
  {
    // El pueblo, a 150 m del trazo de la 18 y la 20. Ojo con la parada
    // PAN DE AZUCAR del catálogo, que está en San Carlos: cae a 12,7 km.
    place: 'Pan de Azúcar',
    lat: -34.77556,
    lng: -55.22403,
    aliases: ['pan de azucar'],
  },
  {
    // Parada medida, a 0-68 m del trazo de la 14 y la 15.
    place: 'Maldonado Nuevo',
    lat: -34.89499,
    lng: -54.94465,
    aliases: ['mldo nuevo', 'maldonado nuevo'],
  },
  {
    // El barrio, a 104-145 m de los trazos de la 3, la D y la L48.
    place: 'Hipódromo',
    lat: -34.86152,
    lng: -54.94483,
    aliases: ['hipodromo', 'bº hipodromo', 'b hipodromo'],
  },
  {
    // A 113-161 m de los trazos de la 5, la 15 y la 55.
    place: 'El Chorro',
    lat: -34.90041,
    lng: -54.81274,
    aliases: ['el chorro'],
  },
  {
    // El paraje, a 13-15 m de los trazos de la 14, la 35 y la 42.
    place: 'José Ignacio',
    lat: -34.84482,
    lng: -54.63769,
    aliases: ['jose ignacio'],
  },
  {
    // A 134-142 m del trazo de la 52.
    place: 'Sodimac',
    lat: -34.88083,
    lng: -54.95211,
    aliases: ['sodimac'],
  },
  {
    // Parada medida, a 0 m del trazo de la 52.
    place: 'Mario Benedetti',
    lat: -34.86458,
    lng: -54.96722,
    aliases: ['benedetti'],
  },
  {
    // "Pda. 19" de la 52 es la parada 19 de la Rambla Williman, la única con
    // ese número en el catálogo: a 24 m del trazo.
    place: 'Parada 19 (Rambla Williman)',
    lat: -34.92657,
    lng: -54.96322,
    aliases: ['pda 19'],
  },
  {
    // Parada medida, a 0-21 m de los trazos de la 17 y la 17/19.
    place: 'Batlle y Ordóñez',
    lat: -34.89907,
    lng: -54.95377,
    aliases: ['b ordonez', 'batlle y ordonez'],
  },
  {
    // Parada medida, a 0-118 m de los trazos de la 17 y la 11.
    place: 'W. F. Aldunate',
    lat: -34.89548,
    lng: -54.95986,
    aliases: ['f aldunate', 'w f aldunate'],
  },
  {
    // Hay dos paradas SAN FRANCISCO en el catálogo. La de la 11 es la del
    // norte, a 0 m del trazo; la otra cae a 2,9 km.
    place: 'San Francisco',
    lat: -34.89658,
    lng: -54.96993,
    aliases: ['san francisco'],
  },
  {
    // Parada medida, a 0 m del trazo de la 11.
    place: 'Los Caracoles',
    lat: -34.90633,
    lng: -54.92674,
    aliases: ['los caracoles', 'bº los caracoles'],
  },
  {
    // Parada medida, a 0 m del trazo de la 11.
    place: 'Distrito 52',
    lat: -34.91511,
    lng: -54.92383,
    aliases: ['distrito 52'],
  },
  {
    // El cruce de Portezuelo, a 23-41 m de los trazos de la 8 y la 61. Sauce
    // de Portezuelo y Barra de Portezuelo, que se llaman parecido, caen a 731
    // m y 1,6 km.
    place: 'Portezuelo',
    lat: -34.87771,
    lng: -55.0573,
    aliases: ['portezuelo'],
  },
  {
    // Hay dos paradas CEMENTERIO. La de la 51 es la de Maldonado, a 139 m del
    // trazo; la de San Carlos cae a 10 km.
    place: 'Cementerio',
    lat: -34.89419,
    lng: -54.97372,
    aliases: ['cementerio'],
  },
  {
    // El balneario, a 17-19 m de los trazos de la 16 y la 42. **No** cubre
    // "Bal. Bs. As. (Calle 26)" ni "(Calle 34)", que son esquinas distintas
    // adentro del balneario y siguen pendientes: mapear las tres al mismo
    // punto las volvería indistinguibles y rompería el orden del servicio.
    place: 'Balneario Buenos Aires',
    lat: -34.88753,
    lng: -54.79372,
    aliases: ['balneario', 'balneario bs as'],
  },
];

/**
 * Nombres que **no se resuelven a propósito**, por ambiguos.
 *
 * "Agencia" a secas lo usan 178 servicios de Maldonado Turismo (16, 17, 19,
 * 17/19) y es la agencia **de esa empresa**, que no está en nuestros datos: no
 * hay parada ni nodo de OSM que la ubique. Sin esta lista terminaba
 * resolviendo por inclusión contra "Agencia San Carlos" —la única agencia
 * mapeada—, que está a 11 km del recorrido de esas líneas.
 *
 * Hoy esa distancia lo salva: la proyección lo descarta por lejos y no llega a
 * ensuciar ninguna hora. Pero eso es suerte y no diseño: el día que se mapee
 * cualquier otra agencia más cerca, "Agencia" empezaría a caer ahí y a
 * inventar horas sin que nadie lo note. Se saca de acá cuando aparezca la
 * ubicación de la agencia de Maldonado Turismo, o cuando el emparejamiento
 * sepa distinguir por empresa.
 */
const AMBIGUOS = new Set(['agencia']);

/**
 * Los que faltan ubicar, con los servicios que cada uno deja mudos.
 *
 * No están en TIMEPOINTS a propósito: preferimos no traducirlos antes que
 * traducirlos mal. Cada uno necesita una coordenada verificada contra el
 * catálogo o contra el recorrido de la línea que lo usa.
 *
 * **Esta lista no se escribe a mano**: sale de correr
 * `src/scripts/check-schedule-timepoints.ts` contra los horarios cargados. La
 * anterior se había escrito a ojo y estaba mal de las dos maneras posibles —
 * nombraba puntos que ningún horario cargado usa ("Sanatorio Mautone", "Las
 * Delicias", "Rbla. Williman") y se perdía cuarenta que sí, entre ellos el más
 * usado de todos—. Al reimportar horarios se vuelve a correr.
 *
 * Por qué sigue pendiente cada uno:
 *
 * - **Sin candidato en los datos.** "Salazar(P2)", "Francia(P2)", "Urb.
 *   Norte", "Bº 14 de Febrero", "Dos Puentes": no hay parada ni lugar de OSM
 *   con ese nombre. Necesitan que alguien los señale.
 * - **Es una esquina, no un lugar.** "Bal. Bs. As. (Calle 26)" y "(Calle 34)",
 *   "Calle 38 y Ruta 10", "Empalme R104 y Medellín", "San Rafael (Cipriani)".
 *   Se resuelven con la intersección de las dos calles; el nombre suelto no
 *   alcanza y mapearlas todas al mismo balneario las volvería indistinguibles.
 * - **El candidato queda fuera del trazo.** "Universidad" (la Católica está a
 *   2,4 km del recorrido de la 16), "El Jagüel" (456 m), "Aeropuerto" (el de
 *   Laguna del Sauce, a 392 m): el nombre coincide pero el lugar no es por
 *   donde pasa el ómnibus.
 * - **La línea no tiene recorrido reconstruido.** "Lausana" (L49, L50) y
 *   "Liceo 5" (L48): aunque se ubicaran, sin trazo no hay dónde proyectarlos.
 *   Se arregla solo cuando esas líneas acumulen avistamientos.
 * - **Ambiguo por diseño.** "Agencia": ver AMBIGUOS arriba.
 */
export const PENDIENTES = [
  'Agencia',
  'Salazar(P2)',
  'Bal. Bs. As. (Calle 26)',
  'Bal. Bs. As. (Calle 34)',
  'Lausana',
  'Universidad',
  'Urb. Norte',
  'San Rafael (Cipriani)',
  'Calle 38 y Ruta 10',
  'El Jagüel',
  'UTU',
  'Aeropuerto',
  'Bº 14 de Febrero',
  'Dos Puentes',
  'Empalme R104 y Medellín',
  'Laguna Garzon',
  'Liceo 5',
  'Francia(P2)',
];

/** Saca tildes, mayúsculas y puntuación para comparar nombres escritos distinto. */
export function normalizeTimepoint(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PORNOMBRE = new Map<string, Timepoint>();
for (const punto of TIMEPOINTS) {
  for (const alias of punto.aliases) {
    PORNOMBRE.set(normalizeTimepoint(alias), punto);
  }
}

/**
 * Ubica un punto de control por su nombre, o null si no está mapeado.
 *
 * Primero por alias exacto -es lo normal-, y si no, por inclusión: "term
 * maldo x cantegril" contiene "term maldo". La inclusión es el último recurso
 * y sólo cuenta si el alias tiene algo de largo, para no emparejar "centro"
 * con cualquier cosa.
 *
 * Y antes que todo eso, los nombres declarados ambiguos no se resuelven: la
 * inclusión es justamente la que los hace caer en el punto equivocado. Ver
 * AMBIGUOS.
 */
export function resolveTimepoint(name: string): Timepoint | null {
  const key = normalizeTimepoint(name);
  if (!key || AMBIGUOS.has(key)) return null;

  const exacto = PORNOMBRE.get(key);
  if (exacto) return exacto;

  for (const [alias, punto] of PORNOMBRE) {
    if (alias.length >= 5 && (key.includes(alias) || alias.includes(key))) {
      return punto;
    }
  }

  return null;
}
