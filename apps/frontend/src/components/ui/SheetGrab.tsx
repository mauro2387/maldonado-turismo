import { useRef, useState } from 'react';
import clsx from 'clsx';

/**
 * La manijita de los sheets, que ahora agarra.
 *
 * Estaba dibujada en las tres fichas del mapa y en la de horarios, y no hacía
 * nada: la única forma de cerrar era la X de la esquina. Una barrita gris
 * centrada arriba de un panel es la señal universal de "esto se arrastra", así
 * que la app venía prometiendo un gesto que no existía. Quien lo intentaba —y
 * en un teléfono lo intenta todo el mundo antes de buscar la X— no obtenía
 * nada y concluía que la pantalla estaba trabada.
 *
 * Cierra de dos maneras porque hay dos formas de agarrar un teléfono:
 * arrastrando hacia abajo, que es lo que el dibujo promete, y tocando, que es
 * lo que hace quien ya se acostumbró a que la barrita sea decorativa.
 *
 * El área sensible mide cuarenta y cuatro píxeles de alto —el mínimo con el
 * que un dedo acierta— aunque la barra siga midiendo cuatro. El elemento de
 * diseño estaba bien; lo que estaba mal era que fuera lo único tocable.
 */

/** Cuánto hay que bajar para que cuente como "cerrá esto". */
const DISMISS_PX = 60;

/**
 * Más allá de esto el arrastre no sigue al dedo.
 *
 * Sin tope, un tirón largo despega el panel de la pantalla y deja un hueco
 * blanco antes de que el gesto termine. Con tope, el panel se resiste igual
 * que en las apps del sistema: se entiende que ya alcanzó.
 */
const MAX_DRAG_PX = 120;

/**
 * Por debajo de esto el dedo no se movió: fue un toque.
 *
 * Nadie apoya el dedo en un punto exacto y lo levanta del mismo píxel, así que
 * sin esta tolerancia la mitad de los toques se leerían como arrastres de dos
 * píxeles y no cerrarían nada.
 */
const TAP_SLOP_PX = 6;

export function SheetGrab({
  onDismiss,
  className,
}: {
  onDismiss: () => void;
  className?: string;
}) {
  const [offset, setOffset] = useState(0);
  const startY = useRef<number | null>(null);
  const moved = useRef(0);
  /**
   * Que el gesto ya se resolvió con el dedo.
   *
   * `click` llega **después** de `pointerup`, así que sin esta marca un
   * arrastre que no llegó al umbral se cerraría igual por la vía del click,
   * que es exactamente lo contrario de lo que pidió quien lo soltó a mitad de
   * camino. Se limpia en el `pointerdown` siguiente.
   */
  const handledByPointer = useRef(false);

  const finish = () => {
    if (startY.current === null) return;

    const distance = moved.current;
    startY.current = null;
    setOffset(0);
    handledByPointer.current = true;

    // Un toque cierra. Un arrastre cierra sólo si llegó abajo; si se soltó
    // antes, el panel vuelve a su lugar y no pasa nada.
    if (distance < TAP_SLOP_PX || distance >= DISMISS_PX) onDismiss();
  };

  return (
    <button
      type="button"
      aria-label="Cerrar"
      // `touch-none` es lo que evita que el navegador se quede con el gesto
      // para hacer scroll: sin eso el arrastre se pierde en cuanto el dedo
      // baja unos píxeles.
      className={clsx('flex h-11 w-full touch-none items-start justify-center pt-2', className)}
      style={offset ? { transform: `translateY(${offset}px)` } : undefined}
      onPointerDown={(event) => {
        startY.current = event.clientY;
        moved.current = 0;
        handledByPointer.current = false;
        try {
          // Capturar el puntero es lo que hace que el arrastre siga funcionando
          // cuando el dedo se sale de la barrita, que es lo que pasa siempre.
          // Falla si el puntero ya no está activo; el gesto sigue igual, sólo
          // que limitado al elemento.
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* el gesto anda igual */
        }
      }}
      onPointerMove={(event) => {
        if (startY.current === null) return;
        // Sólo hacia abajo: un sheet no se cierra tirando para arriba, y
        // seguir el dedo en esa dirección lo despegaría del borde.
        const delta = Math.max(0, event.clientY - startY.current);
        moved.current = delta;
        setOffset(Math.min(MAX_DRAG_PX, delta));
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      // Sólo para teclado: con el dedo ya lo resolvió `finish`.
      onClick={() => {
        if (!handledByPointer.current) onDismiss();
      }}
    >
      <span className="sheet-grab" />
    </button>
  );
}

export default SheetGrab;
