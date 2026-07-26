import { apiFetch } from "./client";

export const AuthAPI = {
  login:    (email, password) => apiFetch("/auth/login", { method:"POST", body:{ email, password }, auth:false }),
  me:       () => apiFetch("/auth/me"),
};

export const DashboardAPI = {
  summary: () => apiFetch("/dashboard/summary"),
};

export const ProductsAPI = {
  list:        (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/products${qs ? `?${qs}` : ""}`);
  },
  create:      (product)    => apiFetch("/products", { method:"POST", body:product }),
  update:      (id, product)=> apiFetch(`/products/${id}`, { method:"PUT", body:product }),
  remove:      (id)         => apiFetch(`/products/${id}`, { method:"DELETE" }),
  reactivate:  (id)         => apiFetch(`/products/${id}`, { method:"PUT", body:{ active:true } }),
  adjustStock: (id, type, qty, reason) =>
    apiFetch(`/products/${id}/adjust-stock`, { method:"POST", body:{ type, qty, reason } }),
};

export const SalesAPI = {
  list:     (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/sales${qs ? `?${qs}` : ""}`);
  },
  create:   (sale)        => apiFetch("/sales", { method:"POST", body:sale }),
  update:   (id, data)    => apiFetch(`/sales/${id}`, { method:"PUT", body:data }),
  voidSale: (id)          => apiFetch(`/sales/${id}/void`, { method:"POST" }),
  sync:     (sales)       => apiFetch("/sales/sync", { method:"POST", body:{ sales } }),
};

export const ExpensesAPI = {
  list:   (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/expenses${qs ? `?${qs}` : ""}`);
  },
  create: (expense) => apiFetch("/expenses", { method:"POST", body:expense }),
  remove: (id)      => apiFetch(`/expenses/${id}`, { method:"DELETE" }),
};

export const UsersAPI = {
  list:   ()         => apiFetch("/users"),
  create: (user)     => apiFetch("/users", { method:"POST", body:user }),
  update: (id, user) => apiFetch(`/users/${id}`, { method:"PUT", body:user }),
  remove: (id)       => apiFetch(`/users/${id}`, { method:"DELETE" }),
};
