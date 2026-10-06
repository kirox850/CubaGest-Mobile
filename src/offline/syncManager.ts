// ─── CUBAGEST SYNC MANAGER ──────────────────────────────────────────────────
// Sincroniza la cola de ventas offline contra POST /sales/sync.
//
// Garantías (P0):
//  - Cada venta viaja con su `clientSaleId` (UUID del dispositivo) y su
//    `locationId` inmutable: si el POST se pierde y se reintenta, el backend
//    reconoce la venta y devuelve la factura ORIGINAL en vez de duplicarla.
//  - Las ventas se marcan 'syncing' antes de salir; si algo falla vuelven a
//    'pending' (nunca quedan colgadas).
//  - Resultado AUSENTE o CON FORMA DESCONOCIDA ⇒ la venta vuelve a 'pending'
//    (reintentable) y su stock local NO se restaura: la venta sigue viva.
//  - Solo un CONFLICTO explícito del servidor (status:'conflict') marca la
//    venta y devuelve el stock local al catálogo.
//  - Nada de polling: el sync se dispara al arrancar (online), al volver a
//    primer plano, al reconectar y a petición manual.

import { apiFetch } from '../api/client';
import {
  getPendingSales,
  getAllOfflineSales,
  updateSaleStatus,
  saveSyncLog,
  restoreLocalStock,
  resetStuckSyncingSales,
  getOfflineOperations,
  updateOfflineOperation,
  type OfflineSale,
  type OfflineOperation,
} from './offlineStore';
import { getActiveNamespace } from './namespace';

let syncing = false;

export function isSyncing(): boolean {
  return syncing;
}

export interface SyncResult {
  synced: number;
  conflicts: number;
  /** Ventas sin resultado del servidor: se reintentan, NO se pierden. */
  unknown: number;
  attempted: number;
  operationsSynced?: number;
  operationsConflict?: number;
  error?: string;
}

const OPERATION_ORDER: Record<OfflineOperation['kind'], number> = {
  shift_open: 0,
  manual_reading: 1,
  transfer_create: 2,
  closing_confirm: 3,
  cash_movement: 4,
  expense: 5,
  transfer_resolve: 6,
  shift_close: 7,
};

async function syncOperation(operation: OfflineOperation): Promise<Record<string, any>> {
  const payload = operation.payload;
  switch (operation.kind) {
    case 'shift_open':
      return apiFetch('/shift/start', { method: 'POST', body: payload });
    case 'manual_reading':
      return apiFetch('/closing/readings', { method: 'POST', body: payload });
    case 'closing_confirm': {
      const all = await getOfflineOperations(['synced', 'pending', 'syncing']);
      const opening = all.find((op) => op.kind === 'manual_reading' && op.payload.clientReadingId === payload.initialReadingId);
      const initialReadingId = opening?.serverResult?.id || payload.initialReadingId;
      return apiFetch('/closing/confirm', { method: 'POST', body: { ...payload, initialReadingId } });
    }
    case 'transfer_create':
      return apiFetch('/transfers', { method: 'POST', body: payload });
    case 'cash_movement':
      return apiFetch('/cash-movements', { method: 'POST', body: payload });
    case 'expense':
      return apiFetch('/accounting/expenses', { method: 'POST', body: payload });
    case 'transfer_resolve':
      return apiFetch(`/transfers/${payload.transferId}/${payload.decision}`, {
        method: 'POST', body: payload.decision === 'reject' ? { reason: payload.reason } : {},
      });
    case 'shift_close': {
      const all = await getOfflineOperations(['synced', 'pending', 'syncing']);
      const opening = all.find((op) => op.kind === 'shift_open' && op.payload.clientReadingId === payload.initialReadingId);
      const initialReadingId = opening?.serverResult?.shift?.openingReadingId || payload.initialReadingId;
      return apiFetch('/shift/end', { method: 'POST', body: { ...payload, initialReadingId } });
    }
  }
}

async function syncOperationGroup(
  kinds: OfflineOperation['kind'][],
  operationIds?: Set<string>,
): Promise<{ synced: number; conflicts: number; error?: string }> {
  const operations = (await getOfflineOperations(['pending']))
    .filter((operation) => kinds.includes(operation.kind) && (!operationIds || operationIds.has(operation.clientOperationId)))
    .sort((a, b) => a.businessAt - b.businessAt || OPERATION_ORDER[a.kind] - OPERATION_ORDER[b.kind]);
  let synced = 0;
  let conflicts = 0;
  let firstError: string | undefined;
  for (const operation of operations) {
    await updateOfflineOperation(operation.clientOperationId, 'syncing');
    try {
      const result = await syncOperation(operation);
      await updateOfflineOperation(operation.clientOperationId, 'synced', { serverResult: result });
      synced++;
    } catch (error) {
      const message = (error as Error).message || 'No se pudo sincronizar la operación';
      // La respuesta de validación no se reintentará en bucle; queda visible
      // para corregir. Fallos de red/servidor permanecen pendientes.
      const status = Number((error as any)?.status);
      const permanent = Number.isFinite(status) && status >= 400 && status < 500 && status !== 408 && status !== 429;
      await updateOfflineOperation(operation.clientOperationId, permanent ? 'conflict' : 'pending', { lastError: message });
      if (permanent) { conflicts++; firstError ||= message; }
      else firstError ||= message;
    }
  }
  return { synced, conflicts, error: firstError };
}

interface SyncResponseRow {
  localId?: string;
  clientSaleId?: string;
  status?: string;
  serverId?: string;
  invoiceNumber?: string;
  reason?: string;
}

export async function restoreLocalStockForSale(sale: OfflineSale): Promise<void> {
  const deltas: Record<string, number> = {};
  for (const item of sale.items) {
    deltas[item.productId] = (deltas[item.productId] || 0) + item.qty;
  }
  await restoreLocalStock(deltas);
}

function toPayload(sale: OfflineSale) {
  return {
    localId: sale.localId,
    // Idempotency key del dispositivo: el backend la persiste con la venta.
    clientSaleId: sale.clientSaleId,
    locationId: sale.locationId,
    // El backend espera clientName; s.client mantiene compat con ventas
    // viejas guardadas antes del renombre.
    clientName: sale.clientName || sale.client || 'Consumidor Final',
    clientNit: sale.clientNit,
    clientPhone: sale.clientPhone,
    items: sale.items.map((i) => ({
      productId: i.productId,
      qty: i.qty,
      price: i.price,
      discountId: i.discountId,
      discountAmount: i.discountAmount || 0,
    })),
    payments: sale.payments?.length ? sale.payments : [{
      method: sale.payMethod,
      currency: sale.currency || 'CUP',
      amount: sale.total,
      exchangeRate: 1,
      rateSource: 'same_currency',
    }],
    payMethod: sale.payMethod,
    currency: sale.currency || 'CUP',
    discountId: sale.discountId,
    saleDiscountAmount: sale.saleDiscountAmount || 0,
    taxAmount: sale.tax || 0,
    // Momento local del dispositivo (auditoría). El servidor usa su propia
    // hora de recepción para planes y cierres.
    offlineTimestamp: sale.timestamp,
  };
}

async function syncSalesBatch(sales: OfflineSale[]): Promise<{
  synced: number; conflicts: number; unknown: number; error?: string;
}> {
  if (!sales.length) return { synced: 0, conflicts: 0, unknown: 0 };
  for (const sale of sales) {
    await updateSaleStatus(sale.localId, 'syncing', undefined, undefined, { incrementAttempts: true });
  }

  let raw: SyncResponseRow[];
  try {
    raw = await apiFetch<SyncResponseRow[]>('/sales/sync', {
      method: 'POST', body: { sales: sales.map(toPayload) },
    });
  } catch (error) {
    const message = (error as Error).message || 'No se pudo sincronizar la venta';
    for (const sale of sales) await updateSaleStatus(sale.localId, 'pending', undefined, undefined, { lastError: message });
    return { synced: 0, conflicts: 0, unknown: sales.length, error: message };
  }

  if (!Array.isArray(raw)) {
    const message = 'El servidor devolvió una respuesta que no entendimos';
    for (const sale of sales) await updateSaleStatus(sale.localId, 'pending', undefined, undefined, { lastError: message });
    return { synced: 0, conflicts: 0, unknown: sales.length, error: message };
  }

  const byLocal = new Map<string, SyncResponseRow>();
  const byClient = new Map<string, SyncResponseRow>();
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    if (row.localId) byLocal.set(row.localId, row);
    if (row.clientSaleId) byClient.set(row.clientSaleId, row);
  }

  let synced = 0;
  let conflicts = 0;
  let unknown = 0;
  let error: string | undefined;
  for (const sale of sales) {
    const result = byLocal.get(sale.localId) || byClient.get(sale.clientSaleId);
    if (!result) {
      await updateSaleStatus(sale.localId, 'pending', undefined, undefined, { lastError: 'El servidor no devolvió resultado para esta venta' });
      unknown++;
      error ||= 'El servidor no confirmó una venta; el resto de operaciones queda pendiente.';
      continue;
    }
    const status = String(result.status || '').toLowerCase();
    if (status === 'synced' || status === 'ok' || result.serverId) {
      await updateSaleStatus(sale.localId, 'synced', result.serverId, undefined, { invoiceNumber: result.invoiceNumber });
      synced++;
      continue;
    }
    if (status === 'conflict' || status === 'rejected' || status === 'error') {
      await updateSaleStatus(sale.localId, 'conflict', undefined, result.reason || 'El servidor rechazó la venta');
      await restoreLocalStockForSale(sale);
      conflicts++;
      error ||= result.reason || 'Una venta requiere revisión; las operaciones posteriores quedan pendientes.';
      continue;
    }
    await updateSaleStatus(sale.localId, 'pending', undefined, undefined, {
      lastError: `Estado de sincronización no reconocido: "${String(result.status)}"`,
    });
    unknown++;
    error ||= 'Una venta quedó sin confirmación; las operaciones posteriores quedan pendientes.';
  }
  return { synced, conflicts, unknown, error };
}

type SyncEvent =
  | { kind: 'sale'; businessAt: number; sale: OfflineSale }
  | { kind: 'operation'; businessAt: number; operation: OfflineOperation }
  | { kind: 'blocker'; businessAt: number };

function eventPriority(event: SyncEvent): number {
  if (event.kind === 'blocker') return -1;
  if (event.kind === 'sale') return 2;
  switch (event.operation.kind) {
    case 'shift_open': return 0;
    case 'manual_reading':
    case 'transfer_create': return 1;
    case 'cash_movement':
    case 'expense': return 3;
    case 'transfer_resolve': return 4;
    case 'closing_confirm': return 5;
    case 'shift_close': return 6;
  }
}

function compareEvents(a: SyncEvent, b: SyncEvent): number {
  if (a.businessAt !== b.businessAt) return a.businessAt - b.businessAt;
  if (a.kind === 'blocker') return -1;
  if (b.kind === 'blocker') return 1;
  if (a.kind === 'operation' && b.kind === 'operation') {
    const aKind = a.operation.kind;
    const bKind = b.operation.kind;
    if (aKind === 'shift_open' && bKind === 'shift_close') {
      return b.operation.payload.initialReadingId === a.operation.payload.clientReadingId ? -1 : 1;
    }
    if (aKind === 'shift_close' && bKind === 'shift_open') {
      return a.operation.payload.initialReadingId === b.operation.payload.clientReadingId ? 1 : -1;
    }
    if (aKind === 'transfer_create' && bKind === 'transfer_resolve') return -1;
    if (aKind === 'transfer_resolve' && bKind === 'transfer_create') return 1;
  }
  return eventPriority(a) - eventPriority(b);
}

export async function runSync(manual = false): Promise<SyncResult> {
  const empty: SyncResult = { synced: 0, conflicts: 0, unknown: 0, attempted: 0, operationsSynced: 0, operationsConflict: 0 };

  if (syncing) {
    return { ...empty, error: manual ? 'Ya hay una sincronización en curso' : undefined };
  }
  if (!getActiveNamespace()) {
    return { ...empty, error: manual ? 'Inicia sesión para sincronizar' : undefined };
  }

  const pending = await getPendingSales();
  const operations = await getOfflineOperations(['pending']);
  const allSales = await getAllOfflineSales();
  const conflictedSales = allSales.filter((sale) => sale.status === 'conflict');
  const conflictedOperations = await getOfflineOperations(['conflict']);
  if (pending.length === 0 && operations.length === 0) {
    if (conflictedSales.length || conflictedOperations.length) {
      return {
        ...empty,
        conflicts: conflictedSales.length,
        operationsConflict: conflictedOperations.length,
        error: 'Hay operaciones en conflicto que requieren revisión antes de continuar la sincronización.',
      };
    }
    if (manual) return { ...empty, error: 'No hay ventas pendientes por sincronizar' };
    return empty;
  }

  syncing = true;
  let synced = 0;
  let conflicts = 0;
  let unknown = 0;
  let operationsSynced = 0;
  let operationsConflict = 0;
  let error: string | undefined;

  try {
    const events: SyncEvent[] = [
      ...pending.map((sale) => ({ kind: 'sale' as const, businessAt: sale.timestamp, sale })),
      ...operations.map((operation) => ({ kind: 'operation' as const, businessAt: operation.businessAt, operation })),
      ...conflictedSales.map((sale) => ({ kind: 'blocker' as const, businessAt: sale.timestamp })),
      ...conflictedOperations.map((operation) => ({ kind: 'blocker' as const, businessAt: operation.businessAt })),
    ].sort(compareEvents);

    for (let i = 0; i < events.length;) {
      const event = events[i];
      if (event.kind === 'blocker') {
        error = 'Hay una operación anterior en conflicto; las operaciones posteriores quedan pendientes para proteger el orden del inventario y los cierres.';
        break;
      }
      if (event.kind === 'sale') {
        const sales: OfflineSale[] = [];
        while (i < events.length && events[i].kind === 'sale') {
          sales.push((events[i] as Extract<SyncEvent, { kind: 'sale' }>).sale);
          i++;
        }
        const result = await syncSalesBatch(sales);
        synced += result.synced;
        conflicts += result.conflicts;
        unknown += result.unknown;
        if (result.error) { error = result.error; break; }
        continue;
      }

      const result = await syncOperationGroup([event.operation.kind], new Set([event.operation.clientOperationId]));
      operationsSynced += result.synced;
      operationsConflict += result.conflicts;
      i++;
      if (result.error) { error = result.error; break; }
    }

    await saveSyncLog({ timestamp: Date.now(), salesSynced: synced, salesConflict: conflicts, salesUnknown: unknown, error });
    return { synced, conflicts, unknown, attempted: pending.length, operationsSynced, operationsConflict, error };
  } finally {
    syncing = false;
  }
}

// Llamar una vez al abrir la app: repara ventas 'syncing' huérfanas.
export async function recoverStuckSyncing(): Promise<number> {
  return resetStuckSyncingSales();
}
