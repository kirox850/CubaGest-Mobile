// ─── WARM CACHE: bajar TODO al entrar, sin visitar pantalla por pantalla ─────
//
// Antes, una caché offline se creaba de rebote: solo existía si alguien había
// abierto esa pantalla con red. Un cajero que entraba y se quedaba sin conexión
// a los dos minutos tenía el POS vacío, porque nadie había pasado por
// Facturación ni por Cierre de caja.
//
// `warmCache()` descarga y guarda TODAS las colecciones de una vez, para que la
// app sea usable sin red en cuanto la sesión se resuelve. El cajero no tiene que
// hacer nada: entrar ya es suficiente.
//
// DOS REGLAS que este archivo no rompe:
//
//  1. NUNCA lanza. Un 500 en una colección no puede abortar las demás, o una
//     sola falla y el cajero se queda sin productos además de sin contabilidad.
//     Cada paso va en su propio try y el resultado se reporta por separado.
//  2. La ubicación se resuelve ANTES de bajar stock. El stock se cachea por
//     caja: bajarlo sin saber en qué caja se está trabajando lo escribiría en el
//     namespace equivocado, que es la causa clásica de "el POS en blanco al
//     quedarse sin red".

import {
  cacheProducts,
  cacheLocations,
  cacheReadings,
  cacheClosings,
  cacheMovements,
  cacheSales,
  cacheSettings,
  cacheDiscounts,
  cacheTransfers,
  getLastLocationId,
} from './offlineStore';
import {
  LocationsAPI, ClosingAPI, CashMovementsAPI,
  SalesAPI, SettingsAPI, DiscountsAPI, ShiftAPI, TransfersAPI,
} from '../api/endpoints';
import { persistShift } from '../hooks/useShift';
import { activateNamespace } from './namespace';
import type { Location, User } from '../types';

export interface WarmStep {
  nombre: string;
  ok: boolean;
  detalle?: string;
}

export interface WarmResult {
  /** Cuántas colecciones quedaron guardadas. */
  ok: number;
  /** Cuántas fallaron, y por qué. El resto sigue funcionando. */
  fallos: WarmStep[];
  pasos: WarmStep[];
}

export interface WarmOpts {
  user: User | null;
  /**
   * Caja desde la que se trabaja. OPCIONAL: si no se pasa, se resuelve aquí con
   * el turno abierto y, si no hay turno, con la última caja conocida. Así
   * AuthContext no tiene que saber nada de cajas para llamar a esta función.
   */
  locationId?: string;
}

/**
 * Un paso que falla NO aborta el resto. El error se registra y se sigue: cinco
 * colecciones buenas y una mala es un POS que funciona; abortar a la primera es
 * un POS vacío.
 */
async function paso(nombre: string, fn: () => Promise<unknown>): Promise<WarmStep> {
  try {
    await fn();
    return { nombre, ok: true };
  } catch (e) {
    return { nombre, ok: false, detalle: (e as Error)?.message || String(e) };
  }
}

/**
 * Descarga y guarda todas las colecciones. Pensada para correr UNA vez, al
 * entrar con red. Es idempotente: volver a llamarla solo refresca.
 */
export async function warmCache(opts: WarmOpts): Promise<WarmResult> {
  const { user, locationId } = opts;
  const pasos: WarmStep[] = [];
  const registrar = (p: WarmStep) => { pasos.push(p); };

  if (!user) return { ok: 0, fallos: [], pasos };

  let availableLocations: Location[] = [];
  let assignedLocationIds: string[] = [];

  // ── 1. Ubicaciones ────────────────────────────────────────────────────────
  // Van primero porque de ellas sale la caja, y sin caja no hay stock que
  // guardar. Es también lo que hace que `sinCache` deje de estar activo en el
  // POS, que es el que dice "sin conexión y sin datos guardados".
  registrar(await paso('ubicaciones', async () => {
    availableLocations = await LocationsAPI.list();
    await cacheLocations(availableLocations);
  }));

  // ── 2. Turno y cajas asignadas ────────────────────────────────────────────
  // La lista de cajas se guarda aunque NO haya turno abierto: es lo que permite
  // al cajero saber dónde puede trabajar sin conexión. `persistShift` preserva
  // esa lista cuando el turno es null, que es justo el caso recién logueado.
  let shiftLocationId: string | null = null;
  registrar(await paso('turno', async () => {
    const resp = await ShiftAPI.current();
    shiftLocationId = resp?.shift?.locationId ?? null;
    assignedLocationIds = (Array.isArray(resp?.assignedCajas) ? resp.assignedCajas : [])
      .filter((location: any) => location?.active !== false && location?.id)
      .map((location: any) => location.id);
    await persistShift(
      user.id,
      resp?.shift ?? null,
      Array.isArray(resp?.assignedCajas) ? resp.assignedCajas : [],
    );
  }));

  // ── 3. Catálogo de la caja en la que se trabaja ───────────────────────────
  //
  // El orden para decidir cuál es: el TURNO manda (es la caja en la que de
  // verdad se está vendiendo), luego la última conocida, y solo si no hay
  // ninguna de las dos se pide la primera caja activa. Es la misma precedencia
  // que `locationResolution.ts`, y usa la misma función para no divergir.
  const recordada = await getLastLocationId();
  const tipoPreferido = user.role === 'almacenista' ? 'almacen' : 'caja';
  const primeraOperativa = availableLocations.find((location) =>
    location.active !== false && location.type === tipoPreferido,
  )?.id || availableLocations.find((location) => location.active !== false)?.id || '';
  // Un cajero con varias cajas y sin turno debe elegir; no convertir la primera
  // asignada en una ubicación implícita, porque una venta offline allí sería
  // difícil de reconciliar con la caja física. Para los demás roles se puede
  // usar una ubicación operativa por defecto.
  const caja = locationId || shiftLocationId || recordada || (
    user.role === 'cajero'
      ? assignedLocationIds.length === 1 ? assignedLocationIds[0] : ''
      : assignedLocationIds[0] || primeraOperativa
  );
  const ubicacionesAdmin = availableLocations
    .filter((location) => location.active !== false)
    .map((location) => location.id);
  const ubicacionesAcalentar = user.role === 'admin'
    ? (ubicacionesAdmin.length > 0 ? ubicacionesAdmin : [caja].filter(Boolean))
    : user.role === 'cajero' && assignedLocationIds.length > 0
      ? assignedLocationIds
      : [caja].filter(Boolean);

  for (const stockLocationId of [...new Set(ubicacionesAcalentar)]) {
    registrar(await paso(`productos:${stockLocationId}`, async () => {
      // Cada catálogo se guarda bajo el namespace de SU ubicación. Sin esto,
      // cacheProducts descarta silenciosamente el stock cuando el usuario aún
      // estaba en "sin-ubicacion" o tenía activa otra caja.
      await activateNamespace(user, stockLocationId);
      const { items } = await LocationsAPI.stock(stockLocationId);
      await cacheProducts(items, stockLocationId);
    }));
  }
  // La siguiente pantalla empieza con el turno/caja real, no con la última
  // ubicación del bucle de precarga.
  await activateNamespace(user, caja || undefined);

  // ── 4. El resto, en paralelo. Son independientes entre sí. ────────────────
  const resto = await Promise.all([
    paso('lecturas', async () => { await cacheReadings(await ClosingAPI.readings()); }),
    paso('cierres', async () => { await cacheClosings(await ClosingAPI.list()); }),
    paso('movimientos', async () => { await cacheMovements(await CashMovementsAPI.list()); }),
    paso('ventas', async () => { await cacheSales(await SalesAPI.list()); }),
    paso('ajustes', async () => { await cacheSettings(await SettingsAPI.get()); }),
    paso('descuentos', async () => { await cacheDiscounts(await DiscountsAPI.list()); }),
    paso('traspasos', async () => { await cacheTransfers(await TransfersAPI.list()); }),
  ]);
  resto.forEach(registrar);

  const fallos = pasos.filter((p) => !p.ok);
  return { ok: pasos.length - fallos.length, fallos, pasos };
}
