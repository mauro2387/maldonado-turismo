import { DivIcon } from 'leaflet';
import { initialFor, paletteFor } from '@lib/fallbackPalette';

/**
 * El marcador de un lugar: una bolita con su foto.
 *
 * Antes eran gotas idénticas con un punto blanco adentro. En un mapa con
 * treinta lugares eso no dice nada: hay que tocar uno por uno para saber qué
 * es cada cual, y la única diferencia entre el Arboretum y una parrilla era la
 * posición. Con la foto adentro, el mapa se lee sin tocarlo —y de paso se ve
 * como se espera que se vea el mapa de una app de turismo—.
 *
 * La colita de abajo no es decoración: una bolita sola marca su **centro** en
 * el punto, y entonces el marcador tapa justo lo que señala. Con la punta
 * abajo, el punto exacto queda libre y el dibujo queda arriba.
 *
 * Cuando no hay foto no se deja el hueco: va el respaldo de color con la
 * inicial, el mismo que usa `Thumb` en las listas, así que el lugar se ve
 * igual en los dos lados.
 */

/**
 * El tamaño de la bolita según el zoom.
 *
 * De lejos tiene que ser chica para que treinta no tapen el callejero; de
 * cerca tiene que ser lo bastante grande como para reconocer la foto. Debajo
 * de 30 px una foto no se distingue de una mancha de color, y ése es el piso.
 */
const SIZE_BY_ZOOM: Record<number, number> = { 12: 30, 13: 34, 14: 38, 15: 44, 16: 50 };

/** Lo que mide la punta que señala el punto. */
const TAIL_PX = 7;

function sizeFor(zoom: number): number {
  return SIZE_BY_ZOOM[Math.round(zoom)] ?? (zoom < 12 ? 28 : 50);
}

/** Los nombres y las URL vienen de la base y terminan en innerHTML. */
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] as string,
  );
}

/**
 * La misma foto, del tamaño que hace falta —o nada.
 *
 * Las fotos originales pesan medio mega cada una: treinta marcadores serían
 * diecisiete megas para dibujar treinta círculos de cuarenta píxeles, en una
 * app que se usa con datos móviles en la calle. Las de los lugares están en
 * Supabase Storage y eso tiene arreglo: su transformador devuelve la misma
 * foto recortada al cuadrado en menos de dos kilobytes, y se pide cambiando
 * `object` por `render/image` en la URL.
 *
 * Las de los eventos no. Nueve de ellas apuntan a sitios de terceros
 * -`cadenadelmar.uy`, `maldonado.gub.uy`- que sirven el archivo entero y a los
 * que no se les puede pedir un recorte. Para ésas se devuelve **null** y el
 * marcador usa el respaldo de color: un círculo de cuarenta píxeles no vale
 * medio mega de datos ajenos, y encima de un mapa que se está moviendo la foto
 * llegaría tarde de todas formas.
 *
 * Cuando esas fotos pasen a Supabase Storage -como ya pasó con las de los
 * lugares, por lo mismo- van a aparecer solas.
 */
export function thumbUrl(url: string, size: number): string | null {
  const marca = '/storage/v1/object/public/';
  if (!url.includes(marca)) return null;

  const px = Math.round(size);
  return (
    url.replace(marca, '/storage/v1/render/image/public/') +
    `?width=${px}&height=${px}&resize=cover&quality=70`
  );
}

/**
 * Los iconos ya armados, para no rehacerlos en cada renderizado.
 *
 * El mapa guarda el encuadre en estado de React, así que **cada paneo**
 * redibuja la página entera; sin esta caché, cada arrastre construía treinta y
 * siete `DivIcon` nuevos, Leaflet reemplazaba los nodos y las fotos volvían a
 * pedirse. Se veía como un parpadeo de todos los marcadores al mover el mapa.
 *
 * Compartir una instancia de icono entre marcadores es la forma normal de
 * usarlos en Leaflet: `createIcon()` arma un elemento nuevo en cada llamada.
 *
 * La clave incluye el tamaño y si está elegido, que es todo lo que cambia el
 * dibujo. La foto no: es siempre la primera del lugar.
 */
const CACHE = new Map<string, DivIcon>();

export function photoMarker({
  name,
  imageUrl,
  zoom,
  selected = false,
}: {
  name: string;
  imageUrl?: string | null;
  zoom: number;
  selected?: boolean;
}): DivIcon {
  const size = sizeFor(selected ? Math.max(zoom, 15) : zoom);

  const key = `${name}|${imageUrl ?? ''}|${size}|${selected}`;
  const cached = CACHE.get(key);
  if (cached) return cached;
  const height = size + TAIL_PX;

  /*
   * El respaldo va **debajo** de la foto y no en lugar de ella.
   *
   * Una foto que no carga no avisa: `background-image` no tiene `onerror`, así
   * que si se dibujara sólo la foto, la bolita quedaría blanca y vacía. Y no
   * es un caso raro: nueve de los eventos apuntan a dominios de terceros que
   * bloquean el enlace directo. Con el color y la inicial pintados abajo, una
   * foto que falla se ve exactamente como un lugar que no tiene foto, que es
   * lo correcto.
   */
  const [from, to] = paletteFor(name);
  const respaldo = `background:linear-gradient(135deg,${from} 0%,${to} 100%);`;

  const inicial = `<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
                    color:rgba(255,255,255,.85);font:800 ${Math.round(size * 0.42)}px/1 Archivo,system-ui,sans-serif;">
         ${escapeHtml(initialFor(name))}
       </span>`;

  // Al doble, para que no se vea borrosa en pantallas de teléfono.
  const recorte = imageUrl ? thumbUrl(imageUrl, size * 2) : null;
  const foto = recorte
    ? `<span style="position:absolute;inset:0;background-image:url('${escapeHtml(recorte)}');
                    background-size:cover;background-position:center;"></span>`
    : '';

  // El aro es lo que despega la foto del mapa: sin él, una foto de arena sobre
  // una playa no tiene borde y deja de leerse como marcador.
  const aro = selected ? '3px solid #DC4227' : '2.5px solid #fff';

  const icon = new DivIcon({
    className: '',
    iconSize: [size, height],
    // La punta de la colita, que es el punto exacto.
    iconAnchor: [size / 2, height],
    html: `
      <div style="position:relative;width:${size}px;height:${height}px;">
        <span style="position:absolute;left:50%;bottom:${TAIL_PX - 2}px;transform:translateX(-50%);
                     width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;
                     border-top:${TAIL_PX}px solid ${selected ? '#DC4227' : '#fff'};
                     filter:drop-shadow(0 1px 1px rgba(11,31,51,.3));"></span>
        <span style="position:absolute;top:0;left:0;width:${size}px;height:${size}px;border-radius:50%;
                     border:${aro};box-sizing:border-box;overflow:hidden;
                     box-shadow:0 2px 6px rgba(11,31,51,.35);${respaldo}">${inicial}${foto}</span>
      </div>`,
  });

  CACHE.set(key, icon);
  return icon;
}

/**
 * La primera foto utilizable de un lugar o un evento.
 *
 * Las dos entidades guardan las fotos igual —un arreglo— pero los eventos
 * usan `gallery` y a veces `image`. Se pide una sola: el marcador muestra una.
 */
export function firstImage(
  item: { images?: string[] | null; gallery?: string[] | null; image?: string | null },
): string | null {
  return item.images?.[0] ?? item.gallery?.[0] ?? item.image ?? null;
}
