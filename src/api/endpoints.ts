import { apiFetch } from './client';
import type {
  AuthResponse, User, Product, Sale, Expense, PlanInfo,
  DashboardSummary, Location, LocationStock, Closing, InventoryReading,
  ClosingPreview, Transfer, AuditLog, AccountingSummary, IncomeRow,
  CashMovement, Shift, ShiftCurrentResponse, AssignedCaja,
  CashToleranceMode, SubscriptionStatus,
} from '../types';

export const AuthAPI = {
  login: (email: string, password: string): Promise<AuthResponse> =>
    apiFetch('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  // GET /auth/me responde { ok, user: {...} } — sin clave "data", así que el
  // unwrapping genérico del cliente devuelve el sobre { user }. Hay que
  // extraer .user aquí: antes se guardaba el sobre como si fuera el usuario,
  // user.role quedaba undefined y la app terminaba con 0 pestañas
  // ("rol desconocido / sin módulos asignados").
  me: async (): Promise<User> => {
    const res = await apiFetch<any>('/auth/me');
    return (res?.user ?? res) as User;
  },
  // El registro actual del backend devuelve un único `token` (sin
  // refreshToken) y el usuario. Aceptamos ambos nombres para no romper
  // ninguna de las dos formas mientras el backend se estandariza.
  register: (data: { companyName: string; companyNit?: string; name: string; email: string; password: string; referralCode?: string }): Promise<AuthResponse> =>
    apiFetch('/auth/register', { method: 'POST', body: data, auth: false }),
  forgotPassword: (email: string): Promise<{ message: string }> =>
    apiFetch('/auth/forgot-password', { method: 'POST', body: { email }, auth: false }),
  // La renovación silenciosa NO vive aquí: la controla src/api/session.ts
  // (un solo refresh en vuelo para toda la app + reglas de "nunca cierres la
  // sesión por un fallo de red"). El cliente HTTP la invoca en cada 401.
};

// ─── Planes y suscripción ─────────────────────────────────────────────────────
export const PlanAPI = {
  // La info del plan vive en GET /subscription (la raíz), no en /plan.
  get: (): Promise<PlanInfo> => apiFetch('/subscription'),
};

export const SubscriptionAPI = {
  status: (): Promise<SubscriptionStatus> => apiFetch('/subscription/status'),
  authorizeQvapay: (plan: string): Promise<{ url?: string }> =>
    apiFetch('/subscription/authorize', { method: 'POST', body: { plan } }),
  // Cancelar la suscripción. La ruta EXISTE (subscriptions.ts:78) y es solo
  // admin; el footer de PlanModal ya prometía "puedes cancelar en cualquier
  // momento" sin ninguna forma de hacerlo, y eso es un problema legal, no una
  // molestia.
  //
  // NO quita el plan al instante: deja el acceso hasta el fin del periodo ya
  // pagado (`accessUntil`) y a partir de ahí vuelve a free sola, sin cobrar
  // nada más. Cancelar hoy lo que ya se pagó sería lo contrario de lo que la
  // gente espera al cancelar.
  cancel: (): Promise<{ subscriptionStatus: string; planExpiry?: string | null; accessUntil?: string | null; alreadyCancelled?: boolean }> =>
    apiFetch('/subscription/cancel', { method: 'POST' }),
};

export const LocationsAPI = {
  list: (): Promise<Location[]> => apiFetch('/locations'),
  stock: (id: string): Promise<LocationStock> => apiFetch(`/locations/${id}/stock`),
  // Cajas que un admin puede ASIGNAR (cajas de la empresa, sin almacén).
  assignable: (): Promise<{ id: string; name: string; active: boolean }[]> =>
    apiFetch('/locations/assignables'),
  // Crear una caja. Solo admin (requireRole("admin") en locations.ts). El
  // backend normaliza `type`: cualquier cosa que no sea "almacen" es "caja".
  create: (body: { name: string; type: 'caja' }): Promise<Location> =>
    apiFetch('/locations', { method: 'POST', body: body as unknown as Record<string, unknown> }),
  // Ajuste de stock en UNA ubicación puntual. OJO: el viejo
  // POST /products/:id/adjust-stock ya NO existe en el backend — por eso el
  // ajuste desde la app siempre fallaba. El backend real es /locations/:id/adjust.
  adjust: (
    id: string,
    body: { productId: string; type: 'entrada' | 'salida'; qty: number; reason?: string },
  ): Promise<{ locationId: string; productId: string; qty: number }> =>
    apiFetch(`/locations/${id}/adjust`, { method: 'POST', body }),
};

export const DashboardAPI = {
  summary: (): Promise<DashboardSummary> => apiFetch('/dashboard/summary'),
  // ?days=N — la web pide 7/30/90/180 según el rango del gráfico.
  analytics: (days?: string): Promise<any> =>
    apiFetch(`/dashboard/analytics${days ? `?days=${days}` : ''}`),
};

// ─── Config de empresa: monedas y tasa de cambio (Fase 4) ─────────────────
export const SettingsAPI = {
  get: (): Promise<{ currencies: string[]; rateMode: 'manual' | 'eltoque'; manualRates: Record<string, number>; rates: Record<string, number>; ratesUpdatedAt?: string; cashToleranceMode?: CashToleranceMode; cashToleranceValue?: number; cashRequireApproval?: boolean }> =>
    apiFetch('/settings'),
  update: (body: { currencies?: string[]; rateMode?: 'manual' | 'eltoque'; manualRates?: Record<string, number>; cashToleranceMode?: CashToleranceMode; cashToleranceValue?: number; cashRequireApproval?: boolean }): Promise<unknown> =>
    apiFetch('/settings', { method: 'PUT', body }),
};

// ─── Descuentos (admin crea/elimina; POS aplica) ──────────────────────────
export const DiscountsAPI = {
  list: (): Promise<any[]> => apiFetch('/discounts'),
  create: (d: Record<string, unknown>): Promise<any> => apiFetch('/discounts', { method: 'POST', body: d }),
  update: (id: string, d: Record<string, unknown>): Promise<any> =>
    apiFetch(`/discounts/${id}`, { method: 'PUT', body: d }),
  remove: (id: string): Promise<unknown> => apiFetch(`/discounts/${id}`, { method: 'DELETE' }),
};

// ─── Referidos ────────────────────────────────────────────────────────────
export const ReferralsAPI = {
  my: (): Promise<{ code?: string; invited?: number; bonified?: number; pending?: number }> => apiFetch('/referrals'),
};

export const ProductsAPI = {
  list: (params: Record<string, string> = {}): Promise<Product[]> => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/products${qs ? `?${qs}` : ''}`);
  },
  create: (product: Partial<Product>): Promise<Product> =>
    apiFetch('/products', { method: 'POST', body: product as Record<string, unknown> }),
  update: (id: string, product: Partial<Product>): Promise<Product> =>
    apiFetch(`/products/${id}`, { method: 'PUT', body: product as Record<string, unknown> }),
  remove: (id: string): Promise<unknown> => apiFetch(`/products/${id}`, { method: 'DELETE' }),
  // El backend real expone POST /products/:id/reactivate (no PUT con active).
  reactivate: (id: string): Promise<unknown> =>
    apiFetch(`/products/${id}/reactivate`, { method: 'POST' }),
};

// ─── Sales ──────────────────────────────────────────────────────────────────
// El cliente manda `clientSaleId` (UUID del dispositivo) y `locationId` para
// que un reintento no duplique la factura y la venta quede anclada a la
// ubicación desde la que se hizo. El backend es la autoridad de precios,
// stock e impuestos: la app solo envía cantidades y preferencias.
export const SalesAPI = {
  list: (params: Record<string, string> = {}): Promise<Sale[]> => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/sales${qs ? `?${qs}` : ''}`);
  },
  create: (sale: Partial<Sale> & { clientSaleId?: string; locationId?: string }): Promise<Sale> =>
    apiFetch('/sales', { method: 'POST', body: sale as Record<string, unknown> }),
  update: (id: string, data: Partial<Sale>): Promise<Sale> =>
    apiFetch(`/sales/${id}`, { method: 'PUT', body: data as Record<string, unknown> }),
  voidSale: (id: string): Promise<unknown> => apiFetch(`/sales/${id}/void`, { method: 'POST' }),
  sync: (sales: Record<string, unknown>[]): Promise<unknown> =>
    apiFetch('/sales/sync', { method: 'POST', body: { sales } }),
};

export const AccountingAPI = {
  summary: (params: Record<string, string> = {}): Promise<AccountingSummary> => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/accounting/summary${qs ? `?${qs}` : ''}`);
  },
  income: (params: Record<string, string> = {}): Promise<IncomeRow[]> => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/accounting/income${qs ? `?${qs}` : ''}`);
  },
};

export const ExpensesAPI = {
  list: (params: Record<string, string> = {}): Promise<Expense[]> => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/accounting/expenses${qs ? `?${qs}` : ''}`);
  },
  create: (expense: Partial<Expense>): Promise<Expense> =>
    apiFetch('/accounting/expenses', { method: 'POST', body: expense as Record<string, unknown> }),
  remove: (id: string): Promise<unknown> => apiFetch(`/accounting/expenses/${id}`, { method: 'DELETE' }),
};

// ─── Usuarios (activación por link) ─────────────────────────────────────────
// Contrato verificado contra el backend:
//  - POST /users NO recibe contraseña: el admin no escribe la clave de nadie.
//    La respuesta trae `setPasswordUrl` (respaldo para compartir a mano si el
//    correo no llega) y `emailSent` (si el backend pudo enviarlo).
//  - POST /users/:id/resend-set-password devuelve { setPasswordUrl, emailSent }.
export interface UserActivation {
  setPasswordUrl?: string;
  emailSent?: boolean;
}

export const UsersAPI = {
  list: (): Promise<User[]> => apiFetch('/users'),
  create: (user: { name: string; email: string; role: string; nit?: string }): Promise<User & UserActivation> =>
    apiFetch('/users', { method: 'POST', body: user as Record<string, unknown> }),
  update: (id: string, user: Partial<User>): Promise<User> =>
    apiFetch(`/users/${id}`, { method: 'PUT', body: user as Record<string, unknown> }),
  remove: (id: string): Promise<unknown> => apiFetch(`/users/${id}`, { method: 'DELETE' }),
  resendSetPassword: (id: string): Promise<UserActivation> =>
    apiFetch(`/users/${id}/resend-set-password`, { method: 'POST' }),
};

export const ClosingAPI = {
  list: (): Promise<Closing[]> => apiFetch('/closing'),
  // El detalle NO es una fila de la lista: solo GET /closing/:id añade `notas`,
  // `explicaciones` y `pendientes` (ya descontado lo explicado). La lista
  // devuelve las filas crudas, así que una pantalla que se apoye en `list()`
  // para pintar el detalle nunca verá si el cierre está resuelto.
  detail: (id: string): Promise<Closing> => apiFetch(`/closing/${id}`),
  readings: (): Promise<InventoryReading[]> => apiFetch('/closing/readings'),
  takeReading: (locationId: string, notes?: string): Promise<InventoryReading> =>
    apiFetch('/closing/readings', { method: 'POST', body: { locationId, notes } }),
  preview: (initialReadingId: string): Promise<ClosingPreview> =>
    apiFetch(`/closing/preview/${initialReadingId}`),
  // `countedCash` y `countedAt` son lo que convierte esto en un cierre de dinero
  // y no solo de inventario. Antes no se mandaban: cada cierre hecho desde el
  // teléfono era money-blind — merchandise-only — y el backend lo aceptaba por
  // cortesía con un cliente "que precede a esta pantalla" (ver closing.ts).
  // `countedCash` es POR MONEDA y `countedAt` es el instante REAL del conteo:
  // sin conexión puede ser horas anterior a cuando se sube, y de eso depende
  // la ventana para explicar el descuadre.
  confirm: (body: {
    initialReadingId: string;
    items: { productId: string; stockValidated: number }[];
    notes?: string;
    countedCash?: Record<string, number>;
    countedAt?: string;
  }): Promise<Closing> =>
    apiFetch('/closing/confirm', { method: 'POST', body }),
  // Explicar un descuadre de DINERO. La cantidad tiene que coincidir con el
  // descuadre EXACTO (el servidor rechaza con 400 AMOUNT_MISMATCH si no), y la
  // nota no puede estar vacía. Respuesta 409 = el cierre ya no está esperando
  // explicaciones.
  explain: (id: string, body: { currency: string; amount: number; note: string }): Promise<{ status?: string; pendientes?: unknown }> =>
    apiFetch(`/closing/${id}/explain`, { method: 'POST', body }),
  // Anotar una línea de MERCADERÍA. Esto NO resuelve el cierre: dice por qué
  // faltó, y vive en otra tabla (`closing_notes`) precisamente para que no
  // pueda confundirse con una explicación de dinero.
  addNote: (id: string, body: { productId: string; note: string }): Promise<unknown> =>
    apiFetch(`/closing/${id}/note`, { method: 'POST', body }),
};

// ─── Turnos ──────────────────────────────────────────────────────────────────
// Contrato verificado contra src/routes/shifts.ts:
//  - GET /shift/current → { shift, assignedCajas, aviso }  ← assignedCajas, NO cajas
//  - POST /shift/start  → { shift }  (crea la lectura de apertura en el servidor)
//  - POST /shift/end    → { closed }
export const ShiftAPI = {
  current: (): Promise<ShiftCurrentResponse> => apiFetch('/shift/current'),
  start: (locationId: string, baseCash?: Record<string, number>): Promise<{ shift: Shift }> =>
    apiFetch('/shift/start', { method: 'POST', body: { locationId, baseCash } }),
  end: (): Promise<{ closed: string }> => apiFetch('/shift/end', { method: 'POST' }),
  // Solo admin. Un PUT es REEMPLAZO TOTAL del juego de cajas, no un toggle:
  // quitar una caja es quitarla de verdad, no "quedó a medio quitar".
  assignments: (userId: string): Promise<AssignedCaja[]> =>
    apiFetch(`/shift/assignments/${userId}`),
  setAssignments: (userId: string, locationIds: string[]): Promise<AssignedCaja[]> =>
    apiFetch(`/shift/assignments/${userId}`, { method: 'PUT', body: { locationIds } }),
};

// ─── Transferencias ─────────────────────────────────────────────────────────
// Reglas verificadas en el backend (src/routes/transfers.ts):
//  - POST /transfers: el admin DEBE mandar `fromLocationId` (no tiene
//    ubicación propia); cajero/almacenista usan su ubicación y no la mandan.
//  - approve/reject: solo quien RECIBE (almacenista si el destino es un
//    almacén; cajero si el destino es su caja). El admin no puede resolver.
//  - cancel: quien creó el envío, o el admin.
export const TransfersAPI = {
  list: (params: Record<string, string> = {}): Promise<Transfer[]> => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/transfers${qs ? `?${qs}` : ''}`);
  },
  create: (body: {
    toLocationId: string;
    items: { productId: string; qty: number }[];
    notes?: string;
    fromLocationId?: string;
  }): Promise<Transfer> =>
    apiFetch('/transfers', { method: 'POST', body }),
  approve: (id: string): Promise<unknown> => apiFetch(`/transfers/${id}/approve`, { method: 'POST' }),
  reject: (id: string, reason?: string): Promise<unknown> =>
    apiFetch(`/transfers/${id}/reject`, { method: 'POST', body: { reason: reason || undefined } }),
  cancel: (id: string): Promise<unknown> => apiFetch(`/transfers/${id}/cancel`, { method: 'POST' }),
};

export const AuditAPI = {
  list: (params: Record<string, string> = {}): Promise<AuditLog[]> => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/audit${qs ? `?${qs}` : ''}`);
  },
};

// ─── Entradas y salidas de dinero de la caja ─────────────────────────────────
// Contrato verificado contra src/routes/cashMovements.ts:
//  - GET  /cash-movements?locationId=&pendientes=1 → ARRAY PLANO (no {data:[…]} de
//    lista, y SÍ envuelto: apiFetch lo desenvuelve igual).
//  - POST /cash-movements  → 201 con la fila. 400 si la cantidad no es > 0 o
//    > 1e9, o si una `salida` viene sin motivo. 403 si el cajero registra una
//    salida sin turno abierto ("Abre tu turno antes de registrar una salida de
//    dinero.").
//  - POST /cash-movements/:id/decide → 409 si ya se decidió, 403 si quien
//    aprueba es quien lo registró.
export const CashMovementsAPI = {
  list: (params: { locationId?: string; pendientes?: '1' } = {}): Promise<CashMovement[]> => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => !!v) as [string, string][],
    ).toString();
    return apiFetch(`/cash-movements${qs ? `?${qs}` : ''}`);
  },
  create: (body: { locationId: string; type: 'entrada' | 'salida'; amount: number; currency: string; reason?: string }): Promise<CashMovement> =>
    apiFetch('/cash-movements', { method: 'POST', body: body as unknown as Record<string, unknown> }),
  decide: (id: string, decision: 'aprobar' | 'rechazar', note?: string): Promise<{ id: string; status: string }> =>
    apiFetch(`/cash-movements/${id}/decide`, { method: 'POST', body: { decision, note: note || undefined } }),
};
