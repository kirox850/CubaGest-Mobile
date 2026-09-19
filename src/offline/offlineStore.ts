// ─── CUBAGEST OFFLINE STORE (React Native) ──────────────────────────────────
// Equivalente RN de src/offlineDB.ts de la web (IndexedDB). Como RN no tiene
// IndexedDB, usamos AsyncStorage con un snapshot JSON por colección y
// operaciones atómicas a nivel de colección: cada mutación lee → modifica →
// escribe el JSON completo en UNA sola llamada a setItem, de modo que si el
// proceso muere a mitad de una operación los datos no quedan "a medias".
//
// Colecciones:
//   products     → catálogo cacheado con localStock (stock descontado offline)
//   sales_queue  → ventas offline pendientes/synced/conflict (LOCAL-0001…)
//   sync_log     → historial de sincronizaciones
//   meta         → contadores y última sincronización

import AsyncStorage from '@react-native-async-storage/async-storage';

const K_PRODUCTS = 'cubagest_offline_products';
const K_SALES = 'cubagest_offline_sales_queue';
const K_LOG = 'cubagest_offline_sync_log';
const K_META = 'cubagest_offline_meta';

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'conflict';

export interface OfflineProduct {
  id: string;
  code: string;
  name: string;
  price: number;
  cost: number;
  stock: number;
  localStock: number; // stock descontado localmente al vender offline
  unit: string;
  category: string;
  active: boolean;
  cachedAt: number;
}

export interface OfflineSaleItem {
  productId: string;
  name: string;
  qty: number;
  price: number;
  total: number;
}

export interface OfflineSale {
  localId: string;       // ID local temporal (LOCAL-0001)
  serverId?: string;     // ID del servidor tras sync
  timestamp: number;     // Para ordenar en sincronización
  status: SyncStatus;
  // clientName es el nombre que espera el backend; "client" se mantuvo por
  // compatibilidad con ventas viejas guardadas antes del renombre.
  clientName?: string;
  client?: string;
  clientNit: string;
  clientPhone?: string;
  payMethod: string;
  items: OfflineSaleItem[];
  subtotal: number;
  total: number;
  currency?: string;     // moneda de la venta (CUP/USD/EUR/MLC)
  discountId?: string;   // descuento de tipo venta (solo online)
  conflictReason?: string;
  syncedAt?: number;
}

export interface SyncLogEntry {
  id: string;
  timestamp: number;
  salesSynced: number;
  salesConflict: number;
  error?: string;
}

interface Meta {
  localCounter: number;
  lastProductSync: number | null;
}

// ── Helpers de lectura/escritura atómica por colección ──────────────────────
async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJSON(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

// ── Meta ────────────────────────────────────────────────────────────────────
async function getMeta(): Promise<Meta> {
  return readJSON<Meta>(K_META, { localCounter: 0, lastProductSync: null });
}

async function putMeta(patch: Partial<Meta>): Promise<void> {
  const meta = await getMeta();
  await writeJSON(K_META, { ...meta, ...patch });
}

export async function getLastProductSync(): Promise<number | null> {
  return (await getMeta()).lastProductSync;
}

// ── Productos ───────────────────────────────────────────────────────────────
export async function cacheProducts(products: any[]): Promise<void> {
  const prev = await readJSON<Record<string, OfflineProduct>>(K_PRODUCTS, {});
  const now = Date.now();
  const next: Record<string, OfflineProduct> = {};

  for (const p of products) {
    const old = prev[p.id];
    next[p.id] = {
      id: p.id,
      code: p.code || '',
      name: p.name,
      price: Number(p.price),
      cost: Number(p.cost || 0),
      stock: Number(p.stock),
      // Si el producto ya estaba cacheado conservamos el localStock (ventas
      // offline sin sincronizar aún); si es nuevo, arranca igual que stock.
      localStock: old ? old.localStock : Number(p.stock),
      unit: p.unit || 'ud',
      category: p.category || '',
      active: p.active !== false,
      cachedAt: now,
    };
  }

  await writeJSON(K_PRODUCTS, next);
  await putMeta({ lastProductSync: now });
}

export async function getOfflineProducts(): Promise<OfflineProduct[]> {
  const map = await readJSON<Record<string, OfflineProduct>>(K_PRODUCTS, {});
  return Object.values(map).filter((p) => p.active);
}

// Descuenta stock local de varios productos en una sola escritura.
async function adjustLocalStock(
  deltas: Record<string, number>, // productId → ±qty
): Promise<void> {
  const map = await readJSON<Record<string, OfflineProduct>>(K_PRODUCTS, {});
  for (const [id, d] of Object.entries(deltas)) {
    const p = map[id];
    if (p) {
      p.localStock = Math.max(0, p.localStock + d);
    }
  }
  await writeJSON(K_PRODUCTS, map);
}

// Restaura stock local (usado por el syncManager cuando una venta offline
// termina en conflicto y sus productos vuelven a estar disponibles).
export async function restoreLocalStock(deltas: Record<string, number>): Promise<void> {
  const positive: Record<string, number> = {};
  for (const [id, d] of Object.entries(deltas)) {
    if (d !== 0) positive[id] = Math.abs(d);
  }
  await adjustLocalStock(positive);
}

// ── Cola de ventas ──────────────────────────────────────────────────────────
export async function saveSaleOffline(
  sale: Omit<OfflineSale, 'localId' | 'status' | 'timestamp'>,
): Promise<OfflineSale> {
  const meta = await getMeta();
  const localId = `LOCAL-${String(meta.localCounter + 1).padStart(4, '0')}`;

  const fullSale: OfflineSale = {
    ...sale,
    localId,
    status: 'pending',
    timestamp: Date.now(),
  };

  // Una sola pasada: guardamos la venta Y descontamos el stock local de todos
  // los items. AsyncStorage no tiene transacciones, así que el orden seguro
  // es: escribir la venta PRIMERO y el stock DESPUÉS — si el proceso muere
  // entre ambas, el sync detectará el conflicto de stock y lo reparará; al
  // revés (stock descontado sin venta) la venta se perdería.
  const sales = await readJSON<Record<string, OfflineSale>>(K_SALES, {});
  sales[localId] = fullSale;
  await writeJSON(K_SALES, sales);

  const deltas: Record<string, number> = {};
  for (const item of sale.items) {
    deltas[item.productId] = (deltas[item.productId] || 0) - item.qty;
  }
  await adjustLocalStock(deltas);

  await putMeta({ localCounter: meta.localCounter + 1 });
  return fullSale;
}

async function readSales(): Promise<Record<string, OfflineSale>> {
  return readJSON<Record<string, OfflineSale>>(K_SALES, {});
}

export async function getPendingSales(): Promise<OfflineSale[]> {
  const all = Object.values(await readSales());
  return all
    .filter((s) => s.status === 'pending')
    .sort((a, b) => a.timestamp - b.timestamp);
}

export async function getAllOfflineSales(): Promise<OfflineSale[]> {
  return Object.values(await readSales()).sort((a, b) => b.timestamp - a.timestamp);
}

export async function getOfflineSale(localId: string): Promise<OfflineSale | undefined> {
  return (await readSales())[localId];
}

export async function updateSaleStatus(
  localId: string,
  status: SyncStatus,
  serverId?: string,
  conflictReason?: string,
): Promise<void> {
  const sales = await readSales();
  const sale = sales[localId];
  if (!sale) return;
  sale.status = status;
  if (serverId) sale.serverId = serverId;
  if (conflictReason) sale.conflictReason = conflictReason;
  if (status === 'synced') sale.syncedAt = Date.now();
  await writeJSON(K_SALES, sales);
}

export async function getPendingCount(): Promise<number> {
  return (await getPendingSales()).length;
}

export async function getConflictCount(): Promise<number> {
  const all = Object.values(await readSales());
  return all.filter((s) => s.status === 'conflict').length;
}

// Si la app se cerró de golpe en medio de una sincronización, alguna venta
// puede quedar en 'syncing' sin que nadie la termine. Esta función se llama
// al abrir la app y las devuelve a 'pending' para que se reintenten.
export async function resetStuckSyncingSales(): Promise<number> {
  const sales = await readSales();
  let recovered = 0;
  for (const s of Object.values(sales)) {
    if (s.status === 'syncing') {
      s.status = 'pending';
      recovered++;
    }
  }
  if (recovered > 0) await writeJSON(K_SALES, sales);
  return recovered;
}

// ── Sync log ────────────────────────────────────────────────────────────────
export async function saveSyncLog(log: Omit<SyncLogEntry, 'id'>): Promise<void> {
  const logArr = await readJSON<SyncLogEntry[]>(K_LOG, []);
  logArr.unshift({ ...log, id: `sync-${Date.now()}` });
  await writeJSON(K_LOG, logArr.slice(0, 30));
}

export async function getSyncLog(): Promise<SyncLogEntry[]> {
  return readJSON<SyncLogEntry[]>(K_LOG, []);
}

// ── Borrado total (logout o reset) ──────────────────────────────────────────
export async function clearOfflineData(): Promise<void> {
  await AsyncStorage.multiRemove([K_PRODUCTS, K_SALES, K_LOG, K_META]);
}
