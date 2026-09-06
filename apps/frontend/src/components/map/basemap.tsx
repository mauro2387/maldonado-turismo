import { useEffect } from 'react';
import { TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';

/**
 * El fondo del mapa, en un solo lugar.
 *
 * Va por el callejero estándar de OpenStreetMap, en imágenes. Es el mapa que
 * todo el mundo reconoce: calles jerarquizadas en amarillo y blanco, manzanas
 * en arena, plazas y montes en verde, los juncales de la laguna rayados y los
 * escudos de ruta. Es el que se pidió y el que la gente ya sabe leer.
 *
 * Antes esto era vectorial (MapLibre sobre Leaflet, estilo `liberty` de
 * OpenFreeMap). Se cambió por dos motivos, y el segundo es el importante:
 *
 * 1. El estilo no era el que se quería.
 *
 * 2. **El mapa desaparecía solo.** El fondo vectorial se dibuja en un canvas
 *    WebGL, y el navegador tiene un tope de contextos WebGL vivos a la vez
 *    -del orden de 16 en Chrome de escritorio y bastante menos en un teléfono-.
 *    Al pasarse, el navegador mata los contextos más viejos sin avisar y esos
 *    canvas quedan **en blanco para siempre**: el mapa se veía bien y de un
 *    momento a otro no estaba más. Acá se abrían contextos de a dos por
 *    pantalla: uno por cada mapa montado -Mapa, Bondis en vivo y el
 *    planificador- y otro más, que ni siquiera se usaba para dibujar, cada vez
 *    que se preguntaba si había WebGL, porque esa prueba creaba un canvas que
 *    no se liberaba nunca. Ir y venir entre pantallas los iba acumulando hasta
 *    que se rompía.
 *
 * Un raster no tiene nada de eso: son `<img>` que Leaflet mete y saca del DOM,
 * sin contexto gráfico que perder ni tope que agotar. Encima anda igual en
 * navegadores con la aceleración por hardware apagada, así que tampoco hace
 * falta el fondo de respaldo que había antes.
 */

/**
 * Los tiles del estilo estándar de OpenStreetMap.
 *
 * Ojo con dos cosas si algún día se toca esto:
 *
 * - **Sin `detectRetina`.** Leaflet pediría las variantes `@2x`, que este
 *   servidor no sirve: saldrían todas 404 y el mapa quedaría vacío.
 * - El servidor es el de la comunidad y su política de uso pide no apoyar
 *   aplicaciones encima. Mientras el tránsito sea el de una app chica de la
 *   Intendencia no molesta a nadie, pero si esto crece hay que pasar a un
 *   proveedor que sirva el mismo estilo -Geoapify, Stadia- y es cambiar esta
 *   única constante.
 */
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const BASEMAP = {
  url: TILE_URL,
  maxZoom: 19,
} as const;

/** El centro y el zoom con los que abre cualquier mapa de la app. */
export const DEFAULT_ZOOM = 13;

/**
 * El crédito a OpenStreetMap.
 *
 * La licencia de los datos (ODbL) obliga a darlo, así que no se puede sacar;
 * lo que sí se puede es no tenerlo escrito encima del mapa todo el tiempo.
 * Va detrás de un botón ⓘ: el mapa queda limpio y el crédito está a un toque.
 */
const CREDITO_HTML =
  '&copy; colaboradores de ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

/**
 * El botón ⓘ de la esquina, con el crédito adentro.
 *
 * Es un control de Leaflet y no un `div` suelto encima del mapa para que se
 * acomode solo junto al resto de los controles y para que tocarlo no arrastre
 * el mapa por debajo.
 */
function CreditoDelMapa() {
  const map = useMap();

  useEffect(() => {
    const control = new L.Control({ position: 'bottomright' });

    control.onAdd = () => {
      const caja = L.DomUtil.create('div', 'leaflet-control mapa-credito');

      const panel = L.DomUtil.create('div', 'mapa-credito__panel', caja);
      panel.innerHTML = CREDITO_HTML;
      panel.hidden = true;

      const boton = L.DomUtil.create('button', 'mapa-credito__boton', caja);
      boton.type = 'button';
      boton.textContent = 'ⓘ';
      boton.setAttribute('aria-label', 'Créditos del mapa');
      boton.setAttribute('aria-expanded', 'false');

      // Sin esto, tocar el botón también arrastra o hace zoom en el mapa.
      L.DomEvent.disableClickPropagation(caja);
      L.DomEvent.disableScrollPropagation(caja);

      L.DomEvent.on(boton, 'click', () => {
        panel.hidden = !panel.hidden;
        boton.setAttribute('aria-expanded', String(!panel.hidden));
      });

      return caja;
    };

    control.addTo(map);
    return () => {
      control.remove();
    };
  }, [map]);

  return null;
}

/**
 * Monta el fondo del mapa dentro de un `<MapContainer>` de react-leaflet.
 *
 * Va primero entre los hijos del mapa, porque se dibuja debajo de todo lo
 * demás. El `<MapContainer>` tiene que llevar `attributionControl={false}`:
 * el crédito lo pone este componente en el botón ⓘ.
 */
export function Basemap() {
  return (
    <>
      <TileLayer url={BASEMAP.url} maxZoom={BASEMAP.maxZoom} />
      <CreditoDelMapa />
    </>
  );
}
