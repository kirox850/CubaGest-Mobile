import { apiFetch } from './client';
import type { AuthResponse, User, Product, Sale, Expense, PlanInfo, DashboardSummary } from '../types';

export const AuthAPI = {
  login: (email: string, password: string): Promise<AuthResponse> =>
    apiFetch('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  me: (): Promise<User> => apiFetch('/auth/me'),
  refresh: (): Promise<AuthResponse> => apiFetch('/auth/refresh', { method: 'POST' }),
};

// ─── Planes y suscripción ─────────────────────────────────────────────────────
export const PlanAPI = {
  get: (): Promise<PlanInfo> => apiFetch('/plan'),
};

export const SubscriptionAPI = {
  status: (): Promise<unknown> => apiFetch('/subscription/status'),
  authorizeQvapay: (plan: string): Promise<{ url?: string }> =>
    apiFetch('/subscription/authorize', { method: 'POST', body: { plan } }),
  cancel: (): Promise<unknown> => apiFetch('/subscription/cancel', { method: 'DELETE' }),
};

export const DashboardAPI = {
  summary: (): Promise<DashboardSummary> => apiFetch('/dashboard/summary'),
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
  reactivate: (id: string): Promise<unknown> =>
    apiFetch(`/products/${id}`, { method: 'PUT', body: { active: true } }),
  adjustStock: (id: string, type: string, qty: number, reason: string): Promise<unknown> =>
    apiFetch(`/products/${id}/adjust-stock`, {
      method: 'POST',
      body: { type, qty, reason },
    }),
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

export const ExpensesAPI = {
  list: (params: Record<string, string> = {}): Promise<Expense[]> => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/expenses${qs ? `?${qs}` : ''}`);
  },
  create: (expense: Partial<Expense>): Promise<Expense> =>
    apiFetch('/expenses', { method: 'POST', body: expense as Record<string, unknown> }),
  remove: (id: string): Promise<unknown> => apiFetch(`/expenses/${id}`, { method: 'DELETE' }),
};

export const UsersAPI = {
  list: (): Promise<User[]> => apiFetch('/users'),
  create: (user: Partial<User> & { password: string }): Promise<User> =>
    apiFetch('/users', { method: 'POST', body: user as Record<string, unknown> }),
  update: (id: string, user: Partial<User>): Promise<User> =>
    apiFetch(`/users/${id}`, { method: 'PUT', body: user as Record<string, unknown> }),
  remove: (id: string): Promise<unknown> => apiFetch(`/users/${id}`, { method: 'DELETE' }),
};
