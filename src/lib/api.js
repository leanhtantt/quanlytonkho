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
  createPurchase: (data) => authFetch('/api/purchases', { method: 'POST', body: JSON.stringify(data) }),
  createOrder: (data) => authFetch('/api/orders', { method: 'POST', body: JSON.stringify(data) }),
};
