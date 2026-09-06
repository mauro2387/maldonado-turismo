import { ConfigService } from '@nestjs/config';
import { FeedHealthService } from './feed-health.service';

/**
 * Un chequeo de salud que sólo sabe decir "ok" no sirve para nada.
 *
 * Lo que hay que poder confiar es en el **camino de la falla**: que cuando el
 * DNS dinámico de la empresa se cae, el informe lo diga, y que no lo diga
 * antes de tiempo -una alarma que grita cuando no pasa nada se apaga a la
 * semana y entonces no hay alarma-.
 */

function servicio(env: Record<string, string> = {}) {
  const config = {
    get: (clave: string, porDefecto?: string) => env[clave] ?? porDefecto,
  } as unknown as ConfigService;

  return new FeedHealthService(config);
}

/** Un rato después de arrancar, para no depender del reloj de verdad. */
function dentroDe(minutos: number): Date {
  return new Date(Date.now() + minutos * 60_000);
}

describe('FeedHealthService', () => {
  it('un feed declarado que todavía no contestó está arrancando, no caído', () => {
    const salud = servicio();
    salud.declarar(['codesa']);

    const informe = salud.snapshot();
    expect(informe.feeds).toHaveLength(1);
    expect(informe.feeds[0].state).toBe('arrancando');
    expect(informe.status).toBe('arrancando');
  });

  it('fallar muchas veces seguidas es estar caído, no arrancando', () => {
    // Caso real: al arrancar, el feed de CODESA acumuló 26 timeouts seguidos y
    // el informe seguía diciendo "arrancando" porque el proceso tenía cinco
    // minutos de vida. Un feed que ya contestó veintiséis veces que no, no está
    // arrancando. Es la misma mentira que se está tratando de sacar de la app.
    const salud = servicio({ GPS_FEED_STALE_MINUTES: '15' });
    for (let i = 0; i < 26; i += 1) {
      salud.registrarFallo('codesa', new Error('This operation was aborted'));
    }

    const informe = salud.snapshot();
    expect(informe.feeds[0].state).toBe('caido');
    expect(informe.feeds[0].consecutive_failures).toBe(26);
  });

  it('un tropiezo aislado durante el arranque no dispara la alarma', () => {
    const salud = servicio({ GPS_FEED_STALE_MINUTES: '15' });
    salud.registrarFallo('codesa', new Error('timeout'));

    expect(salud.snapshot().feeds[0].state).toBe('arrancando');
  });

  it('pasado el umbral sin un solo éxito, ese feed está caído', () => {
    const salud = servicio({ GPS_FEED_STALE_MINUTES: '15' });
    salud.declarar(['codesa']);

    const informe = salud.snapshot(dentroDe(16));
    expect(informe.feeds[0].state).toBe('caido');
    expect(informe.status).toBe('caido');
  });

  it('un feed que contestó recién está ok, y guarda cuántos coches trajo', () => {
    const salud = servicio();
    salud.registrarExito('codesa', 37);

    const feed = salud.snapshot().feeds[0];
    expect(feed.state).toBe('ok');
    expect(feed.vehicles_last_success).toBe(37);
    expect(feed.seconds_since_success).toBeLessThan(5);
  });

  it('contestar con la lista vacía es estar vivo: de noche no hay coches', () => {
    const salud = servicio();
    salud.registrarExito('micro', 0);

    expect(salud.snapshot().feeds[0].state).toBe('ok');
    expect(salud.hayDatosEnVivo()).toBe(true);
  });

  it('deja de estar ok cuando pasa el umbral desde el último éxito', () => {
    const salud = servicio({ GPS_FEED_STALE_MINUTES: '15' });
    salud.registrarExito('codesa', 10);

    expect(salud.snapshot(dentroDe(14)).feeds[0].state).toBe('ok');
    expect(salud.snapshot(dentroDe(16)).feeds[0].state).toBe('caido');
  });

  it('guarda el error para poder arreglarlo sin abrir los logs', () => {
    const salud = servicio();
    salud.registrarFallo('codesa', new Error('getaddrinfo ENOTFOUND avl.example.net'));

    const feed = salud.snapshot().feeds[0];
    expect(feed.ok).toBe(false);
    expect(feed.consecutive_failures).toBe(1);
    expect(feed.last_error).toContain('ENOTFOUND');
  });

  it('desenvuelve la causa real: "fetch failed" solo no sirve para arreglar nada', () => {
    const salud = servicio();
    const envuelto = new Error('fetch failed');
    (envuelto as Error & { cause?: unknown }).cause = Object.assign(
      new Error('getaddrinfo ENOTFOUND avl.example.net'),
      { code: 'ENOTFOUND' },
    );
    salud.registrarFallo('codesa', envuelto);

    const mensaje = salud.snapshot().feeds[0].last_error ?? '';
    expect(mensaje).toContain('ENOTFOUND');
    expect(mensaje).toContain('avl.example.net');
  });

  it('un éxito borra la racha de fallos', () => {
    const salud = servicio();
    salud.registrarFallo('codesa', new Error('timeout'));
    salud.registrarFallo('codesa', new Error('timeout'));
    expect(salud.snapshot().feeds[0].consecutive_failures).toBe(2);

    salud.registrarExito('codesa', 5);
    const feed = salud.snapshot().feeds[0];
    expect(feed.consecutive_failures).toBe(0);
    expect(feed.last_error).toBeNull();
  });

  it('con un feed vivo y otro mudo el estado global es degradado, no caído', () => {
    const salud = servicio({ GPS_FEED_STALE_MINUTES: '15' });
    salud.registrarExito('codesa', 30);
    salud.declarar(['micro']);

    // A los 16 minutos: CODESA sigue sin refrescar y micro nunca contestó.
    const informe = salud.snapshot(dentroDe(16));
    expect(informe.status).toBe('caido');

    // Pero si CODESA sí refrescó, el sistema está degradado: hay con qué
    // contestar, aunque incompleto. La diferencia importa: con "caído" la app
    // deja de prometer llegadas, con "degradado" sólo avisa de una empresa.
    const otra = servicio({ GPS_FEED_STALE_MINUTES: '15' });
    otra.registrarExito('codesa', 30);
    otra.declarar(['micro']);
    otra.registrarExito('codesa', 31);
    expect(otra.snapshot().status).toBe('degradado');
  });

  it('con la ingesta apagada no está caído: está apagado', () => {
    const salud = servicio({ GPS_FEEDS_ENABLED: 'false' });
    salud.declarar(['codesa']);

    const informe = salud.snapshot(dentroDe(60));
    expect(informe.status).toBe('apagado');
    expect(informe.feeds[0].state).toBe('apagado');
  });

  it('hayDatosEnVivo es falso cuando ninguno contesta: la app no puede prometer', () => {
    const salud = servicio({ GPS_FEED_STALE_MINUTES: '15' });
    salud.registrarExito('codesa', 20);

    expect(salud.hayDatosEnVivo()).toBe(true);
    expect(salud.hayDatosEnVivo(dentroDe(16))).toBe(false);
  });
});
