/**
 * Los nombres de parada, como los publican las empresas y como se muestran.
 *
 * El catálogo sale del feed AVL de CODESA, Maldonado Turismo y Micro, y viene
 * tal cual lo escribió el despacho de cada empresa: todo en mayúsculas y con
 * las abreviaturas del rubro.
 *
 *   TNAL. SAN CARLOS · AG. MALDONADO · CNO LAS FLORES · RBLA. BRAVA
 *
 * Eso está bien para una pantalla de despacho y mal para un teléfono: en
 * mayúsculas se lee más lento, y nadie busca "TNAL" — busca "terminal". Las
 * dos funciones de acá resuelven las dos mitades del problema, y ninguna toca
 * el dato guardado: el nombre de la empresa sigue siendo el nombre de la
 * empresa.
 */

/**
 * Abreviaturas que usan los feeds. Solo entran las que no tienen otra lectura
 * posible: `R` queda afuera porque en el mismo catálogo aparece como Ruta
 * ("R.INTERBALNEARIA") y como inicial de un nombre propio ("R BERGALLI"), y no
 * hay con qué decidir cuál es cuál.
 */
const ABBREVIATIONS: Record<string, string> = {
  TNAL: 'Terminal',
  AG: 'Agencia',
  CNO: 'Camino',
  AV: 'Avenida',
  AVDA: 'Avenida',
  RBLA: 'Rambla',
  EMP: 'Empalme',
  ESC: 'Escuela',
  BAL: 'Balneario',
  PZA: 'Plaza',
  HOSP: 'Hospital',
  PTO: 'Puerto',
  BSAS: 'Buenos Aires',
};

/** Palabras que en medio de un nombre van en minúscula. */
const PARTICLES = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y', 'A']);

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Separa la palabra de la puntuación que la rodea para poder mirarla sola. */
function splitToken(token: string): { core: string; trailing: string } {
  const match = token.match(/^([^.,;:]*)([.,;:]*)$/);
  return match ? { core: match[1], trailing: match[2] } : { core: token, trailing: '' };
}

/**
 * El nombre listo para mostrar: "TNAL. SAN CARLOS" → "Terminal San Carlos".
 *
 * Los códigos de parada que la gente usa hablando se dejan como están —"P16",
 * "KM 107"— porque son la referencia con la que se pide el boleto.
 */
export function formatStopName(raw: string | null | undefined): string {
  if (!raw) return '';

  return raw
    .trim()
    .split(/\s+/)
    .map((token, index) => {
      const { core, trailing } = splitToken(token);
      const upper = core.toUpperCase();

      const expanded = ABBREVIATIONS[upper];
      if (expanded) return expanded;

      // "P16", "KM", "18" y demás referencias numéricas se respetan.
      if (/\d/.test(core)) return core.toUpperCase();

      // Una inicial suelta conserva su punto: "J. ARTIGAS" → "J. Artigas".
      if (core.length === 1) return `${upper}${trailing}`;

      if (index > 0 && PARTICLES.has(upper)) return `${upper.toLowerCase()}${trailing}`;

      return `${upper[0]}${core.slice(1).toLowerCase()}${trailing}`;
    })
    .join(' ');
}

/**
 * La forma con la que se compara al buscar: sin acentos, sin puntuación, en
 * mayúsculas y con las abreviaturas ya expandidas.
 *
 * Expandir de los dos lados es lo que hace que "terminal maldonado" encuentre
 * a "TNAL MALDONADO", que es exactamente el destino que más se busca y el que
 * hasta ahora no daba ningún resultado.
 */
export function normalizeStopName(raw: string | null | undefined): string {
  if (!raw) return '';

  return stripAccents(raw)
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .map((word) => stripAccents(ABBREVIATIONS[word] ?? word).toUpperCase())
    .join(' ');
}

/**
 * ¿Este nombre responde a lo que se escribió?
 *
 * Se piden todas las palabras del término, en cualquier orden y como prefijo:
 * "san car" encuentra "Terminal San Carlos", y "maldonado terminal" también.
 * Buscar la frase entera como subcadena fallaba en cuanto alguien escribía las
 * palabras al revés, que es la mitad de las veces.
 */
export function matchesStopQuery(name: string, query: string): boolean {
  const words = normalizeStopName(query).split(' ').filter(Boolean);
  if (words.length === 0) return false;

  const candidate = normalizeStopName(name);
  const candidateWords = candidate.split(' ');

  return words.every(
    (word) => candidate.includes(word) || candidateWords.some((part) => part.startsWith(word)),
  );
}
