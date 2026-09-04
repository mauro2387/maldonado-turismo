import { DivIcon } from 'leaflet';

/**
 * La parada, dibujada.
 *
 * Había tres marcadores distintos para lo mismo —un círculo gris en el mapa
 * general, otro más chico en Bondis en vivo, un punto de 8 px en el viaje— y
 * ninguno se parecía a una parada: eran puntos, iguales a los que marcan
 * cualquier otra cosa. Acá hay uno solo, con forma de cartel de parada, y lo
 * usan las tres pantallas.
 *
 * ## Lo que dice el marcador además de "acá hay una parada"
 *
 * **Cuán seguros estamos de dónde está.** La coordenada de una parada es una
 * medición (ver `StopPlacementService`) y cada una viene con su error en
 * metros. Cuando el error es chico el marcador es macizo: quiere decir "es
 * acá, este cartel". Cuando es grande el aro va punteado y el relleno pálido:
 * la parada existe y el ómnibus para ahí, pero el punto exacto no está
 * confirmado y hay que mirar alrededor.
 *
 * Esa diferencia no es un adorno. Un marcador macizo sobre una esquina
 * equivocada manda a alguien a esperar donde el ómnibus no para, y después no
 * vuelve a creerle a la app. Un aro punteado dice la verdad: "por acá".
 *
 * ## Por qué crece con el zoom
 *
 * Son más de mil paradas. De lejos tienen que ser una textura que muestre por
 * dónde pasa el transporte sin tapar el callejero; de cerca, algo que se pueda
 * tocar con el dedo. El glifo del cartel aparece recién cuando hay píxeles
 * para que se lea; abajo de eso sería una mancha.
 */

/**
 * El verde mar de la paleta, que en esta app es el color del transporte.
 *
 * No el tinta casi negro que tenía antes: sobre el callejero claro, mil
 * círculos negros se leen como suciedad y compiten con los lugares y los
 * eventos, que son los otros dos pines del mapa. El verde mar los separa de
 * los dos y además los ata a la línea de ómnibus, que ya usa este color.
 */
export const STOP_ACCENT = '#0E7C86';

/** El aro de la parada donde te subís, en el coral de la app. */
export const STOP_BOARDING = '#DC4227';

/**
 * Hasta qué error se dibuja la parada como un punto firme.
 *
 * Es el mismo número que usa el backend para decidir si puede decir "esperá
 * acá" (`PRECISE_ENOUGH_M`). Una cuadra de Maldonado son 80-100 m: con 60 m la
 * parada está a lo sumo en la esquina de al lado y se la ve desde donde uno
 * llega.
 */
export const PRECISE_ENOUGH_M = 60;

export interface StopMarkerOptions {
  /** Zoom actual del mapa. Decide el tamaño y si entra el glifo. */
  zoom?: number;
  /** La parada donde hay que subirse: se agranda y cambia de color. */
  boarding?: boolean;
  /**
   * Radio en metros dentro del cual está la parada de verdad. `null` es una
   * parada que todavía no pasó por la medición, y se dibuja como firme para no
   * degradar de golpe todo lo que ya estaba en pantalla.
   */
  accuracyM?: number | null;
  /** Forzar el estado firme/aproximado sin pasar el error. */
  reliable?: boolean;
}

/** Tamaño del marcador según el zoom. */
function sizeFor(zoom: number, boarding: boolean): number {
  if (boarding) return 30;
  if (zoom >= 17) return 24;
  if (zoom >= 16) return 20;
  if (zoom >= 15) return 16;
  if (zoom >= 14) return 11;
  return 8;
}

/**
 * El cartel de parada: el poste con la chapa arriba y el ómnibus dibujado en
 * la chapa.
 *
 * Es el cartel y no un ómnibus suelto, que es lo que usan casi todas las apps.
 * La diferencia importa acá: en Bondis en vivo los ómnibus **están** en el
 * mapa, moviéndose, y un segundo dibujo de ómnibus a diez metros del primero
 * se lee como otro coche. El poste dice lo que hay que decir, que es "el lugar
 * donde se espera", y es además lo que uno busca con la vista cuando llega a
 * la esquina.
 */
const SIGN_GLYPH =
  // La chapa, con el hueco del ómnibus recortado en blanco.
  '<path d="M6.1 3.9h7.8a1.7 1.7 0 0 1 1.7 1.7v3.6a1.7 1.7 0 0 1-1.7 1.7H6.1A1.7 1.7 0 0 1 4.4 9.2V5.6a1.7 1.7 0 0 1 1.7-1.7Z" fill="currentColor"/>' +
  '<rect x="6.5" y="5.7" width="7" height="2.4" rx="0.6" fill="#fff"/>' +
  '<circle cx="7.9" cy="8.9" r="0.72" fill="#fff"/>' +
  '<circle cx="12.1" cy="8.9" r="0.72" fill="#fff"/>' +
  // El poste.
  '<rect x="9.25" y="10.6" width="1.5" height="4.6" rx="0.75" fill="currentColor"/>';

/**
 * El marcador de una parada.
 *
 * Se devuelve un `DivIcon` y no un `Icon` con imagen porque el estado —zoom,
 * subida, precisión— cambia el dibujo, y una imagen por combinación serían
 * treinta archivos.
 */
export function stopMarker({
  zoom = 15,
  boarding = false,
  accuracyM = null,
  reliable,
}: StopMarkerOptions = {}): DivIcon {
  const firme = reliable ?? (accuracyM === null || accuracyM <= PRECISE_ENOUGH_M);
  const size = sizeFor(zoom, boarding);
  const color = boarding ? STOP_BOARDING : STOP_ACCENT;

  // El glifo necesita píxeles para leerse. Abajo de 16 el cartel es una mancha
  // y se dibuja el punto pelado, que a esa escala es lo correcto: marca dónde
  // hay una parada sin pretender que se distinga cuál.
  const conGlifo = size >= 16;
  const grosor = size >= 20 ? 2.4 : size >= 14 ? 2 : 1.6;

  // El aro punteado es lo que distingue "es acá" de "por acá". Se dibuja con
  // dashes cortos sobre el borde del círculo; el largo sale del perímetro para
  // que queden parejos en cualquier tamaño.
  const perimetro = Math.PI * (size - grosor);
  const raya = Math.max(2, perimetro / 12);

  const cuerpo = conGlifo
    ? `<svg width="${size}" height="${size}" viewBox="0 0 20 20" style="display:block">
         <circle cx="10" cy="10" r="${(20 - grosor * (20 / size)) / 2}"
                 fill="${firme ? '#fff' : 'rgba(255,255,255,.88)'}"
                 stroke="${color}" stroke-width="${grosor * (20 / size)}"
                 stroke-opacity="${firme ? 1 : 0.75}"
                 ${firme ? '' : `stroke-dasharray="${raya * (20 / size)} ${raya * (20 / size)}"`}
                 stroke-linecap="round" />
         <g color="${color}" opacity="${firme ? 1 : 0.72}">${SIGN_GLYPH}</g>
       </svg>`
    : `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;
         background:${firme ? '#fff' : 'rgba(255,255,255,.85)'};
         border:${grosor}px ${firme ? 'solid' : 'dashed'} ${color};
         opacity:${firme ? 1 : 0.8};"></span>`;

  return new DivIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html:
      `<div style="width:${size}px;height:${size}px;` +
      `filter:drop-shadow(0 1px 2px rgba(11,31,51,.35));">${cuerpo}</div>`,
  });
}

/**
 * Un punto chico, para las paradas intermedias de un viaje ya dibujado.
 *
 * Ahí el marcador completo sobra: la línea ya dice por dónde va y estas
 * paradas son referencias para ubicarse, no lugares a los que hay que ir. La
 * de subida y la de bajada llevan el marcador entero.
 */
export function stopDot(color: string): DivIcon {
  return new DivIcon({
    className: '',
    iconSize: [9, 9],
    iconAnchor: [4.5, 4.5],
    html:
      '<span style="display:block;width:9px;height:9px;border-radius:50%;' +
      `background:#fff;border:2.5px solid ${color};` +
      'box-shadow:0 1px 2px rgba(11,31,51,.35);"></span>',
  });
}
