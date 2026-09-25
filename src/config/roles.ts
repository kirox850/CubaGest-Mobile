// Matriz de roles de CubaGest.
// Debe coincidir con el backend (src/middleware/roles.ts) y con la web.
//
// Backend-owned (P0 item 7):
//   admin       → todos los módulos
//   cajero      → dashboard, POS, facturación, cierre, transferencias
//   contador    → dashboard, contabilidad
//   almacenista → dashboard, inventario, POS, cierre, transferencias
//
// "pos" no aparece en las pestañas (el POS vive dentro de Facturas), pero sí
// cuenta como permiso: es lo que el backend exige (requireModule("pos")) para
// crear ventas y para POST /sales/sync. Por eso un admin sin "pos" no podría
// vender aunque tenga todos los demás módulos.
export const ROLES: Record<string, { label: string; color: string; perms: string[] }> = {
  admin: {
    label: 'Administrador',
    color: '#048afb',
    perms: [
      'dashboard', 'inventario', 'pos', 'facturacion', 'contabilidad', 'cierre',
      'usuarios', 'config', 'transferencias', 'auditoria', 'descuentos', 'monedas',
    ],
  },
  cajero: {
    label: 'Cajero',
    color: '#048afb',
    perms: ['dashboard', 'pos', 'facturacion', 'cierre', 'transferencias'],
  },
  contador: {
    label: 'Contador',
    color: '#10B981',
    perms: ['dashboard', 'contabilidad'],
  },
  almacenista: {
    label: 'Almacenista',
    color: '#7A5C1A',
    perms: ['dashboard', 'inventario', 'pos', 'cierre', 'transferencias'],
  },
};

/** ¿El rol puede entrar a este módulo? */
export function canAccess(role: string | undefined, module: string): boolean {
  return ROLES[role || '']?.perms.includes(module) ?? false;
}

// Labels idénticos a los de la web (constants.ts)
export const PAY_METHODS = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'usd', label: 'USD (efectivo)' },
  { id: 'clasica', label: 'Clásica' },
  { id: 'zelle', label: 'Zelle' },
  { id: 'mlc', label: 'MLC' },
  { id: 'eur', label: 'EUR (efectivo)' },
];

export const CURRENCIES = ['CUP', 'USD', 'EUR', 'MLC'];
export const CURRENCY_SYMBOLS: Record<string, string> = { CUP: '$', USD: '$', EUR: '€', MLC: 'MLC' };

// Categorías y unidades — mismas listas que la web
export const CATEGORIES = ['Alimentos', 'Higiene', 'Bebidas', 'Limpieza', 'Electrónica', 'Ropa', 'Otros'];
export const UNITS = ['ud', 'kg', 'g', 'L', 'ml', 'paq', 'lata', 'caja', 'docena'];
export const EXPENSE_CATS = ['Compras', 'Nómina', 'Servicios', 'Operaciones', 'Impuestos', 'Otros'];

export const CAN_MANAGE_INVENTORY = ['admin', 'almacenista'];
