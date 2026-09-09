/**
 * Avisar cuando nadie está mirando la pantalla.
 *
 * `ABordo` ya contesta bien la única pregunta que importa arriba del ómnibus
 * —cuándo tocar el timbre— y la contesta con la pantalla entera en coral. El
 * problema es **dónde está esa pantalla**: nadie viaja veinte minutos mirando
 * el teléfono. Está en el bolsillo, o abajo del brazo, o con la app atrás de
 * WhatsApp. Un aviso que sólo se ve no llega, y llegar tarde acá es pasarse de
 * parada, que es justamente lo que esa pantalla existe para evitar.
 *
 * Así que el aviso sale por los tres canales que un navegador da sin
 * infraestructura del lado del servidor, ordenados por cuánto llegan de
 * verdad:
 *
 * 1. **Vibración.** Es el único que atraviesa el bolsillo, y el único que
 *    sirve en un ómnibus lleno donde no se escucha nada.
 * 2. **Sonido corto.** Para el teléfono en la mano con el volumen puesto. Sale
 *    de un oscilador y no de un archivo: son dos tonos de 160 ms, no
 *    justifican sumarle un binario al bundle ni una descarga al teléfono.
 * 3. **Notificación del sistema.** Es la que cubre haberse ido a otra app.
 *
 * Ninguno de los tres existe en todos los navegadores y ninguno se puede dar
 * por sentado: cada uno va en su try/catch y la pantalla funciona completa sin
 * los tres. Un aviso que no se puede dar no es un error que mostrarle a nadie.
 *
 * ## Lo que esto **no** resuelve
 *
 * Con la app en segundo plano el navegador frena los temporizadores —Chrome
 * los baja a uno por minuto y termina congelando la pestaña—, así que el poll
 * de ocho segundos deja de correr y el aviso puede salir tarde o no salir. Lo
 * único que lo evita de verdad es que la pantalla siga prendida y la app
 * adelante, que es para lo que está el wake lock (ver `useWakeLock`). Que el
 * aviso llegue con la app cerrada es Web Push: un service worker y una tabla
 * de suscripciones en el backend. Eso es otra tarea.
 *
 * ## Y en Android la notificación puede no salir
 *
 * En Chrome de Android `new Notification(...)` desde la página tira
 * `Illegal constructor`: ahí la única forma de mostrar una notificación es
 * `ServiceWorkerRegistration.showNotification()`, o sea que hace falta un
 * service worker registrado, y no lo hay. El catch se la come y el aviso queda
 * en vibración y sonido, que en un teléfono guardado son igual los dos que
 * llegan. Está escrito acá para que nadie lo descubra probando en el
 * escritorio, donde sí funciona.
 */

/**
 * Cómo vibra cada aviso.
 *
 * Los dos avisos tienen que distinguirse **sin sacar el teléfono del
 * bolsillo**: si hay que mirar la pantalla para saber cuál de los dos fue, la
 * vibración no sirvió de nada. "Preparate" son dos toques cortos, de los que
 * uno registra y sigue en lo suyo; "bajate" son tres largos, que es lo que
 * hace un teléfono cuando algo pasa ahora.
 *
 * Los números son los de una notificación normal de Android (~150 ms el toque
 * corto, ~400 ms el largo): más corto no se siente en el bolsillo de una
 * campera, y más largo se lee como una llamada entrante.
 */
const VIBRACION_SUAVE = [150, 120, 150];
const VIBRACION_INSISTENTE = [400, 150, 400, 150, 400];

/** El tono del bip, cuánto dura y cuánto va de uno al otro. */
const TONO_HZ = 880;
const BIP_S = 0.16;
const ENTRE_BIPS_S = 0.22;

/**
 * Todas las notificaciones del viaje ocupan el mismo lugar.
 *
 * Con `tag` fijo, la de "tocá el timbre" **reemplaza** a la de "preparate" en
 * vez de apilarse debajo. Dos notificaciones de la misma app diciendo cosas
 * distintas sobre el mismo viaje es la forma más rápida de que alguien lea la
 * vieja.
 */
const TAG = 'viaje-a-bordo';

/**
 * El contexto de audio, abierto una sola vez.
 *
 * Vive fuera de todo componente porque no se puede abrir cuando hace falta: un
 * `AudioContext` creado sin un gesto de la persona nace suspendido y no suena
 * nunca. El único gesto que hay en este flujo es el toque en "Ya me subí", así
 * que se abre ahí (`prepararAvisos`) y queda guardado para los avisos que
 * vienen después, que son todos automáticos.
 */
let audio: AudioContext | null = null;

/**
 * Preparar los avisos. Se llama desde el toque en "Ya me subí".
 *
 * El momento importa más que el código. Pedir el permiso de notificaciones al
 * abrir la pantalla es pedirlo sin contexto, y un permiso negado en un
 * navegador **no se vuelve a pedir**: queda negado para siempre en ese dominio
 * y con él se pierde el único canal que llega cuando la app está atrás. Pedido
 * justo cuando alguien acaba de decir "ya me subí", la pregunta se explica
 * sola: quiere que le avisen cuándo bajarse.
 *
 * Y es el mismo gesto el que habilita el audio, que sin gesto no arranca.
 */
export function prepararAvisos(): void {
  abrirAudio();

  try {
    // `default` es "todavía no se preguntó". Volver a preguntar cuando ya está
    // concedido o negado no hace nada, pero pedirlo sólo en ese estado deja
    // dicho que es una sola vez en la vida de la instalación.
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  } catch {
    // Un navegador sin notificaciones no es un error: la pantalla ya funciona
    // sin ellas y no hay nada que decirle a nadie.
  }
}

/**
 * Dar el aviso por los canales que haya.
 *
 * `insistente` es "esto es ahora": vibra más y suena dos veces. Se usa para
 * "tocá el timbre", que es el único aviso de esta app que no se puede perder.
 */
export function avisar({
  titulo,
  cuerpo,
  insistente = false,
}: {
  titulo: string;
  cuerpo?: string;
  insistente?: boolean;
}): void {
  vibrar(insistente ? VIBRACION_INSISTENTE : VIBRACION_SUAVE);
  sonar(insistente ? 2 : 1);
  notificar(titulo, cuerpo);
}

/** Vibra, si el teléfono sabe. En un escritorio no existe y no pasa nada. */
function vibrar(patron: number[]): void {
  try {
    if ('vibrate' in navigator) navigator.vibrate(patron);
  } catch {
    // Hay navegadores que tiran cuando la página no está visible. No importa:
    // el aviso ya salió por los otros canales.
  }
}

/**
 * Uno o dos bips cortos.
 *
 * Con envolvente y no un tono pelado: un oscilador que arranca y corta de
 * golpe hace un chasquido en el parlante del teléfono que se escucha peor que
 * el bip.
 */
function sonar(veces: number): void {
  // Si el contexto no llegó a abrirse con el gesto, no hay sonido y listo. No
  // se intenta abrirlo acá: nacería suspendido y sería un objeto muerto.
  if (!audio || audio.state !== 'running') return;

  try {
    const desde = audio.currentTime;

    for (let i = 0; i < veces; i += 1) {
      const t = desde + i * ENTRE_BIPS_S;
      const oscilador = audio.createOscillator();
      const volumen = audio.createGain();

      oscilador.type = 'sine';
      oscilador.frequency.value = TONO_HZ;

      // El cero no sirve en una rampa exponencial, de ahí el valor mínimo.
      volumen.gain.setValueAtTime(0.0001, t);
      volumen.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      volumen.gain.exponentialRampToValueAtTime(0.0001, t + BIP_S);

      oscilador.connect(volumen);
      volumen.connect(audio.destination);
      oscilador.start(t);
      oscilador.stop(t + BIP_S + 0.02);
    }
  } catch {
    // Sin sonido se sigue: quedan la vibración y la pantalla.
  }
}

/**
 * La notificación del sistema, sólo cuando la app **no** se está viendo.
 *
 * Con la pantalla adelante ya se avisó de la forma más fuerte que hay —la
 * pantalla entera cambió de color—, y sumarle una notificación arriba sería
 * taparle a alguien justo el número que está mirando.
 */
function notificar(titulo: string, cuerpo?: string): void {
  if (document.visibilityState === 'visible') return;

  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    new Notification(titulo, { body: cuerpo, tag: TAG });
  } catch {
    // Android tira acá (ver el encabezado). Queda la vibración, que en un
    // teléfono guardado es la que llega igual.
  }
}

function abrirAudio(): void {
  try {
    const Constructor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Constructor) return;

    if (!audio) audio = new Constructor();
    // Un contexto que quedó suspendido —porque la pestaña estuvo atrás— se
    // reanuda con este mismo gesto.
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}
