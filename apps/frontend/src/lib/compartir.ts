/**
 * Compartir algo por donde la persona quiera.
 *
 * En el teléfono es la hoja del sistema (`navigator.share`): WhatsApp, un
 * SMS, lo que sea. Donde no está -el escritorio, y algún navegador viejo- se
 * copia el texto al portapapeles y se le dice, adentro de la interfaz y no
 * con un `alert()`. Lo que devuelve es para eso: qué pasó, así la pantalla
 * elige qué decir.
 *
 * Cancelar la hoja del sistema no es un error: la persona cambió de idea, y
 * un aviso de "no se pudo compartir" ahí sería mentira.
 */
export type ResultadoDeCompartir = 'compartido' | 'copiado' | 'cancelado' | 'fallo';

export async function compartir({
  titulo,
  texto,
  url,
}: {
  titulo: string;
  texto: string;
  url?: string;
}): Promise<ResultadoDeCompartir> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: titulo, text: texto, url });
      return 'compartido';
    } catch (error) {
      // `AbortError` es la persona cerrando la hoja. Cualquier otra cosa se
      // cae al portapapeles, que es lo que hubiera pasado sin `share`.
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelado';
    }
  }

  try {
    await navigator.clipboard.writeText(url ? `${texto} ${url}` : texto);
    return 'copiado';
  } catch {
    return 'fallo';
  }
}

/** Qué decirle a la persona según lo que pasó. `null` es "nada que decir". */
export function mensajeDeCompartir(resultado: ResultadoDeCompartir): string | null {
  switch (resultado) {
    case 'copiado':
      return 'Texto copiado. Pegalo donde quieras mandarlo.';
    case 'fallo':
      return 'No pudimos compartir ni copiar el texto.';
    default:
      return null;
  }
}
