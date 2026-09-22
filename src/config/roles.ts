// Debe coincidir EXACTAMENTE con el backend (middleware/roles.ts) y la web
// (App.tsx ROLES). Fase 0: la app tenía un set de perms desactualizado que
// ocultaba pestañas a roles que sí deberían verlas (ej: cajero sin cierre,
// transferencias ni auditoría) y usaba colores distintos.
export const ROLES: Record<string, { label: string; color: string; perms: string[] }> = {
  admin: {
    label: 'Administrador',
    color: '#048afb',
    perms: ['dashboard', 'inventario', 'facturacion', 'contabilidad', 'cierre', 'usuarios', 'config', 'transferencias', 'auditoria', 'monedas'],
  },
  cajero: {
    label: 'Cajero',
    color: '#048afb',
    perms: ['dashboard', 'pos', 'facturacion', 'cierre', 'transferencias', 'auditoria'],
  },
  contador: {
    label: 'Contador',
    color: '#10B981',
    perms: ['dashboard', 'contabilidad', 'cierre', 'auditoria'],
  },
  almacenista: {
    label: 'Almacenista',
    color: '#7A5C1A',
    perms: ['dashboard', 'inventario', 'pos', 'cierre', 'transferencias', 'auditoria'],
  },
};

export const PAY_METHODS = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'usd', label: 'USD' },
  { id: 'clasica', label: 'Clásica' },
  { id: 'zelle', label: 'Zelle' },
  { id: 'mlc', label: 'MLC' },
  { id: 'eur', label: 'EUR' },
];

export const CURRENCIES = ['CUP', 'USD', 'EUR', 'MLC'];
export const CURRENCY_SYMBOLS: Record<string, string> = { CUP: '$', USD: '$', EUR: '€', MLC: 'MLC' };

export const CAN_MANAGE_INVENTORY = ['admin', 'almacenista'];
