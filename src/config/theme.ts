// ─── TEMA CUBAGEST (dual: claro/oscuro) ──────────────────────────────────────
// Paleta oficial del Brand Kit: #048afb. Todos los colores "estáticos" que
// había antes (#3B82F6, #EFF6FF, etc.) ahora viven aquí como tokens, y las
// superficies/textos cambian según el tema activo (ThemeContext). Igual que
// las variables CSS de la web.
//
// REGLA de uso en las screens:
//  - Fondos/textos/bordes SIEMPRE via colors.* (nunca hex suelto).
//  - Blanco sobre color de marca (botones, badges) sí puede ser '#fff'
//    literal: es texto sobre un fondo siempre saturado.

// Canales RGB para derivar transparencias: colors.primary + '18' etc.
const BRAND = '#048afb';
const BRAND_DARK = '#026ace';
const BRAND_LIGHT = '#47a9ff';

// Navy de marca (fondo del login, header de la app) — fijo en ambos temas,
// igual que en la web.
export const NAVY = '#0B1220';
export const NAVY_2 = '#0D3B75';

const light = {
  // Marca
  primary: BRAND,
  primaryDark: BRAND_DARK,
  primaryLight: BRAND_LIGHT,
  primaryTint: '#EAF4FE',      // fondo suave azul (equiv. --brand-tint web)
  primaryTintB: '#B5DBFD',     // borde suave azul (equiv. --brand-tint-b web)

  // Superficies
  bg: '#F8FAFC',
  bgCard: '#ffffff',
  bgSecondary: '#F1F5F9',

  // Bordes
  border: '#E2E8F0',
  borderLight: '#F1F5F9',

  // Textos
  text: '#1E293B',
  textSecondary: '#475569',
  textMuted: '#94A3B8',

  // Acento — Verde (acciones clave: Cobrar, confirmaciones)
  success: '#10B981',
  successBg: '#ECFDF5',
  successLight: '#D1FAE5',

  // Alerta — Naranja
  warning: '#F97316',
  warningBg: '#FFF7ED',
  warningBorder: '#FED7AA',
  warningTextDark: '#9A3412',

  // Peligro
  danger: '#DC2626',
  dangerBg: '#FEF2F2',
  dangerLight: '#FECACA',

  // Info
  info: BRAND,
  infoBg: '#EAF4FE',
};

const dark = {
  // Marca — en oscuro el botón usa un azul un pelín más claro por legibilidad
  primary: '#2E97FC',
  primaryDark: BRAND,
  primaryLight: BRAND_LIGHT,
  primaryTint: 'rgba(4,138,251,0.14)',
  primaryTintB: 'rgba(4,138,251,0.38)',

  // Superficies (equiv. .dark de la web)
  bg: '#0B1220',
  bgCard: '#101A2C',
  bgSecondary: '#1E293B',

  // Bordes
  border: '#26334A',
  borderLight: '#1B2537',

  // Textos
  text: '#E2E8F0',
  textSecondary: '#CBD5E1',
  textMuted: '#94A3B8',

  // Acentos — mismos huevos, fondos translúcidos para no deslumbrar
  success: '#34D399',
  successBg: 'rgba(16,185,129,0.14)',
  successLight: 'rgba(16,185,129,0.30)',

  warning: '#FB923C',
  warningBg: 'rgba(249,115,22,0.12)',
  warningBorder: 'rgba(249,115,22,0.35)',
  warningTextDark: '#FDBA74',

  danger: '#F87171',
  dangerBg: 'rgba(220,38,38,0.14)',
  dangerLight: 'rgba(220,38,38,0.35)',

  info: '#2E97FC',
  infoBg: 'rgba(4,138,251,0.14)',
};

export type Palette = typeof light;

export const palettes = { light, dark };

// `colors` apunta al tema ACTIVO: ThemeContext reasigna estas propiedades al
// cambiar de tema (Object.assign sobre el objeto exportado), así cualquier
// StyleSheet.create creado al importar el módulo queda vivo — los estilos
// estáticos de RN NO se re-evalúan solos, y así no hay que suscribir cada
// screen al contexto para tener dark mode.
const colors: Palette = { ...light };

export const applyTheme = (mode: 'light' | 'dark') => {
  Object.assign(colors, mode === 'dark' ? dark : light);
};

export const getThemeMode = (): 'light' | 'dark' => currentMode;
let currentMode: 'light' | 'dark' = 'light';
// Referencia global de versión de tema: los estilos de las screens se
// reconstruyen cuando cambia (los StyleSheet.create a nivel de módulo
// "hornean" los valores, así que sin esto el modo oscuro no se aplicaría).
export const themeRef = { version: 0 };
export const setThemeMode = (mode: 'light' | 'dark') => {
  if (mode !== currentMode) { currentMode = mode; themeRef.version++; }
};

export { colors };

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};

export const shadow = {
  sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 8,
  },
};

// Sombra de la tarjeta 3D del login (equivalente a las capas del panel
// blanco de la web). Fija — la tarjeta es blanca en ambos temas.
export const card3d = {
  shadowColor: '#0B1220',
  shadowOffset: { width: 0, height: 18 },
  shadowOpacity: 0.30,
  shadowRadius: 36,
  elevation: 12,
};
