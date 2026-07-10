import { auth } from './firebase';

// ponytail: single API_BASE, env var for prod Cloud Run URL, fallback localhost for dev
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function authFetch(path, options = {}) {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : null;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  getProducts: () => authFetch('/api/products'),
  createProduct: (data) => authFetch('/api/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id, data) => authFetch(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  
  getPurchases: () => authFetch('/api/purchases'),
  createPurchase: (data) => authFetch('/api/purchases', { method: 'POST', body: JSON.stringify(data) }),
  updatePurchase: (id, data) => authFetch(`/api/purchases/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePurchase: (id) => authFetch(`/api/purchases/${id}`, { method: 'DELETE' }),
  
  getOrders: () => authFetch('/api/orders'),
  createOrder: (data) => authFetch('/api/orders', { method: 'POST', body: JSON.stringify(data) }),
  updateOrder: (id, data) => authFetch(`/api/orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteOrder: (id) => authFetch(`/api/orders/${id}`, { method: 'DELETE' }),
  
  getLosses: () => authFetch('/api/losses'),
  createLoss: (data) => authFetch('/api/losses', { method: 'POST', body: JSON.stringify(data) }),
  
  getInventory: () => authFetch('/api/inventory'),
  
  getSettings: () => authFetch('/api/settings'),
  updateSettings: (data) => authFetch('/api/settings', { method: 'PUT', body: JSON.stringify(data) }),
  
  getTransactions: () => authFetch('/api/treasury/transactions'),
  createTransaction: (data) => authFetch('/api/treasury/transactions', { method: 'POST', body: JSON.stringify(data) }),
  updateTransaction: (id, data) => authFetch(`/api/treasury/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTransaction: (id) => authFetch(`/api/treasury/transactions/${id}`, { method: 'DELETE' }),
};
