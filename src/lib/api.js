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
    const errorMsg = typeof body.error === 'object' ? JSON.stringify(body.error) : (body.error || `HTTP ${res.status}`);
    throw new Error(errorMsg);
  }
  return res.json();
}

export const api = {
  getProducts: () => authFetch('/api/products'),
  createProduct: (data) => authFetch('/api/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id, data) => authFetch(`/api/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  reorderProducts: (productIds) => authFetch('/api/products/reorder', { method: 'PUT', body: JSON.stringify({ productIds }) }),
  uploadProductImage: (productId, dataUrl) => authFetch('/api/product-images', { method: 'POST', body: JSON.stringify({ productId, dataUrl }) }),
  deleteProductImage: (imageUrl) => authFetch('/api/product-images', { method: 'DELETE', body: JSON.stringify({ imageUrl }) }),
  
  getPurchases: () => authFetch('/api/purchases'),
  createPurchase: (data) => authFetch('/api/purchases', { method: 'POST', body: JSON.stringify(data) }),
  updatePurchase: (id, data) => authFetch(`/api/purchases/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePurchase: (id) => authFetch(`/api/purchases/${id}`, { method: 'DELETE' }),
  
  getOrders: () => authFetch('/api/orders'),
  createOrder: (data) => authFetch('/api/orders', { method: 'POST', body: JSON.stringify(data) }),
  updateOrder: (id, data) => authFetch(`/api/orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteOrder: (id) => authFetch(`/api/orders/${id}`, { method: 'DELETE' }),
  checkHealth: async () => {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (!res.ok) throw new Error('API Server is down');
      return await res.json();
    } catch (e) {
      return { status: 'error', api: false, db: false };
    }
  },
  
  getLosses: () => authFetch('/api/losses'),
  createLoss: (data) => authFetch('/api/losses', { method: 'POST', body: JSON.stringify(data) }),
  updateLoss: (id, data) => authFetch(`/api/losses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteLoss: (id) => authFetch(`/api/losses/${id}`, { method: 'DELETE' }),
  getInventoryAdjustments: () => authFetch('/api/inventory-adjustments'),
  createInventoryAdjustment: (data) => authFetch('/api/inventory-adjustments', { method: 'POST', body: JSON.stringify(data) }),
  updateInventoryAdjustment: (id, data) => authFetch(`/api/inventory-adjustments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteInventoryAdjustment: (id) => authFetch(`/api/inventory-adjustments/${id}`, { method: 'DELETE' }),
  
  getInventory: () => authFetch('/api/inventory'),
  
  getSettings: () => authFetch('/api/settings'),
  updateSettings: (data) => authFetch('/api/settings', { method: 'PUT', body: JSON.stringify(data) }),

  getAds: () => authFetch('/api/ads'),
  createAd: (data) => authFetch('/api/ads', { method: 'POST', body: JSON.stringify(data) }),
  deleteAd: (id) => authFetch(`/api/ads/${id}`, { method: 'DELETE' }),
  
  getTransactions: () => authFetch('/api/treasury/transactions'),
  createTransaction: (data) => authFetch('/api/treasury/transactions', { method: 'POST', body: JSON.stringify(data) }),
  updateTransaction: (id, data) => authFetch(`/api/treasury/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTransaction: (id) => authFetch(`/api/treasury/transactions/${id}`, { method: 'DELETE' }),
};
