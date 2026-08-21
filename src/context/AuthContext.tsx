import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { getToken, setToken as saveToken, setRefreshToken as saveRefreshToken, getCachedUser, setCachedUser } from '../api/client';
import { AuthAPI } from '../api/endpoints';
import { onSessionExpired } from '../api/sessionEvents';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  online: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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

  // Si el token se invalida en cualquier momento (401 de apiFetch), volvemos
  // a la pantalla de login sin recargar nada, igual que en la web.
  useEffect(() => {
    return onSessionExpired(() => setUser(null));
  }, []);

  // Renovar el accessToken automáticamente al recuperar conexión (igual que
  // la web). /auth/refresh solo devuelve un accessToken nuevo, no el user
  // — por eso aquí no se vuelve a guardar el user, solo el token.
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    if (!online || !user) return;
    (async () => {
      try {
        const data = await AuthAPI.refresh();
        if (data?.accessToken) {
          await saveToken(data.accessToken);
        }
      } catch {
        // 401 ya disparó cubagest-session-expired vía apiFetch si aplicaba
      }
    })();
  }, [online, user]);

  // Restore session
  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) { setLoading(false); return; }

      const netState = await NetInfo.fetch();
      const isOnline = !!netState.isConnected && netState.isInternetReachable !== false;

      if (!isOnline) {
        // Offline: use cached user directly
        const cached = await getCachedUser();
        if (cached) setUser(cached as User);
        else await saveToken(null); // no cache, force login
        setLoading(false);
        return;
      }

      // Online: verify with server
      try {
        const me = await AuthAPI.me();
        await setCachedUser(me);
        setUser(me);
      } catch {
        // Server failed — try cache
        const cached = await getCachedUser();
        if (cached) setUser(cached as User);
        else await saveToken(null);
      }
      setLoading(false);
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const { accessToken, refreshToken, user: u } = await AuthAPI.login(email, password);
    await saveToken(accessToken);
    await saveRefreshToken(refreshToken);
    await setCachedUser(u);
    setUser(u);
  };

  const logout = async () => {
    await saveToken(null);
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
