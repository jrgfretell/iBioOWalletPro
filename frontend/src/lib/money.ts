/** All supported currencies use two decimal places. Calculations use integer cents. */
export function aCentavos(monto: number): number {
  if (!Number.isFinite(monto)) throw Error('Importe no válido');
  const cents = Math.round((Math.abs(monto) + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents)) throw Error('Importe fuera del rango permitido');
  return monto < 0 ? -cents : cents;
}

export function deCentavos(centavos: number): number {
  return centavos === 0 ? 0 : centavos / 100;
}
