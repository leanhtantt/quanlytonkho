import { calculateProfitAnalytics } from './src/domain/profitAnalytics.js';

const orders = [
  { id: '1', date: '2024-05-10T10:00:00Z', shop: 'Shopee', status: 'Đã giao', actualRevenue: 150000, totalCost: 100000 },
  { id: '2', date: '2024-05-20T10:00:00Z', shop: 'Tiktok', status: 'đã hoàn trả', totalCost: 80000 }, // No actual revenue, matches 'hoan'
  { id: '3', date: '2024-06-05T10:00:00Z', shop: 'Shopee', status: 'Đã giao', actualRevenue: 200000, totalCost: 120000 },
  { id: '4', date: '2024-05-25T10:00:00Z', shop: 'Shopee', status: 'Đã giao', actualRevenue: 90000, totalCost: 50000 }, // Cash shifts to June
  { id: '5', date: '2024-05-21T10:00:00Z', shop: 'Tiktok', status: 'Đang xử lý', totalCost: 40000, items: [{ isReturned: true }, { isReturned: true }] } // matches items isReturned
];

const losses = [
  { date: '2024-05-15T10:00:00Z', qty: 2, totalCostDeducted: 40000 }
];

const ads = [
  { month: '2024-05', shop: 'Shopee', amount: 20000 },
  { month: '2024-06', shop: 'Tiktok', amount: 30000 }
];

const result = calculateProfitAnalytics(orders, losses, ads);

console.log(JSON.stringify(result, null, 2));

// Assertions
// 1. Returned orders are counted
const mayTiktok = result.find(r => r.month === '2024-05' && r.shop === 'Tiktok');
if (!mayTiktok || mayTiktok.returnedOrders !== 2) throw new Error(`May Tiktok returnedOrders mismatch: expected 2, got ${mayTiktok?.returnedOrders}`);

// 2. No pseudo loss shop row exists
const mayChung = result.find(r => r.shop === 'Chung (Hao hụt)');
if (mayChung) throw new Error('Pseudo loss shop row "Chung (Hao hụt)" should not exist');

// 3. Loss appears only in total row
const mayShopee = result.find(r => r.month === '2024-05' && r.shop === 'Shopee');
if (mayShopee.monthlyLossValue !== 0) throw new Error('May Shopee should have 0 loss value');
if (mayTiktok.monthlyLossValue !== 0) throw new Error('May Tiktok should have 0 loss value');

const mayTotal = result.find(r => r.month === '2024-05' && r.shop === 'Tổng tất cả');
if (!mayTotal || mayTotal.monthlyLossValue !== 40000) throw new Error(`May Total monthlyLossValue mismatch: expected 40000, got ${mayTotal?.monthlyLossValue}`);

// 4. Order on May 25 with actualRevenue shifts withdrawableRevenue and matching cost to June
// May Shopee should only have Order 1 withdrawableRevenue (150000) and cost (100000)
if (mayShopee.withdrawableRevenue !== 150000) throw new Error(`May Shopee withdrawableRevenue mismatch: expected 150000, got ${mayShopee.withdrawableRevenue}`);
if (mayShopee.estimatedMatchingCost !== 100000) throw new Error(`May Shopee estimatedMatchingCost mismatch: expected 100000, got ${mayShopee.estimatedMatchingCost}`);

// June Shopee should have Order 3 (200000 rev, 120000 cost) + Order 4 shifted (90000 rev, 50000 cost) = 290000 rev, 170000 cost
const juneShopee = result.find(r => r.month === '2024-06' && r.shop === 'Shopee');
if (!juneShopee || juneShopee.withdrawableRevenue !== 290000) throw new Error(`June Shopee withdrawableRevenue mismatch: expected 290000, got ${juneShopee?.withdrawableRevenue}`);
if (!juneShopee || juneShopee.estimatedMatchingCost !== 170000) throw new Error(`June Shopee estimatedMatchingCost mismatch: expected 170000, got ${juneShopee?.estimatedMatchingCost}`);

console.log("All smoke tests passed!");

