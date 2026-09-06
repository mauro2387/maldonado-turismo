import { useEffect, useState } from 'react';
import { transportService, TransportHealth } from '@services/transportService';

/**
 * Si está entrando el GPS de las empresas.
 *
 * Existe para que la app no mienta. Cuando el feed de una empresa se cae -y se
 * cae: son DNS dinámico sobre la conexión de la oficina de cada una- la
 * pantalla decía "No hay ómnibus en camino ahora". Eso suena a dato y es
 * ignorancia: no distingue *ninguno viene* de *no tenemos idea*, y deja a
 * alguien esperando en la parada por una frase que la app dijo con seguridad.
 *
 * Se pregunta cada minuto y no cada cinco segundos: es un estado que cambia
 * cada varias horas, y lo que se decide con él es una frase, no un dibujo.
 */

const CADA_MS = 60_000;

export function useTransportHealth() {
  const [health, setHealth] = useState<TransportHealth | null>(null);

  useEffect(() => {
    let cancelado = false;

    const preguntar = () => {
      transportService
        .getHealth()
        .then((resultado) => {
          if (!cancelado) setHealth(resultado);
        })
        .catch(() => {
          // Si ni el chequeo de salud contesta, el problema es más grande que
          // un feed. Se deja en null y la app se comporta como siempre: no es
          // momento de agregarle un cartel más a alguien que ya no tiene app.
          if (!cancelado) setHealth(null);
        });
    };

    preguntar();
    const reloj = setInterval(preguntar, CADA_MS);

    return () => {
      cancelado = true;
      clearInterval(reloj);
    };
  }, []);

  /** Ninguna empresa está reportando: no se puede afirmar nada de las llegadas. */
  const sinGps = health?.status === 'caido';

  /** Alguna sí y alguna no: lo que se muestra está incompleto. */
  const gpsParcial = health?.status === 'degradado';

  /** Qué empresas están mudas, para poder nombrarlas. */
  const empresasCaidas = (health?.feeds ?? [])
    .filter((feed) => feed.state === 'caido')
    .map((feed) => feed.operator);

  return { health, sinGps, gpsParcial, empresasCaidas };
}
