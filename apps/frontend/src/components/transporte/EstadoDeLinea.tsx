import { VehiclePosition } from '@services/transportService';
import { operatorName } from '@lib/operators';

/**
 * Qué está pasando con una línea ahora mismo, en un renglón.
 *
 * La lista de líneas decía cuántos recorridos tiene cada una y cuántas
 * paradas, que es lo que no cambia. Lo que cambia -y lo que decide si esperar
 * o no- no lo decía: si hay coches en la calle, cuántos, o si la empresa
 * directamente no está reportando. Alguien mirando "24 · CODESA · 2
 * recorridos" a las once de la noche no tenía forma de saber que hacía una
 * hora que no salía ninguno.
 *
 * Son tres estados y se distinguen porque piden cosas distintas:
 *
 * - **N en la calle**: hay coches reportando en servicio en esa línea.
 * - **Sin coches reportando**: el GPS de la empresa entra bien y ninguno
 *   está en esa línea. Puede ser que terminó por hoy o que todavía no salió;
 *   el horario de la línea es el que lo dice.
 * - **Sin GPS de la empresa**: no se sabe. No es "sin coches": es que no hay
 *   dato, y la app no convierte ignorancia en un cero.
 * - **Sin conexión**: tampoco se sabe, pero por el teléfono y no por la
 *   empresa. Sin esto, con la red caída la lista de coches llega vacía y
 *   todas las líneas decían "sin coches", que es la misma mentira.
 */

export type EstadoDeLinea =
  | { tipo: 'en-calle'; coches: number }
  | { tipo: 'sin-coches' }
  | { tipo: 'sin-gps'; empresa: string }
  | { tipo: 'sin-conexion' };

/**
 * Cuántos coches en servicio está haciendo cada línea, por empresa y código.
 *
 * Los que van a cargar combustible o hacen un traslado contratado no cuentan:
 * andan por la calle y nadie se los puede tomar.
 */
export function cochesPorLinea(vehicles: VehiclePosition[]): Map<string, number> {
  const porLinea = new Map<string, number>();
  for (const vehicle of vehicles) {
    if (vehicle.in_service === false || !vehicle.line_code || !vehicle.operator) continue;
    const clave = `${vehicle.operator}|${vehicle.line_code}`;
    porLinea.set(clave, (porLinea.get(clave) ?? 0) + 1);
  }
  return porLinea;
}

export function estadoDeLinea(
  porLinea: Map<string, number>,
  empresasCaidas: string[],
  operator: string,
  lineCode: string,
  /** El pedido de posiciones falló: no hay con qué contar. */
  sinConexion = false,
): EstadoDeLinea {
  if (sinConexion) return { tipo: 'sin-conexion' };
  if (empresasCaidas.includes(operator)) {
    return { tipo: 'sin-gps', empresa: operatorName(operator) };
  }
  const coches = porLinea.get(`${operator}|${lineCode}`) ?? 0;
  return coches > 0 ? { tipo: 'en-calle', coches } : { tipo: 'sin-coches' };
}

export function EstadoDeLineaChip({ estado }: { estado: EstadoDeLinea }) {
  if (estado.tipo === 'en-calle') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-live">
        <span className="h-1.5 w-1.5 rounded-full bg-live-dot animate-pulse-dot" />
        {estado.coches === 1 ? '1 coche en la calle' : `${estado.coches} coches en la calle`}
      </span>
    );
  }

  if (estado.tipo === 'sin-gps') {
    return (
      <span className="inline-flex items-center rounded-chip bg-warn-soft px-1.5 py-0.5 text-xs font-semibold text-warn">
        Sin GPS de {estado.empresa}
      </span>
    );
  }

  if (estado.tipo === 'sin-conexion') {
    return (
      <span className="text-xs font-semibold text-ink-400">
        Sin conexión: no sabemos si hay coches en la calle
      </span>
    );
  }

  return <span className="text-xs font-semibold text-ink-400">Sin coches reportando ahora</span>;
}

export default EstadoDeLineaChip;
