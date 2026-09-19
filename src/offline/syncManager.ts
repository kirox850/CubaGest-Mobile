// ─── CUBAGEST SYNC MANAGER ──────────────────────────────────────────────────
// Equivalente RN del runSync() de la web. Encapsula la sincronización de la
// cola de ventas offline contra POST /sales/sync, con los mismos garantías:
//  - Las ventas se marcan 'syncing' antes de salir y si algo falla vuelven a
//    'pending' (nunca quedan colgadas).
//  - Conflictos (stock insuficiente al llegar al servidor): la venta queda
//    'conflict' y su stock local se RESTAURA para que vuelva a estar a la
//    venta.
//  - resetStuckSyncing() al arrancar repara ventas 'syncing' huérfanas.

import { apiFetch } from '../api/client';
import {
  getPendingSales,
  updateSaleStatus,
  saveSyncLog,
  restoreLocalStock,
  resetStuckSyncingSales,
  type OfflineSale,
} from './offlineStore';

let syncing = false;

export function isSyncing(): boolean {
  return syncing;
}

export interface SyncResult {
  synced: number;
  conflicts: number;
  attempted: number;
  error?: string;
}

export async function restoreLocalStockForSale(sale: OfflineSale): Promise<void> {
  const deltas: Record<string, number> = {};
  for (const item of sale.items) {
    deltas[item.productId] = (deltas[item.productId] || 0) + item.qty;
  }
  await restoreLocalStock(deltas);
}

export async function runSync(manual = false): Promise<SyncResult> {
  const empty: SyncResult = { synced: 0, conflicts: 0, attempted: 0 };

  if (syncing) {
    return { ...empty, error: manual ? 'Ya hay una sincronización en curso' : undefined };
  }

  const pending = await getPendingSales();
  if (pending.length === 0) {
    if (manual) return { ...empty, error: 'No hay ventas pendientes por sincronizar' };
    return empty;
  }

  syncing = true;
  let synced = 0;
  let conflicts = 0;

  try {
    // 1. Marcar todas como 'syncing' antes de salir de la app.
    for (const sale of pending) await updateSaleStatus(sale.localId, 'syncing');

    // 2. Enviar el lote al backend (mismo contrato que la web).
    const results: {
      localId: string;
      status: 'synced' | 'conflict';
      serverId?: string;
      reason?: string;
    }[] = await apiFetch('/sales/sync', {
      method: 'POST',
      body: {
        sales: pending.map((s) => ({
          localId: s.localId,
          // El backend espera clientName; s.client mantiene compat con ventas
          // viejas guardadas antes del renombre.
          clientName: s.clientName || s.client || 'Consumidor Final',
          clientNit: s.clientNit,
          clientPhone: s.clientPhone,
          items: s.items.map((i) => ({
            productId: i.productId,
            name: i.name,
            qty: i.qty,
            price: i.price,
          })),
          payMethod: s.payMethod,
          currency: s.currency || 'CUP',
          offlineTimestamp: s.timestamp,
        })),
      },
    });

    // 3. Procesar resultados: sincronizadas vs conflictos (restaurar stock).
    for (const result of results) {
      if (result.status === 'synced') {
        await updateSaleStatus(result.localId, 'synced', result.serverId);
        synced++;
      } else {
        await updateSaleStatus(result.localId, 'conflict', undefined, result.reason);
        const sale = pending.find((s) => s.localId === result.localId);
        if (sale) await restoreLocalStockForSale(sale);
        conflicts++;
      }
    }

    await saveSyncLog({ timestamp: Date.now(), salesSynced: synced, salesConflict: conflicts });
    return { synced, conflicts, attempted: pending.length };
  } catch (e) {
    // Cualquier fallo (red, timeout, sesión expirada) revierte TODAS las
    // ventas de este intento a 'pending' — siempre se reintentan después.
    for (const sale of pending) await updateSaleStatus(sale.localId, 'pending');
    const msg = (e as Error).message || 'No se pudo sincronizar';
    return { synced: 0, conflicts: 0, attempted: pending.length, error: msg };
  } finally {
    syncing = false;
  }
}

// Llamar una vez al abrir la app: repara ventas 'syncing' huérfanas.
export async function recoverStuckSyncing(): Promise<number> {
  return resetStuckSyncingSales();
}
