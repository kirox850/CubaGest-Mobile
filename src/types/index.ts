// ─── Tipos compartidos de CubaGest Mobile ───────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'cajero' | 'contador' | 'almacenista';
  /** Identificador de la empresa. El backend lo devuelve anidado en `company`. */
  businessId?: string;
  company?: Company;
  nit?: string;
  active?: boolean;
  pending?: boolean; // cuenta creada por el admin que aún no establece contraseña
  lastLoginAt?: string;
  createdAt?: string;
}

export interface Company {
  id: string;
  name: string;
  nit?: string;
  address?: string;
  phone?: string;
  plan: 'free' | 'pro' | 'empresarial';
  trialActive?: boolean;
  planExpiry?: string;
  subscriptionStatus?: string;
  createdAt?: string;
}

export interface Product {
  id: string;
  businessId: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  price: number;
  cost: number;
  stock: number;
  minStock: number;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SaleItem {
  productId: string;
  name: string;
  qty: number;
  price: number;
  total?: number;
}

export interface Sale {
  id: string;
  businessId: string;
  invoiceNumber?: string;
  date?: string;
  clientName?: string;
  client?: string;
  clientNit?: string;
  clientPhone?: string;
  subtotal: number;
  tax?: number;
  total: number;
  // Multimoneda: el backend acepta cualquier moneda habilitada en settings
  // (CUP, USD, MLC, EUR, ZELLE, CLASICA...), así que es string libre.
  currency: string;
  payMethod: string;
  status: 'emitida' | 'anulada';
  userId?: string;
  /** Ubicación desde la que se vendió. Inmutable: el stock sale de aquí. */
  locationId?: string;
  /** UUID generado por el dispositivo: idempotencia de la venta. */
  clientSaleId?: string;
  items?: SaleItem[];
  SaleItems?: SaleItem[];
  createdAt?: string;
  syncedAt?: string;
}

export interface Expense {
  id: string;
  businessId: string;
  date: string;
  concept: string;
  amount: number;
  category: string;
  paymentMethod?: string;
  method?: string;
  userId?: string;
  createdAt?: string;
}

export interface DashboardSummary {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  salesCount: number;
  todaySalesCount: number;
  todaySalesTotal: number;
  lowStockCount: number;
  lowStock: Product[];
  chartDays: { date: string; total: number }[];
}

// ─── Ubicaciones e inventario multi-ubicación ──────────────────────────────
export interface Location {
  id: string;
  companyId: string;
  name: string;
  type: 'almacen' | 'caja';
  ownerUserId?: string | null;
  active: boolean;
  createdAt?: string;
}

export interface LocationStockItem extends Product {
  stock: number; // stock EN esa ubicación
}

export interface LocationStock {
  location: Location;
  items: LocationStockItem[];
}

// ─── Cierre de caja ────────────────────────────────────────────────────────
export interface ReadingItem {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  qty: number;
}

export interface InventoryReading {
  id: string;
  companyId: string;
  locationId: string;
  takenById: string;
  takenBy?: { id: string; name: string };
  type: 'apertura' | 'cierre';
  notes?: string | null;
  items: ReadingItem[];
  createdAt: string;
}

export interface ClosingItem {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  price: number;
  stockInitial: number;
  stockSold: number;
  stockExpected: number;
  stockValidated: number;
  shortage: number;
  income: number;
}

export interface Closing {
  id: string;
  companyId: string;
  locationId?: string;
  initialReadingId: string;
  closedById: string;
  closedBy?: { id: string; name: string };
  periodStart: string;
  periodEnd: string;
  totalSales: number;
  totalIncome: number;
  incomeEfectivo: number;
  incomeTransferencia: number;
  items: ClosingItem[];
  notes?: string | null;
  createdAt: string;
}

export interface ClosingPreview {
  initialReading: { id: string; type: string; createdAt: string; notes?: string | null; locationId: string };
  periodStart: string;
  periodEnd: string;
  totalSales: number;
  totalIncome: number;
  incomeEfectivo: number;
  incomeTransferencia: number;
  items: ClosingItem[];
}

// ─── Transferencias / envíos de stock ──────────────────────────────────────
export interface TransferItem {
  id: string;
  transferId: string;
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  qty: number;
}

export interface Transfer {
  id: string;
  companyId: string;
  fromLocationId: string;
  toLocationId: string;
  requestedById: string;
  requestedBy?: { id: string; name: string };
  status: 'pendiente' | 'aprobado' | 'rechazado' | 'cancelado';
  notes?: string | null;
  rejectReason?: string | null;
  items: TransferItem[];
  createdAt: string;
  /** Resueltos por el backend: quién puede aprobar/rechazar y quién cancelar. */
  canResolve?: boolean;
  canCancel?: boolean;
}

// ─── Auditoría ─────────────────────────────────────────────────────────────
export interface AuditLog {
  id: string;
  companyId: string;
  userId?: string | null;
  userName: string;
  action: string;
  entity: string;
  entityId?: string | null;
  detail?: unknown;
  ip?: string | null;
  createdAt: string;
}

// ─── Contabilidad ──────────────────────────────────────────────────────────
// Shape exacto de GET /accounting/summary del backend.
export interface AccountingSummary {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  salesCount: number;
  expensesCount: number;
  period: { from: string | null; to: string | null };
}

export interface IncomeRow {
  id: string;
  invoiceNumber?: string;
  date?: string;
  clientName?: string;
  client?: string;
  payMethod?: string;
  total: number;
}

export interface PlanInfo {
  plan: string;
  subscriptionStatus?: string;
  limits: {
    maxUsers: number;
    maxProducts: number;
    maxSalesMonth: number;
  };
  usage: {
    users: number;
    products: number;
    salesThisMonth: number;
  };
}

// El login real del backend devuelve accessToken (corta duración) +
// refreshToken + user. El registro actual devuelve un único `token` y ningún
// refreshToken, por eso refreshToken es opcional al normalizar.
export interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  user: User;
}

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: Record<string, unknown>;
  auth?: boolean;
  /** Uso interno del cliente: evita bucles infinitos al reintentar tras refresh */
  __isRetry?: boolean;
}
