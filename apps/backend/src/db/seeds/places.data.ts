/**
 * Atractivos turísticos del departamento de Maldonado.
 *
 * Todo lo que hay acá está verificado contra una fuente citable, y esa fuente
 * va anotada en `sources`. Se optó por dejar un campo vacío antes que
 * completarlo de memoria: un horario inventado en una app oficial manda gente
 * a un museo cerrado.
 *
 * Las coordenadas salen de OpenStreetMap (Nominatim), no de estimaciones sobre
 * el mapa.
 *
 * Las fotos son de Wikimedia Commons. Cada una lleva autor, licencia y enlace
 * al archivo original porque CC BY y CC BY-SA obligan a atribuir; la ficha del
 * lugar muestra ese crédito.
 */

export interface PlaceImage {
  url: string;
  author: string;
  license: string;
  licenseUrl: string | null;
  source: string;
}

export interface PlaceSeed {
  name: string;
  locality: string;
  category: string;
  description: string;
  lat: number;
  lng: number;
  address: string | null;
  phone: string | null;
  website: string | null;
  /** Texto libre o mapa día -> horario. null cuando no se pudo verificar. */
  schedule: Record<string, string> | { general: string } | null;
  priceRange: string | null;
  facilities: string[];
  activities: string[];
  tips: string[];
  highlights: string[];
  isFeatured: boolean;
  images: PlaceImage[];
  /** De dónde salió cada dato no obvio. */
  sources: string[];
}

const COMMONS = 'https://upload.wikimedia.org/wikipedia/commons';
const CC_BY_SA_3 = 'https://creativecommons.org/licenses/by-sa/3.0';
const CC_BY_SA_4 = 'https://creativecommons.org/licenses/by-sa/4.0';
const CC_BY_2 = 'https://creativecommons.org/licenses/by/2.0';
const CC_BY_25 = 'https://creativecommons.org/licenses/by/2.5';
const CC_BY_3 = 'https://creativecommons.org/licenses/by/3.0';
const CC0 = 'https://creativecommons.org/publicdomain/zero/1.0/';

function commonsFile(name: string): string {
  return `https://commons.wikimedia.org/wiki/File:${name}`;
}

export const PLACES: PlaceSeed[] = [
  // ==========================================================================
  // Punta del Este
  // ==========================================================================
  {
    name: 'Monumento al Ahogado (Los Dedos)',
    locality: 'Punta del Este',
    category: 'Monumentos',
    description:
      'Cinco dedos de hormigón emergiendo de la arena de Playa Brava, la imagen más reconocible de Punta del Este. La obra es del escultor chileno Mario Irarrázabal y se levantó en el verano de 1982, para el Primer Encuentro Internacional de Escultura Moderna al Aire Libre. Su nombre oficial es "Monumento al Ahogado" y advierte sobre la fuerza del mar en la costa oceánica, aunque todo el mundo la conoce como "La Mano" o "Los Dedos".',
    lat: -34.957892,
    lng: -54.937291,
    address: 'Rambla General Artigas, Playa Brava, Punta del Este',
    phone: null,
    website: null,
    schedule: { general: 'Acceso libre las 24 horas' },
    priceRange: 'Gratis',
    facilities: ['Estacionamiento', 'Acceso a la playa'],
    activities: ['Fotografía', 'Caminata por la rambla'],
    tips: [
      'La luz del atardecer es la mejor para fotografiarla y hay bastante menos gente que al mediodía.',
      'En temporada alta conviene llegar caminando por la rambla: estacionar cerca es difícil.',
    ],
    highlights: ['Escultura de Mario Irarrázabal (1982)', 'Sobre la arena de Playa Brava'],
    isFeatured: true,
    images: [
      {
        url: `${COMMONS}/thumb/9/96/La_mano_de_Punta_del_Este.JPG/1280px-La_mano_de_Punta_del_Este.JPG`,
        author: 'María Cecilia',
        license: 'CC0',
        licenseUrl: CC0,
        source: commonsFile('La_mano_de_Punta_del_Este.JPG'),
      },
      {
        url: `${COMMONS}/thumb/3/3b/La_mano_que_emerge_en_Punta_del_Este.JPG/1280px-La_mano_que_emerge_en_Punta_del_Este.JPG`,
        author: 'Isabeltorrado',
        license: 'CC BY-SA 3.0',
        licenseUrl: CC_BY_SA_3,
        source: commonsFile('La_mano_que_emerge_en_Punta_del_Este.JPG'),
      },
    ],
    sources: ['https://www.maldonado.gub.uy/descubre-maldonado/atracciones-turisticas'],
  },
  {
    name: 'Playa Brava',
    locality: 'Punta del Este',
    category: 'Playas',
    description:
      'La costa oceánica de la península, de oleaje fuerte y arena gruesa. Es la playa del Monumento al Ahogado y la que eligen los surfistas. Va desde la punta de la península hacia el este, pasando por las paradas de la Rambla Lorenzo Batlle Pacheco hasta San Rafael y La Brava.',
    lat: -34.958,
    lng: -54.9375,
    address: 'Rambla Lorenzo Batlle Pacheco, Punta del Este',
    phone: null,
    website: null,
    schedule: { general: 'Acceso libre. Guardavidas en temporada estival' },
    priceRange: 'Gratis',
    facilities: ['Paradores', 'Guardavidas en temporada', 'Estacionamiento sobre la rambla'],
    activities: ['Surf', 'Bodyboard', 'Caminatas', 'Fotografía'],
    tips: [
      'El oleaje es fuerte y hay corrientes: bañarse siempre frente a un puesto de guardavidas.',
      'Es la costa del lado del océano, así que el agua está bastante más fría que en la Mansa.',
    ],
    highlights: ['Olas para surf', 'Monumento al Ahogado', 'Atardeceres sobre la rambla'],
    isFeatured: true,
    images: [
      {
        url: `${COMMONS}/thumb/f/f1/Playa_Brava%2C_Punta_del_Este%2C_Uruguay.jpg/1280px-Playa_Brava%2C_Punta_del_Este%2C_Uruguay.jpg`,
        author: 'Flaviohmg',
        license: 'CC BY-SA 4.0',
        licenseUrl: CC_BY_SA_4,
        source: commonsFile('Playa_Brava,_Punta_del_Este,_Uruguay.jpg'),
      },
      {
        url: `${COMMONS}/thumb/1/15/Surfers_in_Playa_Brava.JPG/1280px-Surfers_in_Playa_Brava.JPG`,
        author: 'Rosina Peixoto',
        license: 'CC BY-SA 3.0',
        licenseUrl: CC_BY_SA_3,
        source: commonsFile('Surfers_in_Playa_Brava.JPG'),
      },
    ],
    sources: ['https://www.maldonado.gub.uy/descubre-maldonado/playas'],
  },
  {
    name: 'Playa Mansa',
    locality: 'Punta del Este',
    category: 'Playas',
    description:
      'La costa del Río de la Plata, sobre la bahía de Maldonado. Aguas quietas, arena fina y menos viento que del lado oceánico, lo que la hace la opción para ir con chicos y para los deportes náuticos. Se extiende sobre la Rambla Claudio Williman, desde el puerto hacia Punta Ballena, y sus paradas son la referencia con la que todo el mundo se ubica en Punta del Este.',
    lat: -34.945534,
    lng: -54.943787,
    address: 'Rambla Claudio Williman, Punta del Este',
    phone: null,
    website: null,
    schedule: { general: 'Acceso libre. Guardavidas en temporada estival' },
    priceRange: 'Gratis',
    facilities: ['Paradores', 'Guardavidas en temporada', 'Alquiler de equipos náuticos'],
    activities: ['Natación', 'Kayak', 'Stand up paddle', 'Windsurf', 'Vela'],
    tips: [
      'Es la mejor opción para ir con niños: el agua entra en pendiente suave y no rompe ola.',
      'Las paradas van del 1 en adelante alejándose de la península; sirven de dirección para todo.',
    ],
    highlights: ['Aguas calmas', 'Deportes náuticos', 'Puestas de sol sobre la bahía'],
    isFeatured: true,
    images: [
      {
        url: `${COMMONS}/thumb/f/fa/Playa_Mansa%2C_Punta_del_Este.JPG/1280px-Playa_Mansa%2C_Punta_del_Este.JPG`,
        author: 'Rosina Peixoto',
        license: 'CC BY-SA 4.0',
        licenseUrl: CC_BY_SA_4,
        source: commonsFile('Playa_Mansa,_Punta_del_Este.JPG'),
      },
      {
        url: `${COMMONS}/thumb/c/cb/Mansa_Beach_Punta_del_Este_Uruguay.JPG/1280px-Mansa_Beach_Punta_del_Este_Uruguay.JPG`,
        author: 'Roberto Tietzmann',
        license: 'CC BY 2.5',
        licenseUrl: CC_BY_25,
        source: commonsFile('Mansa_Beach_Punta_del_Este_Uruguay.JPG'),
      },
    ],
    sources: ['https://www.maldonado.gub.uy/descubre-maldonado/playas'],
  },
  {
    name: 'Puerto de Punta del Este',
    locality: 'Punta del Este',
    category: 'Puertos',
    description:
      'El puerto deportivo sobre la Rambla Artigas, en el extremo oeste de la península. Amarran yates y veleros junto a la flota de pesca artesanal, y en los muelles se instaló una colonia de lobos marinos que se acerca a esperar el descarte de los pescadores. De acá salen las lanchas a la Isla Gorriti y a la Isla de Lobos.',
    lat: -34.962851,
    lng: -54.945644,
    address: 'Rambla General Artigas, Punta del Este',
    phone: null,
    website: null,
    schedule: { general: 'Acceso libre. Los paseos en lancha operan principalmente en temporada' },
    priceRange: 'Gratis (los paseos náuticos se pagan aparte)',
    facilities: ['Restaurantes', 'Feria de artesanos', 'Amarras', 'Venta de pescado fresco'],
    activities: ['Avistamiento de lobos marinos', 'Paseos en lancha', 'Gastronomía', 'Pesca'],
    tips: [
      'Los lobos marinos se juntan junto a los muelles de la pesca artesanal, sobre todo cuando vuelven las barcas.',
      'No hay que darles de comer ni acercarse: son animales silvestres.',
    ],
    highlights: ['Lobos marinos', 'Salida a Isla Gorriti e Isla de Lobos', 'Feria de artesanos'],
    isFeatured: true,
    images: [
      {
        url: `${COMMONS}/thumb/d/de/Puerto_de_Punta_del_Este_%2801%29.jpg/1280px-Puerto_de_Punta_del_Este_%2801%29.jpg`,
        author: 'Zulmabm',
        license: 'CC BY-SA 4.0',
        licenseUrl: CC_BY_SA_4,
        source: commonsFile('Puerto_de_Punta_del_Este_(01).jpg'),
      },
      {
        url: `${COMMONS}/7/7e/Puerto_de_Punta_del_Este_%2802%29.jpg`,
        author: 'Zulmabm',
        license: 'CC BY-SA 4.0',
        licenseUrl: CC_BY_SA_4,
        source: commonsFile('Puerto_de_Punta_del_Este_(02).jpg'),
      },
    ],
    sources: ['https://www.maldonado.gub.uy/descubre-maldonado/atracciones-turisticas'],
  },
  {
    name: 'Faro de Punta del Este',
    locality: 'Punta del Este',
    category: 'Monumentos',
    description:
      'La torre blanca de 45 metros que marca la punta de la península, en pleno casco antiguo, junto a la Iglesia de la Candelaria. Se encendió en 1860 para señalar el encuentro del Río de la Plata con el Atlántico, uno de los pasos más complicados de la costa uruguaya, y sigue en servicio a cargo de la Armada Nacional.',
    lat: -34.968858,
    lng: -54.951642,
    address: 'Calle 2 de Febrero (Calle 10) y Calle 31, Punta del Este',
    phone: null,
    website: null,
    schedule: null,
    priceRange: null,
    facilities: [],
    activities: ['Fotografía', 'Recorrido por el casco antiguo de la península'],
    tips: [
      'El faro sigue operativo y las visitas al interior dependen de la Armada: no siempre están habilitadas.',
      'Alrededor está la parte más antigua de Punta del Este, con la Iglesia de la Candelaria a metros.',
    ],
    highlights: ['En servicio desde 1860', '45 metros de altura', 'Casco antiguo de la península'],
    isFeatured: false,
    images: [
      {
        url: `${COMMONS}/thumb/a/a8/FaroPuntadelEste.jpg/1280px-FaroPuntadelEste.jpg`,
        author: 'Ezarate',
        license: 'CC BY-SA 4.0',
        licenseUrl: CC_BY_SA_4,
        source: commonsFile('FaroPuntadelEste.jpg'),
      },
      {
        url: `${COMMONS}/thumb/6/6a/Faro_de_Punta_del_Este_%28vista_aerea%29.JPG/1280px-Faro_de_Punta_del_Este_%28vista_aerea%29.JPG`,
        author: 'Juan Pablo240684',
        license: 'CC BY-SA 3.0',
        licenseUrl: CC_BY_SA_3,
        source: commonsFile('Faro_de_Punta_del_Este_(vista_aerea).JPG'),
      },
    ],
    sources: ['https://www.maldonado.gub.uy/descubre-maldonado/atracciones-turisticas'],
  },
  {
    name: 'Playa El Emir',
    locality: 'Punta del Este',
    category: 'Playas',
    description:
      'La primera playa de la costa brava saliendo de la península, a pocas cuadras del centro de Punta del Este. Es chica y muy concurrida, con buena rompiente para surfear y el parador que le da nombre; su cercanía la vuelve la playa a la que se llega caminando desde el centro.',
    lat: -34.962916,
    lng: -54.940432,
    address: 'Rambla Lorenzo Batlle Pacheco, Parada 2, Punta del Este',
    phone: null,
    website: null,
    schedule: { general: 'Acceso libre. Guardavidas en temporada estival' },
    priceRange: 'Gratis',
    facilities: ['Parador', 'Guardavidas en temporada'],
    activities: ['Surf', 'Natación'],
    tips: ['Es de las playas más cercanas al centro: se llega a pie desde la península.'],
    highlights: ['A pasos del centro', 'Rompiente para surf'],
    isFeatured: false,
    images: [
      {
        url: `${COMMONS}/5/50/Punta%2C_Playa_El_Emir_-_panoramio.jpg`,
        author: 'Alejandro Sartor',
        license: 'CC BY-SA 3.0',
        licenseUrl: CC_BY_SA_3,
        source: commonsFile('Punta,_Playa_El_Emir_-_panoramio.jpg'),
      },
    ],
    sources: ['https://www.maldonado.gub.uy/descubre-maldonado/playas'],
  },
  {
    name: 'Isla Gorriti',
    locality: 'Punta del Este',
    category: 'Islas',
    description:
      'Isla frente al puerto, a unos veinte minutos de lancha, con dos playas de arena blanca —Puerto Jardín y Playa Honda— y un bosque de pinos y eucaliptos. Conserva las ruinas de las baterías españolas de fines del siglo XVIII, levantadas para defender la bahía de Maldonado, y es Monumento Histórico Nacional.',
    lat: -34.954577,
    lng: -54.971622,
    address: 'Bahía de Maldonado, frente al Puerto de Punta del Este',
    phone: null,
    website: null,
    schedule: { general: 'Se llega en lancha desde el puerto; los servicios funcionan en temporada' },
    priceRange: 'El traslado en lancha se paga',
    facilities: ['Paradores en temporada', 'Playas'],
    activities: ['Playa', 'Senderismo', 'Visita a las fortificaciones históricas', 'Buceo'],
    tips: [
      'No hay servicios permanentes: fuera de temporada conviene llevar agua y comida.',
      'Las lanchas salen del puerto y hay que confirmar el horario de vuelta antes de cruzar.',
    ],
    highlights: ['Baterías españolas del siglo XVIII', 'Playas Puerto Jardín y Honda', 'Monumento Histórico Nacional'],
    isFeatured: true,
    images: [
      {
        url: `${COMMONS}/thumb/1/12/IslaGorriti-bosque.jpg/1280px-IslaGorriti-bosque.jpg`,
        author: 'Ezarate',
        license: 'CC BY-SA 4.0',
        licenseUrl: CC_BY_SA_4,
        source: commonsFile('IslaGorriti-bosque.jpg'),
      },
      {
        url: `${COMMONS}/thumb/1/1a/Fortificacion_isla_gorriti_punta_del_este_maldonado.JPG/1280px-Fortificacion_isla_gorriti_punta_del_este_maldonado.JPG`,
        author: 'Paro1414',
        license: 'CC BY-SA 3.0',
        licenseUrl: CC_BY_SA_3,
        source: commonsFile('Fortificacion_isla_gorriti_punta_del_este_maldonado.JPG'),
      },
      {
        url: `${COMMONS}/thumb/4/4c/Isla_Gorriti_17.jpg/1280px-Isla_Gorriti_17.jpg`,
        author: 'Pipe310593',
        license: 'CC BY-SA 4.0',
        licenseUrl: CC_BY_SA_4,
        source: commonsFile('Isla_Gorriti_17.jpg'),
      },
    ],
    sources: ['https://www.maldonado.gub.uy/descubre-maldonado/atracciones-turisticas'],
  },
  {
    name: 'Isla de Lobos',
    locality: 'Punta del Este',
    category: 'Islas',
    description:
      'Isla a unos 8 km mar adentro que alberga una de las mayores colonias de lobos marinos de América del Sur. Su faro, encendido en 1906, es el más alto de Uruguay con 59 metros. Es reserva natural: el desembarco está restringido y se visita en excursiones náuticas que la rodean sin bajar a tierra.',
    lat: -35.027242,
    lng: -54.883687,
    address: 'Océano Atlántico, a 8 km de Punta del Este',
    phone: null,
    website: null,
    schedule: { general: 'Sólo por excursión náutica; el desembarco está restringido por ser reserva' },
    priceRange: 'La excursión se paga',
    facilities: [],
    activities: ['Avistamiento de lobos marinos', 'Excursión náutica', 'Fotografía de fauna'],
    tips: [
      'La navegación es en mar abierto y se suspende con mal tiempo: conviene consultar antes de salir.',
      'Es reserva de fauna, así que las excursiones bordean la isla y no desembarcan.',
    ],
    highlights: ['Colonia de lobos marinos', 'El faro más alto del país (59 m, 1906)', 'Reserva de fauna'],
    isFeatured: false,
    images: [
      {
        url: `${COMMONS}/thumb/4/48/Faro_Isla_de_Lobos%2C_Maldonado%2C_Uruguay.JPG/1280px-Faro_Isla_de_Lobos%2C_Maldonado%2C_Uruguay.JPG`,
        author: 'Ismael Cordero',
        license: 'CC BY-SA 3.0',
        licenseUrl: CC_BY_SA_3,
        source: commonsFile('Faro_Isla_de_Lobos,_Maldonado,_Uruguay.JPG'),
      },
      {
        url: `${COMMONS}/7/77/Isla_de_Lobos-Uruguay.jpg`,
        author: 'Pri Jordão',
        license: 'CC BY 2.0',
        licenseUrl: CC_BY_2,
        source: commonsFile('Isla_de_Lobos-Uruguay.jpg'),
      },
    ],
    sources: ['https://www.maldonado.gub.uy/descubre-maldonado/atracciones-turisticas'],
  },

  // ==========================================================================
  // Punta Ballena
  // ==========================================================================
  {
    name: 'Casapueblo',
    locality: 'Punta Ballena',
    category: 'Museos',
    description:
      'La casa-taller que Carlos Páez Vilaró construyó sobre los acantilados de Punta Ballena, levantada a mano y sin planos durante décadas, inspirada en los nidos del hornero. Hoy funciona como museo con obra del artista repartida en cinco salas y tres terrazas, y su recorrido de pasadizos, arcadas y objetos incrustados en los muros es en sí mismo la pieza principal. Al atardecer se lee la "Ceremonia del Sol", el texto que Páez Vilaró escribió para despedir el día.',
    lat: -34.908758,
    lng: -55.044587,
    address: 'Carlos Páez Vilaró s/n, Punta Ballena, Maldonado',
    phone: '+598 4257 8041',
    website: 'https://casapueblo.com.uy',
    schedule: { general: 'Todos los días del año, de 10:00 hasta la puesta de sol' },
    priceRange: '$U 600 general · $U 500 residentes mayores de 65 · menores de 12 gratis',
    facilities: ['Museo', 'Galería de arte', 'Cafetería', 'Hotel', 'Estacionamiento'],
    activities: ['Visita al museo taller', 'Ceremonia del Sol al atardecer', 'Fotografía'],
    tips: [
      'La Ceremonia del Sol es al atardecer: conviene llegar con tiempo, porque es cuando más gente hay.',
      'Está a unos 15 km de Punta del Este por la Ruta Interbalnearia.',
    ],
    highlights: ['Obra de Carlos Páez Vilaró', 'Cinco salas y tres terrazas', 'Ceremonia del Sol'],
    isFeatured: true,
    images: [
      {
        url: `${COMMONS}/thumb/6/69/Casapueblo.JPG/1280px-Casapueblo.JPG`,
        author: 'Talkingheads',
        license: 'CC BY-SA 3.0',
        licenseUrl: CC_BY_SA_3,
        source: commonsFile('Casapueblo.JPG'),
      },
      {
        url: `${COMMONS}/thumb/0/0b/Casapueblo_%28172031347%29.jpeg/1280px-Casapueblo_%28172031347%29.jpeg`,
        author: 'Marcelo Campi',
        license: 'CC BY-SA 3.0',
        licenseUrl: CC_BY_SA_3,
        source: commonsFile('Casapueblo_(172031347).jpeg'),
      },
    ],
    sources: ['https://casapueblo.com.uy/contacto/', 'https://casapueblo.com.uy/'],
  },
  {
    name: 'Punta Ballena',
    locality: 'Punta Ballena',
    category: 'Naturaleza',
    description:
      'Península rocosa entre la Laguna del Sauce y el Río de la Plata, con un mirador desde el que se ve toda la bahía de Maldonado y, en los días claros, el skyline de Punta del Este. Es zona declarada Paisaje Protegido y en sus laderas están Casapueblo y el Arboretum Lussich.',
    lat: -34.890144,
    lng: -55.040114,
    address: 'Punta Ballena, Maldonado',
    phone: null,
    website: null,
    schedule: { general: 'Acceso libre' },
    priceRange: 'Gratis',
    facilities: ['Mirador', 'Estacionamiento'],
    activities: ['Mirador panorámico', 'Fotografía', 'Atardeceres'],
    tips: ['El mirador da al oeste: es de los mejores lugares del departamento para ver la puesta de sol.'],
    highlights: ['Mirador sobre la bahía', 'Paisaje Protegido', 'Casapueblo y Arboretum Lussich'],
    isFeatured: false,
    images: [
      {
        url: `${COMMONS}/thumb/1/19/Mirador_en_Punta_Ballena.JPG/1280px-Mirador_en_Punta_Ballena.JPG`,
        author: 'Basesta',
        license: 'CC BY-SA 3.0',
        licenseUrl: CC_BY_SA_3,
        source: commonsFile('Mirador_en_Punta_Ballena.JPG'),
      },
      {
        url: `${COMMONS}/e/e8/20003_Punta_Ballena%2C_Maldonado_Department%2C_Uruguay_-_panoramio_%281%29.jpg`,
        author: 'Cleant',
        license: 'CC BY 3.0',
        licenseUrl: CC_BY_3,
        source: commonsFile('20003_Punta_Ballena,_Maldonado_Department,_Uruguay_-_panoramio_(1).jpg'),
      },
    ],
    sources: ['https://www.maldonado.gub.uy/descubre-maldonado/atracciones-turisticas'],
  },
  {
    name: 'Arboretum Lussich',
    locality: 'Punta Ballena',
    category: 'Naturaleza',
    description:
      'Reserva forestal de 192 hectáreas en las laderas de Punta Ballena. La empezó Antonio Lussich en 1896 sobre un terreno que entonces era sólo dunas y piedra, plantando especies traídas de todo el mundo; hoy reúne más de 350 especies exóticas y cerca de 70 autóctonas, recorribles por una red de senderos.',
    lat: -34.870348,
    lng: -55.02881,
    address: 'Ruta Panorámica, Punta Ballena, Maldonado',
    phone: null,
    website: 'https://arboretumlussich.uy',
    schedule: {
      bosque: 'Martes de 9:00 a 17:30 · Miércoles a domingo de 9:00 a 18:00',
      espacioInterpretacion: 'Miércoles a domingo de 10:00 a 20:00',
    },
    priceRange: 'Gratis',
    facilities: ['Senderos señalizados', 'Espacio de interpretación', 'Estacionamiento'],
    activities: ['Senderismo', 'Avistamiento de aves', 'Visitas guiadas', 'Educación ambiental'],
    tips: [
      'Los horarios del bosque y los del espacio de interpretación son distintos: conviene mirar los dos antes de ir.',
      'Hay unos 40 caminos dentro del predio; los señalizados son los recomendados para una primera visita.',
    ],
    highlights: ['192 hectáreas de bosque', 'Más de 350 especies exóticas y 70 autóctonas', 'Creado en 1896'],
    isFeatured: false,
    images: [
      {
        url: `${COMMONS}/e/ea/Arboretum_Lussich_01.jpg`,
        author: 'Rosina Peixoto',
        license: 'CC BY-SA 3.0',
        licenseUrl: CC_BY_SA_3,
        source: commonsFile('Arboretum_Lussich_01.jpg'),
      },
      {
        url: `${COMMONS}/b/b7/Arboretum_Lussich_02.jpg`,
        author: 'Rosina Peixoto',
        license: 'CC BY-SA 3.0',
        licenseUrl: CC_BY_SA_3,
        source: commonsFile('Arboretum_Lussich_02.jpg'),
      },
    ],
    sources: [
      'https://maldonado.gub.uy/noticias/arboretum-lussich-cuenta-nuevos-horarios-visita',
      'https://en.wikipedia.org/wiki/Lussich_Arboretum',
    ],
  },
  {
    name: 'Laguna del Sauce',
    locality: 'Punta Ballena',
    category: 'Naturaleza',
    description:
      'La mayor laguna del departamento y la fuente de agua potable de toda la zona de Maldonado y Punta del Este. Está rodeada de sierras y bosque, es punto de avistamiento de aves acuáticas y en sus orillas se practican deportes náuticos. A su vera está el Aeropuerto Internacional de Punta del Este.',
    lat: -34.807004,
    lng: -55.049402,
    address: 'Laguna del Sauce, Maldonado',
    phone: null,
    website: null,
    schedule: { general: 'Acceso libre' },
    priceRange: 'Gratis',
    facilities: ['Accesos públicos a la costa'],
    activities: ['Avistamiento de aves', 'Pesca deportiva', 'Kayak', 'Vela'],
    tips: ['Es la reserva de agua potable de la zona: no está permitido bañarse ni usar motores en todas las áreas.'],
    highlights: ['La laguna más grande del departamento', 'Avifauna', 'Deportes náuticos'],
    isFeatured: false,
    images: [
      {
        url: `${COMMONS}/thumb/f/f9/Atardecer_laguna_del_sauce.jpg/1280px-Atardecer_laguna_del_sauce.jpg`,
        author: 'Vicente Blanco',
        license: 'CC BY-SA 3.0',
        licenseUrl: CC_BY_SA_3,
        source: commonsFile('Atardecer_laguna_del_sauce.jpg'),
      },
    ],
    sources: ['https://www.maldonado.gub.uy/descubre-maldonado/atracciones-turisticas'],
  },

  // ==========================================================================
  // La Barra y Manantiales
  // ==========================================================================
  {
    name: 'Puente Leonel Viera (Puente de La Barra)',
    locality: 'La Barra',
    category: 'Monumentos',
    description:
      'El puente ondulado sobre el Arroyo Maldonado que une Punta del Este con La Barra. Lo proyectó el ingeniero uruguayo Leonel Viera y se inauguró en 1965; su sistema de puente colgante de tablero de hormigón fue una solución original que se replicó después en otros países. Las dos lomas que hay que pasar a velocidad moderada se volvieron parte de la experiencia de llegar a La Barra.',
    lat: -34.910999,
    lng: -54.872858,
    address: 'Ruta 10 sobre el Arroyo Maldonado, La Barra',
    phone: null,
    website: null,
    schedule: { general: 'Tránsito permanente' },
    priceRange: 'Gratis',
    facilities: ['Vereda peatonal'],
    activities: ['Fotografía', 'Caminata', 'Atardeceres sobre el arroyo'],
    tips: [
      'Hay que cruzarlo despacio: las ondulaciones son pronunciadas y a velocidad alta el auto se despega.',
      'Son dos puentes paralelos, uno por sentido; el original de Viera es el del lado este.',
    ],
    highlights: ['Obra de Leonel Viera (1965)', 'Puente ondulante', 'Entrada a La Barra'],
    isFeatured: true,
    images: [
      {
        url: `${COMMONS}/thumb/d/d8/Puente_Leonel_Viera_%28La_Barra_-_Punta_Del_Este%29.jpg/1280px-Puente_Leonel_Viera_%28La_Barra_-_Punta_Del_Este%29.jpg`,
        author: 'Joao Vicente',
        license: 'CC BY 2.0',
        licenseUrl: CC_BY_2,
        source: commonsFile('Puente_Leonel_Viera_(La_Barra_-_Punta_Del_Este).jpg'),
      },
      {
        url: `${COMMONS}/thumb/1/14/Ponte_Ondulada_de_Punta_Del_Este_%288452855931%29.jpg/1280px-Ponte_Ondulada_de_Punta_Del_Este_%288452855931%29.jpg`,
        author: 'Davi Sanchez',
        license: 'CC BY 2.0',
        licenseUrl: CC_BY_2,
        source: commonsFile('Ponte_Ondulada_de_Punta_Del_Este_(8452855931).jpg'),
      },
    ],
    sources: ['https://www.maldonado.gub.uy/descubre-maldonado/atracciones-turisticas'],
  },
  {
    name: 'La Barra',
    locality: 'La Barra',
    category: 'Balnearios',
    description:
      'Balneario sobre la Ruta 10, pasando el puente ondulado, con una calle principal de restaurantes, galerías de arte y locales de diseño, y playas oceánicas de buena rompiente. Combina el movimiento nocturno del verano con un perfil más tranquilo el resto del año.',
    lat: -34.9186,
    lng: -54.8833,
    address: 'Ruta 10, La Barra, Maldonado',
    phone: null,
    website: null,
    schedule: { general: 'Acceso libre' },
    priceRange: 'Gratis',
    facilities: ['Restaurantes', 'Galerías de arte', 'Comercios', 'Paradores'],
    activities: ['Playa', 'Surf', 'Gastronomía', 'Vida nocturna', 'Compras'],
    tips: ['La calle principal se corta al tránsito algunas noches de temporada; conviene estacionar antes.'],
    highlights: ['Calle principal de restaurantes y galerías', 'Playas de surf', 'Puente ondulado'],
    isFeatured: true,
    images: [
      {
        url: `${COMMONS}/thumb/0/05/En_La_Barra.JPG/1280px-En_La_Barra.JPG`,
        author: 'Rosina Peixoto',
        license: 'CC BY-SA 4.0',
        licenseUrl: CC_BY_SA_4,
        source: commonsFile('En_La_Barra.JPG'),
      },
      {
        url: `${COMMONS}/thumb/0/0a/Vista_de_La_Barra_desde_La_Gorgorita.JPG/1280px-Vista_de_La_Barra_desde_La_Gorgorita.JPG`,
        author: 'Rosina Peixoto',
        license: 'CC BY-SA 4.0',
        licenseUrl: CC_BY_SA_4,
        source: commonsFile('Vista_de_La_Barra_desde_La_Gorgorita.JPG'),
      },
    ],
    sources: ['https://www.maldonado.gub.uy/descubre-maldonado/atracciones-turisticas'],
  },
  {
    name: 'Playa Montoya',
    locality: 'La Barra',
    category: 'Playas',
    description:
      'La playa más conocida de La Barra, sobre el océano y con buena rompiente durante casi todo el año. Es sede habitual de campeonatos de surf y una de las playas más concurridas de la zona en temporada.',
    lat: -34.913171,
    lng: -54.843908,
    address: 'Ruta 10, La Barra, Maldonado',
    phone: null,
    website: null,
    schedule: { general: 'Acceso libre. Guardavidas en temporada estival' },
    priceRange: 'Gratis',
    facilities: ['Paradores', 'Guardavidas en temporada'],
    activities: ['Surf', 'Natación', 'Playa'],
    tips: ['Es playa oceánica de oleaje fuerte: bañarse frente al puesto de guardavidas.'],
    highlights: ['Rompiente para surf', 'Campeonatos de surf'],
    isFeatured: false,
    images: [
      {
        url: `${COMMONS}/thumb/3/3e/Vista_de_La_Barra_de_Maldonado_-_panoramio.jpg/1280px-Vista_de_La_Barra_de_Maldonado_-_panoramio.jpg`,
        author: 'Alejandro Sartor',
        license: 'CC BY 3.0',
        licenseUrl: CC_BY_3,
        source: commonsFile('Vista_de_La_Barra_de_Maldonado_-_panoramio.jpg'),
      },
    ],
    sources: ['https://www.maldonado.gub.uy/descubre-maldonado/playas'],
  },
  {
    name: 'Museo del Mar',
    locality: 'La Barra',
    category: 'Museos',
    description:
      'Museo fundado en 1996 en el barrio El Tesoro de La Barra. Reúne ejemplares de más de 10.000 especies marinas de todo el mundo, el esqueleto de una ballena de 20 metros, salas dedicadas a caracoles y a mamíferos marinos, y un acuario con caballitos de mar vivos. Suma además una muestra de fotografías antiguas sobre la historia de Punta del Este.',
    lat: -34.898947,
    lng: -54.870377,
    address: 'Calle de los Corsarios, barrio El Tesoro, La Barra, Maldonado',
    phone: '+598 4277 1817',
    website: null,
    schedule: {
      general: 'Todo el año de 10:00 a 17:30 · Desde mediados de diciembre, hasta las 20:00',
    },
    priceRange: 'Entrada paga',
    facilities: ['Salas de exposición', 'Acuario', 'Tienda'],
    activities: ['Visita al museo', 'Actividades para niños'],
    tips: ['En verano extiende el horario hasta las 20:00, así que se puede combinar con la tarde de playa.'],
    highlights: ['Más de 10.000 especies marinas', 'Esqueleto de ballena de 20 metros', 'Acuario de caballitos de mar'],
    isFeatured: false,
    images: [
      {
        url: `${COMMONS}/thumb/0/0f/Puente_Barra_Maldonado_%28Punta_del_Este%29.jpg/1280px-Puente_Barra_Maldonado_%28Punta_del_Este%29.jpg`,
        author: 'Axe',
        license: 'Dominio público',
        licenseUrl: null,
        source: commonsFile('Puente_Barra_Maldonado_(Punta_del_Este).jpg'),
      },
    ],
    sources: [
      'https://www.museos.gub.uy/index.php/museos/museos-por-localidad/maldonado/item/230-museo-del-mar',
    ],
  },
  {
    name: 'Manantiales',
    locality: 'Manantiales',
    category: 'Balnearios',
    description:
      'Balneario sobre la Ruta 10, entre La Barra y José Ignacio, de perfil más tranquilo y residencial. Su playa Bikini es una de las más elegidas del este, con paradores sobre la arena, y desde acá arranca el camino hacia José Ignacio.',
    lat: -34.905909,
    lng: -54.823862,
    address: 'Ruta 10, Manantiales, Maldonado',
    phone: null,
    website: null,
    schedule: { general: 'Acceso libre' },
    priceRange: 'Gratis',
    facilities: ['Paradores', 'Restaurantes', 'Comercios'],
    activities: ['Playa', 'Gastronomía', 'Deportes náuticos'],
    tips: ['Es el punto medio entre La Barra y José Ignacio, buena base para recorrer la Ruta 10.'],
    highlights: ['Playa Bikini', 'Paradores sobre la arena', 'Camino a José Ignacio'],
    isFeatured: true,
    images: [
      {
        url: `${COMMONS}/thumb/b/b5/Manantiales_Uruguay.jpg/1280px-Manantiales_Uruguay.jpg`,
        author: 'Marcelo Campi',
        license: 'CC BY-SA 4.0',
        licenseUrl: CC_BY_SA_4,
        source: commonsFile('Manantiales_Uruguay.jpg'),
      },
      {
        url: `${COMMONS}/thumb/a/aa/Terrazas_de_Manantiales_-_panoramio.jpg/1280px-Terrazas_de_Manantiales_-_panoramio.jpg`,
        author: 'Alejandro Sartor',
        license: 'CC BY 3.0',
        licenseUrl: CC_BY_3,
        source: commonsFile('Terrazas_de_Manantiales_-_panoramio.jpg'),
      },
    ],
    sources: ['https://www.maldonado.gub.uy/descubre-maldonado/atracciones-turisticas'],
  },

  // ==========================================================================
  // José Ignacio
  // ==========================================================================
  {
    name: 'Faro de José Ignacio',
    locality: 'José Ignacio',
    category: 'Monumentos',
    description:
      'El faro sobre la punta rocosa de José Ignacio, encendido en 1877 para señalizar este tramo de la costa atlántica. Sus 32 metros de torre dominan un pueblo de casas bajas entre dos playas —la mansa y la brava— y el paseo hasta su base es el recorrido clásico del lugar.',
    lat: -34.846267,
    lng: -54.632821,
    address: 'Calle 8, José Ignacio, Maldonado',
    phone: null,
    website: null,
    schedule: null,
    priceRange: null,
    facilities: ['Restaurantes cercanos', 'Estacionamiento'],
    activities: ['Fotografía', 'Caminata por la punta', 'Atardeceres'],
    tips: [
      'Las visitas al interior del faro dependen de la Armada y no siempre están habilitadas.',
      'La punta separa la playa mansa de la brava: se pasa de una a otra caminando.',
    ],
    highlights: ['En servicio desde 1877', '32 metros de altura', 'Entre la playa mansa y la brava'],
    isFeatured: true,
    images: [
      {
        url: `${COMMONS}/thumb/a/a2/Faro_de_Jos%C3%A9_Ignacio_-_Maldonado_-_Uruguay.JPG/1280px-Faro_de_Jos%C3%A9_Ignacio_-_Maldonado_-_Uruguay.JPG`,
        author: 'Lorisstragliotto',
        license: 'CC BY-SA 3.0',
        licenseUrl: CC_BY_SA_3,
        source: commonsFile('Faro_de_José_Ignacio_-_Maldonado_-_Uruguay.JPG'),
      },
      {
        url: `${COMMONS}/thumb/f/fc/Faro_Jos%C3%A9_Ignacio.jpg/1280px-Faro_Jos%C3%A9_Ignacio.jpg`,
        author: 'Tano4595',
        license: 'CC BY-SA 3.0',
        licenseUrl: CC_BY_SA_3,
        source: commonsFile('Faro_José_Ignacio.jpg'),
      },
    ],
    sources: ['https://www.maldonado.gub.uy/descubre-maldonado/atracciones-turisticas'],
  },

  // ==========================================================================
  // Ciudad de Maldonado
  // ==========================================================================
  {
    name: 'Catedral de San Fernando de Maldonado',
    locality: 'Maldonado',
    category: 'Monumentos',
    description:
      'La iglesia matriz de Maldonado, frente a la Plaza San Fernando. Su construcción arrancó en 1801 y se extendió durante casi un siglo, atravesando las guerras del período; fue elevada a catedral en 1966, al crearse la Diócesis de Maldonado-Punta del Este. Es el edificio que ordena el centro histórico de la ciudad.',
    lat: -34.908799,
    lng: -54.959048,
    address: '18 de Julio y Sarandí, Plaza San Fernando, Maldonado',
    phone: null,
    website: null,
    schedule: null,
    priceRange: 'Gratis',
    facilities: [],
    activities: ['Visita al centro histórico', 'Fotografía'],
    tips: ['Está sobre la Plaza San Fernando, a metros del Cuartel de Dragones y la Torre del Vigía.'],
    highlights: ['Construcción iniciada en 1801', 'Catedral desde 1966', 'Frente a la Plaza San Fernando'],
    isFeatured: false,
    images: [
      {
        url: `${COMMONS}/thumb/3/34/Catedral_de_Maldonado_-_Mirada_a_la_luna.jpg/1280px-Catedral_de_Maldonado_-_Mirada_a_la_luna.jpg`,
        author: 'Dyegocortinas',
        license: 'CC BY-SA 3.0',
        licenseUrl: CC_BY_SA_3,
        source: commonsFile('Catedral_de_Maldonado_-_Mirada_a_la_luna.jpg'),
      },
      {
        url: `${COMMONS}/thumb/2/28/Catedral_Plaza_principal_de_Maldonado.JPG/1280px-Catedral_Plaza_principal_de_Maldonado.JPG`,
        author: 'Colocrado',
        license: 'CC BY-SA 3.0',
        licenseUrl: CC_BY_SA_3,
        source: commonsFile('Catedral_Plaza_principal_de_Maldonado.JPG'),
      },
    ],
    sources: ['https://www.maldonado.gub.uy/descubre-maldonado/atracciones-turisticas'],
  },
  {
    name: 'Cuartel de Dragones',
    locality: 'Maldonado',
    category: 'Monumentos',
    description:
      'Cuartel colonial levantado por la corona española a fines del siglo XVIII para alojar al cuerpo de Dragones que defendía la plaza de Maldonado. Es uno de los conjuntos de arquitectura militar colonial mejor conservados del país, Monumento Histórico Nacional, y hoy alberga actividades culturales y actos oficiales.',
    lat: -34.909616,
    lng: -54.959243,
    address: 'Rafael Pérez del Puerto y 18 de Julio, Maldonado',
    phone: null,
    website: null,
    schedule: null,
    priceRange: 'Gratis',
    facilities: ['Patio central', 'Salas'],
    activities: ['Visita histórica', 'Actividades culturales'],
    tips: ['Forma parte del circuito histórico del centro, junto a la Catedral y la Torre del Vigía.'],
    highlights: ['Arquitectura militar colonial', 'Monumento Histórico Nacional', 'Sede de actividades culturales'],
    isFeatured: false,
    images: [
      {
        url: `${COMMONS}/thumb/c/ce/Cuartel_de_Dragones_-_Maldonado.JPG/1280px-Cuartel_de_Dragones_-_Maldonado.JPG`,
        author: 'Rosina Peixoto',
        license: 'CC BY-SA 3.0',
        licenseUrl: CC_BY_SA_3,
        source: commonsFile('Cuartel_de_Dragones_-_Maldonado.JPG'),
      },
      {
        url: `${COMMONS}/thumb/7/7e/Cuartel_de_Dragones.jpg/1280px-Cuartel_de_Dragones.jpg`,
        author: 'Rosina Peixoto',
        license: 'CC0',
        licenseUrl: CC0,
        source: commonsFile('Cuartel_de_Dragones.jpg'),
      },
    ],
    sources: ['https://www.maldonado.gub.uy/descubre-maldonado/atracciones-turisticas'],
  },
  {
    name: 'Torre del Vigía',
    locality: 'Maldonado',
    category: 'Monumentos',
    description:
      'Torre de vigilancia del siglo XIX desde la que se controlaba la entrada de embarcaciones a la bahía de Maldonado y se avisaba a la ciudad. Es uno de los símbolos del casco histórico y está a metros del Cuartel de Dragones.',
    lat: -34.910424,
    lng: -54.96143,
    address: 'Rafael Pérez del Puerto y Sarandí, Maldonado',
    phone: null,
    website: null,
    schedule: null,
    priceRange: 'Gratis',
    facilities: [],
    activities: ['Visita histórica', 'Fotografía'],
    tips: ['Se recorre junto con el Cuartel de Dragones y la Catedral en una caminata corta por el centro.'],
    highlights: ['Torre de vigilancia del siglo XIX', 'Casco histórico de Maldonado'],
    isFeatured: false,
    images: [
      {
        url: `${COMMONS}/thumb/8/80/Torre_del_Vigia_-_Maldonado.JPG/1280px-Torre_del_Vigia_-_Maldonado.JPG`,
        author: 'Rosina Peixoto',
        license: 'CC BY-SA 3.0',
        licenseUrl: CC_BY_SA_3,
        source: commonsFile('Torre_del_Vigia_-_Maldonado.JPG'),
      },
    ],
    sources: ['https://www.maldonado.gub.uy/descubre-maldonado/atracciones-turisticas'],
  },
  {
    name: 'Museo Regional Francisco Mazzoni',
    locality: 'Maldonado',
    category: 'Museos',
    description:
      'Museo de sitio en una casona de 1782 que el profesor Francisco Mazzoni reconstruyó como su residencia y llenó de objetos del pasado colonial y patricio de la región. Donó la casa y su colección al Estado en 1969. Se conserva el mobiliario y la distribución original de la vivienda.',
    lat: -34.907438,
    lng: -54.958074,
    address: 'Ituzaingó 789, Maldonado',
    phone: '+598 4222 1107',
    website: 'https://museomazzoni.uy',
    schedule: { general: 'Martes a sábado de 10:00 a 19:00 · Domingos y lunes cerrado' },
    priceRange: 'Gratis',
    facilities: ['Salas de exposición', 'Patio'],
    activities: ['Visita al museo', 'Muestras temporales', 'Charlas y presentaciones'],
    tips: ['Cierra domingos y lunes, que es cuando más gente lo intenta visitar.'],
    highlights: ['Casona de 1782', 'Colección colonial y patricia', 'Entrada gratuita'],
    isFeatured: false,
    images: [
      {
        url: `${COMMONS}/thumb/f/fb/Museo_Francisco_Mazzoni_1.JPG/1280px-Museo_Francisco_Mazzoni_1.JPG`,
        author: 'Rosina Peixoto',
        license: 'CC BY-SA 3.0',
        licenseUrl: CC_BY_SA_3,
        source: commonsFile('Museo_Francisco_Mazzoni_1.JPG'),
      },
      {
        url: `${COMMONS}/b/b0/Museo_Regional_Francisco_Mazzoni_1.jpg`,
        author: 'Rosina Peixoto',
        license: 'CC BY-SA 3.0',
        licenseUrl: CC_BY_SA_3,
        source: commonsFile('Museo_Regional_Francisco_Mazzoni_1.jpg'),
      },
    ],
    sources: [
      'https://www.maldonado.gub.uy/noticias/horarios-museos-salas-expositivas-maldonado',
      'http://www.museos.gub.uy/index.php?option=com_k2&view=item&id=61:museo-regional-francisco-mazzoni',
    ],
  },
  {
    name: 'Plaza San Fernando',
    locality: 'Maldonado',
    category: 'Plazas',
    description:
      'La plaza fundacional de Maldonado y el centro de la vida de la ciudad. La rodean la Catedral de San Fernando y los edificios del casco histórico, y en ella se hacen los actos oficiales, las ferias y buena parte de la agenda cultural al aire libre.',
    lat: -34.908765,
    lng: -54.958202,
    address: 'Sarandí y 18 de Julio, Maldonado',
    phone: null,
    website: null,
    schedule: { general: 'Acceso libre' },
    priceRange: 'Gratis',
    facilities: ['Bancos', 'Juegos', 'Wifi público'],
    activities: ['Ferias', 'Espectáculos al aire libre', 'Paseo'],
    tips: ['Es el punto de partida natural para recorrer el casco histórico a pie.'],
    highlights: ['Plaza fundacional', 'Frente a la Catedral', 'Sede de ferias y espectáculos'],
    isFeatured: false,
    images: [
      {
        url: `${COMMONS}/thumb/1/11/Artigas_en_Plaza_San_Fernando.JPG/1280px-Artigas_en_Plaza_San_Fernando.JPG`,
        author: 'Rosina Peixoto',
        license: 'CC BY-SA 3.0',
        licenseUrl: CC_BY_SA_3,
        source: commonsFile('Artigas_en_Plaza_San_Fernando.JPG'),
      },
    ],
    sources: ['https://www.maldonado.gub.uy/descubre-maldonado/atracciones-turisticas'],
  },
  {
    name: 'Casa de la Cultura de Maldonado',
    locality: 'Maldonado',
    category: 'Cultura',
    description:
      'El centro cultural de la Intendencia de Maldonado. Aloja el Museo San Fernando, el teatro y el foyer "María Emma Núñez", y concentra buena parte de la agenda cultural del departamento: teatro, música, presentaciones de libros y muestras, en general con entrada libre.',
    lat: -34.910221,
    lng: -54.957308,
    address: 'Rafael Pérez del Puerto y Sarandí, Maldonado',
    phone: '+598 4223 1786',
    website: 'https://www.maldonado.gub.uy/cultura',
    schedule: { museoSanFernando: 'Lunes a sábado de 9:00 a 19:00' },
    priceRange: 'Gratis',
    facilities: ['Teatro', 'Salas de exposición', 'Museo San Fernando'],
    activities: ['Teatro', 'Conciertos', 'Muestras', 'Talleres'],
    tips: ['Los horarios del museo y los de las funciones del teatro son distintos; la agenda se publica por función.'],
    highlights: ['Museo San Fernando', 'Teatro y foyer María Emma Núñez', 'Acceso libre y gratuito'],
    isFeatured: false,
    images: [
      {
        url: `${COMMONS}/thumb/9/95/Torre_del_Vig%C3%ADa%2C_Maldonado.jpg/1280px-Torre_del_Vig%C3%ADa%2C_Maldonado.jpg`,
        author: 'Rosina Peixoto',
        license: 'CC BY-SA 3.0',
        licenseUrl: CC_BY_SA_3,
        source: commonsFile('Torre_del_Vigía,_Maldonado.jpg'),
      },
    ],
    sources: ['https://www.maldonado.gub.uy/noticias/horarios-museos-salas-expositivas-maldonado'],
  },

  // ==========================================================================
  // Resto del departamento
  // ==========================================================================
  {
    name: 'Cerro San Antonio',
    locality: 'Piriápolis',
    category: 'Naturaleza',
    description:
      'El cerro que cierra Piriápolis por el este, con un mirador desde el que se ve toda la bahía, la rambla y el Argentino Hotel. Se sube por camino vehicular o por la aerosilla, y en la cima hay una capilla y un parador.',
    lat: -34.878172,
    lng: -55.274025,
    address: 'Piriápolis, Maldonado',
    phone: null,
    website: null,
    schedule: { general: 'Acceso libre. La aerosilla funciona en temporada' },
    priceRange: 'Gratis (la aerosilla se paga)',
    facilities: ['Mirador', 'Parador', 'Aerosilla', 'Estacionamiento'],
    activities: ['Mirador panorámico', 'Aerosilla', 'Senderismo', 'Fotografía'],
    tips: ['La aerosilla no funciona todo el año; fuera de temporada se sube por el camino vehicular.'],
    highlights: ['Mirador sobre la bahía de Piriápolis', 'Aerosilla', 'Capilla en la cima'],
    isFeatured: false,
    images: [
      {
        url: `${COMMONS}/4/46/Cerro_San_Antonio.jpg`,
        author: 'Marianocecowski',
        license: 'CC BY-SA 3.0',
        licenseUrl: CC_BY_SA_3,
        source: commonsFile('Cerro_San_Antonio.jpg'),
      },
    ],
    sources: ['https://www.maldonado.gub.uy/descubre-maldonado/atracciones-turisticas'],
  },
  {
    name: 'Argentino Hotel',
    locality: 'Piriápolis',
    category: 'Monumentos',
    description:
      'El hotel que Francisco Piria mandó construir frente a la rambla de Piriápolis y que se inauguró en 1930. Fue en su momento el más grande de Sudamérica y es la construcción que define la postal del balneario, con su casino y sus baños de agua de mar.',
    lat: -34.862717,
    lng: -55.278378,
    address: 'Rambla de los Argentinos, Piriápolis, Maldonado',
    phone: null,
    website: null,
    schedule: null,
    priceRange: null,
    facilities: ['Hotel', 'Casino', 'Restaurantes'],
    activities: ['Alojamiento', 'Casino', 'Fotografía'],
    tips: ['Está sobre la rambla, en el centro de Piriápolis: se llega caminando desde cualquier punto del balneario.'],
    highlights: ['Inaugurado en 1930', 'Obra de Francisco Piria', 'Postal de Piriápolis'],
    isFeatured: false,
    images: [
      {
        url: `${COMMONS}/thumb/9/90/Argentino_Hotel%2C_Pir%C3%ADapolis.jpg/1280px-Argentino_Hotel%2C_Pir%C3%ADapolis.jpg`,
        author: 'Marianocecowski',
        license: 'CC BY-SA 3.0',
        licenseUrl: CC_BY_SA_3,
        source: commonsFile('Argentino_Hotel,_Piríapolis.jpg'),
      },
      {
        url: `${COMMONS}/thumb/6/61/Piriapolis%2C_rambla.JPG/1280px-Piriapolis%2C_rambla.JPG`,
        author: 'Rosina Peixoto',
        license: 'CC BY-SA 3.0',
        licenseUrl: CC_BY_SA_3,
        source: commonsFile('Piriapolis,_rambla.JPG'),
      },
    ],
    sources: ['https://www.maldonado.gub.uy/descubre-maldonado/atracciones-turisticas'],
  },
  {
    name: 'Cerro Pan de Azúcar',
    locality: 'Pan de Azúcar',
    category: 'Naturaleza',
    description:
      'Uno de los puntos más altos del Uruguay, con 423 metros, coronado por una cruz de hormigón de 35 metros a la que se puede subir por su escalera interior. En sus laderas está la Reserva de Fauna Autóctona Cerro Pan de Azúcar y desde la cima se ve buena parte del departamento.',
    lat: -34.81023,
    lng: -55.25869,
    address: 'Ruta 37, Pan de Azúcar, Maldonado',
    phone: null,
    website: null,
    schedule: null,
    priceRange: 'Gratis',
    facilities: ['Sendero de ascenso', 'Reserva de fauna', 'Estacionamiento'],
    activities: ['Senderismo', 'Ascenso a la cruz', 'Avistamiento de fauna', 'Fotografía'],
    tips: [
      'El ascenso es exigente: calzado cerrado y agua, y conviene evitar las horas de más calor.',
      'La reserva de fauna al pie del cerro tiene su propio horario, distinto al del sendero.',
    ],
    highlights: ['423 metros de altura', 'Cruz de hormigón de 35 metros', 'Reserva de fauna autóctona'],
    isFeatured: false,
    images: [
      {
        url: `${COMMONS}/d/df/Cerro_Pan_de_Az%C3%BAcar_%28Maldonado%29.jpg`,
        author: 'Ezarate',
        license: 'CC BY-SA 4.0',
        licenseUrl: CC_BY_SA_4,
        source: commonsFile('Cerro_Pan_de_Azúcar_(Maldonado).jpg'),
      },
      {
        url: `${COMMONS}/0/0b/Cerro_Pan_de_Az%C3%BAcar_01.jpg`,
        author: 'Rosina Peixoto',
        license: 'CC BY-SA 3.0',
        licenseUrl: CC_BY_SA_3,
        source: commonsFile('Cerro_Pan_de_Azúcar_01.jpg'),
      },
    ],
    sources: ['https://www.maldonado.gub.uy/descubre-maldonado/atracciones-turisticas'],
  },
  {
    name: 'Sierra de las Ánimas',
    locality: 'Solís Grande',
    category: 'Naturaleza',
    description:
      'Cadena serrana en el límite entre Maldonado y Lavalleja, con cerros que superan los 500 metros, cascadas y bosque nativo. Es área protegida y uno de los destinos de trekking más buscados del sur del país; el acceso al circuito de senderos está regulado.',
    lat: -34.7362,
    lng: -55.3181,
    address: 'Ruta 60, Sierra de las Ánimas, Maldonado',
    phone: null,
    website: null,
    schedule: null,
    priceRange: null,
    facilities: ['Senderos', 'Área de acampe'],
    activities: ['Trekking', 'Avistamiento de aves', 'Cascadas', 'Acampe'],
    tips: [
      'El acceso está regulado y hay que coordinarlo antes: no se entra por cualquier lado.',
      'Es una jornada larga de caminata; hay que llevar agua, comida y salir temprano.',
    ],
    highlights: ['Cerros de más de 500 metros', 'Cascadas y bosque nativo', 'Área protegida'],
    isFeatured: false,
    images: [
      {
        url: `${COMMONS}/thumb/7/7f/Sierra_de_las_Animas.jpg/1280px-Sierra_de_las_Animas.jpg`,
        author: 'Jimmy Baikovicius',
        license: 'CC BY-SA 2.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0',
        source: commonsFile('Sierra_de_las_Animas.jpg'),
      },
    ],
    sources: ['https://www.maldonado.gub.uy/descubre-maldonado/atracciones-turisticas'],
  },
];
