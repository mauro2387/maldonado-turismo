import { Polyline } from 'react-leaflet';
import { LatLng } from '@lib/polyline';

/**
 * Un trazo de recorrido sobre el mapa.
 *
 * Está en un componente porque el estilo es la mitad del dato: una polilínea
 * de 4 px con las puntas cuadradas sobre un callejero claro se pierde en las
 * curvas y se corta en cada quiebre. Lo que la hace legible son tres cosas, y
 * las tres tienen que ir juntas:
 *
 * - **contorno blanco por debajo**, que la despega del fondo sin oscurecerlo;
 * - **puntas y uniones redondeadas**, que es lo que evita los picos en cada
 *   esquina y hace que un recorrido con seiscientos vértices se lea como una
 *   sola línea;
 * - **grosor parejo**, apenas por encima del ancho de una calle al zoom al que
 *   se mira.
 *
 * La caminata va punteada y sin contorno: es la convención que usan todas las
 * apps de transporte para separar lo que se hace a pie de lo que se hace
 * arriba de algo, y no necesita despegarse tanto porque son tramos cortos.
 */

/** Grosor del trazo y cuánto asoma el contorno por debajo. */
export const LINE_WEIGHT = 5.5;
const CASING_EXTRA = 4;

export function RouteLine({
  positions,
  color,
  dashed = false,
  weight = LINE_WEIGHT,
  opacity = 0.95,
  casing = true,
}: {
  positions: LatLng[];
  color: string;
  dashed?: boolean;
  weight?: number;
  opacity?: number;
  /**
   * El contorno blanco. Se apaga cuando este trazo va *encima* de otro: el
   * contorno del de arriba taparía al de abajo, que es lo que hacía que la
   * ida y la vuelta de una línea se vieran como un solo recorrido verde.
   */
  casing?: boolean;
}) {
  if (positions.length < 2) return null;

  return (
    <>
      {!dashed && casing && (
        <Polyline
          positions={positions}
          pathOptions={{
            color: '#FFFFFF',
            weight: weight + CASING_EXTRA,
            opacity: 0.95,
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      )}
      <Polyline
        positions={positions}
        pathOptions={{
          color,
          weight,
          opacity,
          lineCap: 'round',
          lineJoin: 'round',
          dashArray: dashed ? '1 9' : undefined,
        }}
      />
    </>
  );
}

/**
 * Verde de la caminata.
 *
 * Es el color del semáforo peatonal y el que usan todas las apps de transporte
 * para lo que se hace a pie, así que no hay que explicarlo. Está elegido más
 * saturado que el verde de "en vivo" de la paleta (#137F58) para que no se
 * confundan: uno es un dato que cambia, éste es un tramo del viaje.
 */
export const WALK_GREEN = '#0EA45C';

/**
 * La caminata: la parte del viaje que uno hace con los pies.
 *
 * Va **animada y en verde**, y las dos cosas hacen trabajo:
 *
 * - **Los puntos avanzan hacia el destino.** Un tramo punteado gris dice "acá
 *   se camina"; uno que se mueve dice además **para qué lado**, que en una
 *   caminata de tres cuadras entre dos esquinas parecidas es justamente lo que
 *   uno necesita antes de arrancar. La dirección no es decorativa: sale de la
 *   geometría, que viene ordenada desde el origen hasta la parada.
 * - **El verde la separa del ómnibus de un vistazo**, sin leer la referencia.
 *
 * Debajo va un corredor verde continuo y translúcido. Sin él, los puntos se
 * pierden sobre el callejero -que ya tiene verdes de plazas y grises de
 * calles- y en las curvas cerradas el trazo se lee cortado. Con él, la
 * caminata es una cinta que se sigue con el ojo aunque los puntos caigan sobre
 * un parque.
 *
 * El movimiento respeta `prefers-reduced-motion`: quien pidió que las cosas no
 * se muevan ve la misma cinta punteada, quieta. Ver `index.css`.
 */
export function WalkLine({
  positions,
  color = WALK_GREEN,
  weight = 5,
}: {
  positions: LatLng[];
  color?: string;
  weight?: number;
}) {
  if (positions.length < 2) return null;

  return (
    <>
      <Polyline
        positions={positions}
        pathOptions={{
          color,
          weight: weight + 5,
          opacity: 0.16,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
      <Polyline
        positions={positions}
        pathOptions={{
          color,
          weight,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
          // Punto y espacio: con las puntas redondeadas cada raya de 1 px se
          // dibuja como un círculo del ancho del trazo. El período (1 + 11) es
          // el mismo número que corre la animación, así que el ciclo cierra
          // sin saltos.
          dashArray: '1 11',
          className: 'linea-caminata',
        }}
      />
    </>
  );
}

export default RouteLine;
