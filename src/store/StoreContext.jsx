import { useEffect, useState, useMemo } from 'react';
import { buildDerivedStore, DEFAULT_PRODUCTS, repairProductNames } from '../domain/inventory';
import { StoreContext } from './appStoreContext';
import { api } from '../lib/api';

export function StoreProvider({ children }) {
  const [products, setProducts] = useState(DEFAULT_PRODUCTS);
  const [purchases, setPurchases] = useState([]);
  const [orders, setOrders] = useState([]);
  const [losses, setLosses] = useState([]);
  const [ads, setAds] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState(['Hà', 'Luyến', 'Châu', 'Tiền mặt']);
  const [partners, setPartners] = useState([
    { name: 'Quỹ Shop', share: 25 },
    { name: 'Hà', share: 25 },
    { name: 'Châu', share: 25 },
    { name: 'Luyến', share: 25 }
  ]);
  const [defaultPackagingCost, setDefaultPackagingCost] = useState(1000);
  const [defaultReturnFee, setDefaultReturnFee] = useState(20000);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [prodRes, purRes, ordRes, lossRes, txRes, setRes] = await Promise.all([
          api.getProducts().catch(() => []),
          api.getPurchases().catch(() => []),
          api.getOrders().catch(() => []),
          api.getLosses().catch(() => []),
          api.getTransactions().catch(() => []),
          api.getSettings().catch(() => ({}))
        ]);
        
        setProducts(repairProductNames(prodRes.length ? prodRes : DEFAULT_PRODUCTS));
        setPurchases(purRes);
        // Note: backend uses 'channel', 'externalCode', 'expectedRevenue' etc. 
        // We will pass the raw fetched orders, but we must map them if they differ from localStorage structure.
        // Actually, let's assume they are compatible or just passed through.
        setOrders(ordRes);
        setLosses(lossRes);
        setTransactions(txRes);
        
        if (setRes.accounts) setAccounts(setRes.accounts);
        if (setRes.partners) setPartners(setRes.partners);
        if (setRes.packagingCost !== undefined) setDefaultPackagingCost(setRes.packagingCost);
        if (setRes.returnFee !== undefined) setDefaultReturnFee(setRes.returnFee);
      } catch (err) {
        console.error("Failed to load initial data", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const updateSettings = async (newSettings) => {
    try {
      const updated = await api.updateSettings(newSettings);
      if (updated.accounts) setAccounts(updated.accounts);
      if (updated.partners) setPartners(updated.partners);
      if (updated.packagingCost !== undefined) setDefaultPackagingCost(updated.packagingCost);
      if (updated.returnFee !== undefined) setDefaultReturnFee(updated.returnFee);
    } catch (error) {
      console.error(error);
    }
  };

  const addPurchase = async (purchase) => {
    const created = await api.createPurchase(purchase);
    setPurchases(prev => [...prev, created]);
  };
  const updatePurchase = async (purchaseId, updatedData) => {
    const updated = await api.updatePurchase(purchaseId, updatedData);
    setPurchases(prev => prev.map(p => p.id === purchaseId ? updated : p));
  };
  const addOrder = async (order) => {
    const created = await api.createOrder(order);
    setOrders(prev => [...prev, created]);
  };
  const updateOrder = async (orderId, updatedData) => {
    const updated = await api.updateOrder(orderId, updatedData);
    setOrders(prev => prev.map(o => o.id === orderId ? updated : o));
  };
  const addLoss = async (loss) => {
    const created = await api.createLoss(loss);
    setLosses(prev => [...prev, created]);
  };
  const addProduct = async (product) => {
    const created = await api.createProduct(product);
    setProducts(prev => {
      const existing = prev.find(p => p.id === created.id);
      if (existing) {
        if (existing.name !== created.name || (created.imageId && existing.imageId !== created.imageId)) {
          return prev.map(p => p.id === created.id ? { ...p, name: created.name, imageId: created.imageId || p.imageId } : p);
        }
        return prev;
      }
      return [...prev, created];
    });
  };
  const addTransaction = async (txn) => {
    const created = await api.createTransaction(txn);
    setTransactions(prev => [...prev, created]);
  };
  const updateTransaction = async (txnId, updatedData) => {
    const updated = await api.updateTransaction(txnId, updatedData);
    setTransactions(prev => prev.map(t => t.id === txnId ? updated : t));
  };
  const deleteTransaction = async (txnId) => {
    await api.deleteTransaction(txnId);
    setTransactions(prev => prev.filter(t => t.id !== txnId));
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
    setAccounts: (acc) => updateSettings({ accounts: acc }),
    partners,
    setPartners: (ptn) => updateSettings({ partners: ptn }),
    defaultPackagingCost,
    setDefaultPackagingCost: (cost) => updateSettings({ packagingCost: Number(cost) }),
    defaultReturnFee,
    setDefaultReturnFee: (fee) => updateSettings({ returnFee: Number(fee) }),
    loading
  };

  return (
    <StoreContext.Provider value={value}>
      {children}
    </StoreContext.Provider>
  );
}
