/**
 * Clasificación de lo que traen los scrapers: en qué balneario cae el evento,
 * de qué categoría es, dónde se hace y cuánto sale.
 *
 * Las agendas locales no traen nada de esto estructurado, así que se deduce del
 * texto. Cuando no alcanza para decidir, se devuelve null y el evento queda sin
 * ese dato antes que con uno inventado.
 */

import { normalizeText } from './spanish-date.util';

/**
 * Localidades del departamento con las coordenadas de su centro, para que el
 * evento tenga una posición aproximada en el mapa aunque la nota no diga la
 * dirección exacta.
 *
 * El orden importa: se evalúan de más específica a más general, porque "La
 * Barra" y "Manantiales" son parte del área de Punta del Este y las notas
 * suelen nombrar las dos.
 */
interface Locality {
  name: string;
  lat: number;
  lng: number;
  patterns: RegExp[];
}

const LOCALITIES: Locality[] = [
  {
    name: 'Manantiales',
    lat: -34.9042,
    lng: -54.8342,
    patterns: [/\bmanantiales\b/, /\bbikini\b/],
  },
  {
    name: 'La Barra',
    lat: -34.9186,
    lng: -54.8833,
    patterns: [/\bla barra\b/, /\bmontoya\b/, /\bbikini beach\b/],
  },
  {
    name: 'José Ignacio',
    lat: -34.8397,
    lng: -54.6389,
    patterns: [/\bjose ignacio\b/, /\bfaro de jose ignacio\b/],
  },
  {
    name: 'Punta Ballena',
    lat: -34.9033,
    lng: -55.0508,
    patterns: [/\bpunta ballena\b/, /\bcasapueblo\b/, /\blaguna del sauce\b/, /\bsolanas\b/],
  },
  {
    name: 'Punta del Este',
    lat: -34.9611,
    lng: -54.9506,
    patterns: [
      /\bpunta del este\b/,
      /\bpuerto de punta\b/,
      /\bconrad\b/,
      /\benjoy punta\b/,
      /\bcantegril\b/,
      /\bteatro cantegril\b/,
      /\bpeninsula\b/,
      /\bplaya mansa\b/,
      /\bplaya brava\b/,
      /\bparada \d+\b/,
      /\bcentro de convenciones\b/,
      /\byacht club\b/,
    ],
  },
  {
    name: 'Piriápolis',
    lat: -34.8686,
    lng: -55.2761,
    patterns: [/\bpiriapolis\b/, /\bcerro san antonio\b/, /\bargentino hotel\b/, /\bpunta colorada\b/],
  },
  {
    name: 'San Carlos',
    lat: -34.7942,
    lng: -54.9203,
    patterns: [/\bsan carlos\b/, /\bteatro union\b/, /\bplaya hermosa\b/],
  },
  {
    name: 'Pan de Azúcar',
    lat: -34.7789,
    lng: -55.2372,
    patterns: [/\bpan de azucar\b/, /\bzorrilla de san martin\b/],
  },
  { name: 'Aiguá', lat: -34.2058, lng: -54.7581, patterns: [/\baigua\b/] },
  { name: 'Garzón', lat: -34.5847, lng: -54.5714, patterns: [/\bgarzon\b/, /\bla juanita\b/] },
  { name: 'Solís Grande', lat: -34.7847, lng: -55.4056, patterns: [/\bsolis grande\b/, /\bbella vista\b/] },
  { name: 'Pueblo Edén', lat: -34.5619, lng: -55.0511, patterns: [/\bpueblo eden\b/] },
  {
    name: 'Maldonado',
    lat: -34.9089,
    lng: -54.9581,
    patterns: [
      /\bmaldonado\b/,
      /\bcasa de la cultura\b/,
      /\bmuseo mazzoni\b/,
      /\bcuartel de dragones\b/,
      /\bplaza san fernando\b/,
      /\bcampus\b/,
      /\bel jaguel\b/,
      /\bpueblo gaucho\b/,
      /\bcerro pelado\b/,
    ],
  },
];

export interface LocalityMatch {
  name: string;
  lat: number;
  lng: number;
}

/**
 * Gana la localidad que se nombra primero, no la que esté primera en la lista.
 *
 * Estas notas abren diciendo dónde es y recién después nombran salas o
 * balnearios vecinos; recorriendo la lista en orden fijo, un "Teatro Cantegril"
 * mencionado al final mandaba a Punta del Este una actividad que el título
 * ubicaba en Maldonado.
 */
export function detectLocality(text: string): LocalityMatch | null {
  const normalized = normalizeText(text);

  let best: { locality: Locality; index: number } | null = null;

  for (const locality of LOCALITIES) {
    for (const pattern of locality.patterns) {
      const index = normalized.search(pattern);
      if (index === -1) continue;
      // Ante un empate (la misma posición) queda la primera de la lista, que
      // está ordenada de la localidad más específica a la más general.
      if (!best || index < best.index) best = { locality, index };
      break;
    }
  }

  if (!best) return null;
  return { name: best.locality.name, lat: best.locality.lat, lng: best.locality.lng };
}

/**
 * Categorías, alineadas con las que ya usa el filtro de la agenda en el
 * frontend. Se recorre en orden y gana la primera que matchea, así que van de
 * la más específica a la más amplia.
 */
const CATEGORIES: { name: string; patterns: RegExp[] }[] = [
  {
    name: 'Gastronomía',
    patterns: [
      /\bgastronom/,
      /\bchorizo\b/,
      /\bvino[s]?\b/,
      /\bbodega/,
      /\benoturismo\b/,
      /\bcerveza/,
      /\bdegustacion/,
      /\bcocina\b/,
      /\bchef\b/,
      /\bplaza de comidas\b/,
    ],
  },
  {
    name: 'Deportes',
    patterns: [
      /\bmaraton\b/,
      // "carrera" a secas es trampa: en estas notas aparece casi siempre como
      // "carrera artística" o "carrera docente".
      /\bcarrera[s]? (pedestre|ciclista|de ciclismo|de montana|atletica)\b/,
      /\bcorrida\b/,
      /\bfutbol\b/,
      /\bbasquet/,
      /\btenis\b/,
      /\bgolf\b/,
      /\bregata\b/,
      /\bvela\b/,
      /\bciclismo\b/,
      /\bdeportiv/,
      /\btorneo\b/,
      /\bcampeonato\b/,
      /\bsurf\b/,
      /\bpolo\b/,
      /\brally\b/,
      /\bnatacion\b/,
    ],
  },
  {
    name: 'Música',
    patterns: [
      /\brecital\b/,
      /\bconcierto\b/,
      /\bmusica\b/,
      /\bmusical\b/,
      /\bbanda[s]?\b/,
      /\borquesta\b/,
      /\bcantante\b/,
      /\bcanta\b/,
      /\bdj\b/,
      /\bfestival de la cancion\b/,
      /\brock\b/,
      /\btango\b/,
      /\bfolclor/,
      /\bmurga\b/,
      /\bcandombe\b/,
    ],
  },
  {
    name: 'Ferias',
    patterns: [/\bferia\b/, /\bexpo\b/, /\bartesan/, /\bmercado\b/, /\bstand[s]?\b/, /\bremate\b/],
  },
  {
    name: 'Celebraciones',
    patterns: [
      /\bcarnaval\b/,
      /\baniversario\b/,
      /\bfiesta\b/,
      /\bcelebra/,
      /\bnoche de la nostalgia\b/,
      /\bano nuevo\b/,
      /\bnavidad\b/,
      /\bdia de la ninez\b/,
      /\bdesfile\b/,
    ],
  },
  {
    name: 'Cultura',
    patterns: [
      /\bteatro\b/,
      /\bmuseo\b/,
      /\bmuestra\b/,
      /\bexposicion\b/,
      /\bcine\b/,
      /\bcultural\b/,
      /\blibro\b/,
      /\bpresentacion del libro\b/,
      /\bdanza\b/,
      /\bpatrimonio\b/,
      /\bbiblioteca\b/,
      /\bcharla\b/,
      /\bconferencia\b/,
      /\btaller\b/,
      /\bcongreso\b/,
      /\bseminario\b/,
      /\bjornada\b/,
      /\bencuentro\b/,
    ],
  },
  {
    name: 'Naturaleza',
    patterns: [/\bavistamiento\b/, /\bballena[s]?\b/, /\bsenderismo\b/, /\bambiental\b/, /\bfauna\b/, /\bflora\b/],
  },
];

export function detectCategory(text: string): string {
  const normalized = normalizeText(text);

  for (const category of CATEGORIES) {
    if (category.patterns.some((pattern) => pattern.test(normalized))) return category.name;
  }

  return 'Cultura';
}

/**
 * Salas y espacios reconocibles, con su dirección y coordenadas. Cuando el
 * evento cae en uno de éstos queda ubicado en el punto exacto, que es bastante
 * mejor que el centroide de la localidad.
 */
const VENUES: { patterns: RegExp[]; name: string; address: string; lat: number; lng: number }[] = [
  {
    patterns: [/\bcasa de la cultura\b/],
    name: 'Casa de la Cultura de Maldonado',
    address: 'Rafael Pérez del Puerto y Sarandí, Maldonado',
    lat: -34.9082,
    lng: -54.9571,
  },
  {
    patterns: [/\bteatro cantegril\b/, /\bsala cantegril\b/, /\bcantegril country club\b/],
    name: 'Teatro Cantegril',
    address: 'Av. Roosevelt y Parada 5, Punta del Este',
    lat: -34.9421,
    lng: -54.9384,
  },
  {
    patterns: [/\bmuseo (regional )?(francisco )?mazzoni\b/],
    name: 'Museo Regional Francisco Mazzoni',
    address: 'Ituzaingó 787, Maldonado',
    lat: -34.9095,
    lng: -54.9566,
  },
  {
    patterns: [/\bmuseo garcia uriburu\b/],
    name: 'Museo Nicolás García Uriburu',
    address: 'Sarandí y Rafael Pérez del Puerto, Maldonado',
    lat: -34.9084,
    lng: -54.9569,
  },
  {
    patterns: [/\bcuartel de dragones\b/],
    name: 'Cuartel de Dragones',
    address: 'Pérez del Puerto y 18 de Julio, Maldonado',
    lat: -34.9075,
    lng: -54.9553,
  },
  {
    patterns: [/\bcentro de convenciones (de )?(y predio ferial )?(de )?punta del este\b/, /\bcentro de convenciones\b/],
    name: 'Centro de Convenciones y Predio Ferial de Punta del Este',
    address: 'Av. Juan Díaz de Solís y Ruta 39, Punta del Este',
    lat: -34.9297,
    lng: -54.9438,
  },
  {
    patterns: [/\benjoy punta del este\b/, /\bconrad\b/],
    name: 'Enjoy Punta del Este',
    address: 'Rambla Claudio Williman y Parada 4, Punta del Este',
    lat: -34.9364,
    lng: -54.9459,
  },
  {
    patterns: [/\bpueblo gaucho\b/],
    name: 'Pueblo Gaucho',
    address: 'Ruta 39 km 8, Maldonado',
    lat: -34.8698,
    lng: -54.9317,
  },
  {
    patterns: [/\bparque zorrilla de san martin\b/, /\bzorrilla de san martin\b/],
    name: 'Parque Zorrilla de San Martín',
    address: 'Pan de Azúcar, Maldonado',
    lat: -34.7797,
    lng: -55.2364,
  },
  {
    patterns: [/\bteatro union\b/],
    name: 'Teatro Unión',
    address: '18 de Julio y Treinta y Tres, San Carlos',
    lat: -34.7936,
    lng: -54.9174,
  },
  {
    patterns: [/\bcampus (municipal|de maldonado)?\b/],
    name: 'Campus Municipal de Maldonado',
    address: 'Av. Aparicio Saravia, Maldonado',
    lat: -34.9174,
    lng: -54.9645,
  },
  {
    patterns: [/\bel jaguel\b/],
    name: 'Parque El Jagüel',
    address: 'Av. Aparicio Saravia, Maldonado',
    lat: -34.9236,
    lng: -54.9268,
  },
  {
    patterns: [/\byacht club (de )?punta del este\b/],
    name: 'Yacht Club Punta del Este',
    address: 'Rambla Artigas, Puerto de Punta del Este',
    lat: -34.9671,
    lng: -54.9503,
  },
  {
    patterns: [/\bbiblioteca (publica )?jose artigas\b/],
    name: 'Biblioteca José Artigas',
    address: 'Sarandí 855, Maldonado',
    lat: -34.9089,
    lng: -54.9564,
  },
  {
    patterns: [/\bazotea de haedo\b/],
    name: 'Azotea de Haedo',
    address: 'Sarandí y 3 de Febrero, Maldonado',
    lat: -34.9086,
    lng: -54.9556,
  },
];

export interface VenueMatch {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export function detectVenue(text: string): VenueMatch | null {
  const normalized = normalizeText(text);

  for (const venue of VENUES) {
    if (venue.patterns.some((pattern) => pattern.test(normalized))) {
      return { name: venue.name, address: venue.address, lat: venue.lat, lng: venue.lng };
    }
  }

  return null;
}

/**
 * Precio. Sólo se devuelve algo cuando el texto lo dice; que quede en null es
 * preferible a publicar "Gratis" en un evento que cobra entrada.
 */
export function detectPrice(text: string): string | null {
  const normalized = normalizeText(text);

  if (/\b(entrada (libre y )?gratuita|acceso gratuito|gratis|sin costo|entrada libre|participacion gratuita|actividad gratuita|es gratuito)\b/.test(normalized)) {
    return 'Gratis';
  }

  const amount = text.match(/\$\s?\d[\d.,]*/);
  if (amount) return amount[0].replace(/\s/g, '');

  if (/\b(entrada[s]? (a la venta|por|desde)|venta de entradas|preventa|localidades)\b/.test(normalized)) {
    return 'Entrada paga';
  }

  return null;
}

/**
 * Organizador. Se limita a los que aparecen una y otra vez en estas agendas,
 * porque intentar sacarlo del texto libre daba más ruido que aciertos.
 */
export function detectOrganizer(text: string): string | null {
  const normalized = normalizeText(text);

  if (/\bintendencia de maldonado\b|\bidm\b|\bdepartamento de cultura\b/.test(normalized)) {
    return 'Intendencia de Maldonado';
  }
  const municipio = normalized.match(
    /municipio de (punta del este|maldonado|san carlos|piriapolis|pan de azucar|aigua|garzon|solis grande)/,
  );
  if (municipio) {
    return `Municipio de ${municipio[1].replace(/\b\w/g, (c) => c.toUpperCase())}`;
  }

  return null;
}

/**
 * Filtra lo que no es un evento al que alguien pueda ir: agenda protocolar del
 * intendente, actos por invitación, avisos de tránsito, notas de balance. Es lo
 * que más ruido metía cuando se publicaba todo lo que traía la sección
 * "Eventos" de la Intendencia.
 */
const NOT_AN_EVENT =
  /\b(zona de exclusion|corte de transito|licitacion|llamado a concurso|rendicion de cuentas|firma de convenio|firmaron convenio|cambio de autoridades|recambio de autoridades|entrega de certificados|actividad por invitacion|solo por invitacion|conferencia de prensa|asume|asumio|destaco la importancia|balance de|reunion de trabajo|fue invitado el intendente|suspendi[oó]|se suspende|queda suspendid)\b/;

export function looksLikeAttendableEvent(text: string): boolean {
  return !NOT_AN_EVENT.test(normalizeText(text));
}
