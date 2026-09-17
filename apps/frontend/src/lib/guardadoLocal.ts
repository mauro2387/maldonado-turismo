/**
 * Lo último que se vio, guardado para cuando no hay señal.
 *
 * No es una caché en el sentido del service worker —nada se sirve desde acá
 * mientras la red anda— sino un respaldo: lo que la app trajo bien la última
 * vez, con la fecha, para poder mostrarlo **diciendo que es viejo** cuando el
 * pedido falla. Es lo que hace que el horario de la 24 se pueda mirar en la
 * Ruta 10 sin datos, que es exactamente donde más se necesita y donde nunca
 * hay señal.
 *
 * Por eso vive en `localStorage` y no en el service worker: el worker no
 * tiene `fetch` a propósito (ver `public/sw.js`), y un respaldo explícito de
 * dos o tres cosas -el catálogo de líneas, los horarios que se abrieron- se
 * puede razonar entero; una caché de todo lo que pasa por la red, no.
 *
 * Lo que se guarda es chico: un horario de línea son unos kilobytes. Igual
 * hay un tope de entradas, y al pasarlo se va la más vieja: `localStorage`
 * tiene cinco megas y los comparte con lo tuyo y el recordatorio.
 */

const PREFIJO = 'respaldo:';

/** Cuántas cosas se guardan como mucho. Sesenta horarios son todas las líneas. */
const MAX_ENTRADAS = 60;

interface Guardado<T> {
  valor: T;
  /** Cuándo se trajo de la red, en milisegundos de época. */
  guardadoEl: number;
}

export function guardar<T>(clave: string, valor: T): void {
  try {
    const entrada: Guardado<T> = { valor, guardadoEl: Date.now() };
    localStorage.setItem(PREFIJO + clave, JSON.stringify(entrada));
    podar();
  } catch {
    // Sin disco no hay respaldo. La app sigue igual: esto es un extra.
  }
}

export function leer<T>(clave: string): Guardado<T> | null {
  try {
    const crudo = localStorage.getItem(PREFIJO + clave);
    if (!crudo) return null;
    const entrada = JSON.parse(crudo) as Partial<Guardado<T>>;
    if (typeof entrada?.guardadoEl !== 'number' || entrada.valor === undefined) return null;
    return { valor: entrada.valor, guardadoEl: entrada.guardadoEl };
  } catch {
    return null;
  }
}

/** Saca las entradas más viejas cuando hay más de la cuenta. */
function podar(): void {
  const claves: Array<{ clave: string; guardadoEl: number }> = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const clave = localStorage.key(i);
    if (!clave || !clave.startsWith(PREFIJO)) continue;
    try {
      const entrada = JSON.parse(localStorage.getItem(clave) ?? '') as Partial<Guardado<unknown>>;
      claves.push({ clave, guardadoEl: entrada?.guardadoEl ?? 0 });
    } catch {
      claves.push({ clave, guardadoEl: 0 });
    }
  }
  if (claves.length <= MAX_ENTRADAS) return;
  claves
    .sort((a, b) => a.guardadoEl - b.guardadoEl)
    .slice(0, claves.length - MAX_ENTRADAS)
    .forEach(({ clave }) => localStorage.removeItem(clave));
}

/** "guardado el 12/9 a las 18:03", para decir de cuándo es lo que se muestra. */
export function fechaDeGuardado(guardadoEl: number): string {
  const fecha = new Date(guardadoEl);
  return `${fecha.toLocaleDateString('es-UY', { day: 'numeric', month: 'numeric' })} a las ${fecha.toLocaleTimeString(
    'es-UY',
    { hour: '2-digit', minute: '2-digit', hour12: false },
  )}`;
}
