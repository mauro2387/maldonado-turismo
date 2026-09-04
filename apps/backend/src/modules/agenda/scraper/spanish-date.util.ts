/**
 * Extracción de fechas de eventos a partir del texto en español de las
 * agendas locales.
 *
 * Ninguna de las fuentes publica la fecha del evento en un campo aparte: la
 * escriben dentro de la nota ("tendrá lugar el sábado 26 y domingo 27 de
 * setiembre", "este viernes 28 de agosto a las 19:00 horas"). Lo que hay acá
 * es el parser de esas frases.
 *
 * Dos particularidades del uruguayo escrito que conviene tener presentes:
 *
 * - Septiembre se escribe casi siempre "setiembre", y ambas formas conviven
 *   incluso dentro de la misma nota.
 * - El año se omite prácticamente siempre. Se infiere a partir de la fecha de
 *   publicación de la nota: se elige el año que deja el evento dentro de la
 *   ventana [publicación - 1 mes, publicación + 11 meses].
 */

/** Uruguay no aplica horario de verano desde 2015, el offset es fijo. */
export const UY_UTC_OFFSET_MIN = -180;

const MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

const MONTH_ALTERNATION = Object.keys(MONTHS).join('|');

export interface ParsedEventDate {
  /** Inicio del evento en UTC. */
  start: Date;
  /** Fin, sólo cuando el texto declara un rango de días. */
  end: Date | null;
  /** Hora tal como la escribió la fuente ("20:00", "20:00 a 22:00"). */
  timeLabel: string | null;
  /** true si el texto traía hora; si no, el inicio queda a las 00:00 local. */
  hasTime: boolean;
  /** 0..1. Baja cuando hubo que inferir demasiado. */
  confidence: number;
  /** Fragmento del que salió la fecha, para poder auditar el parseo. */
  matchedText: string;
}

/**
 * Quita tildes y normaliza espacios y variantes de ordinal ("1.º", "1ro").
 * Trabajar sin tildes evita duplicar cada regex por "miércoles"/"miercoles".
 */
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // "1.º", "1º", "1ro", "1er" -> "1". El ordinal sólo aparece pegado al
    // número, por eso no se admite espacio antes de "ro"/"er"/"o".
    .replace(/(\d{1,2})\s?\.?\s?[º°]/g, '$1')
    .replace(/(\d{1,2})(?:ro|er|mo|o)\b/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Construye un Date UTC a partir de una fecha y hora locales de Uruguay. */
export function uruguayDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - UY_UTC_OFFSET_MIN / 60, minute));
}

/** Valida que día/mes existan de verdad (descarta "31 de febrero"). */
function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

const ONE_MONTH_MS = 31 * 24 * 60 * 60 * 1000;
const ELEVEN_MONTHS_MS = 334 * 24 * 60 * 60 * 1000;

/**
 * Elige el año de un día/mes sin año explícito.
 *
 * Se prueban el año de la publicación y los adyacentes, y gana el que cae
 * dentro de la ventana razonable. Que la ventana empiece un mes antes de la
 * publicación es a propósito: muchas notas se publican unos días después de
 * arrancado un ciclo que sigue en cartel.
 */
export function inferYear(month: number, day: number, publishedAt: Date): number {
  const base = publishedAt.getUTCFullYear();

  for (const year of [base, base + 1, base - 1]) {
    if (!isRealDate(year, month, day)) continue;
    const delta = uruguayDate(year, month, day).getTime() - publishedAt.getTime();
    if (delta >= -ONE_MONTH_MS && delta <= ELEVEN_MONTHS_MS) return year;
  }

  return base;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Busca la hora del evento. Contempla las formas que efectivamente usan las
 * fuentes: "a las 20:00 horas", "20.30 horas", "hora 19", "de 14 a 16",
 * "desde las 12.00", "entre las 17:00 hs. y las 18:30 horas".
 */
export function parseTime(
  text: string,
): { label: string; hour: number; minute: number } | null {
  const normalized = normalizeText(text);

  // Rango explícito primero: si existe, el inicio es el primer extremo.
  const range = normalized.match(
    /(?:de|entre|desde)\s+(?:las\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(?:hs?\.?|horas?)?\s*(?:a|y|hasta)\s+(?:las\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(?:hs?\.?|horas?)/,
  );
  if (range) {
    const hour = Number(range[1]);
    const minute = Number(range[2] ?? 0);
    const endHour = Number(range[3]);
    const endMinute = Number(range[4] ?? 0);
    if (hour <= 23 && minute <= 59 && endHour <= 23 && endMinute <= 59) {
      return {
        label: `${pad(hour)}:${pad(minute)} a ${pad(endHour)}:${pad(endMinute)}`,
        hour,
        minute,
      };
    }
  }

  const single = normalized.match(
    /(?:a\s+las|desde\s+las|hora:?|a\s+la\s+hora)\s+(\d{1,2})(?:[:.](\d{2}))?\s*(?:hs?\.?|horas?)?|(\d{1,2})[:.](\d{2})\s*(?:hs?\b|horas?)/,
  );
  if (!single) return null;

  const hour = Number(single[1] ?? single[3]);
  const minute = Number(single[2] ?? single[4] ?? 0);
  if (!Number.isFinite(hour) || hour > 23 || minute > 59) return null;

  return { label: `${pad(hour)}:${pad(minute)}`, hour, minute };
}

interface Candidate {
  month: number;
  day: number;
  endMonth: number | null;
  endDay: number | null;
  year: number | null;
  confidence: number;
  matchedText: string;
  index: number;
}

type CandidateParts = Pick<Candidate, 'month' | 'day' | 'endMonth' | 'endDay' | 'year'>;

/**
 * Patrones de fecha ordenados de más específico a más genérico. El primero que
 * matchea en un tramo del texto se lo queda, así "del 22 al 24 de setiembre"
 * no se degrada a "24 de setiembre".
 */
const DATE_PATTERNS: {
  regex: RegExp;
  confidence: number;
  build: (m: RegExpExecArray) => CandidateParts;
}[] = [
  // "del 29 de junio al 5 de julio [de 2026]"
  {
    regex: new RegExp(
      `\\bdel\\s+(\\d{1,2})\\s+de\\s+(${MONTH_ALTERNATION})\\s+(?:al|hasta\\s+el)\\s+(\\d{1,2})\\s+de\\s+(${MONTH_ALTERNATION})(?:\\s+de\\s+(\\d{4}))?`,
      'g',
    ),
    confidence: 0.95,
    build: (m) => ({
      day: Number(m[1]),
      month: MONTHS[m[2]],
      endDay: Number(m[3]),
      endMonth: MONTHS[m[4]],
      year: m[5] ? Number(m[5]) : null,
    }),
  },
  // "del 22 al 24 de setiembre [de 2026]"
  {
    regex: new RegExp(
      `\\b(?:del|entre\\s+el)\\s+(\\d{1,2})\\s+(?:al|y\\s+el|hasta\\s+el)\\s+(\\d{1,2})\\s+de\\s+(${MONTH_ALTERNATION})(?:\\s+de\\s+(\\d{4}))?`,
      'g',
    ),
    confidence: 0.95,
    build: (m) => ({
      day: Number(m[1]),
      month: MONTHS[m[3]],
      endDay: Number(m[2]),
      endMonth: MONTHS[m[3]],
      year: m[4] ? Number(m[4]) : null,
    }),
  },
  // "sábado 26 y domingo 27 de setiembre", "26 y el 27 de setiembre"
  {
    regex: new RegExp(
      `\\b(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)?\\s*(\\d{1,2})\\s+y\\s+(?:el\\s+)?(?:proximo\\s+)?(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)?\\s*(\\d{1,2})\\s+de\\s+(${MONTH_ALTERNATION})(?:\\s+de\\s+(\\d{4}))?`,
      'g',
    ),
    confidence: 0.9,
    build: (m) => ({
      day: Number(m[1]),
      month: MONTHS[m[3]],
      endDay: Number(m[2]),
      endMonth: MONTHS[m[3]],
      year: m[4] ? Number(m[4]) : null,
    }),
  },
  // "sábado 26 de setiembre de 2026", "este viernes 28 de agosto", "12 de setiembre"
  {
    regex: new RegExp(`\\b(\\d{1,2})\\s+de\\s+(${MONTH_ALTERNATION})(?:\\s+de\\s+(\\d{4}))?`, 'g'),
    confidence: 0.85,
    build: (m) => ({
      day: Number(m[1]),
      month: MONTHS[m[2]],
      endDay: null,
      endMonth: null,
      year: m[3] ? Number(m[3]) : null,
    }),
  },
  // "12/09/2026" o "12-09-2026"
  {
    regex: /\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/g,
    confidence: 0.9,
    build: (m) => ({
      day: Number(m[1]),
      month: Number(m[2]),
      endDay: null,
      endMonth: null,
      year: Number(m[3]),
    }),
  },
];

/**
 * Frases que hablan de algo ya ocurrido. Si la fecha viene precedida por una
 * de éstas, la nota es una crónica y no un anuncio, así que baja la confianza
 * lo suficiente como para que el evento no se publique solo.
 */
const PAST_MARKERS =
  /\b(se realizo|tuvo lugar|se llevo a cabo|fue el|el pasado|ocurrio|se desarrollo|cerro|culmino|finalizo|habia sido)\b/;

/**
 * Extrae todas las fechas del texto y devuelve la más temprana que no sea
 * pasada. Se prefiere la más temprana futura porque el primer párrafo de estas
 * notas suele traer la fecha del evento y las siguientes las de instancias
 * secundarias (lanzamiento, cierre de inscripciones).
 */
/**
 * Media Uruguay tiene calles y plazas con nombre de fecha: 25 de Mayo, 18 de
 * Julio, 3 de Febrero, 8 de Octubre. Escritas en una dirección ("Ituzaingó y 25
 * de Mayo") son indistinguibles de una fecha una vez que se pasa todo a
 * minúsculas, y colaban eventos fechados en mayo del año que viene.
 *
 * Lo que las separa es la mayúscula: el nombre propio va capitalizado y la
 * fecha común no. Por eso el enmascarado se hace sobre el texto original, antes
 * de normalizar. Se exige minúscula después de la inicial para no comerse los
 * títulos en mayúsculas, que sí suelen traer fechas de verdad.
 */
const STREET_LIKE_DATE =
  /\b\d{1,2}\s+de\s+(?:Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Setiembre|Septiembre|Octubre|Noviembre|Diciembre)(?![A-ZÁÉÍÓÚÑ])/g;

export function maskStreetNames(text: string): string {
  // El reemplazo mantiene el largo para no correr las posiciones que después
  // se usan para buscar la hora en la vecindad de la fecha.
  return text.replace(STREET_LIKE_DATE, (match) => '·'.repeat(match.length));
}

/**
 * Segundo filtro para las calles con nombre de fecha, para cuando la fuente las
 * escribe en minúscula y el enmascarado por mayúsculas no las agarra ("ubicado
 * en 25 de mayo -entre 18 de Julio y Dodera-").
 *
 * Lo que las delata es el contexto: una dirección viene detrás de "calle",
 * "ubicado en" o "esquina", o seguida de "entre X y Z". Una fecha de evento no.
 */
const ADDRESS_BEFORE =
  /\b(calle|avenida|av\.?|ave\.?|esquina|esq\.?|ubicad[oa]s? en|sito en|sede en|rambla|bulevar|bvar\.?|paseo|peatonal|padron|local|direccion|entre)\s*$/;
// "entre" abre tanto una dirección ("entre 18 de Julio y Dodera") como un
// rango horario ("entre las 17:00 y las 18:30"); sólo la primera descalifica
// la fecha.
const ADDRESS_AFTER =
  /^\s*(?:-|,)?\s*(?:entre(?!\s+(?:las|\d{1,2}\s*[:.h]))|esquina|esq\.?|casi|n[º°o]?\s*\d)/;

function isAddress(normalized: string, start: number, end: number): boolean {
  return (
    ADDRESS_BEFORE.test(normalized.slice(Math.max(0, start - 24), start)) ||
    ADDRESS_AFTER.test(normalized.slice(end, end + 24))
  );
}

export function parseEventDate(
  text: string,
  publishedAt: Date,
  notBefore: Date,
): ParsedEventDate | null {
  const normalized = normalizeText(maskStreetNames(text));
  const candidates: Candidate[] = [];
  const claimed: [number, number][] = [];

  for (const pattern of DATE_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.regex.exec(normalized)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      // Un patrón más específico ya se quedó con este tramo del texto.
      if (claimed.some(([from, to]) => start < to && end > from)) continue;
      claimed.push([start, end]);

      const parts = pattern.build(match);
      if (!parts.month) continue;
      if (isAddress(normalized, start, end)) continue;

      candidates.push({
        ...parts,
        confidence: pattern.confidence,
        matchedText: match[0].trim(),
        index: start,
      });
    }
  }

  if (candidates.length === 0) return null;

  const resolved = candidates
    .map((candidate): ParsedEventDate | null => {
      const year = candidate.year ?? inferYear(candidate.month, candidate.day, publishedAt);
      if (!isRealDate(year, candidate.month, candidate.day)) return null;

      // La hora se busca en la vecindad de la fecha, no en toda la nota: si no
      // se acota, cualquier "a las 11:00" de otro párrafo se pega a la fecha
      // equivocada.
      const window = normalized.slice(candidate.index, candidate.index + 160);
      const time = parseTime(window);

      const start = uruguayDate(
        year,
        candidate.month,
        candidate.day,
        time?.hour ?? 0,
        time?.minute ?? 0,
      );

      let end: Date | null = null;
      if (candidate.endDay && candidate.endMonth) {
        // Un rango que cruza diciembre termina el año siguiente.
        const endYear = candidate.endMonth < candidate.month ? year + 1 : year;
        if (isRealDate(endYear, candidate.endMonth, candidate.endDay)) {
          end = uruguayDate(endYear, candidate.endMonth, candidate.endDay, 23, 59);
        }
      }

      const preceding = normalized.slice(Math.max(0, candidate.index - 90), candidate.index);
      const looksPast = PAST_MARKERS.test(preceding);

      // Los descuentos están calibrados sobre la agenda real: en estas notas el
      // año casi nunca se escribe y la hora falta seguido, así que ninguna de
      // las dos ausencias puede por sí sola mandar el evento a revisión. Lo que
      // sí lo manda es que la nota hable en pasado.
      let confidence = candidate.confidence;
      if (!candidate.year) confidence -= 0.02;
      if (!time) confidence -= 0.05;
      if (looksPast) confidence -= 0.45;

      return {
        start,
        end,
        timeLabel: time?.label ?? null,
        hasTime: Boolean(time),
        confidence: Math.max(0, Math.round(confidence * 100) / 100),
        matchedText: candidate.matchedText,
      };
    })
    .filter((value): value is ParsedEventDate => value !== null)
    // Un evento de varios días sigue vigente hasta su último día.
    .filter((value) => (value.end ?? value.start).getTime() >= notBefore.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  return resolved[0] ?? null;
}
