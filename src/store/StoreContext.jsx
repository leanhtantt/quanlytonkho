import { useEffect, useMemo } from 'react';
import { buildDerivedStore, DEFAULT_PRODUCTS, repairProductNames } from '../domain/inventory';
import { useLocalStorage } from '../lib/useLocalStorage';
import { StoreContext } from './appStoreContext';

export function StoreProvider({ children }) {
  const [products, setProducts] = useLocalStorage('bap-store.products.v1', DEFAULT_PRODUCTS);
  const [purchases, setPurchases] = useLocalStorage('bap-store.purchases.v1', []);
  const [orders, setOrders] = useLocalStorage('bap-store.orders.v1', []);
  const [losses, setLosses] = useLocalStorage('bap-store.losses.v1', []);

  useEffect(() => {
    setProducts(prev => repairProductNames(prev));
  }, [setProducts]);

  const addPurchase = (purchase) => setPurchases(prev => [...prev, purchase]);
  const updatePurchase = (purchaseId, updatedData) => {
    setPurchases(prev => prev.map(p => p.id === purchaseId ? { ...p, ...updatedData } : p));
  };
  const addOrder = (order) => setOrders(prev => [...prev, order]);
  const updateOrder = (orderId, updatedData) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updatedData } : o));
  };
  const addLoss = (loss) => setLosses(prev => [...prev, loss]);
  const addProduct = (product) => {
    setProducts(prev => prev.find(p => p.id === product.id) ? prev : [...prev, product]);
  };

  const derivedState = useMemo(() => buildDerivedStore({
    products,
    purchases,
    orders,
    losses
  }), [products, purchases, orders, losses]);

  const value = {
    products,
    purchases,
    orders: derivedState.enrichedOrders,
    losses: derivedState.enrichedLosses,
    inventory: derivedState.inventory,
    addPurchase,
    updatePurchase,
    addOrder,
    updateOrder,
    addLoss,
    addProduct
  };

  return (
    <StoreContext.Provider value={value}>
      {children}
    </StoreContext.Provider>
  );
}
