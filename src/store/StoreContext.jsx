import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { DEFAULT_PRODUCTS, repairProductNames } from '../domain/inventory';
import { extendHistoryRange, initialHistoryRange } from '../domain/historyPeriod';
import { StoreContext } from './appStoreContext';
import { api } from '../lib/api';
import { toast } from '../components/ui/toastHelper';

const DEFAULT_SHOPS = ['Chà Tiktok', 'Chà Shopee', 'Lyn WD', 'Lyn - Phụ kiện', 'Lyn Tiktok'];

function normalizeLossRecord(response, fallback = {}) {
  const record = response?.loss || response;
  if (!record || typeof record !== 'object' || !record.id) return null;

  return {
    ...record,
    name: record.name || fallback.name,
    sku: record.sku || fallback.sku,
    date: record.date || record.occurredAt || fallback.date,
    totalCostDeducted: response?.totalLossValue ?? record.totalCostDeducted ?? 0
  };
}

export function StoreProvider({ children }) {
  const [products, setProducts] = useState(DEFAULT_PRODUCTS);
  const [purchases, setPurchases] = useState([]);
  const [orders, setOrders] = useState([]);
  const [losses, setLosses] = useState([]);
  const [inventoryAdjustments, setInventoryAdjustments] = useState([]);
  const [ads, setAds] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [treasurySummary, setTreasurySummary] = useState(null);
  const [historyRange, setHistoryRange] = useState(() => initialHistoryRange());
  const [historyTotals, setHistoryTotals] = useState({});
  const [loadingOlderHistory, setLoadingOlderHistory] = useState(false);
  const [accounts, setAccounts] = useState(['Hà', 'Luyến', 'Châu', 'Tiền mặt']);
  const [shops, setShops] = useState(DEFAULT_SHOPS);
  const [partners, setPartners] = useState([
    { name: 'Quỹ Shop', share: 25 },
    { name: 'Hà', share: 25 },
    { name: 'Châu', share: 25 },
    { name: 'Luyến', share: 25 }
  ]);
  const [defaultPackagingCost, setDefaultPackagingCost] = useState(1000);
  const [defaultReturnFee, setDefaultReturnFee] = useState(20000);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const lastRefreshRef = useRef(0);

  const refresh = useCallback(async () => {
    // ponytail: chống gọi dồn — bỏ qua nếu vừa refetch < 10s hoặc đang tải
    const now = Date.now();
    if (refreshing || (now - lastRefreshRef.current < 10_000)) return;
    setRefreshing(true);
    lastRefreshRef.current = now;
    try {
      const params = { from: historyRange.from, to: historyRange.to };
      const [prodRes, purRes, ordRes, lossRes, adjustmentRes, txRes, inventoryRes, treasuryRes, adRes, setRes] = await Promise.all([
        api.getProducts(), api.getPurchases(params), api.getOrders(params), api.getLosses(params),
        api.getInventoryAdjustments(), api.getTransactions(params), api.getInventory(),
        api.getTreasurySummary(historyRange.from), api.getAds(), api.getSettings()
      ]);
      const unwrap = response => Array.isArray(response) ? { items: response, total: response.length } : response;
      const purchasePage = unwrap(purRes);
      const orderPage = unwrap(ordRes);
      const lossPage = unwrap(lossRes);
      const transactionPage = unwrap(txRes);

      setProducts(repairProductNames(prodRes.length ? prodRes : DEFAULT_PRODUCTS));
      setPurchases(purchasePage.items);
      setOrders(orderPage.items);
      setLosses(lossPage.items.map(loss => normalizeLossRecord(loss)).filter(Boolean));
      setInventoryAdjustments(adjustmentRes);
      setTransactions(transactionPage.items);
      setInventory(inventoryRes);
      setTreasurySummary(treasuryRes);
      setHistoryTotals({ purchases: purchasePage.total, orders: orderPage.total, losses: lossPage.total, transactions: transactionPage.total });
      setAds(adRes);
      
      if (Array.isArray(setRes.accounts) && setRes.accounts.length > 0) setAccounts(setRes.accounts);
      if (Array.isArray(setRes.shops) && setRes.shops.length > 0) setShops(setRes.shops);
      if (Array.isArray(setRes.partners) && setRes.partners.length > 0) setPartners(setRes.partners);
      if (setRes.packagingCost !== undefined) setDefaultPackagingCost(setRes.packagingCost);
      if (setRes.returnFee !== undefined) setDefaultReturnFee(setRes.returnFee);
    } catch (err) {
      console.error('Failed to refresh data', err);
      toast.error('Tải dữ liệu thất bại');
    } finally {
      setRefreshing(false);
      setLoadingOlderHistory(false);
    }
  }, [historyRange, refreshing]);

  // Giữ tham chiếu refresh mới nhất để subscribe auth 1 lần, không phụ thuộc identity
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  // Tải dữ liệu KHI Firebase đã xác thực xong (tránh race gọi API trước khi có token → 401)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }
      lastRefreshRef.current = 0; // bỏ qua debounce cho lần tải sau khi đăng nhập
      try { await refreshRef.current(); } catch { /* đã log trong refresh */ }
      setLoading(false);
    });
    return unsub;
  }, []);

  // Auto-refetch khi tab/cửa sổ lấy lại focus (chỉ khi đã đăng nhập)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && auth.currentUser) refresh();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [refresh]);

  useEffect(() => {
    if (!loadingOlderHistory || !auth.currentUser) return;
    lastRefreshRef.current = 0;
    refresh();
  }, [historyRange, loadingOlderHistory, refresh]);

  const refreshSnapshots = async () => {
    const [inventoryRes, treasuryRes] = await Promise.all([
      api.getInventory(),
      api.getTreasurySummary(historyRange.from),
    ]);
    setInventory(inventoryRes);
    setTreasurySummary(treasuryRes);
  };

  const updateSettings = async (newSettings) => {
    try {
      const updated = await api.updateSettings(newSettings);
      if (updated.accounts) setAccounts(updated.accounts);
      if (Array.isArray(updated.shops)) setShops(updated.shops);
      if (updated.partners) setPartners(updated.partners);
      if (updated.packagingCost !== undefined) setDefaultPackagingCost(updated.packagingCost);
      if (updated.returnFee !== undefined) setDefaultReturnFee(updated.returnFee);
    } catch (error) {
      console.error(error);
      throw error;
    }
  };

  const addPurchase = async (purchase) => {
    const created = await api.createPurchase(purchase);
    setPurchases(prev => [...prev, created]);
    setProducts(await api.getProducts());
    await refreshSnapshots();
    return created;
  };
  const updatePurchase = async (purchaseId, updatedData) => {
    const updated = await api.updatePurchase(purchaseId, updatedData);
    setPurchases(prev => prev.map(p => p.id === purchaseId ? updated : p));
    setProducts(await api.getProducts());
    await refreshSnapshots();
    return updated;
  };
  const deletePurchase = async (purchaseId) => {
    await api.deletePurchase(purchaseId);
    setPurchases(prev => prev.filter(p => p.id !== purchaseId));
    setProducts(await api.getProducts());
    await refreshSnapshots();
  };
  const addOrder = async (order) => {
    try {
      const created = await api.createOrder(order);
      setOrders(prev => [...prev, created]);
      await refreshSnapshots();
      return created;
    } catch (err) {
      console.error('Tạo đơn thất bại', order?.id, err);
      throw err;
    }
  };
  const updateOrder = async (orderId, updatedData) => {
    try {
      const updated = await api.updateOrder(orderId, updatedData);
      setOrders(prev => prev.map(o => o.id === orderId ? updated : o));
      await refreshSnapshots();
      return updated;
    } catch (err) {
      console.error(err);
      throw err;
    }
  };
  const deleteOrder = async (orderId) => {
    try {
      await api.deleteOrder(orderId);
      setOrders(prev => prev.filter(o => o.id !== orderId));
      await refreshSnapshots();
    } catch (err) {
      console.error(err);
      throw err;
    }
  };
  const addLoss = async (loss) => {
    const response = await api.createLoss(loss);
    const normalizedLoss = normalizeLossRecord(response, loss);
    if (!normalizedLoss) throw new Error('Backend không trả về mã phiếu hao hụt hợp lệ.');
    setLosses(prev => [...prev, normalizedLoss]);
    await refreshSnapshots();
    return normalizedLoss;
  };
  const updateLoss = async (lossId, loss) => {
    const response = await api.updateLoss(lossId, loss);
    const normalizedLoss = normalizeLossRecord(response, loss);
    if (!normalizedLoss) throw new Error('Backend không trả về mã phiếu hao hụt hợp lệ.');
    setLosses(prev => prev.map(item => item.id === lossId ? normalizedLoss : item));
    await refreshSnapshots();
    return normalizedLoss;
  };
  const deleteLoss = async (lossId) => {
    if (!lossId) throw new Error('Phiếu hao hụt không có UUID hợp lệ. Hãy tải lại trang.');
    await api.deleteLoss(lossId);
    setLosses(prev => prev.filter(item => normalizeLossRecord(item)?.id !== lossId));
    await refreshSnapshots();
  };
  const addInventoryAdjustment = async (adjustment) => {
    const created = await api.createInventoryAdjustment(adjustment);
    setInventoryAdjustments(prev => [...prev, created]);
    await refreshSnapshots();
    return created;
  };
  const updateInventoryAdjustment = async (adjustmentId, adjustment) => {
    const updated = await api.updateInventoryAdjustment(adjustmentId, adjustment);
    setInventoryAdjustments(prev => prev.map(item => item.id === adjustmentId ? updated : item));
    await refreshSnapshots();
    return updated;
  };
  const deleteInventoryAdjustment = async (adjustmentId) => {
    await api.deleteInventoryAdjustment(adjustmentId);
    setInventoryAdjustments(prev => prev.filter(item => item.id !== adjustmentId));
    await refreshSnapshots();
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
  const updateProduct = async (productId, updatedData) => {
    const updated = await api.updateProduct(productId, updatedData);
    setProducts(prev => prev.map(p => p.id === productId ? updated : p));
    return updated;
  };
  const renameProductSku = async (productId, sku) => {
    const updated = await api.renameProductSku(productId, sku);
    setProducts(prev => prev.map(p => p.id === productId ? updated : p));
    return updated;
  };
  const addTransaction = async (txn) => {
    const created = await api.createTransaction(txn);
    setTransactions(prev => [...prev, created]);
    await refreshSnapshots();
  };
  const updateTransaction = async (txnId, updatedData) => {
    const updated = await api.updateTransaction(txnId, updatedData);
    setTransactions(prev => prev.map(t => t.id === txnId ? updated : t));
    await refreshSnapshots();
  };
  const deleteTransaction = async (txnId) => {
    await api.deleteTransaction(txnId);
    setTransactions(prev => prev.filter(t => t.id !== txnId));
    await refreshSnapshots();
  };
  const reorderProducts = async (productIds) => {
    const reordered = await api.reorderProducts(productIds);
    setProducts(reordered);
    return reordered;
  };
  const addAd = async (ad) => {
    const created = await api.createAd(ad);
    setAds(prev => [created, ...prev]);
    if (created.source === 'SELF_FUNDED') {
      const refreshedTransactions = await api.getTransactions({ from: historyRange.from, to: historyRange.to });
      setTransactions(refreshedTransactions.items);
    }
    await refreshSnapshots();
    return created;
  };
  const reimburseAdAdvance = async (adId, reimbursement) => {
    const updated = await api.reimburseAdAdvance(adId, reimbursement);
    setAds(prev => prev.map(ad => ad.id === adId ? updated : ad));
    if (reimbursement.source === 'TREASURY_ACCOUNT') {
      const refreshedTransactions = await api.getTransactions({ from: historyRange.from, to: historyRange.to });
      setTransactions(refreshedTransactions.items);
    }
    await refreshSnapshots();
    return updated;
  };
  const deleteAd = async (adId) => {
    const ad = ads.find(item => item.id === adId);
    await api.deleteAd(adId);
    setAds(prev => prev.filter(item => item.id !== adId));
    if (ad?.source === 'SELF_FUNDED') {
      const refreshedTransactions = await api.getTransactions({ from: historyRange.from, to: historyRange.to });
      setTransactions(refreshedTransactions.items);
    }
    await refreshSnapshots();
  };

  const normalizedLosses = useMemo(
    () => losses.map(loss => normalizeLossRecord(loss)).filter(Boolean),
    [losses]
  );
  const enrichedAdjustments = useMemo(
    () => inventoryAdjustments.map(item => ({ ...item, totalValue: item.qty * (Number(item.unitCost) || 0) })),
    [inventoryAdjustments]
  );

  const loadOlderHistory = () => {
    setLoadingOlderHistory(true);
    lastRefreshRef.current = 0;
    setHistoryRange(previous => extendHistoryRange(previous));
  };

  const value = {
    products,
    purchases,
    orders,
    losses: normalizedLosses,
    inventoryAdjustments: enrichedAdjustments,
    inventory,
    ads,
    addAd,
    reimburseAdAdvance,
    deleteAd,
    addPurchase,
    updatePurchase,
    deletePurchase,
    addOrder,
    updateOrder,
    deleteOrder,
    addLoss,
    updateLoss,
    deleteLoss,
    addInventoryAdjustment,
    updateInventoryAdjustment,
    deleteInventoryAdjustment,
    addProduct,
    updateProduct,
    renameProductSku,
    reorderProducts,
    transactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    accounts,
    setAccounts: (acc) => updateSettings({ accounts: acc }),
    shops,
    setShops: (nextShops) => updateSettings({ shops: nextShops }),
    partners,
    setPartners: (ptn) => updateSettings({ partners: ptn }),
    defaultPackagingCost,
    setDefaultPackagingCost: (cost) => updateSettings({ packagingCost: Number(cost) }),
    defaultReturnFee,
    setDefaultReturnFee: (fee) => updateSettings({ returnFee: Number(fee) }),
    loading,
    refresh,
    refreshing,
    treasurySummary,
    historyRange,
    historyTotals,
    loadOlderHistory,
    loadingOlderHistory
  };

  return (
    <StoreContext.Provider value={value}>
      {children}
    </StoreContext.Provider>
  );
}
