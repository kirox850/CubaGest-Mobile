export const colors = {
  // Primario — Azul Eléctrico
  primary:      "#3B82F6",
  primaryDark:  "#1E3A5F",
  primaryLight: "#EFF6FF",

  // Fondos
  bg:           "#F8FAFC",
  bgCard:       "#ffffff",
  bgSecondary:  "#F1F5F9",

  // Bordes
  border:       "#E2E8F0",
  borderLight:  "#F1F5F9",

  // Textos
  text:         "#1E293B",
  textSecondary:"#475569",
  textMuted:    "#94A3B8",

  // Acento — Verde Menta (acciones clave: Cobrar, confirmaciones)
  success:      "#10B981",
  successBg:    "#ECFDF5",
  successLight: "#D1FAE5",

  // Alerta — Naranja Coral
  warning:      "#F97316",
  warningBg:    "#FFF7ED",
  warningBorder:"#FED7AA",

  // Peligro
  danger:       "#EF4444",
  dangerBg:     "#FEF2F2",
  dangerLight:  "#FECACA",

  // Info
  info:         "#3B82F6",
  infoBg:       "#EFF6FF",

  // Sidebar
  sidebarBg:    "#1E293B",
  sidebarText:  "rgba(255,255,255,0.7)",
  sidebarActive:"#3B82F6",
};

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32,
};

export const radius = {
  sm: 8, md: 12, lg: 16, xl: 20, full: 9999,
};

export const shadow = {
  sm: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: "#3B82F6",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
};
