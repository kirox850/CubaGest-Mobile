import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyTheme, setThemeMode } from '../config/theme';

// ─── THEME CONTEXT (modo claro/oscuro) ───────────────────────────────────────
// Igual que en la web: preferencia persistida y aplicada globalmente.
// Al cambiar, reasigna los tokens de `colors` (theme.ts) y bumped `version`
// para que los consumidores que necesitan re-render (navigator, header)
// re-creen sus estilos.
interface ThemeContextValue {
  mode: 'light' | 'dark';
  toggle: () => void;
  /** Número que cambia en cada toggle — úsalo en dependencias de useEffect/memo */
  version: number;
}

const ThemeContext = createContext<ThemeContextValue>({ mode: 'light', toggle: () => {}, version: 0 });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const [version, setVersion] = useState(0);

  // Cargar preferencia al montar
  useEffect(() => {
    AsyncStorage.getItem('cubagest_theme').then((saved) => {
      if (saved === 'dark' || saved === 'light') {
        setMode(saved);
        applyTheme(saved);
        setThemeMode(saved);
      }
    });
  }, []);

  const toggle = () => {
    setMode((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      setThemeMode(next);
      AsyncStorage.setItem('cubagest_theme', next);
      setVersion((v) => v + 1);
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ mode, toggle, version }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
