import { apiFetch } from './client';
import type {
  AuthResponse, User, Product, Sale, Expense, PlanInfo,
  DashboardSummary, Location, LocationStock, Closing, InventoryReading,
  ClosingPreview, Transfer, AuditLog, AccountingSummary, IncomeRow,
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
  status: (): Promise<unknown> => apiFetch('/subscription/status'),
  authorizeQvapay: (plan: string): Promise<{ url?: string }> =>
    apiFetch('/subscription/authorize', { method: 'POST', body: { plan } }),
  // NO hay `cancel`: el backend expone /status, /, /whatsapp, /authorize y
  // /qvapay-callback — no existe DELETE /subscription/cancel. Antes había aquí
  // un stub que apuntaba a una ruta inexistente (cualquier botón que lo
  // usara recibiría 404). El plan es explícito: la UI de cancelación se añade
  // SOLO cuando exista la ruta; mientras tanto se gestiona con soporte.
};

export const LocationsAPI = {
  list: (): Promise<Location[]> => apiFetch('/locations'),
  stock: (id: string): Promise<LocationStock> => apiFetch(`/locations/${id}/stock`),
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
  get: (): Promise<{ currencies: string[]; rateMode: 'manual' | 'eltoque'; manualRates: Record<string, number>; rates: Record<string, number>; ratesUpdatedAt?: string }> =>
    apiFetch('/settings'),
  update: (body: { currencies?: string[]; rateMode?: 'manual' | 'eltoque'; manualRates?: Record<string, number> }): Promise<unknown> =>
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
  detail: (id: string): Promise<Closing> => apiFetch(`/closing/${id}`),
  readings: (): Promise<InventoryReading[]> => apiFetch('/closing/readings'),
  takeReading: (locationId: string, notes?: string): Promise<InventoryReading> =>
    apiFetch('/closing/readings', { method: 'POST', body: { locationId, notes } }),
  preview: (initialReadingId: string): Promise<ClosingPreview> =>
    apiFetch(`/closing/preview/${initialReadingId}`),
  confirm: (body: { initialReadingId: string; items: { productId: string; stockValidated: number }[]; notes?: string }): Promise<Closing> =>
    apiFetch('/closing/confirm', { method: 'POST', body }),
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
