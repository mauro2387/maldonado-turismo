/**
 * El instante de hoy que corresponde a una hora "HH:MM" del horario.
 *
 * Los horarios publicados son horas del día sin fecha, y la madrugada es del
 * día que termina: "00:30" después de las 23:10 es el último servicio de
 * hoy, no el primero de mañana. Por eso una hora antes de las 4 se lleva al
 * día siguiente si ya pasaron las 4 de hoy, que es el mismo corte que usa el
 * backend para ordenar el día (`ordenDelDia`). Null si no es una hora.
 */
export function instanteDeHoy(hhmm: string, ahora = new Date()): number | null {
  const partes = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!partes) return null;
  const horas = Number(partes[1]);
  const minutos = Number(partes[2]);
  if (horas > 23 || minutos > 59) return null;

  const fecha = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), horas, minutos);
  if (horas < 4 && ahora.getHours() >= 4) fecha.setDate(fecha.getDate() + 1);
  return fecha.getTime();
}

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
