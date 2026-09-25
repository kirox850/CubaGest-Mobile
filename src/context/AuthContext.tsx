// ─── AUTH CONTEXT ───────────────────────────────────────────────────────────
// Sesión persistente para dispositivos personales con mala conectividad:
//
//  - Al abrir la app se restaura la sesión desde el almacenamiento local SIN
//    esperar al servidor: si hay token + usuario cacheado, la app abre
//    directo. Un token vencido NO echa al usuario.
//  - En segundo plano (y solo si hay red) se revalida la sesión al arrancar y
//    al volver a primer plano. Si el servidor no responde, no pasa nada: se
//    conserva la sesión y se sigue trabajando con datos locales.
//  - Solo se cierra la sesión cuando el SERVIDOR la rechaza (revocación) o
//    cuando el usuario pulsa "Cerrar sesión".
//  - Logout borra SOLO el estado de autenticación. Los datos offline de la
//    cuenta (catálogo, cola de ventas) se conservan en su namespace para la
//    próxima entrada; otra cuenta entra en SU namespace y nunca los ve.

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {
  endSession,
  loadSession,
  refreshAccessToken,
  revalidateSession,
  saveSession,
} from '../api/session';
import { onSessionExpired } from '../api/sessionEvents';
import { AuthAPI } from '../api/endpoints';
import { activateNamespace, deactivateNamespace } from '../offline/namespace';
import { adoptUnscopedSales } from '../offline/offlineStore';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  online: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Frecuencia de la renovación silenciosa al volver a primer plano. Evita
// golpear al servidor cada vez que el usuario cambia de app en el teléfono.
const FOREGROUND_REFRESH_MS = 5 * 60 * 1000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);

  // Monitor network
  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      setOnline(!!state.isConnected && state.isInternetReachable !== false);
    });
    return unsub;
  }, []);

  // Si el SERVIDOR revoca la sesión (401/403 al renovar) volvemos al login.
  // Un corte de red nunca dispara esto.
  useEffect(() => {
    return onSessionExpired(() => {
      deactivateNamespace();
      setUser(null);
    });
  }, []);

  // ── Restaurar sesión (sin esperar al servidor) ────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { accessToken, user: cached } = await loadSession();
      if (cancelled) return;

      if (!accessToken || !cached) {
        setLoading(false);
        return;
      }

      // Sesión abierta al instante con lo que hay en el dispositivo.
      setUser(cached);
      await activateNamespace(cached);
      // Si ya se conoce la ubicación de la cuenta, las ventas que se guardaron
      // antes de conocerla se mudan a su namespace real (si no, quedarían
      // invisibles para Facturación y para el sync).
      void adoptUnscopedSales();
      setLoading(false);

      // Revalidación en segundo plano, solo si hay red.
      NetInfo.fetch().then(async (state) => {
        const isOnline = !!state.isConnected && state.isInternetReachable !== false;
        if (!isOnline || cancelled) return;

        const outcome = await revalidateSession();
        if (cancelled) return;
        if (outcome.status === 'ok') {
          setUser(outcome.user);
          await activateNamespace(outcome.user);
        } else if (outcome.status === 'rejected') {
          // Revocación real del servidor: aquí sí se cierra la sesión.
          await endSession();
          deactivateNamespace();
          setUser(null);
        }
        // 'unavailable' → sin red/5xx: la sesión cacheada sigue vigente.
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Renovación silenciosa al recuperar conexión ───────────────────────────
  // No consulta la base de datos: solo renueva el token. Si falla, la sesión
  // local intacta.
  const wasOffline = useRef(false);
  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      const connected = !!state.isConnected && state.isInternetReachable !== false;
      const reconnected = connected && wasOffline.current;
      wasOffline.current = !connected;
      if (!reconnected) return;
      (async () => {
        const outcome = await refreshAccessToken();
        if (outcome.status === 'rejected') {
          await endSession();
          deactivateNamespace();
          setUser(null);
        }
      })();
    });
    return unsub;
  }, []);

  // ── Renovación silenciosa al volver a primer plano ───────────────────────
  const lastForegroundRefresh = useRef(0);
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state !== 'active') return;
      const now = Date.now();
      if (now - lastForegroundRefresh.current < FOREGROUND_REFRESH_MS) return;
      lastForegroundRefresh.current = now;
      (async () => {
        const netState = await NetInfo.fetch();
        const isOnline = !!netState.isConnected && netState.isInternetReachable !== false;
        if (!isOnline) return;
        const outcome = await refreshAccessToken();
        if (outcome.status === 'rejected') {
          await endSession();
          deactivateNamespace();
          setUser(null);
        }
        // 'unavailable'/'none' → seguimos con la sesión cacheada.
      })();
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  const login = async (email: string, password: string) => {
    const { accessToken, refreshToken, user: u } = await AuthAPI.login(email, password);
    await saveSession({ accessToken, refreshToken, user: u });
    // Namespace nuevo para esta cuenta (o el suyo si vuelve a entrar).
    await activateNamespace(u);
    // Ventas de una sesión anterior en la que aún no se conocía la ubicación.
    void adoptUnscopedSales();
    setUser(u);
  };

  const logout = async () => {
    // Revoca en el servidor (best-effort) y borra SOLO el estado de auth.
    // Los datos offline de la cuenta se conservan en su namespace.
    await endSession();
    deactivateNamespace();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, online, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
