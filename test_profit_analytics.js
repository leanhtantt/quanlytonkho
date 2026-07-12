import { calculateOrderGrossProfit, calculateProfitAnalytics } from './src/domain/profitAnalytics.js';
import { buildDerivedStore } from './src/domain/inventory.js';

const item = (isReturned = false) => ({ qty: 1, sellingPrice: 100000, isReturned });

const orders = [
  {
    id: 'status-only', date: '2026-04-01', shop: 'Shop A', status: 'Hoàn hàng',
    actualRevenue: 80000, totalCost: 50000, packagingFee: 0, returnFee: 5000,
    items: [item(false)]
  },
  {
    id: 'checked-return', date: '2026-04-02', shop: 'Shop A', status: 'Đã giao',
    actualRevenue: 10000, totalCost: 40000, packagingFee: 0, returnFee: 7000,
    items: [item(true)]
  },
  {
    id: 'partial-return', date: '2026-04-03', shop: 'Shop A', status: 'Đã giao',
    actualRevenue: 60000, totalCost: 30000, packagingFee: 0, returnFee: 3000,
    items: [item(true), item(false)]
  }
];

orders.push({
  id: 'packaging-once', date: '2026-04-03', shop: 'Shop B', status: 'Đã giao',
  actualRevenue: 80000, totalCost: 51000, packagingFee: 1000, returnFee: 0,
  items: [item(false)]
});

const adExpenses = [
  { month: '2026-04', shop: 'Shop B', amount: 7000, source: 'DEDUCTED_FROM_REVENUE' },
  { month: '2026-04', shop: 'Shop B', amount: 5000, source: 'SELF_FUNDED' }
];
const result = calculateProfitAnalytics(orders, [], adExpenses);
const shop = result.find(row => row.month === '2026-04' && row.shop === 'Shop A');

if (!shop) throw new Error('Missing Shop A analytics row');
if (shop.returnedOrders !== 1) {
  throw new Error(`Only checked returns should count: expected 1, got ${shop.returnedOrders}`);
}
if (shop.deliveredOrders !== 2) {
  throw new Error(`Normal and partial-return reconciled orders should be delivered: expected 2, got ${shop.deliveredOrders}`);
}
if (shop.totalOrders !== shop.deliveredOrders + shop.returnedOrders + shop.pendingOrders) {
  throw new Error('Order status buckets must reconcile to total orders');
}

const returnedGrossProfit = calculateOrderGrossProfit(orders[1]);
if (returnedGrossProfit !== -30000) {
  throw new Error(`Returned gross profit mismatch: expected -30000, got ${returnedGrossProfit}`);
}

// Explicit return fees: 5,000 + 7,000 + 3,000. Only the full-return order
// contributes its gross loss magnitude: 30,000. Total hidden return cost = 45,000.
if (shop.returnCost !== 45000) {
  throw new Error(`Hidden return cost mismatch: expected 45000, got ${shop.returnCost}`);
}

const shopB = result.find(row => row.month === '2026-04' && row.shop === 'Shop B');
if (!shopB || shopB.orderProductCost !== 50000 || shopB.packagingCost !== 1000 || shopB.ads !== 5000 || shopB.deductedAds !== 7000 || shopB.orderMonthProfit !== 24000) {
  throw new Error(`Packaging must be deducted once: ${JSON.stringify(shopB)}`);
}

const derived = buildDerivedStore({
  products: [{ id: 'SKU-1', name: 'Sản phẩm 1' }],
  purchases: [{ id: 'PO-1', date: '2026-03-01', items: [{ productId: 'SKU-1', name: 'Sản phẩm 1', qty: 5, finalCostVnd: 10000 }] }],
  orders: [
    { id: 'status-only', date: '2026-04-01', status: 'Hoàn hàng', packagingFee: 0, items: [{ productId: 'SKU-1', qty: 2, sellingPrice: 20000, isReturned: false }] },
    { id: 'checked-return', date: '2026-04-02', status: 'Đã giao', packagingFee: 0, items: [{ productId: 'SKU-1', qty: 3, sellingPrice: 20000, isReturned: true }] }
  ],
  losses: []
});

if (derived.inventory[0].stock !== 3) {
  throw new Error(`Inventory must follow the checkbox only: expected stock 3, got ${derived.inventory[0].stock}`);
}

console.log('All profit analytics smoke tests passed!');
