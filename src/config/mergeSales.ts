// ─── FUSIÓN DE FACTURAS: servidor + cola local ────────────────────────────────
//
// POR QUÉ EXISTE. Una venta cobrada sin conexión es real: se cobró, se entregó
// la mercancía y alguien tiene un papel con un número que el servidor todavía
// no conoce. Si la pantalla de Facturas solo muestra lo que vino de arriba,
// esa venta es invisible justo cuando más molesta — y la primera señal de que
// "el POS no guardó" es un cliente que vuelve con el papel.
//
// Regla de colisión, y es la parte importante: cuando una venta local tiene el
// MISMO `clientSaleId` que una del servidor, GANA LA LOCAL. Ese `clientSaleId`
// es la clave de idempotencia que el backend ya persistió, así que las dos
// filas son la MISMA venta, no dos: lo que se está eligiendo es de qué lado
// se lee. Y la local lleva la verdad más reciente — el número de factura que
// devolvió el sync cuando se confirmó, o el error que aún impide mandarla.
//
// La local gana también por una razón práctica: la fila del servidor puede no
// estar en la página que se descargó. Elegir la local garantiza que una venta
// visible antes del sync siga siéndolo después.

import type { Sale } from '../types';
import type { OfflineSale, SyncStatus } from '../offline/offlineStore';

// `businessId` es opcional en la fila fusionada: la del servidor lo trae, y la
// cola local no lo guarda nunca (el namespace ya aísla por empresa). No se
// inventa un valor vacío para satisfacer al tipo.
export interface MergedSaleRow extends Omit<Sale, 'businessId'> {
  businessId?: string;
  /** La fila viene de la cola local de este dispositivo. */
  esOffline?: boolean;
  /** Estado en la cola local (solo si `esOffline`). */
  estadoOffline?: SyncStatus;
  /** Por qué sigue pendiente, o por qué está en conflicto. */
  offlineHint?: string;
  /** ID local legible (LOCAL-0001), para reconocerla sin abrirla. */
  localId?: string;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Instante de la venta, en ms. Tolerance cero: un `NaN` aquí pone la fila al final. */
function instante(row: { date?: string; createdAt?: string; syncedAt?: string; timestamp?: number }): number {
  if (typeof row.timestamp === 'number' && Number.isFinite(row.timestamp)) return row.timestamp;
  for (const raw of [row.date, row.createdAt, row.syncedAt]) {
    if (!raw) continue;
    const t = new Date(raw).getTime();
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

function toRow(sale: OfflineSale): MergedSaleRow {
  return {
    // La factura que el servidor confirmó al sincronizar; si la venta sigue
    // viva no hay ninguno y se muestra el id local, que es honesto.
    id: sale.serverId || sale.localId,
    invoiceNumber: sale.invoiceNumber,
    date: new Date(sale.timestamp).toISOString(),
    clientName: sale.clientName || sale.client || 'Consumidor Final',
    clientNit: sale.clientNit,
    clientPhone: sale.clientPhone,
    subtotal: num(sale.subtotal),
    total: num(sale.total),
    currency: sale.currency || 'CUP',
    payMethod: sale.payMethod,
    status: 'emitida',
    locationId: sale.locationId,
    clientSaleId: sale.clientSaleId,
    items: sale.items.map((i) => ({
      productId: i.productId,
      name: i.name,
      qty: num(i.qty),
      price: num(i.price),
      total: num(i.total),
    })),
    esOffline: true,
    estadoOffline: sale.status,
    localId: sale.localId,
    offlineHint: sale.conflictReason || sale.lastError,
  };
}

/**
 * Junta las ventas del servidor con las que siguen en la cola local.
 *
 * Deliberadamente TOLERANTE en el segundo argumento: si la lectura local falló
 * (AsyncStorage lleno, abortada) la pantalla llama a esta función con la lista
 * vacía y sigue viendo las facturas del servidor. La cola es un extra, nunca un
 * requisito para ver la lista — si lo fuera, un fallo de almacenamiento dejaría
 * la pantalla en blanco y el aviso apuntaría al problema equivocado.
 */
export function mergeSales(server: Sale[], offline?: OfflineSale[] | null): MergedSaleRow[] {
  const delServidor = Array.isArray(server) ? server : [];
  // Las ventas ya sincronizadas NO se añaden: el servidor ya las tiene y las
  // devuelve con su número definitivo. Reagregarlas sería mostrar dos veces la
  // misma venta.
  const vivas = (Array.isArray(offline) ? offline : []).filter((s) => s?.status !== 'synced');

  // Las filas locales van PRIMERO a propósito: al montar la lista se lleva su
  // `clientSaleId` y la fila del servidor que choca con él se descarta. Así la
  // decisión "gana la local" no depende de un `sort` posterior que la revierta.
  const out: MergedSaleRow[] = vivas.map(toRow);
  const ganadoras = new Set<string>();
  for (const fila of out) {
    if (fila.clientSaleId) ganadoras.add(fila.clientSaleId);
  }
  for (const s of delServidor) {
    const clave = s?.clientSaleId;
    // Una venta del servidor sin clientSaleId (creada en la web) no puede
    // chocar con nada: se muestra siempre.
    if (clave && ganadoras.has(clave)) continue;
    out.push({ ...s });
  }

  return out.sort((a, b) => instante(b) - instante(a));
}
