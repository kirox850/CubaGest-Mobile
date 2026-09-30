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

/**
 * Una nota de mercancía sobre una línea que no cuadró.
 *
 * OJO, y es la diferencia más importante de todo este archivo: una NOTA no
 * resuelve un cierre. Es el relato de por qué faltó, no una línea cuadrada. Por
 * eso el backend las guarda en `closing_notes`, una tabla APARTE de
 * `closing_explanations` (que sí resuelve dinero). Si la UI las presentara como
 * la misma acción, alguien cerraría un descuadre creyéndolo resuelto cuando el
 * sistema sigue diciendo que falta mercancía.
 */
export interface ClosingNote {
  id: string;
  productId: string;
  productName: string;
  qty: number;
  note: string;
  autor: string;
  createdAt: string;
}

/** Una explicación de dinero: sí resuelve, y solo si coincide EXACTAMENTE. */
export interface ClosingExplicacion {
  id: string;
  currency: string;
  amount: number;
  note: string;
  autor: string;
  createdAt: string;
}

export interface ClosingPendientes {
  /** Descuadre por moneda que aún supera el margen y no está explicado. */
  dinero: Record<string, number>;
  /** Líneas de inventario que no cuadran, en cualquier sentido. */
  mercaderia: { productId: string; productName: string; unit: string; shortage: number }[];
}

export type ClosingStatus = 'cerrado' | 'provisional' | 'resuelto';

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
  // ── El dinero ────────────────────────────────────────────────────────────
  // Antes el cierre solo miraba inventario: el dinero se registraba pero nunca
  // se contaba, así que un faltante de 300 en la caja no era detectable. Estos
  // campos son los que hacen que sea detectable, y son todos POR MONEDA
  // (Record<string, number>): sumar currencies no significa nada.
  /** Turno al que pertenece este cierre (dos turnos sobre la misma caja). */
  shiftId?: string | null;
  /** Fondo con el que se abrió el turno. */
  baseCash?: Record<string, number>;
  /** Momento del conteo. Sin conexión puede ser horas antes de subirlo. */
  countedAt?: string | null;
  /** Lo que el cajero contó de verdad. */
  countedCash?: Record<string, number>;
  /** Lo que DEBÍA haber: fondo + efectivo + entradas − salidas. */
  expectedCash?: Record<string, number>;
  /** contado − esperado. Vacío = cuadró. */
  cashDiff?: Record<string, number>;
  // ── El estado de la resolución ───────────────────────────────────────────
  status?: ClosingStatus;
  /** Cuándo vence la ventana para explicar. null si ya no está en espera. */
  provisionalUntil?: string | null;
  notas?: ClosingNote[];
  explicaciones?: ClosingExplicacion[];
  /** Lo que el servidor dice que SIGUE abierto. No se deduce en el cliente. */
  pendientes?: ClosingPendientes;
}

export interface ClosingCashPreview {
  base: Record<string, number>;
  ventas: Record<string, number>;
  entradas: Record<string, number>;
  salidas: Record<string, number>;
  esperado: Record<string, number>;
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
  /** Lo que debería haber en la caja, por moneda. El contado aún va en blanco. */
  cash?: ClosingCashPreview;
  shiftId?: string | null;
  baseCash?: Record<string, number>;
}

// ─── Turnos ─────────────────────────────────────────────────────────────────
// Un turno es "esta persona, en esta caja, desde esta hora". La caja de trabajo
// sale de aquí, no de "la caja cuyo dueño soy": las cajas son del negocio y las
// pueden llevar varios.
export interface Shift {
  id: string;
  locationId: string;
  locationName: string;
  startedAt: string;
  openingReadingId?: string | null;
  /** Con cuánto dinero arrancó la caja, por moneda. */
  baseCash?: Record<string, number>;
}

/**
 * Una caja que este usuario puede abrir turno en.
 *
 * OJO: el backend devuelve `{ id, name, type, active }`
 * (getCajasAsignadas selecciona las cuatro columnas), no solo id y name. Aquí
 * se declara el mínimo que la UI necesita y el resto llega sin estorbar.
 */
export interface AssignedCaja {
  id: string;
  name: string;
  type?: string;
  active?: boolean;
}

export interface ShiftCurrentResponse {
  shift: Shift | null;
  /**
   * OJO con el nombre: es `assignedCajas`, NO `cajas`. Leer el nombre equivocado
   * deja la lista vacía sin error visible, el prompt de abrir turno no se
   * dispara nunca y el cajero con dos cajas vuelve a vender en la primera que
   * aparezca. Es un fallo silencioso, por eso tiene test de contrato.
   */
  assignedCajas: AssignedCaja[];
  /** Aviso del servidor, p. ej. que falta la migración 0012. */
  aviso?: string | null;
}

// ─── Entradas y salidas de dinero de la caja ────────────────────────────────
export interface CashMovement {
  id: string;
  locationId: string;
  locationName?: string;
  type: 'entrada' | 'salida';
  amount: number;
  currency: string;
  reason?: string | null;
  status: 'pendiente' | 'aprobada' | 'rechazada';
  userName: string;
  approvedAt?: string | null;
  decisionNote?: string | null;
  createdAt: string;
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

/**
 * GET /subscription/status. Con estos dos datos el panel puede decir la verdad
 * — "cancelado, te queda hasta el día X" — en vez de un mensaje ambiguo.
 */
export interface SubscriptionStatus {
  plan: string;
  planExpiry?: string | null;
  subscriptionStatus?: string;
  paymentMethod?: string | null;
  qvapayAuthorized?: boolean;
  lastPaymentDate?: string | null;
  nextPaymentDate?: string | null;
  failedAttempts?: number;
  daysLeft: number | null;
  isTrial: boolean;
  isCancelled: boolean;
  /** ¿Va a dejar de cobrarse solo? */
  willRenew: boolean;
}

/**
 * El margen de descuadre que el negocio acepta. NO es una preferencia de la
 * plataforma: cada caja tiene su ruido de billetes sueltos, y un margen
 * absoluto solo tiene sentido en la moneda para la que el dueño lo puso.
 */
export type CashToleranceMode = 'absoluto' | 'porcentaje';

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
