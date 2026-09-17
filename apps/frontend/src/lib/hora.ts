/**
 * Una hora de reloj, como se lee en Uruguay: "17:42".
 *
 * `'es-UY'` con las opciones por defecto devuelve "5:42 p. m.", que además
 * de largo se lee mal de un vistazo; el reloj de acá es de 24 horas.
 */
export function horaDeReloj(instante: number | Date): string {
  return new Date(instante).toLocaleTimeString('es-UY', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
