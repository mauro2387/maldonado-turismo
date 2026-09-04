/**
 * Dónde vive cada foto de un atractivo.
 *
 * Las fotos son de Wikimedia Commons pero la app no las enlaza desde ahí. Dos
 * razones:
 *
 * - Wikimedia pide expresamente no hotlinkear `upload.wikimedia.org` desde
 *   aplicaciones; con tráfico de temporada responde 429 y al turista se le
 *   rompen las imágenes justo cuando más se usa la app.
 * - Si el archivo se renombra o se borra en Commons, la ficha queda sin foto.
 *
 * Así que se copian una vez a nuestro bucket de Supabase Storage y la app sirve
 * desde ahí. La URL de Commons se conserva igual en `image_credits.source`,
 * porque la atribución la exigen las licencias CC BY y CC BY-SA.
 */

export const STORAGE_BUCKET = 'turismo';

/** Nombre de archivo estable, para que volver a subir pise la foto anterior. */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function storagePath(placeName: string, index: number): string {
  return `lugares/${slugify(placeName)}-${index + 1}.jpg`;
}

/**
 * URL pública del bucket. Requiere SUPABASE_URL; si no está configurada se cae
 * a la URL original de Commons, para que un entorno sin Storage siga mostrando
 * la foto en vez de un hueco.
 */
export function publicImageUrl(placeName: string, index: number, fallback: string): string {
  const base = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  if (!base) return fallback;

  return `${base}/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath(placeName, index)}`;
}
