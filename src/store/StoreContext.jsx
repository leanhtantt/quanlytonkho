import { createContext, useContext, useState, useMemo } from 'react';

const StoreContext = createContext();

export function useAppStore() {
  return useContext(StoreContext);
}

export function StoreProvider({ children }) {
  // Raw Data Tables
  const [products, setProducts] = useState([
    { id: 'SP01', name: 'Báp Lì Xì (Đỏ)' },
    { id: 'SP02', name: 'Chữ Hỷ Dán Cửa' },
    { id: 'SP03', name: 'Combo Bê Tráp 7 Quả' }
  ]);

  const [purchases, setPurchases] = useState([]);
  const [orders, setOrders] = useState([]);
  const [losses, setLosses] = useState([]);

  // Actions
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
    if (!products.find(p => p.id === product.id)) {
      setProducts(prev => [...prev, product]);
    }
  };

  // Derived State: Inventory (FIFO), Enriched Orders, Enriched Losses
  const derivedState = useMemo(() => {
    const inv = {};
    
    // Initialize Inventory Map
    products.forEach(p => {
      inv[p.id] = { 
        ...p, 
        totalImported: 0, 
        totalSold: 0, 
        totalLost: 0, 
        stock: 0, 
        batches: [] // FIFO batches
      };
    });

    // 1. Process Purchases -> Create Batches
    purchases.forEach(purchase => {
      purchase.items.forEach(item => {
        if (!inv[item.productId]) return;
        const i = inv[item.productId];
        
        i.totalImported += item.qty;
        i.stock += item.qty;
        
        i.batches.push({
          purchaseId: purchase.id,
          date: purchase.date,
          qtyOriginal: item.qty,
          qtyRemaining: item.qty,
          costVnd: item.finalCostVnd
        });
      });
    });

    // 2. Combine Orders & Losses into chronological timeline
    const timelineEvents = [];
    orders.forEach(o => timelineEvents.push({ type: 'order', date: o.date, id: o.id, data: o }));
    losses.forEach(l => timelineEvents.push({ type: 'loss', date: l.date, id: l.id, data: l }));
    
    // Sort by date, then ID to ensure stability
    timelineEvents.sort((a, b) => {
      if (a.date !== b.date) return new Date(a.date) - new Date(b.date);
      return a.id.localeCompare(b.id);
    });

    const enrichedOrders = [];
    const enrichedLosses = [];

    // Helper: Deduct FIFO
    const deductFifo = (productId, qtyToDeduct) => {
      const i = inv[productId];
      if (!i) return { totalCostDeducted: 0, batchesDeducted: [] };

      let remainingToDeduct = qtyToDeduct;
      let totalCostDeducted = 0;
      const batchesDeducted = [];
      
      // Loop through batches from oldest to newest
      for (const batch of i.batches) {
        if (remainingToDeduct <= 0) break;
        if (batch.qtyRemaining > 0) {
          const deducted = Math.min(batch.qtyRemaining, remainingToDeduct);
          batch.qtyRemaining -= deducted;
          remainingToDeduct -= deducted;
          totalCostDeducted += (deducted * batch.costVnd);
          batchesDeducted.push({ purchaseId: batch.purchaseId, qty: deducted, costVnd: batch.costVnd });
        }
      }

      // If we oversell (negative stock), use the last known cost
      if (remainingToDeduct > 0) {
        const lastCost = i.batches.length > 0 ? i.batches[i.batches.length-1].costVnd : 0;
        totalCostDeducted += (remainingToDeduct * lastCost);
        batchesDeducted.push({ purchaseId: 'EXCESS', qty: remainingToDeduct, costVnd: lastCost });
      }
      
      return { totalCostDeducted, batchesDeducted };
    };

    // 3. Process Timeline
    timelineEvents.forEach(event => {
      if (event.type === 'order') {
        const order = event.data;
        let orderTotalCost = 0;
        
        if (order.status !== 'Hoàn hàng') {
          const enrichedItems = order.items.map(item => {
            if (item.isReturned) {
              return { ...item, totalCostDeducted: 0, batchesDeducted: [] };
            }
            const { totalCostDeducted, batchesDeducted } = deductFifo(item.productId, item.qty);
            orderTotalCost += totalCostDeducted;
            
            const i = inv[item.productId];
            if (i) {
              i.totalSold += item.qty;
              i.stock -= item.qty;
            }
            
            return { ...item, totalCostDeducted, batchesDeducted };
          });
          
          // Cộng thêm chi phí đóng gói vào tổng giá vốn đơn hàng (nếu có)
          const pkgFee = order.packagingFee || 0;
          orderTotalCost += pkgFee;

          enrichedOrders.push({ ...order, items: enrichedItems, totalCost: orderTotalCost });
        } else {
          // Hoàn hàng nguyên đơn: Doesn't deduct stock. 
          const enrichedItems = order.items.map(item => ({ ...item, totalCostDeducted: 0, batchesDeducted: [] }));
          enrichedOrders.push({ ...order, items: enrichedItems, totalCost: order.packagingFee || 0 }); // Có thể mất tiền đóng gói
        }
      } else if (event.type === 'loss') {
        const loss = event.data;
        const { totalCostDeducted, batchesDeducted } = deductFifo(loss.productId, loss.qty);
        
        const i = inv[loss.productId];
        if (i) {
          i.totalLost += loss.qty;
          i.stock -= loss.qty;
        }
        
        enrichedLosses.push({ ...loss, totalCostDeducted, batchesDeducted });
      }
    });

    return {
      inventory: Object.values(inv),
      enrichedOrders,
      enrichedLosses
    };
  }, [products, purchases, orders, losses]);

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
