import React, { createContext, useContext, useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { getToken, setToken as saveToken, getCachedUser, setCachedUser } from "../api/client";
import { AuthAPI } from "../api/endpoints";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline]   = useState(true);

  // Monitor network
  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      setOnline(state.isConnected && state.isInternetReachable !== false);
    });
    return unsub;
  }, []);

  // Restore session
  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) { setLoading(false); return; }

      const netState = await NetInfo.fetch();
      const isOnline = netState.isConnected && netState.isInternetReachable !== false;

      if (!isOnline) {
        // Offline: use cached user directly
        const cached = await getCachedUser();
        if (cached) setUser(cached);
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
        if (cached) setUser(cached);
        else await saveToken(null);
      }
      setLoading(false);
    })();
  }, []);

  const login = async (email, password) => {
    const { token, user: u } = await AuthAPI.login(email, password);
    await saveToken(token);
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

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
