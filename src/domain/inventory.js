export const DEFAULT_PRODUCTS = [
  { id: 'SP01', name: 'BÃ¡p LÃ¬ XÃ¬ (Äá»)' },
  { id: 'SP02', name: 'Chá»¯ Há»· DÃ¡n Cá»­a' },
  { id: 'SP03', name: 'Combo BÃª TrÃ¡p 7 Quáº£' }
];

export function calculateSuggestedPrice(cost) {
  if (cost > 10000) {
    return Math.round(((cost + 3000) * 2.5) / 0.745);
  }

  return Math.round(((cost + 3000) * 2.2) / 0.745);
}

export function buildDerivedStore({ products, purchases, orders, losses }) {
  const inv = {};

  products.forEach((product) => {
    inv[product.id] = {
      ...product,
      totalImported: 0,
      totalSold: 0,
      totalLost: 0,
      stock: 0,
      batches: []
    };
  });

  purchases.forEach((purchase) => {
    purchase.items.forEach((item) => {
      if (!inv[item.productId]) return;

      const inventoryItem = inv[item.productId];
      inventoryItem.totalImported += item.qty;
      inventoryItem.stock += item.qty;
      inventoryItem.batches.push({
        purchaseId: purchase.id,
        date: purchase.date,
        qtyOriginal: item.qty,
        qtyRemaining: item.qty,
        costVnd: item.finalCostVnd
      });
    });
  });

  const timelineEvents = [
    ...orders.map((order) => ({ type: 'order', date: order.date, id: order.id, data: order })),
    ...losses.map((loss) => ({ type: 'loss', date: loss.date, id: loss.id, data: loss }))
  ];

  timelineEvents.sort((a, b) => {
    if (a.date !== b.date) return new Date(a.date) - new Date(b.date);
    return a.id.localeCompare(b.id);
  });

  const enrichedOrders = [];
  const enrichedLosses = [];

  const deductFifo = (productId, qtyToDeduct) => {
    const inventoryItem = inv[productId];
    if (!inventoryItem) return { totalCostDeducted: 0, batchesDeducted: [] };

    let remainingToDeduct = qtyToDeduct;
    let totalCostDeducted = 0;
    const batchesDeducted = [];

    for (const batch of inventoryItem.batches) {
      if (remainingToDeduct <= 0) break;
      if (batch.qtyRemaining <= 0) continue;

      const deducted = Math.min(batch.qtyRemaining, remainingToDeduct);
      batch.qtyRemaining -= deducted;
      remainingToDeduct -= deducted;
      totalCostDeducted += deducted * batch.costVnd;
      batchesDeducted.push({ purchaseId: batch.purchaseId, qty: deducted, costVnd: batch.costVnd });
    }

    if (remainingToDeduct > 0) {
      const lastCost = inventoryItem.batches.length > 0
        ? inventoryItem.batches[inventoryItem.batches.length - 1].costVnd
        : 0;

      totalCostDeducted += remainingToDeduct * lastCost;
      batchesDeducted.push({ purchaseId: 'EXCESS', qty: remainingToDeduct, costVnd: lastCost });
    }

    return { totalCostDeducted, batchesDeducted };
  };

  timelineEvents.forEach((event) => {
    if (event.type === 'order') {
      const order = event.data;
      let orderTotalCost = 0;

      if (order.status !== 'HoÃ n hÃ ng') {
        const enrichedItems = order.items.map((item) => {
          if (item.isReturned) {
            return { ...item, totalCostDeducted: 0, batchesDeducted: [] };
          }

          const { totalCostDeducted, batchesDeducted } = deductFifo(item.productId, item.qty);
          orderTotalCost += totalCostDeducted;

          const inventoryItem = inv[item.productId];
          if (inventoryItem) {
            inventoryItem.totalSold += item.qty;
            inventoryItem.stock -= item.qty;
          }

          return { ...item, totalCostDeducted, batchesDeducted };
        });

        enrichedOrders.push({
          ...order,
          items: enrichedItems,
          totalCost: orderTotalCost + (order.packagingFee || 0)
        });
        return;
      }

      const enrichedItems = order.items.map((item) => ({
        ...item,
        totalCostDeducted: 0,
        batchesDeducted: []
      }));

      enrichedOrders.push({ ...order, items: enrichedItems, totalCost: order.packagingFee || 0 });
      return;
    }

    const loss = event.data;
    const { totalCostDeducted, batchesDeducted } = deductFifo(loss.productId, loss.qty);
    const inventoryItem = inv[loss.productId];

    if (inventoryItem) {
      inventoryItem.totalLost += loss.qty;
      inventoryItem.stock -= loss.qty;
    }

    enrichedLosses.push({ ...loss, totalCostDeducted, batchesDeducted });
  });

  return {
    inventory: Object.values(inv),
    enrichedOrders,
    enrichedLosses
  };
}

