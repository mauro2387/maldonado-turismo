/**
 * El color de un lugar sin foto.
 *
 * Sale del nombre y no de un contador, así que el mismo lugar se ve siempre
 * igual —en la lista, en el mapa y en la ficha— y una pantalla sin fotos
 * igual se distingue de un vistazo.
 *
 * Los cinco pares son de la paleta de la app: tinta, verde mar, coral, azul
 * pizarra y arena. Ninguno es un color de relleno.
 */
const FALLBACK_COLORS = [
  ['#0B1F33', '#2A3E52'],
  ['#0E7C86', '#09515A'],
  ['#DC4227', '#A32D17'],
  ['#3D5063', '#1A2D3F'],
  ['#B8A88F', '#7A6B52'],
] as const;

export function paletteFor(seed: string): readonly [string, string] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

/** La inicial que va adentro del respaldo. */
export function initialFor(name: string): string {
  return name.trim().charAt(0).toUpperCase() || 'M';
}
