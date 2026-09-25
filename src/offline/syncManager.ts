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
  updateSaleStatus,
  saveSyncLog,
  restoreLocalStock,
  resetStuckSyncingSales,
  type OfflineSale,
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
  error?: string;
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
      name: i.name,
      qty: i.qty,
      price: i.price,
    })),
    payMethod: sale.payMethod,
    currency: sale.currency || 'CUP',
    // Momento local del dispositivo (auditoría). El servidor usa su propia
    // hora de recepción para planes y cierres.
    offlineTimestamp: sale.timestamp,
  };
}

export async function runSync(manual = false): Promise<SyncResult> {
  const empty: SyncResult = { synced: 0, conflicts: 0, unknown: 0, attempted: 0 };

  if (syncing) {
    return { ...empty, error: manual ? 'Ya hay una sincronización en curso' : undefined };
  }
  if (!getActiveNamespace()) {
    return { ...empty, error: manual ? 'Inicia sesión para sincronizar' : undefined };
  }

  const pending = await getPendingSales();
  if (pending.length === 0) {
    if (manual) return { ...empty, error: 'No hay ventas pendientes por sincronizar' };
    return empty;
  }

  syncing = true;
  let synced = 0;
  let conflicts = 0;
  let unknown = 0;

  try {
    // 1. Marcar todas como 'syncing' antes de salir de la app.
    for (const sale of pending) {
      await updateSaleStatus(sale.localId, 'syncing', undefined, undefined, {
        incrementAttempts: true,
      });
    }

    // 2. Enviar el lote al backend (mismo contrato que la web + idempotencia).
    const raw = await apiFetch<SyncResponseRow[]>('/sales/sync', {
      method: 'POST',
      body: { sales: pending.map(toPayload) },
    });

    // Respuesta con forma inesperada: no se marca nada. Todo vuelve a
    // 'pending' y se reintenta — NADIE pierde la venta por un response raro.
    if (!Array.isArray(raw)) {
      for (const sale of pending) {
        await updateSaleStatus(sale.localId, 'pending', undefined, undefined, {
          lastError: 'El servidor devolvió una respuesta que no entendimos',
        });
      }
      const msg = 'Respuesta de sincronización inesperada; se reintentará.';
      await saveSyncLog({ timestamp: Date.now(), salesSynced: 0, salesConflict: 0, salesUnknown: pending.length, error: msg });
      return { synced: 0, conflicts: 0, unknown: pending.length, attempted: pending.length, error: msg };
    }

    // El backend puede identificar cada resultado por localId o por
    // clientSaleId (si reintentamos un lote con ids nuevos en el cliente).
    const byLocal = new Map<string, SyncResponseRow>();
    const byClient = new Map<string, SyncResponseRow>();
    for (const row of raw) {
      if (!row || typeof row !== 'object') continue;
      if (row.localId) byLocal.set(row.localId, row);
      if (row.clientSaleId) byClient.set(row.clientSaleId, row);
    }

    // 3. Procesar resultados: sincronizadas, conflictos (restauran stock) y
    //    las que no vinieron (vuelven a pending, sin tocar el stock local).
    for (const sale of pending) {
      const result = byLocal.get(sale.localId) || byClient.get(sale.clientSaleId);

      if (!result) {
        await updateSaleStatus(sale.localId, 'pending', undefined, undefined, {
          lastError: 'El servidor no devolvió resultado para esta venta',
        });
        unknown++;
        continue;
      }

      const status = String(result.status || '').toLowerCase();
      if (status === 'synced' || status === 'ok' || result.serverId) {
        await updateSaleStatus(sale.localId, 'synced', result.serverId, undefined, {
          invoiceNumber: result.invoiceNumber,
        });
        synced++;
        continue;
      }

      if (status === 'conflict' || status === 'rejected' || status === 'error') {
        await updateSaleStatus(
          sale.localId,
          'conflict',
          undefined,
          result.reason || 'El servidor rechazó la venta',
        );
        await restoreLocalStockForSale(sale);
        conflicts++;
        continue;
      }

      // Status desconocido ("accepted", "", undefined...): no sabemos si se
      // facturó. Es reintentable y NO se restaura stock (el backend deduplica
      // por clientSaleId cuando vuelva a recibirla).
      await updateSaleStatus(sale.localId, 'pending', undefined, undefined, {
        lastError: `Estado de sincronización no reconocido: "${String(result.status)}"`,
      });
      unknown++;
    }

    await saveSyncLog({
      timestamp: Date.now(),
      salesSynced: synced,
      salesConflict: conflicts,
      salesUnknown: unknown,
    });
    return { synced, conflicts, unknown, attempted: pending.length };
  } catch (e) {
    // Cualquier fallo (red, timeout, 5xx) revierte TODAS las ventas de este
    // intento a 'pending' — siempre se reintentan después. El stock local NO
    // se restaura: las ventas siguen descontándolo porque siguen pendientes.
    const msg = (e as Error).message || 'No se pudo sincronizar';
    for (const sale of pending) {
      await updateSaleStatus(sale.localId, 'pending', undefined, undefined, { lastError: msg });
    }
    await saveSyncLog({
      timestamp: Date.now(),
      salesSynced: 0,
      salesConflict: 0,
      salesUnknown: pending.length,
      error: msg,
    });
    return { synced: 0, conflicts: 0, unknown: 0, attempted: pending.length, error: msg };
  } finally {
    syncing = false;
  }
}

// Llamar una vez al abrir la app: repara ventas 'syncing' huérfanas.
export async function recoverStuckSyncing(): Promise<number> {
  return resetStuckSyncingSales();
}
