import { useEffect, useMemo } from 'react';
import { buildDerivedStore, DEFAULT_PRODUCTS, repairProductNames } from '../domain/inventory';
import { useLocalStorage } from '../lib/useLocalStorage';
import { StoreContext } from './appStoreContext';

export function StoreProvider({ children }) {
  const [products, setProducts] = useLocalStorage('bap-store.products.v1', DEFAULT_PRODUCTS);
  const [purchases, setPurchases] = useLocalStorage('bap-store.purchases.v1', []);
  const [orders, setOrders] = useLocalStorage('bap-store.orders.v1', []);
  const [losses, setLosses] = useLocalStorage('bap-store.losses.v1', []);
  const [ads, setAds] = useLocalStorage('bap-store.monthlyAds.v1', []);
  const [transactions, setTransactions] = useLocalStorage('bap-store.transactions.v1', []);
  const [accounts, setAccounts] = useLocalStorage('bap-store.accounts.v1', ['Hà', 'Luyến', 'Châu', 'Tiền mặt']);
  const [partners, setPartners] = useLocalStorage('bap-store.partners.v1', [
    { name: 'Quỹ Shop', share: 25 },
    { name: 'Hà', share: 25 },
    { name: 'Châu', share: 25 },
    { name: 'Luyến', share: 25 }
  ]);
  const [defaultPackagingCost, setDefaultPackagingCost] = useLocalStorage('bap-store.packagingCost.v1', 1000);
  const [defaultReturnFee, setDefaultReturnFee] = useLocalStorage('bap-store.returnFee.v1', 20000);

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
    setProducts(prev => {
      const existing = prev.find(p => p.id === product.id);
      if (existing) {
        if (existing.name !== product.name || (product.imageId && existing.imageId !== product.imageId)) {
          return prev.map(p => p.id === product.id ? { ...p, name: product.name, imageId: product.imageId || p.imageId } : p);
        }
        return prev;
      }
      return [...prev, product];
    });
  };
  const addTransaction = (txn) => setTransactions(prev => [...prev, txn]);
  const updateTransaction = (txnId, updatedData) => {
    setTransactions(prev => prev.map(t => t.id === txnId ? { ...t, ...updatedData } : t));
  };
  const deleteTransaction = (txnId) => setTransactions(prev => prev.filter(t => t.id !== txnId));

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
    ads,
    setAds,
    addPurchase,
    updatePurchase,
    addOrder,
    updateOrder,
    addLoss,
    addProduct,
    transactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    accounts,
    setAccounts,
    partners,
    setPartners,
    defaultPackagingCost,
    setDefaultPackagingCost,
    defaultReturnFee,
    setDefaultReturnFee
  };

  return (
    <StoreContext.Provider value={value}>
      {children}
    </StoreContext.Provider>
  );
}
