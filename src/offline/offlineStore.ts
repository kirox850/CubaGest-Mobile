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
//
// Colecciones de LECTURA (por cuenta, para pintar sin red):
//   locations    → cajas y almacenes de la empresa
//   readings     → lecturas de apertura de inventario
//   sales_index  → ventas ya confirmadas por el servidor
//   closings     → cierres de caja
//   movements    → entradas y salidas de dinero
//   settings     → monedas, modo de tasa y tolerancia de caja
//   discounts    → descuentos aplicables a una venta
//
// El turno NO está aquí: lo guarda `useShift` bajo `cubagest_shift:<userId>`.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  accountScopedKey, activeKeys, getActiveNamespace, namespaceKey,
  recallLocation, writeLocationHint, UNKNOWN_LOCATION,
} from './namespace';
import { derivarLocalStock, pendingQtyPorProducto } from './localStock';
import { generateUuid, isUuid } from '../utils/uuid';
import type { Location, InventoryReading, Sale, Closing, CashMovement, Transfer } from '../types';

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
  discountId?: string;
  discountAmount?: number;
}

export interface OfflinePayment {
  method: string;
  currency: string;
  amount: number;
  exchangeRate?: number | null;
  rateSource?: 'same_currency' | 'automatic' | 'manual';
  rateUpdatedAt?: number | string | null;
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
  payments?: OfflinePayment[];
  items: OfflineSaleItem[];
  subtotal: number;
  tax?: number;
  total: number;
  currency?: string;     // moneda de la venta (CUP/USD/EUR/MLC)
  discountId?: string;
  saleDiscountAmount?: number;
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

export type OfflineOperationKind = 'shift_open' | 'shift_close' | 'manual_reading' | 'closing_confirm' | 'transfer_create' | 'transfer_resolve' | 'cash_movement' | 'expense';
export interface OfflineOperation {
  clientOperationId: string;
  kind: OfflineOperationKind;
  businessAt: number;
  payload: Record<string, any>;
  status: SyncStatus;
  createdAt: number;
  lastError?: string;
  serverResult?: Record<string, any>;
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

export interface OfflineCartSnapshot {
  locationId: string;
  cart: Record<string, number>;
  lineDiscounts: Record<string, string>;
  saleCurrency: string;
  paymentLines: any[];
  saleDiscountId: string;
  clientName: string;
  clientNit: string;
  clientPhone: string;
  updatedAt: number;
}

function cartKey(): string {
  const namespace = getActiveNamespace();
  if (!namespace) throw new NoNamespaceError();
  return accountScopedKey('pos_cart', namespace.companyId, namespace.userId);
}

export async function getOfflineCart(locationId: string): Promise<OfflineCartSnapshot | null> {
  if (!activeKeys()) return null;
  const rows = await readJSON<Record<string, OfflineCartSnapshot>>(cartKey(), {});
  return rows[locationId] || null;
}

export async function saveOfflineCart(snapshot: OfflineCartSnapshot): Promise<void> {
  await serialize(async () => {
    const key = cartKey();
    const rows = await readJSON<Record<string, OfflineCartSnapshot>>(key, {});
    rows[snapshot.locationId] = snapshot;
    await writeJSON(key, rows);
  });
}

export async function clearOfflineCart(locationId: string): Promise<void> {
  if (!activeKeys()) return;
  await serialize(async () => {
    const key = cartKey();
    const rows = await readJSON<Record<string, OfflineCartSnapshot>>(key, {});
    delete rows[locationId];
    await writeJSON(key, rows);
  });
}

function operationsKey(): string {
  const namespace = getActiveNamespace();
  if (!namespace) throw new NoNamespaceError();
  return accountScopedKey('operations', namespace.companyId, namespace.userId);
}

export async function enqueueOfflineOperation(
  kind: OfflineOperationKind,
  payload: Record<string, any>,
  businessAt = Date.now(),
  clientOperationId = generateUuid(),
): Promise<OfflineOperation> {
  return serialize(async () => {
    const key = operationsKey();
    const operations = await readJSON<OfflineOperation[]>(key, []);
    const existing = operations.find((op) => op.clientOperationId === clientOperationId);
    if (existing) return existing;
    const operation: OfflineOperation = {
      clientOperationId, kind, businessAt, payload, status: 'pending', createdAt: Date.now(),
    };
    await writeJSON(key, [...operations, operation]);
    return operation;
  });
}

export async function getOfflineOperations(statuses: SyncStatus[] = ['pending']): Promise<OfflineOperation[]> {
  if (!activeKeys()) return [];
  const rows = await readJSON<OfflineOperation[]>(operationsKey(), []);
  return rows.filter((op) => statuses.includes(op.status)).sort((a, b) => a.businessAt - b.businessAt);
}

export async function updateOfflineOperation(
  clientOperationId: string,
  status: SyncStatus,
  patch: Partial<Pick<OfflineOperation, 'lastError' | 'serverResult'>> = {},
): Promise<void> {
  if (!activeKeys()) return;
  await serialize(async () => {
    const key = operationsKey();
    const rows = await readJSON<OfflineOperation[]>(key, []);
    const index = rows.findIndex((op) => op.clientOperationId === clientOperationId);
    if (index < 0) return;
    rows[index] = { ...rows[index], ...patch, status };
    if (status === 'synced') rows[index].lastError = undefined;
    await writeJSON(key, rows);
  });
}

export async function recoverStuckOfflineOperations(): Promise<number> {
  const all = await getOfflineOperations(['syncing']);
  for (const operation of all) await updateOfflineOperation(operation.clientOperationId, 'pending');
  return all.length;
}

// ── Productos ───────────────────────────────────────────────────────────────

/**
 * Cuánto de cada producto está comprometido en ventas que AÚN no han subido.
 *
 * Es una lectura simple, sin lock propio: la usa `cacheProducts` DENTRO de su
 * `serialize()`, y ahí queda atómica con la escritura del catálogo. Si se
 * leyera fuera, entre la lectura y la escritura se podría colar una venta y el
 * catálogo guardado ofrecería mercancía ya vendida.
 */
async function readPendingQty(): Promise<Record<string, number>> {
  const keys = activeKeys();
  if (!keys) return {};
  const sales = Object.values(await readJSON<Record<string, OfflineSale>>(keys.sales, {}));
  return pendingQtyPorProducto(sales);
}

export async function cacheProducts(products: any[], locationId?: string): Promise<void> {
  const keys = activeKeys();
  if (!keys) return; // sin namespace no se cachea nada: jamás entre cuentas
  // El catálogo cacheado es POR ubicación: si el caller pasó otra ubicación
  // (p. ej. admin revisando el almacén) no lo escribimos en esta caja.
  const active = getActiveNamespace();
  if (locationId && active && locationId !== active.locationId) return;

  await serialize(async () => {
    // Lo que este dispositivo ya vendió y el servidor todavía no sabe. Se lee
    // aquí dentro, con el catálogo, para que los dos datos sean del mismo
    // instante: entre una lectura y otra se puede colar una venta.
    const pending = await readPendingQty();
    const now = Date.now();
    const next: Record<string, OfflineProduct> = {};

    for (const p of products) {
      // El stock que se puede cobrar es el del servidor MENOS lo que este
      // dispositivo ya vendió sin sincronizar. Antes se conservaba el
      // `localStock` viejo si el producto ya estaba, y si era nuevo se
      // guardaba el stock entero: en ambos casos la app ofrecía más mercancía
      // de la que existía, que es peor que no ofrecer nada.
      const localStock = derivarLocalStock(Number(p.stock), pending[p.id] || 0);
      next[p.id] = {
        id: p.id,
        code: p.code || '',
        name: p.name,
        price: Number(p.price),
        cost: Number(p.cost || 0),
        stock: Number(p.stock),
        localStock,
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
        p.localStock += d;
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
      if (p) p.localStock += d;
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

// ── Colas que NO se construyen, y por qué ───────────────────────────────────
//
// ENTRADAS Y SALIDAS DE DINERO. No hay cola para ellas, a propósito.
//
// `POST /cash-movements` NO es idempotente: no acepta id de cliente, no tiene
// índice único y no hay `onConflict`. Un reintento tras un corte de red —que es
// exactamente lo que hace una cola— crearía un SEGUNDO movimiento por el mismo
// retiro, y el saldo de la caja quedaría descuadrado por dinero registrado dos
// veces.
//
// El cierre no tiene ese problema: `POST /closing/confirm` usa
// `initialReadingId` como `confirm_key`, con un índice único parcial
// (migración 0007) y un 409 `READING_ALREADY_CLOSED` (routes/closing.ts:294-310).
// Reenviar el mismo cierre no puede cerrarla dos veces, así que esa cola sí es
// segura. Movimientos requiere antes una clave de idempotencia en el backend;
// hasta entonces se hacen con conexión, que es preferible a duplicar un retiro.

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

// ── Ubicaciones y lecturas (cachés DE CUENTA, no de ubicación) ──────────────
//
// Estas dos cachés viven bajo companyId+userId y NO bajo el namespace de
// ubicación, y eso es deliberado. Son la respuesta a la pregunta "¿en qué caja
// estoy?", y si dependieran de la ubicación no podrían contestar nada: para
// leerlas habría que saber ya la ubicación, que es justo lo que se está
// buscando. El mismo razonamiento que en la web (`useLocations`): sin copia
// local de /locations, el modo sin conexión se veía roto entero, y no era el
// POS ni el inventario, era que no había forma de saber a qué caja pertenecía
// el catálogo cacheado.

function accountKey(name: string): string | null {
  const active = getActiveNamespace();
  if (!active) return null;
  return accountScopedKey(name, active.companyId, active.userId);
}

export async function cacheLocations(locations: Location[]): Promise<void> {
  const key = accountKey('locations');
  if (!key) return;
  const lista = Array.isArray(locations) ? locations : [];
  if (lista.length === 0) return;   // un vacío no borra la última versión buena
  await serialize(async () => { await writeJSON(key, lista); });
}

export async function getOfflineLocations(): Promise<Location[]> {
  const key = accountKey('locations');
  if (!key) return [];
  return readJSON<Location[]>(key, []);
}

export async function cacheReadings(readings: InventoryReading[]): Promise<void> {
  const key = accountKey('readings');
  if (!key) return;
  const lista = Array.isArray(readings) ? readings : [];
  if (lista.length === 0) return;
  await serialize(async () => { await writeJSON(key, lista); });
}

/**
 * Las lecturas de apertura guardadas. Son la BASE del conteo del cierre: sin
 * copia local no se puede empezar a cerrar sin red, que es lo que pasaba.
 */
export async function getOfflineReadings(): Promise<InventoryReading[]> {
  const key = accountKey('readings');
  if (!key) return [];
  return readJSON<InventoryReading[]>(key, []);
}

// ── Colecciones de lectura (las pantallas las necesitan sin red) ─────────────
//
// Estas NO son colas de escritura: son la última versión buena que el servidor
// entregó, para que una pantalla pueda pintar algo cuando no hay red. Mismo
// patrón que `locations` y `readings`: por cuenta, y un array vacío NUNCA borra
// la copia anterior, porque un cierre que se borrara dejaría al cajero sin
// poder consultar el último que hizo.
//
// El turno NO vive aquí: lo guarda `useShift` bajo `cubagest_shift:<userId>`.
// Es funcionalmente lo mismo que una clave por cuenta y moverlo no cambia nada
// que el usuario vea, así que se deja donde está y no se toca el arreglo que
// impide perder la lista de cajas.

/** Sustituye una colección de lectura, conservando la anterior si llega vacía. */
async function cacheList<T>(name: string, items: T[] | null | undefined): Promise<void> {
  const key = accountKey(name);
  if (!key) return;
  const lista = Array.isArray(items) ? items : [];
  if (lista.length === 0) return;   // un vacío no borra la última versión buena
  await serialize(async () => { await writeJSON(key, lista); });
}

/** Lee una colección de lectura. Array vacío = nunca se descargó o no hay copia. */
async function readList<T>(name: string): Promise<T[]> {
  const key = accountKey(name);
  if (!key) return [];
  const v = await readJSON<T[]>(key, []);
  return Array.isArray(v) ? v : [];
}

/** Guarda un documento suelto (no una lista), sin borrarlo si llega vacío. */
async function cacheDoc(name: string, doc: unknown): Promise<void> {
  const key = accountKey(name);
  if (!key) return;
  if (!doc || typeof doc !== 'object') return;
  await serialize(async () => { await writeJSON(key, doc); });
}

/** Lee un documento suelto. `null` = nunca se descargó o no hay copia. */
async function getOfflineDoc<T>(name: string): Promise<T | null> {
  const key = accountKey(name);
  if (!key) return null;
  const v = await readJSON<T | null>(key, null);
  return v && typeof v === 'object' ? v : null;
}

// Las ventas del servidor, para pintar el listado de facturación sin red. Las
// ventas PENDIENTES viven en la cola `sales`, que es otra cosa: esto es solo el
// histórico que el servidor ya confirmó.
export const cacheSales = (sales: Sale[]) => cacheList<Sale>('sales_index', sales);
export const getOfflineSales = (): Promise<Sale[]> => readList<Sale>('sales_index');

// Los cierres: la lista del cajero. Sin esta copia, sin red no había forma de
// saber qué cierres existen ni cuál era el provisional pendiente.
export const cacheClosings = (c: Closing[]) => cacheList<Closing>('closings', c);
export const getOfflineClosings = (): Promise<Closing[]> => readList<Closing>('closings');

// Entradas y salidas de dinero de la caja.
export const cacheMovements = (m: CashMovement[]) => cacheList<CashMovement>('movements', m);
export const getOfflineMovements = (): Promise<CashMovement[]> => readList<CashMovement>('movements');

// Ajustes de la empresa: monedas, modo de tasa y tolerancia de caja. El POS
// pinta el símbolo de la moneda desde aquí, así que sin esta copia una venta
// offline se guarda sin moneda y el cierre posterior no cuadra.
export const cacheSettings = (s: unknown) => cacheDoc('settings', s);
export const getOfflineSettings = () => getOfflineDoc<Record<string, unknown>>('settings');

// El resumen contable que devuelve el backend (summary + ingresos + egresos).
// Es un agregado, no una lista: se guarda entero bajo una clave.
export const cacheContabilidad = (c: unknown) => cacheDoc('contabilidad', c);
export const getOfflineContabilidad = () => getOfflineDoc<Record<string, unknown>>('contabilidad');

// Descuentos aplicables a una venta.
export const cacheDiscounts = (d: any[]) => cacheList<any>('discounts', d);
export const getOfflineDiscounts = (): Promise<any[]> => readList<any>('discounts');
export const cacheTransfers = (transfers: Transfer[]) => cacheList<Transfer>('transfers', transfers);
export const getOfflineTransfers = (): Promise<Transfer[]> => readList<Transfer>('transfers');

// ── Última ubicación conocida ────────────────────────────────────────────────
// No es un almacén nuevo: delega en la pista que YA existe en namespace.ts
// (`cubagest_offline_location_hints`, por usuario y sobreviviente al logout).
// Dos almacenes de lo mismo divergirían, y el que divergiera siempre sería el
// que nadie lee al depurar.

export async function getLastLocationId(): Promise<string | null> {
  const active = getActiveNamespace();
  if (!active) return null;
  return recallLocation(active.userId);
}

export async function setLastLocationId(locationId: string): Promise<void> {
  const active = getActiveNamespace();
  if (!active || !locationId) return;
  await writeLocationHint(active.userId, locationId);
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
