/**
 * El service worker más chico posible, y existe por un solo motivo.
 *
 * En Chrome de Android `new Notification(...)` desde la página tira
 * `Illegal constructor`: ahí la única forma de mostrar una notificación es
 * `ServiceWorkerRegistration.showNotification()`, que necesita un service
 * worker registrado. O sea que el único canal del aviso de bajada que llega
 * con la app en segundo plano **no funcionaba justamente en el teléfono para
 * el que está hecha la app**. En el escritorio andaba, que es lo que hacía que
 * no se notara. Ver `avisos.ts`.
 *
 * ## Lo que este archivo NO hace, a propósito
 *
 * **No tiene `fetch`.** Un service worker que intercepta pedidos se mete entre
 * la app y el backend para siempre: sirve páginas viejas, esconde errores de
 * red y hay que pensar una estrategia de caché y de invalidación para cada
 * cosa. Nada de eso hace falta acá y todo eso puede romper. Sin `fetch`, el
 * navegador ni siquiera lo consulta al navegar: la app carga exactamente igual
 * que antes de que este archivo existiera.
 *
 * **No es Web Push.** Web Push es que el aviso llegue con la app cerrada, y
 * eso necesita claves VAPID, una tabla de suscripciones y un backend que
 * empuje. Esto sólo le presta al aviso local una superficie donde mostrarse.
 * Sigue haciendo falta que la pestaña esté viva para que el poll corra.
 *
 * **No cachea nada.** No hay `install` que precargue ni versión que invalidar.
 */

/**
 * Tomar el control enseguida, sin esperar a que se cierren las pestañas
 * viejas.
 *
 * El ciclo normal de un service worker deja al nuevo "esperando" hasta que no
 * queden pestañas con el anterior. Acá eso sería un problema de verdad: quien
 * toca "ya me subí" registra el worker y necesita que esté activo **en ese
 * viaje**, no en el próximo. El aviso llega diez minutos después; si el worker
 * todavía está esperando, no hay dónde mostrarlo.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Tocar el aviso vuelve al viaje.
 *
 * Alguien que tiene el teléfono en el bolsillo y siente la vibración va a
 * sacarlo y tocar la notificación: eso tiene que devolverlo a la pantalla que
 * le dice cuándo bajarse, no abrir una pestaña nueva encima de la que ya
 * estaba siguiendo el viaje. Por eso se busca una ventana abierta de la app y
 * se la trae al frente; sólo si no hay ninguna se abre una.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((ventanas) => {
        for (const ventana of ventanas) {
          if ('focus' in ventana) return ventana.focus();
        }
        return self.clients.openWindow('/transporte/planificador');
      })
      .catch(() => {
        // Si el navegador no deja enfocar ni abrir, la notificación ya cumplió
        // su trabajo: la persona está mirando el teléfono.
      }),
  );
});
