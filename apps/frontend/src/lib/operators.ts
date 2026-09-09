/**
 * Las empresas, escritas como se las conoce.
 *
 * En el feed son identificadores —`codesa`, `maldonado-turismo`, `micro`— y en
 * la pantalla tienen que ser el nombre que está pintado en el ómnibus. Vivía
 * duplicado en la ficha de la parada y en la del QR, y las dos pantallas
 * hablan de las mismas tres empresas.
 */
const OPERATOR_LABELS: Record<string, string> = {
  codesa: 'CODESA',
  'maldonado-turismo': 'Maldonado Turismo',
  micro: 'Micro',
};

export function operatorName(operator: string): string {
  return OPERATOR_LABELS[operator] ?? operator;
}

/** "CODESA · Micro". Una empresa que no esté en la tabla se muestra igual. */
export function operatorNames(operators: string[] | null | undefined): string {
  return (operators ?? []).map(operatorName).join(' · ');
}
