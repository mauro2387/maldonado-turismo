/**
 * Datos de flota que no viajan en el feed AVL y hay que resolver por fuera.
 */

/**
 * Coches 100% eléctricos, por empresa.
 *
 * La propulsión no viaja en el feed: ningún tag del <marker> la indica. CODESA
 * la resuelve en el JavaScript de su propia página pública de seguimiento
 * (archivo btkserver4_privado.js de su servidor AVL), con la lista
 * de números de coche escrita a mano:
 *
 *     electrico = (bus == 310 || bus == 321 || bus == 322 ||
 *                  bus == 323 || bus == 324 || bus == 325);
 *
 * y los muestra con un ⚡ al lado del ícono y "Coche 100% electrico" en el
 * popup. Se replica la misma lista para que la app coincida con lo que la
 * empresa publica.
 *
 * Al ser una lista fija y no un dato del feed, queda desactualizada sola: hay
 * que revisarla contra ese archivo cada vez que CODESA sume o saque unidades
 * eléctricas.
 *
 * Ni Maldonado Turismo ni Micro publican una lista equivalente -la página de
 * seguimiento de Micro no menciona la propulsión en ningún lado-, así que de
 * esas dos empresas no hay forma de saber si tienen eléctricos.
 */
const ELECTRIC_COACHES_BY_OPERATOR: Record<string, ReadonlySet<string>> = {
  codesa: new Set(['310', '321', '322', '323', '324', '325']),
};

/**
 * El vehicle_id se arma como `${operator}-${coche}` al normalizar el feed, y
 * hay operadores con guion en el nombre ('maldonado-turismo'), así que el
 * corte va en el último guion y no en el primero.
 */
export function isElectricVehicle(vehicleId?: string | null): boolean {
  if (!vehicleId) return false;

  const cut = vehicleId.lastIndexOf('-');
  if (cut < 0) return false;

  const operator = vehicleId.slice(0, cut);
  const coach = vehicleId.slice(cut + 1);

  return ELECTRIC_COACHES_BY_OPERATOR[operator]?.has(coach) ?? false;
}

/**
 * Carteles que no son un servicio que alguien pueda tomar.
 *
 * El feed publica todos los coches con el equipo prendido, incluidos los que
 * van a cargar combustible o hacen un traslado contratado. Son ómnibus reales
 * andando por la calle, pero mostrarlos en el mapa como una línea más hace que
 * alguien espere en la esquina un "300" que no para en ningún lado.
 *
 * Se los reconoce por el cartel, que es lo que publica la empresa; el coche se
 * sigue guardando en la base, sólo que no se ofrece como servicio.
 */
const NOT_A_SERVICE = [
  'carga combustible',
  'traslado',
  'fuera de servicio',
  'sin servicio',
  'taller',
  'garage',
];

export function isInService(lineName?: string | null): boolean {
  const name = (lineName ?? '').toLowerCase();
  if (!name.trim()) return true;
  return !NOT_A_SERVICE.some((marker) => name.includes(marker));
}
