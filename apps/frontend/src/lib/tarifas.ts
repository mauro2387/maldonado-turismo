/**
 * Cuánto sale el boleto.
 *
 * Todo lo que hay acá está copiado de una publicación oficial y se cita:
 * si un número no se puede citar, no está. La app no estima un precio.
 *
 * ## De dónde sale
 *
 * La tarifa del transporte colectivo departamental **la fija la Intendencia**,
 * no cada empresa: la Resolución N° 12441/2025 (expediente 2025-88-01-22086,
 * firmada el 30/12/2025) adecúa "la tabla de valores de precio al público de
 * los boletos de transporte colectivo departamental de pasajeros" a partir
 * de las 00:00 del 1º de enero de 2026, y obliga a las empresas a exponerla
 * dentro de los ómnibus. Vale para CODESA, Maldonado Turismo y Micro por
 * igual. CODESA publica la resolución y la misma tabla en su sitio
 * (codesa.com.uy/p/precios.html); Maldonado Turismo publica la misma tabla
 * (maldonadoturismo.com/tarifas-2/) más las condiciones de los abonos y las
 * combinaciones; Micro no publica tarifas en internet.
 *
 * Lo que la resolución **no** dice es qué tramo es cada viaje. Eso son los
 * "cierres" de cada empresa: qué zonas separan un tramo del siguiente. CODESA
 * publica los suyos (codesa.com.uy/p/cierres-y-tramos-de-boletos.html, la
 * tabla "Cierres y Tramos de Boletos") y están copiados en `CIERRES_CODESA`;
 * los de Maldonado Turismo y Micro no están publicados y por eso para sus
 * líneas la app no puede decir qué tramo es un viaje.
 *
 * ## Cuándo deja de valer
 *
 * La resolución dice que el ajuste es anual y que hay "nuevos ajustes a
 * partir del 1º de julio de 2026" en los salarios del sector, así que
 * conviene mirar si hay una resolución nueva cada enero y cada julio. La
 * fecha de vigencia se muestra en la pantalla para que nadie tome por
 * actual una tabla vieja.
 */

export const TARIFAS = {
  vigenteDesde: '2026-01-01',
  resolucion: 'Resolución N° 12441/2025 de la Intendencia de Maldonado',
  fuentes: [
    {
      nombre: 'Resolución 12441/2025 (PDF publicado por CODESA)',
      url: 'https://drive.google.com/file/d/1hPk2EOqZ3dH_zblyiz5k1Ty_jTcclYD-/view',
    },
    { nombre: 'CODESA · Precios', url: 'https://www.codesa.com.uy/p/precios.html' },
    { nombre: 'Maldonado Turismo · Tarifas', url: 'https://maldonadoturismo.com/tarifas-2/' },
  ],

  /** Boletos comunes, en pesos uruguayos. Índice 0 es el boleto local. */
  comunes: [39, 62, 79, 101, 129],
  /**
   * Combinaciones: un boleto para llegar usando hasta dos ómnibus de
   * cualquier empresa. No hay combinación local. Índice 1 es tramo 1.
   */
  combinaciones: [null, 62, 84, 112, 140],
  /** Jubilados y pensionistas categoría A (ingresos hasta 3 BPC). */
  jubiladosA: [20, 31, 39, 51, 65],
  /** Jubilados y pensionistas categoría B (ingresos entre 3 y 4 BPC). */
  jubiladosB: [29, 46, 59, 76, 97],

  /**
   * Cuánto dura una combinación, por tramo, en horas. Lo publica Maldonado
   * Turismo citando la resolución del Director General de Tránsito y
   * Transporte: la combinación sirve para ir del origen al destino en hasta
   * dos ómnibus, no para volver.
   */
  combinacionHoras: [null, 1, 2, 3, 3],

  abonos: {
    /** Descuento sobre el boleto común, por resolución. */
    comunesDescuento: 20,
    /** Descuento del abono estudiantil, según lo publican las empresas. */
    estudiantesDescuento: 50,
    /** Lo que cuesta la tarjeta la primera vez, según las empresas. */
    tarjeta: 100,
    /** Cuándo se venden y recargan, según Maldonado Turismo. */
    venta: 'del 1 al 15 de cada mes',
    /** El estudiantil se expide de marzo a noviembre, según Maldonado Turismo. */
    estudiantilMeses: 'de marzo a noviembre',
  },
} as const;

export const NOMBRE_DE_TRAMO = ['Local', 'Tramo 1', 'Tramo 2', 'Tramo 3', 'Tramo 4'] as const;

/**
 * Los cierres de CODESA: de una zona a otra, qué tramo es.
 *
 * Copiado de la tabla "Cierres y Tramos de Boletos" que publica CODESA, con
 * los nombres de zona escritos como se leen. 0 es boleto local. La tabla no
 * es simétrica en cómo está escrita -no todas las zonas aparecen como
 * origen- así que se busca en las dos direcciones. Si un par no está, no se
 * sabe, y se dice.
 *
 * Lo que se dejó afuera a propósito: las filas "recorrido local" de San
 * Carlos y de Balneario Buenos Aires (un viaje dentro de la misma localidad
 * es boleto local, y eso lo cubre `desde === hasta`), la variante "Punta del
 * Este por Ruta 104" (mismo tramo que la directa) y una fila que dice "Ruta
 * 103, Escuela 24" donde todas las demás dicen Ruta 104: es casi seguro un
 * error de tipeo de la planilla, pero corregirlo sería inventar.
 */
export const ZONAS_CODESA = [
  'San Carlos',
  'Marelli',
  'Hipódromo',
  'Maldonado',
  'Punta del Este',
  'Balneario Buenos Aires',
  'Puente La Barra',
  'José Ignacio - Laguna Garzón',
  'Piriápolis',
  'Parada 44 Mansa',
  'Aeropuerto Laguna del Sauce',
  'Ruta 93, entrada Camino Arrayanes',
  'Km 2,5 Camino Arrayanes',
  'Parque Jagüel - Centro de Convenciones',
  'Macro Mercado',
  'Ruta 104 km 4',
  'Ruta 104, Escuela 24 (Pago de la Paja)',
  'Empalme Ruta 104 y Camino Medellín',
  'Camino Medellín',
  'Puente Laguna José Ignacio',
  'Parada 6, Bulevar Artigas (línea 14)',
] as const;

export type ZonaCodesa = (typeof ZONAS_CODESA)[number];

const C: Array<[ZonaCodesa, ZonaCodesa, number]> = [
  // SAN CARLOS.
  ['San Carlos', 'Hipódromo', 1],
  ['San Carlos', 'Maldonado', 2],
  ['San Carlos', 'Parada 44 Mansa', 3],
  ['San Carlos', 'Punta del Este', 3],
  ['San Carlos', 'Puente La Barra', 3],
  ['San Carlos', 'Balneario Buenos Aires', 3],
  ['San Carlos', 'Aeropuerto Laguna del Sauce', 4],
  ['San Carlos', 'Piriápolis', 4],
  ['San Carlos', 'José Ignacio - Laguna Garzón', 4],
  ['San Carlos', 'Ruta 104, Escuela 24 (Pago de la Paja)', 1],
  ['San Carlos', 'Ruta 104 km 4', 2],
  ['San Carlos', 'Empalme Ruta 104 y Camino Medellín', 2],
  ['San Carlos', 'Macro Mercado', 2],
  ['San Carlos', 'Parque Jagüel - Centro de Convenciones', 2],
  ['San Carlos', 'Camino Medellín', 3],
  // MARELLI.
  ['Marelli', 'Maldonado', 1],
  ['Marelli', 'San Carlos', 1],
  ['Marelli', 'Parada 44 Mansa', 2],
  ['Marelli', 'Punta del Este', 2],
  ['Marelli', 'Puente La Barra', 2],
  ['Marelli', 'Aeropuerto Laguna del Sauce', 3],
  ['Marelli', 'Balneario Buenos Aires', 3],
  ['Marelli', 'Piriápolis', 4],
  ['Marelli', 'José Ignacio - Laguna Garzón', 4],
  ['Marelli', 'Macro Mercado', 1],
  ['Marelli', 'Parque Jagüel - Centro de Convenciones', 1],
  // HIPODROMO.
  ['Hipódromo', 'Punta del Este', 1],
  ['Hipódromo', 'San Carlos', 1],
  ['Hipódromo', 'Parada 44 Mansa', 1],
  ['Hipódromo', 'Aeropuerto Laguna del Sauce', 2],
  ['Hipódromo', 'Puente La Barra', 2],
  ['Hipódromo', 'Balneario Buenos Aires', 3],
  ['Hipódromo', 'Ruta 93, entrada Camino Arrayanes', 3],
  ['Hipódromo', 'Piriápolis', 4],
  ['Hipódromo', 'José Ignacio - Laguna Garzón', 4],
  ['Hipódromo', 'Parque Jagüel - Centro de Convenciones', 1],
  ['Hipódromo', 'Macro Mercado', 1],
  // MALDONADO.
  ['Maldonado', 'Punta del Este', 1],
  ['Maldonado', 'Parada 44 Mansa', 1],
  ['Maldonado', 'Marelli', 1],
  ['Maldonado', 'San Carlos', 2],
  ['Maldonado', 'Aeropuerto Laguna del Sauce', 2],
  ['Maldonado', 'Puente La Barra', 2],
  ['Maldonado', 'Balneario Buenos Aires', 3],
  ['Maldonado', 'Ruta 93, entrada Camino Arrayanes', 3],
  ['Maldonado', 'Piriápolis', 4],
  ['Maldonado', 'José Ignacio - Laguna Garzón', 4],
  ['Maldonado', 'Parque Jagüel - Centro de Convenciones', 1],
  // P. DEL ESTE.
  ['Punta del Este', 'Puente La Barra', 1],
  ['Punta del Este', 'Parada 44 Mansa', 1],
  ['Punta del Este', 'Maldonado', 1],
  ['Punta del Este', 'Hipódromo', 1],
  ['Punta del Este', 'Balneario Buenos Aires', 2],
  ['Punta del Este', 'Aeropuerto Laguna del Sauce', 2],
  ['Punta del Este', 'Marelli', 2],
  ['Punta del Este', 'San Carlos', 3],
  ['Punta del Este', 'Ruta 93, entrada Camino Arrayanes', 3],
  ['Punta del Este', 'José Ignacio - Laguna Garzón', 4],
  ['Punta del Este', 'Piriápolis', 4],
  ['Punta del Este', 'Puente Laguna José Ignacio', 3],
  // BAL. Bs.As.
  ['Balneario Buenos Aires', 'Puente La Barra', 1],
  ['Balneario Buenos Aires', 'Punta del Este', 2],
  ['Balneario Buenos Aires', 'José Ignacio - Laguna Garzón', 3],
  ['Balneario Buenos Aires', 'Maldonado', 3],
  ['Balneario Buenos Aires', 'San Carlos', 3],
  ['Balneario Buenos Aires', 'Parada 44 Mansa', 3],
  ['Balneario Buenos Aires', 'Aeropuerto Laguna del Sauce', 4],
  ['Balneario Buenos Aires', 'Piriápolis', 4],
  ['Balneario Buenos Aires', 'Ruta 104 km 4', 1],
  ['Balneario Buenos Aires', 'Puente Laguna José Ignacio', 2],
  ['Balneario Buenos Aires', 'Parque Jagüel - Centro de Convenciones', 2],
  ['Balneario Buenos Aires', 'Parada 6, Bulevar Artigas (línea 14)', 2],
  // PUENTE LA BARRA.
  ['Puente La Barra', 'Balneario Buenos Aires', 1],
  ['Puente La Barra', 'Punta del Este', 1],
  ['Puente La Barra', 'Maldonado', 2],
  ['Puente La Barra', 'Parada 44 Mansa', 2],
  ['Puente La Barra', 'Hipódromo', 2],
  ['Puente La Barra', 'José Ignacio - Laguna Garzón', 3],
  ['Puente La Barra', 'San Carlos', 3],
  ['Puente La Barra', 'Aeropuerto Laguna del Sauce', 3],
  ['Puente La Barra', 'Piriápolis', 4],
  ['Puente La Barra', 'Ruta 104 km 4', 1],
  ['Puente La Barra', 'Parque Jagüel - Centro de Convenciones', 1],
  ['Puente La Barra', 'Parada 6, Bulevar Artigas (línea 14)', 1],
  ['Puente La Barra', 'Puente Laguna José Ignacio', 2],
  ['Puente La Barra', 'Ruta 104, Escuela 24 (Pago de la Paja)', 2],
  // JOSE IGNACIO - LAGUNA GARZÓN.
  ['José Ignacio - Laguna Garzón', 'Puente Laguna José Ignacio', 1],
  ['José Ignacio - Laguna Garzón', 'Balneario Buenos Aires', 2],
  ['José Ignacio - Laguna Garzón', 'Ruta 104 km 4', 3],
  ['José Ignacio - Laguna Garzón', 'Puente La Barra', 3],
  ['José Ignacio - Laguna Garzón', 'Maldonado', 4],
  ['José Ignacio - Laguna Garzón', 'San Carlos', 4],
  ['José Ignacio - Laguna Garzón', 'Piriápolis', 4],
  // PIRIAPOLIS.
  ['Piriápolis', 'Km 2,5 Camino Arrayanes', 0],
  ['Piriápolis', 'Ruta 93, entrada Camino Arrayanes', 1],
  ['Piriápolis', 'Aeropuerto Laguna del Sauce', 2],
  ['Piriápolis', 'Parada 44 Mansa', 3],
  ['Piriápolis', 'Maldonado', 4],
  ['Piriápolis', 'San Carlos', 4],
  ['Piriápolis', 'Punta del Este', 4],
  ['Piriápolis', 'José Ignacio - Laguna Garzón', 4],
  // P44 MANSA.
  ['Parada 44 Mansa', 'Aeropuerto Laguna del Sauce', 1],
  ['Parada 44 Mansa', 'Maldonado', 1],
  ['Parada 44 Mansa', 'Hipódromo', 1],
  ['Parada 44 Mansa', 'Punta del Este', 1],
  ['Parada 44 Mansa', 'Ruta 93, entrada Camino Arrayanes', 2],
  ['Parada 44 Mansa', 'Marelli', 2],
  ['Parada 44 Mansa', 'Puente La Barra', 2],
  ['Parada 44 Mansa', 'San Carlos', 2],
  ['Parada 44 Mansa', 'Piriápolis', 3],
  ['Parada 44 Mansa', 'Balneario Buenos Aires', 3],
  ['Parada 44 Mansa', 'José Ignacio - Laguna Garzón', 4],
  // AEROP. LAGUNA DEL SAUCE.
  ['Aeropuerto Laguna del Sauce', 'Ruta 93, entrada Camino Arrayanes', 1],
  ['Aeropuerto Laguna del Sauce', 'Parada 44 Mansa', 1],
  ['Aeropuerto Laguna del Sauce', 'Piriápolis', 2],
  ['Aeropuerto Laguna del Sauce', 'Maldonado', 2],
  ['Aeropuerto Laguna del Sauce', 'Hipódromo', 2],
  ['Aeropuerto Laguna del Sauce', 'Punta del Este', 2],
  ['Aeropuerto Laguna del Sauce', 'Parque Jagüel - Centro de Convenciones', 2],
  ['Aeropuerto Laguna del Sauce', 'Puente La Barra', 3],
  ['Aeropuerto Laguna del Sauce', 'Balneario Buenos Aires', 3],
  ['Aeropuerto Laguna del Sauce', 'Marelli', 3],
  ['Aeropuerto Laguna del Sauce', 'San Carlos', 3],
  ['Aeropuerto Laguna del Sauce', 'José Ignacio - Laguna Garzón', 4],
  // RUTA 93, ENTRADA CAMINO ARRAYANES.
  ['Ruta 93, entrada Camino Arrayanes', 'Piriápolis', 1],
  ['Ruta 93, entrada Camino Arrayanes', 'Aeropuerto Laguna del Sauce', 1],
  ['Ruta 93, entrada Camino Arrayanes', 'Parada 44 Mansa', 2],
  ['Ruta 93, entrada Camino Arrayanes', 'Maldonado', 3],
  ['Ruta 93, entrada Camino Arrayanes', 'Hipódromo', 3],
  ['Ruta 93, entrada Camino Arrayanes', 'Punta del Este', 3],
  ['Ruta 93, entrada Camino Arrayanes', 'Marelli', 4],
  ['Ruta 93, entrada Camino Arrayanes', 'San Carlos', 4],
  ['Ruta 93, entrada Camino Arrayanes', 'Puente La Barra', 4],
  ['Ruta 93, entrada Camino Arrayanes', 'José Ignacio - Laguna Garzón', 4],
  // KM 2,5 CAMINO ARRAYANES.
  ['Km 2,5 Camino Arrayanes', 'Piriápolis', 0],
  ['Km 2,5 Camino Arrayanes', 'Ruta 93, entrada Camino Arrayanes', 1],
  ['Km 2,5 Camino Arrayanes', 'Aeropuerto Laguna del Sauce', 2],
  ['Km 2,5 Camino Arrayanes', 'Parada 44 Mansa', 3],
  ['Km 2,5 Camino Arrayanes', 'Maldonado', 4],
  ['Km 2,5 Camino Arrayanes', 'Hipódromo', 4],
  ['Km 2,5 Camino Arrayanes', 'Punta del Este', 4],
  ['Km 2,5 Camino Arrayanes', 'José Ignacio - Laguna Garzón', 4],
];

export const CIERRES_CODESA = C;

/**
 * Qué tramo es un viaje de CODESA entre dos zonas, según la tabla de la
 * empresa. `null` si el par no está publicado: no se deduce.
 */
export function tramoCodesa(desde: ZonaCodesa, hasta: ZonaCodesa): number | null {
  if (desde === hasta) return 0;
  const directo = C.find(([a, b]) => a === desde && b === hasta);
  if (directo) return directo[2];
  const vuelta = C.find(([a, b]) => a === hasta && b === desde);
  return vuelta ? vuelta[2] : null;
}

/** "$ 62", como se escribe acá. */
export function pesos(valor: number): string {
  return `$ ${valor.toLocaleString('es-UY')}`;
}
