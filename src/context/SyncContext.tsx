// ─── CUBAGEST SYNC CONTEXT ──────────────────────────────────────────────────
// Estado de la cola offline (pendientes/conflictos) y disparo de la
// sincronización SOLO en los momentos que tienen sentido para un dispositivo
// con mala conectividad:
//
//   1. arranque con internet (una vez),
//   2. volver a primer plano (con internet y respecting un mínimo de tiempo
//      entre pasadas, para no golpear el servidor),
//   3. reconexión de red,
//   4. acción manual del usuario.
//
// NO hay polling ni intervalos de fondo: la app no consume datos ni pega al
// servidor por su cuenta. Además, tras un sync con éxito solo se refresca el
// stock de la UBICACIÓN afectada (una llamada), nunca el catálogo completo.

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from './AuthContext';
import { runSync, isSyncing, recoverStuckSyncing, type SyncResult } from '../offline/syncManager';
import { getAllOfflineSales, cacheProducts, type OfflineSale } from '../offline/offlineStore';
import { getActiveNamespace, UNKNOWN_LOCATION } from '../offline/namespace';
import { LocationsAPI } from '../api/endpoints';

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
    const all = await getAllOfflineSales();
    setOfflineSales(all);
    setPendingCount(all.filter((s) => s.status === 'pending').length);
    setConflictCount(all.filter((s) => s.status === 'conflict').length);
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
      }
      return result;
    },
    [refresh, refreshLocationStock],
  );

  // Reparar ventas 'syncing' huérfanas al arrancar + cargar contadores.
  useEffect(() => {
    (async () => {
      await recoverStuckSyncing();
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
