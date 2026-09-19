// ─── CUBAGEST SYNC CONTEXT ──────────────────────────────────────────────────
// Expone a toda la app el estado de la cola offline (pendientes/conflictos)
// y dispara la sincronización automáticamente, igual que la web:
//  - al recuperar la conexión (NetInfo),
//  - al volver la app a primer plano (AppState),
//  - y manualmente con syncNow() (botón "Sincronizar ahora" en Facturas).

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from './AuthContext';
import { runSync, isSyncing, type SyncResult } from '../offline/syncManager';
import { recoverStuckSyncing } from '../offline/syncManager';
import {
  getAllOfflineSales,
  type OfflineSale,
} from '../offline/offlineStore';

interface SyncContextValue {
  pendingCount: number;
  conflictCount: number;
  syncing: boolean;
  offlineSales: OfflineSale[];
  syncNow: (manual?: boolean) => Promise<SyncResult>;
  refresh: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { user, online } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);
  const [conflictCount, setConflictCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [offlineSales, setOfflineSales] = useState<OfflineSale[]>([]);

  const refresh = useCallback(async () => {
    const all = await getAllOfflineSales();
    setOfflineSales(all);
    setPendingCount(all.filter((s) => s.status === 'pending').length);
    setConflictCount(all.filter((s) => s.status === 'conflict').length);
  }, []);

  const syncNow = useCallback(
    async (manual = false) => {
      if (isSyncing()) setSyncing(true);
      const result = await runSync(manual);
      setSyncing(false);
      await refresh();
      return result;
    },
    [refresh],
  );

  // Reparar ventas 'syncing' huérfanas al arrancar + cargar contadores.
  useEffect(() => {
    (async () => {
      await recoverStuckSyncing();
      await refresh();
    })();
  }, [refresh]);

  // Al recuperar la conexión → sincronizar.
  const wasOffline = useRef(false);
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const connected = !!state.isConnected && state.isInternetReachable !== false;
      if (connected && wasOffline.current && user) {
        syncNow();
      }
      wasOffline.current = !connected;
    });
    return unsub;
  }, [user, syncNow]);

  // Al volver la app a primer plano → intentar sincronizar.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && user && online) syncNow();
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
