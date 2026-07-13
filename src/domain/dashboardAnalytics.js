const UNKNOWN_SHOP = 'Không xác định';

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function getOrderEstimatedRevenue(order) {
  return (order.items || []).reduce((sum, item) => (
    sum + (item.isReturned ? 0 : toNumber(item.qty) * toNumber(item.sellingPrice))
  ), 0);
}

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDashboardOrderRevenue(order) {
  if (order.actualRevenue !== null && order.actualRevenue !== undefined && order.actualRevenue !== '') {
    return toNumber(order.actualRevenue);
  }

  return getOrderEstimatedRevenue(order);
}

export function calculateDailyDashboard(orders = [], configuredShops = [], selectedDate = '') {
  const dailyOrders = orders.filter(order => String(order.date || '').slice(0, 10) === selectedDate);
  const historicalShops = orders.map(order => order.shop).filter(Boolean);
  const shopNames = Array.from(new Set([...configuredShops, ...historicalShops]));

  if (dailyOrders.some(order => !order.shop)) shopNames.push(UNKNOWN_SHOP);

  const shopMap = new Map(shopNames.map(shop => [shop, { shop, revenue: 0, orderCount: 0 }]));
  const productMap = new Map();

  dailyOrders.forEach(order => {
    const shop = order.shop || UNKNOWN_SHOP;
    if (!shopMap.has(shop)) shopMap.set(shop, { shop, revenue: 0, orderCount: 0 });

    const shopSummary = shopMap.get(shop);
    shopSummary.revenue += getDashboardOrderRevenue(order);
    shopSummary.orderCount += 1;

    (order.items || []).forEach(item => {
      if (item.isReturned) return;

      const productKey = item.productId || item.sku || item.name || 'unknown-product';
      if (!productMap.has(productKey)) {
        productMap.set(productKey, {
          productId: productKey,
          sku: item.sku || item.productId || '—',
          name: item.name || item.sku || item.productId || 'Sản phẩm chưa xác định',
          quantity: 0,
          orderIds: new Set(),
          salesValue: 0
        });
      }

      const product = productMap.get(productKey);
      product.quantity += toNumber(item.qty);
      product.salesValue += toNumber(item.qty) * toNumber(item.sellingPrice);
      product.orderIds.add(order.id || `${shop}-${product.orderIds.size}`);
    });
  });

  const shops = Array.from(shopMap.values());
  const total = shops.reduce((summary, shop) => ({
    shop: 'Tổng tất cả shop',
    revenue: summary.revenue + shop.revenue,
    orderCount: summary.orderCount + shop.orderCount
  }), { shop: 'Tổng tất cả shop', revenue: 0, orderCount: 0 });

  const products = Array.from(productMap.values())
    .map(({ orderIds, ...product }) => ({ ...product, orderCount: orderIds.size }))
    .sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, 'vi'));

  return { shops, total, products };
}
