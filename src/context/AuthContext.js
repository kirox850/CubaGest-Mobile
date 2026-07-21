import React, { createContext, useContext, useEffect, useState } from "react";
import { getToken, setToken as saveToken } from "../api/client";
import { AuthAPI } from "../api/endpoints";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        try {
          const me = await AuthAPI.me();
          setUser(me);
        } catch (err) {
          await saveToken(null); // token vencido o inválido
        }
      }
      setLoading(false);
    })();
  }, []);

  const register = async (payload) => {
    const { token, user: newUser } = await AuthAPI.register(payload);
    await saveToken(token);
    setUser(newUser);
  };

  const login = async (email, password) => {
    const { token, user: loggedUser } = await AuthAPI.login(email, password);
    await saveToken(token);
    setUser(loggedUser);
  };

  const logout = async () => {
    await saveToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
