// ─── Tipos compartidos de CubaGest Mobile ───────────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'cajero' | 'contador' | 'almacenista';
  businessId: string;
  company?: Company;
  active?: boolean;
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
  currency: 'CUP' | 'MLC';
  payMethod: string;
  status: 'emitida' | 'anulada';
  userId?: string;
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
  paymentMethod: string;
  userId?: string;
  createdAt?: string;
}

export interface DashboardSummary {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  salesCount: number;
  lowStock: Product[];
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

// El login real del backend devuelve accessToken (corta duración, 1h) +
// refreshToken (7 días) + user — no un solo "token" como antes.
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

// POST /auth/refresh solo devuelve un accessToken nuevo, no el user.
export interface RefreshResponse {
  accessToken: string;
}

export interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: Record<string, unknown>;
  auth?: boolean;
}
