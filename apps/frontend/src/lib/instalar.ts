/**
 * Instalar la app en el teléfono.
 *
 * Con el manifiesto puesto, Chrome en Android ofrece "agregar a la pantalla
 * de inicio" por su cuenta, pero cuándo y cómo lo ofrece lo decide él -una
 * barrita que aparece y desaparece, o nada-. Lo que se puede hacer es
 * **guardarse** el pedido: el navegador dispara `beforeinstallprompt` una
 * vez, apenas decide que la app es instalable, y si nadie lo agarra se
 * pierde. Acá se agarra al arrancar y se ofrece desde Vos, con un botón que
 * dice lo que hace.
 *
 * En iPhone no existe nada de esto: Safari instala sólo desde "Compartir →
 * Agregar a inicio", a mano, y no avisa. Ahí lo único que se puede hacer es
 * decírselo a la persona, y para eso hay que saber que es un iPhone y que la
 * app todavía no está instalada. Ver `comoInstalar`.
 */

/** El evento que Chrome dispara; no está en los tipos del DOM. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let pedidoGuardado: BeforeInstallPromptEvent | null = null;
const oyentes = new Set<() => void>();

function avisarCambio(): void {
  oyentes.forEach((oyente) => oyente());
}

/**
 * Se llama una vez al arrancar la app. Escucha el pedido de instalación y lo
 * guarda; y escucha cuando la app se instaló, para dejar de ofrecerla.
 */
export function escucharInstalacion(): void {
  try {
    window.addEventListener('beforeinstallprompt', (event) => {
      // Sin esto Chrome muestra su propia barrita además del botón de Vos.
      event.preventDefault();
      pedidoGuardado = event as BeforeInstallPromptEvent;
      avisarCambio();
    });
    window.addEventListener('appinstalled', () => {
      pedidoGuardado = null;
      avisarCambio();
    });
  } catch {
    // Sin ventana no hay nada que instalar.
  }
}

/** Para que un componente se entere cuando aparece o desaparece el pedido. */
export function alCambiarInstalacion(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** Si la app ya corre instalada, a pantalla completa. */
export function estaInstalada(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

/**
 * Cómo se instala en este teléfono.
 *
 * - `boton`: hay un pedido guardado y se puede instalar con un toque.
 * - `ios`: es un iPhone o iPad con Safari, donde se instala a mano.
 * - `instalada`: ya está.
 * - `no`: el navegador no ofreció instalarla (todavía, o nunca).
 */
export function comoInstalar(): 'boton' | 'ios' | 'instalada' | 'no' {
  if (estaInstalada()) return 'instalada';
  if (pedidoGuardado) return 'boton';

  try {
    const ua = navigator.userAgent;
    // iPadOS se hace pasar por Mac; lo delata el táctil.
    const esIos = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const esSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (esIos && esSafari) return 'ios';
  } catch {
    /* sin navegador no hay cómo saber */
  }

  return 'no';
}

/** Muestra el diálogo del sistema. Devuelve si la persona aceptó. */
export async function instalar(): Promise<boolean> {
  const pedido = pedidoGuardado;
  if (!pedido) return false;

  try {
    await pedido.prompt();
    const { outcome } = await pedido.userChoice;
    // El pedido se usa una sola vez: aceptado o no, Chrome no lo vuelve a
    // aceptar. Si lo rechazó, va a haber otro `beforeinstallprompt` más
    // adelante, cuando Chrome quiera.
    pedidoGuardado = null;
    avisarCambio();
    return outcome === 'accepted';
  } catch {
    pedidoGuardado = null;
    avisarCambio();
    return false;
  }
}
