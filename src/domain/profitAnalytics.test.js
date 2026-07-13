import { describe, expect, it } from 'vitest';
import { buildDerivedStore } from './inventory.js';
import { calculateOrderGrossProfit, calculateProfitAnalytics } from './profitAnalytics.js';

const item = (isReturned = false) => ({ qty: 1, sellingPrice: 100_000, isReturned });

describe('profit analytics', () => {
  it('classifies delivered, full-return and partial-return orders from reconciliation data', () => {
    const orders = [
      { id: 'status-only', date: '2026-04-01', shop: 'Shop A', status: 'Hoàn hàng', actualRevenue: 80_000, totalCost: 50_000, packagingFee: 0, returnFee: 5_000, items: [item(false)] },
      { id: 'checked-return', date: '2026-04-02', shop: 'Shop A', status: 'Đã giao', actualRevenue: 10_000, totalCost: 40_000, packagingFee: 0, returnFee: 7_000, items: [item(true)] },
      { id: 'partial-return', date: '2026-04-03', shop: 'Shop A', status: 'Đã giao', actualRevenue: 60_000, totalCost: 30_000, packagingFee: 0, returnFee: 3_000, items: [item(true), item(false)] },
    ];

    const shop = calculateProfitAnalytics(orders, [], []).find((row) => row.month === '2026-04' && row.shop === 'Shop A');

    expect(shop).toMatchObject({ totalOrders: 3, deliveredOrders: 2, returnedOrders: 1, pendingOrders: 0 });
    expect(shop.totalOrders).toBe(shop.deliveredOrders + shop.returnedOrders + shop.pendingOrders);
    expect(calculateOrderGrossProfit(orders[1])).toBe(-30_000);
    expect(shop.returnCost).toBe(45_000);
  });

  it('uses actual revenue when present and item selling prices only as the estimate', () => {
    const order = {
      date: '2026-04-01', shop: 'Shop A', actualRevenue: 80_000, totalCost: 50_000,
      packagingFee: 0, items: [{ qty: 1, sellingPrice: 100_000, isReturned: false }],
    };
    const shop = calculateProfitAnalytics([order], [], [])[0];

    expect(calculateOrderGrossProfit(order)).toBe(30_000);
    expect(shop.expectedRevenue).toBe(100_000);
    expect(shop.actualRevenue).toBe(80_000);
  });

  it('deducts packaging once and separates ads deducted from revenue', () => {
    const orders = [{ id: 'packaging-once', date: '2026-04-03', shop: 'Shop B', status: 'Đã giao', actualRevenue: 80_000, totalCost: 51_000, packagingFee: 1_000, returnFee: 0, items: [item(false)] }];
    const ads = [
      { month: '2026-04', shop: 'Shop B', amount: 7_000, source: 'DEDUCTED_FROM_REVENUE' },
      { month: '2026-04', shop: 'Shop B', amount: 5_000, source: 'SELF_FUNDED' },
    ];
    const shop = calculateProfitAnalytics(orders, [], ads).find((row) => row.month === '2026-04' && row.shop === 'Shop B');

    expect(shop).toMatchObject({ orderProductCost: 50_000, packagingCost: 1_000, ads: 5_000, deductedAds: 7_000, orderMonthProfit: 24_000 });
  });

  it('includes shop losses in the month profit and loss totals', () => {
    const losses = [{ date: '2026-04-10', shop: 'Shop A', qty: 2, totalCostDeducted: 9_000 }];
    const shop = calculateProfitAnalytics([], losses, []).find((row) => row.month === '2026-04' && row.shop === 'Shop A');

    expect(shop).toMatchObject({ monthlyLossQty: 2, monthlyLossValue: 9_000, orderMonthProfit: -9_000, cashMonthProfit: -9_000 });
  });

  it('uses returned-item checkboxes for derived inventory, not the status text alone', () => {
    const derived = buildDerivedStore({
      products: [{ id: 'SKU-1', name: 'Sản phẩm 1' }],
      purchases: [{ id: 'PO-1', date: '2026-03-01', items: [{ productId: 'SKU-1', name: 'Sản phẩm 1', qty: 5, finalCostVnd: 10_000 }] }],
      orders: [
        { id: 'status-only', date: '2026-04-01', status: 'Hoàn hàng', packagingFee: 0, items: [{ productId: 'SKU-1', qty: 2, sellingPrice: 20_000, isReturned: false }] },
        { id: 'checked-return', date: '2026-04-02', status: 'Đã giao', packagingFee: 0, items: [{ productId: 'SKU-1', qty: 3, sellingPrice: 20_000, isReturned: true }] },
      ],
      losses: [],
    });

    expect(derived.inventory[0].stock).toBe(3);
  });
});
