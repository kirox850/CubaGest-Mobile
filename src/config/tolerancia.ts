// ─── LA TOLERANCIA DE DESCUADRE ──────────────────────────────────────────────
//
// El margen de descuadre que un negocio acepta, y las reglas para no poder
// meter un número que rompa la conciliación.
//
// DOS COSAS QUE NO SON INTERCAMBIABLES:
//
//  · EN PORCENTAJE va de 0 a 100. Un 200% de tolerancia aceptaría cualquier
//    descuadre, que es lo contrario de una tolerancia: es desactivar la
//    detección de robos. El backend también lo recorta a 100, pero mandarle un
//    200 y ver el error del servidor es peor que no dejar escribirlo.
//
//  · EN ABSOLUTO no tiene un tope fijo, pero hay un máximo de 9 dígitos
//    (999 999 999). Es el mismo MAX_MOVEMENT del backend. Arriba de eso no hay
//    descuadre: hay un tecleo equivocado.
//
// Y una consecuencia que conviene tener presente al usarla: una tolerancia
// ABSOLUTA se compara SIEMPRE contra la moneda base de la caja, no contra cada
// moneda por separado (cierreDinero.ts). Por eso un margen de 100 CUP ignora un
// descuadre de 5 USD, que no son 100 pesos. No es un error de la app: es la
// regla del backend, y esta pantalla lo dice en voz alta en vez de dejar que el
// dueño descubra que su tolerancia no hace lo que creía.

export type ToleranciaModo = 'absoluto' | 'porcentaje';

export const PORCENTAJE_MAXIMO = 100;
/** El mismo tope que el backend en importes (MAX_MOVEMENT = 1e9). */
export const ABSOLUTO_MAXIMO = 999_999_999;

/**
 * ¿El valor cabe en este modo?
 *
 * @param texto lo que el dueño está escribiendo, tal cual
 */
export function enRango(texto: string, modo: ToleranciaModo): boolean {
  const crudo = (texto ?? '').trim();
  // Vacío o ya en proceso: no es un error todavía, es un campo en uso.
  if (crudo === '') return true;
  const v = Number(crudo.replace(',', '.'));
  if (!Number.isFinite(v)) return false;
  if (v < 0) return false;
  if (modo === 'porcentaje') return v <= PORCENTAJE_MAXIMO;
  return v <= ABSOLUTO_MAXIMO;
}

/** El mensaje de por qué no se puede guardar, o null si sí se puede. */
export function errorDeRango(texto: string, modo: ToleranciaModo): string | null {
  if (enRango(texto, modo)) return null;
  if (modo === 'porcentaje') {
    return `El porcentaje no puede pasar de ${PORCENTAJE_MAXIMO}%. Más de eso no sería una tolerancia: sería no detectar los faltantes.`;
  }
  return 'Esa cantidad es demasiado grande. Revisa el número.';
}

/** El número a enviar, o null si no se puede guardar. */
export function valorDeTolerancia(texto: string, modo: ToleranciaModo): number | null {
  if (!enRango(texto, modo)) return null;
  const v = Number((texto ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(v)) return null;
  return v;
}

/**
 * Aviso sobre una tolerancia absoluta, en los términos del dueño.
 *
 * No bloquea: es una consecuencia del backend que él tiene que conocer. Se
 * muestra junto al campo, en el momento de fijarla, y no meses después cuando
 * un descuadre de dólares pasa desapercibido.
 */
export function avisoTolerancia(modo: ToleranciaModo, valor: number, hayVariasMonedas: boolean): string | null {
  if (modo !== 'absoluto' || valor <= 0 || !hayVariasMonedas) return null;
  return `Este margen se compara contra la moneda base de la caja, no contra cada moneda. ` +
    `Un descuadre pequeño en una moneda distinta de la base puede quedar por debajo del margen y no avisar.`;
}
