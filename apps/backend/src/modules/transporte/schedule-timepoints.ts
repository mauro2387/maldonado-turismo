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
 * Los puntos con ubicación **verificada** contra el catálogo de paradas.
 *
 * Faltan varios que los PDF nombran y que todavía no se pudieron ubicar con
 * confianza (Agencia Maldonado, Vialidad, Sanatorio Cantegril, Pan de Azúcar
 * pueblo, Las Delicias...). Están listados en PENDIENTES abajo: se completan
 * cuando la extracción termine y se sepa el conjunto exacto de nombres que hay
 * que cubrir. Hasta entonces, un servicio cuyo tramo dependa de un punto no
 * mapeado no se usa, y la app cae a la frecuencia en vivo como hasta ahora.
 */
export const TIMEPOINTS: Timepoint[] = [
  {
    place: 'Terminal Maldonado',
    lat: -34.91697,
    lng: -54.95815,
    aliases: ['terminal mldo', 'terminal maldonado', 'tnal mldo', 'tnal maldonado', 'term mldo', 'term maldo'],
  },
  {
    place: 'Terminal Punta del Este',
    lat: -34.95544,
    lng: -54.93859,
    aliases: ['terminal p del este', 'tnal p del este', 'term p del este', 'terminal punta del este', 'term p del este'],
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
    aliases: ['manantiales', 'manantiales'],
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
];

/**
 * Los que faltan ubicar. No están en TIMEPOINTS a propósito: preferimos no
 * traducirlos antes que traducirlos mal. Cada uno necesita una coordenada
 * verificada contra el catálogo (o contra el recorrido de la línea que lo usa).
 *
 * - "Ag. Mldo." / "Agencia Maldonado" — la agencia de CODESA (no la Terminal).
 * - "Vialidad" — cabecera en San Carlos, antes de la Agencia.
 * - "Lavagna" — punto intermedio San Carlos ⇄ Maldonado.
 * - "Sanatorio Cantegril" / "Cantegril" — sobre Av. Roosevelt.
 * - "Sanatorio Mautone" / "Mautone" — la 1, 7, 9 pasan por ahí.
 * - "Las Delicias", "Rbla. Williman" — tramo de la Mansa.
 * - "Pan de Azúcar" (pueblo), "Solanas", "Dos Puentes", "Las Flores" — líneas
 *   de Micro; ojo que hay una parada llamada "PAN DE AZUCAR" en San Carlos que
 *   NO es el pueblo.
 */
export const PENDIENTES = [
  'Ag. Mldo.',
  'Vialidad',
  'Lavagna',
  'Sanatorio Cantegril',
  'Sanatorio Mautone',
  'Las Delicias',
  'Rbla. Williman',
  'Pan de Azúcar (pueblo)',
  'Solanas',
  'Dos Puentes',
  'Las Flores',
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
 */
export function resolveTimepoint(name: string): Timepoint | null {
  const key = normalizeTimepoint(name);
  if (!key) return null;

  const exacto = PORNOMBRE.get(key);
  if (exacto) return exacto;

  for (const [alias, punto] of PORNOMBRE) {
    if (alias.length >= 5 && (key.includes(alias) || alias.includes(key))) {
      return punto;
    }
  }

  return null;
}
