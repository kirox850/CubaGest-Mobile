// ─── CUBAGEST OFFLINE STORE (React Native) ──────────────────────────────────
// Equivalente RN de src/offlineDB.ts de la web (IndexedDB). Como RN no tiene
// IndexedDB, usamos AsyncStorage con un snapshot JSON por colección y un
// ESCRITOR SERIALIZADO: cada mutación pasa por una cola de promesas, así dos
// operaciones concurrentes (dos ventas rápidas, un sync en vuelo) no pueden
// pisarse con el clásico read → modify → write.
//
// TODO lo que se guarda aquí vive bajo el namespace
// companyId + userId + locationId (ver ./namespace.ts) y SOBREVIVE al logout:
// es el comportamiento pedido para dispositivos personales. Cerrar sesión
// borra únicamente el estado de autenticación.
//
// Colecciones (por namespace):
//   products     → catálogo cacheado con localStock (stock descontado offline)
//   sales        → ventas offline pendientes/synced/conflict (LOCAL-0001…)
//   sync_log     → historial de sincronizaciones
//   meta         → contadores y última sincronización

import AsyncStorage from '@react-native-async-storage/async-storage';
import { activeKeys, getActiveNamespace, namespaceKey, UNKNOWN_LOCATION } from './namespace';
import { generateUuid, isUuid } from '../utils/uuid';

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
  localId: string;        // ID local legible (LOCAL-0001)
  clientSaleId: string;   // UUID del dispositivo = idempotency key del backend
  locationId: string;     // ubicación desde la que se vendió (inmutable)
  serverId?: string;      // ID del servidor tras sync
  invoiceNumber?: string; // factura definitiva tras sync
  timestamp: number;      // momento local de la venta (auditoría)
  status: SyncStatus;
  attempts: number;       // intentos de sincronización
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
  lastError?: string;    // último error de sync (reintentable)
  syncedAt?: number;
}

export interface SyncLogEntry {
  id: string;
  timestamp: number;
  salesSynced: number;
  salesConflict: number;
  salesUnknown?: number;
  error?: string;
}

interface Meta {
  localCounter: number;
  lastProductSync: number | null;
}

class NoNamespaceError extends Error {
  constructor() {
    super(
      'No hay namespace offline activo. Entra con tu cuenta y abre el punto de venta para inicializarlo.',
    );
    this.name = 'NoNamespaceError';
  }
}

// ── Escritor serializado ────────────────────────────────────────────────────
// Una sola cadena de promesas: cada operación lee, modifica y escribe sin que
// otra pueda intercalar un write intermedio.
let chain: Promise<unknown> = Promise.resolve();

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  // La cadena nunca se rompe aunque una operación falle.
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

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

function requireKeys() {
  const keys = activeKeys();
  if (!keys) throw new NoNamespaceError();
  return keys;
}

// ── Meta ────────────────────────────────────────────────────────────────────
async function getMeta(): Promise<Meta> {
  return readJSON<Meta>(requireKeys().meta, { localCounter: 0, lastProductSync: null });
}

async function putMeta(patch: Partial<Meta>): Promise<void> {
  const keys = requireKeys();
  const meta = await readJSON<Meta>(keys.meta, { localCounter: 0, lastProductSync: null });
  await writeJSON(keys.meta, { ...meta, ...patch });
}

export async function getLastProductSync(): Promise<number | null> {
  if (!activeKeys()) return null;
  return (await getMeta()).lastProductSync;
}

// ── Productos ───────────────────────────────────────────────────────────────
export async function cacheProducts(products: any[], locationId?: string): Promise<void> {
  const keys = activeKeys();
  if (!keys) return; // sin namespace no se cachea nada: jamás entre cuentas
  // El catálogo cacheado es POR ubicación: si el caller pasó otra ubicación
  // (p. ej. admin revisando el almacén) no lo escribimos en esta caja.
  const active = getActiveNamespace();
  if (locationId && active && locationId !== active.locationId) return;

  await serialize(async () => {
    const prev = await readJSON<Record<string, OfflineProduct>>(keys.products, {});
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

    await writeJSON(keys.products, next);
    await writeJSON(keys.meta, {
      ...(await readJSON<Meta>(keys.meta, { localCounter: 0, lastProductSync: null })),
      lastProductSync: now,
    });
  });
}

export async function getOfflineProducts(): Promise<OfflineProduct[]> {
  const keys = activeKeys();
  if (!keys) return [];
  const map = await readJSON<Record<string, OfflineProduct>>(keys.products, {});
  return Object.values(map).filter((p) => p.active);
}

// Resta stock local de varios productos en una sola escritura serializada.
async function adjustLocalStock(deltas: Record<string, number>): Promise<void> {
  const keys = activeKeys();
  if (!keys) return;
  await serialize(async () => {
    const map = await readJSON<Record<string, OfflineProduct>>(keys.products, {});
    for (const [id, d] of Object.entries(deltas)) {
      const p = map[id];
      if (p) {
        p.localStock = Math.max(0, p.localStock + d);
      }
    }
    await writeJSON(keys.products, map);
  });
}

/**
 * Restaura stock local. SOLO se llama cuando el servidor confirma un
 * CONFLICTO explícito de esa venta: ante una respuesta desconocida o un corte
 * de red el stock sigue descontado (la venta sigue viva y se reintentará).
 */
export async function restoreLocalStock(deltas: Record<string, number>): Promise<void> {
  const positive: Record<string, number> = {};
  for (const [id, d] of Object.entries(deltas)) {
    if (d !== 0) positive[id] = Math.abs(d);
  }
  await adjustLocalStock(positive);
}

// ── Cola de ventas ──────────────────────────────────────────────────────────
export async function saveSaleOffline(
  sale: Omit<OfflineSale, 'localId' | 'status' | 'timestamp' | 'attempts' | 'clientSaleId' | 'locationId'> &
    Partial<Pick<OfflineSale, 'clientSaleId' | 'locationId'>>,
): Promise<OfflineSale> {
  const keys = requireKeys();
  const active = getActiveNamespace();

  // La ubicación queda FIJADA al momento de la venta: aunque el usuario luego
  // cambie de caja/almacén, esta venta se sincroniza contra donde se hizo.
  const locationId = sale.locationId || active?.locationId || UNKNOWN_LOCATION;
  const clientSaleId = isUuid(sale.clientSaleId) ? sale.clientSaleId : generateUuid();

  return serialize(async () => {
    const meta = await readJSON<Meta>(keys.meta, { localCounter: 0, lastProductSync: null });
    const localId = `LOCAL-${String(meta.localCounter + 1).padStart(4, '0')}`;

    const fullSale: OfflineSale = {
      ...sale,
      localId,
      clientSaleId,
      locationId,
      status: 'pending',
      attempts: 0,
      timestamp: Date.now(),
    };

    // Una sola pasada: guardamos la venta Y descontamos el stock local de todos
    // los items. AsyncStorage no tiene transacciones, así que el orden seguro
    // es: escribir la venta PRIMERO y el stock DESPUÉS — si el proceso muere
    // entre ambas, el sync detectará el conflicto de stock y lo reparará; al
    // revés (stock descontado sin venta) la venta se perdería.
    const sales = await readJSON<Record<string, OfflineSale>>(keys.sales, {});
    sales[localId] = fullSale;
    await writeJSON(keys.sales, sales);

    const deltas: Record<string, number> = {};
    for (const item of sale.items) {
      deltas[item.productId] = (deltas[item.productId] || 0) - item.qty;
    }
    const map = await readJSON<Record<string, OfflineProduct>>(keys.products, {});
    for (const [id, d] of Object.entries(deltas)) {
      const p = map[id];
      if (p) p.localStock = Math.max(0, p.localStock + d);
    }
    await writeJSON(keys.products, map);

    await writeJSON(keys.meta, { ...meta, localCounter: meta.localCounter + 1 });
    return fullSale;
  });
}

async function readSales(): Promise<Record<string, OfflineSale>> {
  const keys = activeKeys();
  if (!keys) return {};
  return readJSON<Record<string, OfflineSale>>(keys.sales, {});
}

/**
 * Adopta las ventas que se guardaron SIN ubicación conocida.
 *
 * Caso real: el usuario abre la app sin conexión antes de que la app haya
 * podido resolver su caja, cobra, y la venta acaba en el namespace
 * `sin-ubicacion`. En cuanto se conoce la ubicación real esas ventas tienen que
 * mudarse de namespace, o quedan invisibles para Facturación y para el sync
 * (la venta existe pero nadie la ve ni la envía).
 *
 * NO se toca el catálogo: esas ventas descontaron stock en un namespace que
 * normalmente está vacío, y el cache real de la ubicación se refresca del
 * servidor en cuanto hay conexión. Reaplicar el descuento aquí lo contaría dos
 * veces.
 *
 * Devuelve cuántas ventas se adoptaron.
 */
export async function adoptUnscopedSales(): Promise<number> {
  const active = getActiveNamespace();
  if (!active || active.locationId === UNKNOWN_LOCATION) return 0;
  const keys = activeKeys();
  if (!keys) return 0;

  const orphanKey = namespaceKey({ ...active, locationId: UNKNOWN_LOCATION });
  const orphanSalesKey = `${orphanKey}|sales`;

  return serialize(async () => {
    const orphans = await readJSON<Record<string, OfflineSale>>(orphanSalesKey, {});
    const entries = Object.values(orphans).filter((s) => s && s.locationId === UNKNOWN_LOCATION);
    if (entries.length === 0) return 0;

    const current = await readJSON<Record<string, OfflineSale>>(keys.sales, {});
    // Se preserva el resto de la meta: adoptar ventas no debe borrar el
    // `lastProductSync` (ni ningún otro dato) del namespace real.
    const meta = await readJSON<Meta>(keys.meta, { localCounter: 0, lastProductSync: null });
    let counter = meta.localCounter;
    let moved = 0;

    for (const sale of entries) {
      // El clientSaleId NO cambia: es la clave de idempotencia del backend y
      // ya pudo haber travelled al servidor. Si este localId ya existe aquí
      // (venta local con el mismo número), se le da otro: son listas distintas.
      let localId = sale.localId;
      while (current[localId]) {
        counter += 1;
        localId = `LOCAL-${String(counter).padStart(4, '0')}`;
      }
      current[localId] = { ...sale, localId, locationId: active.locationId };
      moved += 1;
    }

    await writeJSON(keys.sales, current);
    await writeJSON(keys.meta, { ...meta, localCounter: counter });

    // El namespace huérfano queda limpio (solo si no le quedaba nada más).
    const left = { ...orphans };
    for (const [key, sale] of Object.entries(left)) {
      if (sale?.locationId === UNKNOWN_LOCATION) delete left[key];
    }
    if (Object.keys(left).length === 0) await AsyncStorage.removeItem(orphanSalesKey);
    else await writeJSON(orphanSalesKey, left);

    return moved;
  });
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
  extra?: { invoiceNumber?: string; lastError?: string; incrementAttempts?: boolean },
): Promise<void> {
  const keys = activeKeys();
  if (!keys) return;
  await serialize(async () => {
    const sales = await readJSON<Record<string, OfflineSale>>(keys.sales, {});
    const sale = sales[localId];
    if (!sale) return;
    sale.status = status;
    if (serverId) sale.serverId = serverId;
    if (extra?.invoiceNumber) sale.invoiceNumber = extra.invoiceNumber;
    if (extra?.incrementAttempts) sale.attempts = (sale.attempts || 0) + 1;
    // El mensaje de conflicto se guarda solo en conflictos; los errores
    // reintentables van en lastError para no mezclarlos.
    if (status === 'conflict') {
      if (conflictReason) sale.conflictReason = conflictReason;
      sale.lastError = undefined;
    } else if (status === 'pending') {
      sale.lastError = extra?.lastError;
      sale.conflictReason = undefined;
    }
    if (status === 'synced') {
      sale.syncedAt = Date.now();
      sale.lastError = undefined;
    }
    await writeJSON(keys.sales, sales);
  });
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
  const keys = activeKeys();
  if (!keys) return 0;
  return serialize(async () => {
    const sales = await readJSON<Record<string, OfflineSale>>(keys.sales, {});
    let recovered = 0;
    for (const s of Object.values(sales)) {
      if (s.status === 'syncing') {
        s.status = 'pending';
        s.lastError = 'Sincronización interrumpida: se reintentará.';
        recovered++;
      }
    }
    if (recovered > 0) await writeJSON(keys.sales, sales);
    return recovered;
  });
}

// ── Sync log ────────────────────────────────────────────────────────────────
export async function saveSyncLog(log: Omit<SyncLogEntry, 'id'>): Promise<void> {
  const keys = activeKeys();
  if (!keys) return;
  await serialize(async () => {
    const logArr = await readJSON<SyncLogEntry[]>(keys.log, []);
    logArr.unshift({ ...log, id: `sync-${Date.now()}` });
    await writeJSON(keys.log, logArr.slice(0, 30));
  });
}

export async function getSyncLog(): Promise<SyncLogEntry[]> {
  const keys = activeKeys();
  if (!keys) return [];
  return readJSON<SyncLogEntry[]>(keys.log, []);
}
