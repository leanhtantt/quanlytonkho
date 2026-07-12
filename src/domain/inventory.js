export const DEFAULT_PRODUCTS = [];

const DEFAULT_PRODUCT_NAMES = new Map(DEFAULT_PRODUCTS.map(product => [product.id, product.name]));
const MOJIBAKE_MARKERS = ['Ã', 'Â', 'Ä'];

export function repairProductNames(products) {
  let changed = false;

  const repairedProducts = products.map((product) => {
    const defaultName = DEFAULT_PRODUCT_NAMES.get(product.id);
    const looksCorrupt = typeof product.name === 'string'
      && MOJIBAKE_MARKERS.some(marker => product.name.includes(marker));

    if (!defaultName || !looksCorrupt) return product;

    changed = true;
    return { ...product, name: defaultName };
  });

  return changed ? repairedProducts : products;
}

export function calculateSuggestedPrice(cost) {
  if (cost > 10000) {
    return Math.round(((cost + 3000) * 2.5) / 0.745);
  }

  return Math.round(((cost + 3000) * 2.2) / 0.745);
}

export function buildDerivedStore({ products, purchases, orders, losses }) {
  const inv = {};

  products.forEach(p => {
    inv[p.id] = {
      id: p.id,
      sku: p.sku || p.id,
      name: p.name || p.id,
      imageId: p.imageId || null,
      totalImported: 0,
      totalSold: 0,
      totalLost: 0,
      stock: 0,
      batches: []
    };
  });

  purchases.forEach((purchase) => {
    purchase.items.forEach((item) => {
      if (!inv[item.productId]) {
        inv[item.productId] = {
          id: item.productId,
          sku: item.productId,
          name: item.name || item.productId,
          imageId: null,
          totalImported: 0,
          totalSold: 0,
          totalLost: 0,
          stock: 0,
          batches: []
        };
      }

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

  // FIFO ("nhập trước xuất trước"): consume batches in order of their receive date,
  // regardless of the order the purchases happened to be entered/loaded in.
  // Tie-break by purchaseId so the result is deterministic for same-day batches.
  Object.values(inv).forEach((inventoryItem) => {
    inventoryItem.batches.sort((a, b) => {
      if (a.date !== b.date) return new Date(a.date) - new Date(b.date);
      return String(a.purchaseId).localeCompare(String(b.purchaseId));
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
