import { apiFetch } from './client';
import { getRefreshToken } from './client';
import type {
  AuthResponse, RefreshResponse, User, Product, Sale, Expense, PlanInfo,
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
  register: (data: { companyName: string; companyNit?: string; name: string; email: string; password: string; referralCode?: string }): Promise<AuthResponse> =>
    apiFetch('/auth/register', { method: 'POST', body: data, auth: false }),
  forgotPassword: (email: string): Promise<{ message: string }> =>
    apiFetch('/auth/forgot-password', { method: 'POST', body: { email }, auth: false }),
  // El backend exige el refreshToken en el body — antes no se mandaba nada
  // y esta llamada siempre fallaba con 400.
  refresh: async (): Promise<RefreshResponse> => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) throw new Error('No hay refresh token guardado');
    return apiFetch('/auth/refresh', { method: 'POST', body: { refreshToken }, auth: false });
  },
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
  // Cancela la renovación automática. La empresa sigue en su plan actual
  // hasta que venza el período ya pagado (planExpiry) y ahí cae a free.
  cancel: (): Promise<{ message: string; planExpiry?: string }> =>
    apiFetch('/subscription/cancel', { method: 'DELETE' }),
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
  analytics: (): Promise<any> => apiFetch('/dashboard/analytics'),
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

export const SalesAPI = {
  list: (params: Record<string, string> = {}): Promise<Sale[]> => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/sales${qs ? `?${qs}` : ''}`);
  },
  create: (sale: Partial<Sale>): Promise<Sale> =>
    apiFetch('/sales', { method: 'POST', body: sale as Record<string, unknown> }),
  update: (id: string, data: Partial<Sale>): Promise<Sale> =>
    apiFetch(`/sales/${id}`, { method: 'PUT', body: data as Record<string, unknown> }),
  voidSale: (id: string): Promise<unknown> => apiFetch(`/sales/${id}/void`, { method: 'POST' }),
  sync: (sales: Partial<Sale>[]): Promise<unknown> =>
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

export const UsersAPI = {
  list: (): Promise<User[]> => apiFetch('/users'),
  create: (user: Partial<User> & { password: string }): Promise<User> =>
    apiFetch('/users', { method: 'POST', body: user as Record<string, unknown> }),
  update: (id: string, user: Partial<User>): Promise<User> =>
    apiFetch(`/users/${id}`, { method: 'PUT', body: user as Record<string, unknown> }),
  remove: (id: string): Promise<unknown> => apiFetch(`/users/${id}`, { method: 'DELETE' }),
  resendSetPassword: (id: string): Promise<{ link?: string; email?: string }> =>
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

export const TransfersAPI = {
  list: (params: Record<string, string> = {}): Promise<Transfer[]> => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/transfers${qs ? `?${qs}` : ''}`);
  },
  create: (body: { toLocationId: string; items: { productId: string; qty: number }[]; notes?: string }): Promise<Transfer> =>
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
