// ─── DINERO DEL CIERRE (reglas puras) ────────────────────────────────────────
//
// La cuenta, en una línea:
//
//   esperado = fondo del turno + ventas en efectivo + entradas − salidas
//   descuadre = contado − esperado
//
// Y dos cosas que parecen detalles y no lo son:
//
//  1. CADA MONEDA POR SEPARADO. Si la caja tiene 100 CUP y 2 USD, se compara 100
//     contra los CUP y 2 contra los USD. Sumarlos daría "102" contra un total en
//     pesos, que no significa nada. Por eso todo aquí son
//     `Record<string, number>` y nunca un número único.
//  2. Solo se envía lo que se CONTÓ. Ver `countedCashDe`: mandar ceros por
//     defecto inventaría un descuadre del 100% en cada moneda con saldo.

export type Cajas = Record<string, number>;

/** Lo que el cajero está escribiendo: texto, no número. */
export type ContadoTexto = Record<string, string>;

/** La diferencia se considera cero por debajo de medio céntimo. */
export const TOLERANCIA_CENTAVOS = 0.005;

/** El mismo criterio que usa el backend para no acumular ruido de flotantes. */
export function esCero(diferencia: number): boolean {
  return Math.abs(Number(diferencia) || 0) <= TOLERANCIA_CENTAVOS;
}

/**
 * Lo que se manda al backend: SOLO las monedas que el cajero escribió.
 *
 * Vacío significa "no se contó dinero", que es un caso que el servidor ya sabe
 * manejar (el mismo `countedCash: {}` que usa el preview) y que deja el cierre
 * funcionando exactamente como antes de existir esta pantalla.
 */
export function countedCashDe(contado: ContadoTexto): Cajas {
  const out: Cajas = {};
  for (const [k, v] of Object.entries(contado || {})) {
    const x = Number(v);
    // Un campo con texto que no es número (o vacío) cuenta como 0 contado, no
    // como "fuente": se envió una respuesta, aunque sea "no había nada".
    out[k] = Number.isFinite(x) ? x : 0;
  }
  return out;
}

/** ¿Se escribió algo? Si no, el cierre se manda sin dinero. */
export function hayConteo(contado: ContadoTexto): boolean {
  return Object.keys(contado || {}).length > 0;
}

/**
 * Las monedas que hay que pedir en la pantalla: las del esperado y las que el
 * cajero ya escribió. Si puso una moneda que no se esperaba, se conserva: puede
 * estar contando ese dinero de verdad.
 */
export function monedasAContar(esperado: Cajas | undefined, contado: ContadoTexto): string[] {
  return Array.from(new Set([...Object.keys(esperado || {}), ...Object.keys(contado || {})]));
}

/** Esperadas por las que el cajero no escribió: aviso, no error. */
export function sinContar(esperado: Cajas | undefined, contado: ContadoTexto): string[] {
  return Object.keys(esperado || {}).filter((k) => !(k in (contado || {})));
}

/** La diferencia de una moneda, ya redondeada a centavo. */
export function diffDe(esperado: number | undefined, contado: number | string | undefined): number {
  const e = Number(esperado) || 0;
  const c = Number(contado) || 0;
  return Math.round((c - e) * 100) / 100;
}

// ── El fondo con el que se abre el turno ─────────────────────────────────────

/** Una fila del editor de monedas: el nombre y lo escrito, como texto. */
export type FilaMoneda = { cur: string; valor: string };

/**
 * El fondo del turno, por moneda.
 *
 * Este dato es del que depende TODA la conciliación posterior: sin él, un
 * faltante de 200 al cerrar no se distingue de "ya faltaban 200 al abrir". Por
 * eso se pregunta al abrir el turno y no al cerrarlo.
 *
 * Solo se envían las monedas con un importe REAL. Un campo vacío, un 0 o un
 * negativo no se mandan: el backend descarta los ceros al normalizar, y
 * "abro con 0" no es lo mismo que "no dijiste cuánto abrías con".
 */
export function baseCashDe(filas: FilaMoneda[] | undefined): Cajas {
  const out: Cajas = {};
  for (const f of filas || []) {
    const cur = (f?.cur || '').trim().toUpperCase().slice(0, 8);
    if (!cur) continue;
    const v = Number(f?.valor);
    if (Number.isFinite(v) && v > 0) out[cur] = v;
  }
  return out;
}
