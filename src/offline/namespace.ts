// ─── NAMESPACE DE DATOS OFFLINE ─────────────────────────────────────────────
// La app retiene catálogo, stock local y cola de ventas al cerrar sesión
// (decisión de producto: cada usuario tiene su dispositivo personal). Para que
// dos cuentas que usen el mismo teléfono NUNCA mezclen ni reenvíen datos, todo
// lo offline vive bajo un namespace:
//
//        companyId + userId + locationId
//
//  - companyId/userId: identidad de la cuenta.
//  - locationId: la ubicación operativa desde la que se vende (caja del cajero
//    o almacén del almacenista). El stock es POR ubicación, así que una caja
//    no puede consumir el catálogo cacheado de otra.
//
// El namespace activo se mantiene en memoria durante la sesión y se recuerda
// por usuario (pista de "última ubicación conocida") para que, al abrir la app
// sin conexión, la app abra el namespace correcto SIN poder consultar al
// servidor. Esa pista NO es estado de autenticación: sobrevive al logout (es
// parte de los datos offline de la cuenta) y se borra junto con el namespace.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { companyIdOf } from '../api/userShape';
import type { User } from '../types';

export interface OfflineNamespace {
  companyId: string;
  userId: string;
  /** 'sin-ubicacion' mientras el usuario todavía no ha resuelto dónde vende. */
  locationId: string;
}

export const UNKNOWN_LOCATION = 'sin-ubicacion';

const LOCATION_HINT_KEY = 'cubagest_offline_location_hints';
const KEY_PREFIX = 'cubagest_offline_v2';

// Claves legacy (v1, globales, sin namespace). Se descartan: mezclaban las
// cuentas y no se pueden atribuir con seguridad a nadie.
const LEGACY_KEYS = [
  'cubagest_offline_products',
  'cubagest_offline_sales_queue',
  'cubagest_offline_sync_log',
  'cubagest_offline_meta',
];

let active: OfflineNamespace | null = null;
let legacyPurged = false;

function safeId(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : UNKNOWN_LOCATION;
}

export function buildNamespace(ns: OfflineNamespace): OfflineNamespace {
  return {
    companyId: safeId(ns.companyId),
    userId: safeId(ns.userId),
    locationId: safeId(ns.locationId),
  };
}

/** Clave de storage del namespace. Distinta por cuenta y por ubicación. */
export function namespaceKey(ns: OfflineNamespace): string {
  const n = buildNamespace(ns);
  return `${KEY_PREFIX}|${n.companyId}|${n.userId}|${n.locationId}`;
}

/** Clave para caches de cuenta (no de ubicación), ej: el resumen del dashboard. */
export function accountScopedKey(name: string, companyId: string, userId: string): string {
  return `${KEY_PREFIX}|${safeId(companyId)}|${safeId(userId)}|${name}`;
}

export function sameNamespace(a: OfflineNamespace | null, b: OfflineNamespace | null): boolean {
  if (!a || !b) return a === b;
  return namespaceKey(a) === namespaceKey(b);
}

// ── Pista de ubicación por usuario (sobrevive al logout) ────────────────────

async function readHints(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(LOCATION_HINT_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export async function recallLocation(userId: string): Promise<string | null> {
  if (!userId) return null;
  const hints = await readHints();
  return hints[userId] || null;
}

async function writeHint(userId: string, locationId: string): Promise<void> {
  if (!userId || !locationId) return;
  const hints = await readHints();
  if (hints[userId] === locationId) return;
  hints[userId] = locationId;
  try {
    await AsyncStorage.setItem(LOCATION_HINT_KEY, JSON.stringify(hints));
  } catch {
    // sin pista no se rompe nada: el namespace se reconstruye al vender online
  }
}

// ── Namespace activo ────────────────────────────────────────────────────────

/**
 * Activa el namespace de una cuenta. Si no se pasa locationId se usa la última
 * conocida para ese usuario (arranque sin conexión). Devuelve el namespace
 * activo.
 */
export async function activateNamespace(
  user: Pick<User, 'id' | 'businessId' | 'company'> | null,
  locationId?: string | null,
): Promise<OfflineNamespace | null> {
  const companyId = companyIdOf(user as User | null);
  if (!user?.id || !companyId) {
    active = null;
    return null;
  }

  const resolved = safeId(locationId || (await recallLocation(user.id)) || UNKNOWN_LOCATION);
  if (resolved !== UNKNOWN_LOCATION) await writeHint(user.id, resolved);

  const ns = buildNamespace({ companyId, userId: user.id, locationId: resolved });
  active = ns;
  await purgeLegacyKeys();
  return ns;
}

export function getActiveNamespace(): OfflineNamespace | null {
  return active;
}

/** Solo memoria: el logout no borra datos, solo deja de usar este namespace. */
export function deactivateNamespace(): void {
  active = null;
}

/** Llaves de las colecciones del namespace activo. */
export function activeKeys(): {
  products: string;
  sales: string;
  log: string;
  meta: string;
} | null {
  if (!active) return null;
  const base = namespaceKey(active);
  return {
    products: `${base}|products`,
    sales: `${base}|sales`,
    log: `${base}|sync_log`,
    meta: `${base}|meta`,
  };
}

/**
 * Descarta los datos offline SIN namespace de versiones anteriores. No se
 * importan a ninguna cuenta: no se sabe de quién eran, y meterlos en una
 * cuenta nueva podría descontar stock o jugar ventas de otro usuario.
 */
export async function purgeLegacyKeys(): Promise<void> {
  if (legacyPurged) return;
  legacyPurged = true;
  try {
    await AsyncStorage.multiRemove(LEGACY_KEYS);
  } catch {
    // si falla, se reintenta la próxima vez que se active un namespace
    legacyPurged = false;
  }
}

/** Borra SOLO los datos del namespace activo (reset explícito, no logout). */
export async function clearActiveNamespaceData(): Promise<void> {
  const keys = activeKeys();
  if (!keys) return;
  await AsyncStorage.multiRemove([keys.products, keys.sales, keys.log, keys.meta]);
}

/** Uso interno de tests: olvida el namespace activo en memoria. */
export function __resetNamespaceForTests(): void {
  active = null;
  legacyPurged = false;
}
