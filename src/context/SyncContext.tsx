// ─── CUBAGEST SYNC CONTEXT ──────────────────────────────────────────────────
// Estado de la cola offline (pendientes/conflictos) y disparo de la
// sincronización SOLO en los momentos que tienen sentido para un dispositivo
// con mala conectividad:
//
//   1. arranque con internet (una vez),
//   2. volver a primer plano (con internet y respecting un mínimo de tiempo
//      entre pasadas, para no golpear el servidor),
//   3. reconexión de red,
//   4. acción manual del usuario,
//   5. CADA 5 MINUTOS, con la app en primer plano y con red.
//
// El intervalo (5) es un cambio de producto pedido: la app tiene que dejar de
// depender de que el cajero visite pantallas para tener datos frescos. NO corre
// en segundo plano —React Native suspende los temporizadores ahí, y un bucle de
// 5 minutos despertando la radio es batería gastada sin ningún beneficio— y NO
// corre sin red, para no gastar peticiones en llamadas que van a fallar.
//
// Cada pasada es SIEMPRE en el mismo orden: primero se SUBE lo pendiente y
// después se BAJA lo fresco. Al revés, una descarga podría pisar la vista local
// de una venta que el servidor todavía no ha visto.
//
// Además, tras un sync con éxito solo se refresca el stock de la UBICACIÓN
// afectada (una llamada), nunca el catálogo completo.

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, DeviceEventEmitter } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from './AuthContext';
import { runSync, isSyncing, recoverStuckSyncing, type SyncResult } from '../offline/syncManager';
import { getAllOfflineSales, getOfflineOperations, cacheProducts, cacheDiscounts, recoverStuckOfflineOperations, type OfflineSale } from '../offline/offlineStore';
import { getActiveNamespace, UNKNOWN_LOCATION } from '../offline/namespace';
import { DiscountsAPI, LocationsAPI } from '../api/endpoints';
import { debeCorrerCiclo, SYNC_CYCLE_MS } from '../offline/syncCycle';

interface SyncContextValue {
  pendingCount: number;
  conflictCount: number;
  syncing: boolean;
  offlineSales: OfflineSale[];
  syncNow: (manual?: boolean) => Promise<SyncResult>;
  refresh: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

// Mínimo entre sincronizaciones automáticas (foreground / reconexión).
const AUTO_SYNC_COOLDOWN_MS = 45 * 1000;


export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { user, online } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [offlineSales, setOfflineSales] = useState<OfflineSale[]>([]);
  const lastAutoSync = useRef(0);

  const refresh = useCallback(async () => {
    const [all, operations] = await Promise.all([getAllOfflineSales(), getOfflineOperations(['pending', 'syncing', 'conflict'])]);
    setOfflineSales(all);
    setPendingCount(all.filter((s) => s.status === 'pending').length + operations.filter((op) => op.status === 'pending' || op.status === 'syncing').length);
    setConflictCount(all.filter((s) => s.status === 'conflict').length + operations.filter((op) => op.status === 'conflict').length);
  }, []);

  /** Tras sincronizar: solo el stock de la ubicación que وكانت afectada. */
  const refreshLocationStock = useCallback(async () => {
    const current = getActiveNamespace();
    if (!current || !user || current.locationId === UNKNOWN_LOCATION) return;
    try {
      const { items } = await LocationsAPI.stock(current.locationId);
      await cacheProducts(items, current.locationId);
    } catch {
      // Sin red o sin permiso: el catálogo cacheado sigue sirviendo al POS.
    }
  }, [user]);

  const syncNow = useCallback(
    async (manual = false) => {
      if (isSyncing()) setSyncing(true);
      const result = await runSync(manual);
      setSyncing(false);
      await refresh();
      if (!result.error && result.synced > 0) {
        lastAutoSync.current = Date.now();
        await refreshLocationStock();
        try {
          await cacheDiscounts(await DiscountsAPI.list());
          DeviceEventEmitter.emit('cubagest:discounts-updated');
        } catch {
          // La caché local se conserva si el catálogo no pudo refrescarse.
        }
      }
      return result;
    },
    [refresh, refreshLocationStock],
  );

  // Reparar ventas 'syncing' huérfanas al arrancar + cargar contadores.
  useEffect(() => {
    (async () => {
      await recoverStuckSyncing();
      await recoverStuckOfflineOperations();
      await refresh();
    })();
  }, [refresh]);

  // Arranque con internet: una sola pasada.
  useEffect(() => {
    if (!user || !online) return;
    (async () => {
      if (lastAutoSync.current) return;
      lastAutoSync.current = Date.now();
      await syncNow(false);
    })();
  }, [user, online, syncNow]);

  // Al recuperar la conexión → sincronizar (con enfriamiento mínimo).
  const wasOffline = useRef(false);
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const connected = !!state.isConnected && state.isInternetReachable !== false;
      if (connected && wasOffline.current && user) {
        if (Date.now() - lastAutoSync.current < AUTO_SYNC_COOLDOWN_MS) return;
        lastAutoSync.current = Date.now();
        syncNow();
      }
      wasOffline.current = !connected;
    });
    return unsub;
  }, [user, syncNow]);

  // Al volver la app a primer plano → intentar sincronizar (con cooldown).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !user || !online) return;
      if (Date.now() - lastAutoSync.current < AUTO_SYNC_COOLDOWN_MS) return;
      lastAutoSync.current = Date.now();
      syncNow();
    });
    return () => sub.remove();
  }, [user, online, syncNow]);

  // ── Ciclo de 5 minutos ────────────────────────────────────────────────────
  // Cuatro condiciones, y todas hacen falta: hay que tener sesión, tener red, no
  // estar en segundo plano, y que el enfriamiento mínimo se haya cumplido para
  // que un tick y una reconexión no se pisen.
  const enPrimerPlano = useRef(false);
  useEffect(() => {
    if (!user || !online) return;
    const id = setInterval(() => {
      if (!debeCorrerCiclo({
        haySesion: !!user,
        hayRed: online,
        primerPlano: enPrimerPlano.current,
        sincronizando: isSyncing(),
        ultimoSync: lastAutoSync.current,
        ahora: Date.now(),
      })) return;
      lastAutoSync.current = Date.now();
      void syncNow(false);
    }, SYNC_CYCLE_MS);
    return () => clearInterval(id);
  }, [user, online, syncNow]);

  // React Native suspende los temporizadores en segundo plano, pero no se
  // puede confiar en que el proceso sobreviva: se lleva la cuenta del AppState
  // para no lanzar un ciclo en una app que el sistema dejó en segundo plano.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      enPrimerPlano.current = state === 'active';
    });
    enPrimerPlano.current = AppState.currentState === 'active';
    return () => sub.remove();
  }, []);

  return (
    <SyncContext.Provider
      value={{ pendingCount, conflictCount, syncing, offlineSales, syncNow, refresh }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync debe usarse dentro de SyncProvider');
  return ctx;
}
