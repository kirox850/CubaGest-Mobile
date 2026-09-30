// ─── STOCK LOCAL (la mercancía que se puede cobrar) ──────────────────────────
//
// El stock que se MUESTRA y se puede cobrar es el LOCAL: el último stock que
// envió el servidor menos las ventas de ESTE dispositivo que siguen pendientes
// de subir. Sin esa resta, la app ofrece mercancía que ya se vendió — y en un
// negocio con mala conectividad ese es exactamente el momento en que más se
// cobra.
//
// La regla de la web es `localStock = max(0, stock - pendingQty)`. El móvil
// usaba otra cosa, `old ? old.localStock : stock`, que falla justo en el caso
// que importa: un producto NUEVO en el caché que ya tiene ventas offline
// pendientes entra con el stock entero del servidor, así que la app ofrece de
// más. Y en el caso contrario — un producto que ya estaba cacheado — se
// quedaba pegado al `localStock` viejo, sin recalcular nunca.
//
// Aquí vive la derivación, sola y testeada, para que no se pueda volver a
// escribir a mano dentro de `cacheProducts`.

export interface VentaParaStock {
  status: 'pending' | 'syncing' | 'synced' | 'conflict' | string;
  items: { productId: string; qty: number }[];
}

/**
 * El stock disponible para la venta.
 *
 * Nunca baja de cero: un descuadre de stock no puede fabricar mercancía
 * negativa, solo dejar de ofrecer más de lo que hay.
 */
export function derivarLocalStock(stock: number, pendingQty: number): number {
  const s = Number(stock);
  const p = Number.isFinite(Number(pendingQty)) ? Number(pendingQty) : 0;
  if (!Number.isFinite(s)) return 0;
  return Math.max(0, s - p);
}

/**
 * Cuánto de un producto está comprometido en ventas que AÚN no han subido.
 *
 * Se cuentan las ventas `pending` y `syncing`: las dos están vivas y las dos
 * siguen descontando stock. Una venta `synced` ya la tiene el servidor, así que
 * su stock ya viene descontado en el `stock` que nos pasó — volver a restarlo
 * sería descontarlo dos veces. Una venta en `conflict` devolvió su stock local
 * (ver restoreLocalStock), así que tampoco cuenta.
 */
export function pendingQtyDe(sales: VentaParaStock[], productId: string): number {
  let total = 0;
  for (const sale of sales || []) {
    if (sale?.status !== 'pending' && sale?.status !== 'syncing') continue;
    for (const item of sale?.items || []) {
      if (item?.productId === productId) total += Number(item.qty) || 0;
    }
  }
  return total;
}

/** Lo mismo, para un producto que aparece en varias ventas a la vez. */
export function pendingQtyPorProducto(sales: VentaParaStock[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const sale of sales || []) {
    if (sale?.status !== 'pending' && sale?.status !== 'syncing') continue;
    for (const item of sale?.items || []) {
      if (!item?.productId) continue;
      out[item.productId] = (out[item.productId] || 0) + (Number(item.qty) || 0);
    }
  }
  return out;
}
