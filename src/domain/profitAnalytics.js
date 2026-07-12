export function calculateOrderGrossProfit(order) {
  const revenue = order.actualRevenue != null && order.actualRevenue !== ''
    ? Number(order.actualRevenue)
    : (order.items || []).reduce((sum, item) => (
      sum + (item.isReturned ? 0 : (Number(item.qty) || 0) * (Number(item.sellingPrice) || 0))
    ), 0);
  return revenue - (Number(order.totalCost) || 0);
}

export function calculateProfitAnalytics(orders, losses, ads, partners = [], defaultPackagingCost = 1000) {
  const data = {};
  const globalLosses = {};

  const getStats = (month, shop) => {
    if (!data[month]) data[month] = {};
    if (!data[month][shop]) {
      data[month][shop] = {
        totalOrders: 0, deliveredOrders: 0, returnedOrders: 0, pendingOrders: 0,
        expectedRevenue: 0, actualRevenue: 0, settledRevenue: 0, withdrawableRevenue: 0, orderProductCost: 0,
        estimatedMatchingCost: 0, monthlyLossQty: 0, monthlyLossValue: 0, ads: 0, deductedAds: 0,
        packagingCost: 0, estimatedPackagingCost: 0,
        returnCost: 0, estimatedReturnCost: 0,
        platformFee: 0, marketingFee: 0
      };
    }
    return data[month][shop];
  };

  for (const order of orders) {
    if (!order.date) continue;
    const orderMonth = order.date.substring(0, 7);
    const shop = order.shop || 'Không xác định';
    const stats = getStats(orderMonth, shop);

    stats.totalOrders += 1;
    const hasActualRevenue = order.actualRevenue != null && order.actualRevenue !== '';
    const hasReturnedItem = order.items?.some(item => item.isReturned) || false;
    const isFullReturn = order.items?.length > 0 && order.items.every(item => item.isReturned);
    if (hasActualRevenue && !isFullReturn) {
      stats.deliveredOrders += 1;
    }
    if (isFullReturn) {
      stats.returnedOrders += 1;
    } else if (!hasActualRevenue) {
      stats.pendingOrders += 1;
    }

    const actualRevNum = hasActualRevenue ? Number(order.actualRevenue) : 0;
    const pkgCost = order.packagingFee !== undefined ? Number(order.packagingFee) : defaultPackagingCost;
    // buildDerivedStore.totalCost includes packaging. Profit analytics shows
    // packaging in its own column, so only the FIFO product cost belongs here.
    const costNum = Math.max(0, (Number(order.totalCost) || 0) - pkgCost);
    const retCost = order.returnFee !== undefined ? Number(order.returnFee) : 0;
    const platFee = Number(order.platformFee) || 0;
    const mktFee = Number(order.marketingFee) || 0;
    
    // Tính doanh thu dự kiến (giá ưu đãi * số lượng)
    const expectedRev = order.items.reduce((sum, item) => sum + (Number(item.sellingPrice) || 0) * (Number(item.qty) || 0), 0);

    stats.expectedRevenue += expectedRev;
    stats.actualRevenue += actualRevNum;
    stats.orderProductCost += costNum;
    stats.packagingCost += pkgCost;
    const returnedGrossLoss = hasReturnedItem ? Math.max(0, -calculateOrderGrossProfit(order)) : 0;
    stats.returnCost += retCost + returnedGrossLoss;
    stats.platformFee += platFee;
    stats.marketingFee += mktFee;

    // Cash month shifting
    let cashMonth;
    if (order.settlementDate) {
      cashMonth = order.settlementDate.substring(0, 7);
    } else {
      const dateObj = new Date(order.date);
      dateObj.setDate(dateObj.getDate() + 15);
      cashMonth = dateObj.getFullYear() + '-' + String(dateObj.getMonth() + 1).padStart(2, '0');
    }
    
    const cashStats = getStats(cashMonth, shop);
    if (hasActualRevenue || (hasReturnedItem && retCost > 0)) {
      // Đối với đơn hoàn, khi xác nhận hoàn (hoặc có doanh thu thực tế = 0), ta ghi nhận phí hoàn vào dòng tiền tháng đối soát.
      // Tuy nhiên nếu đơn chưa đối soát (chưa về hàng/chưa trừ tiền), cashMonth sẽ là dự kiến.
      cashStats.withdrawableRevenue += actualRevNum;
      cashStats.estimatedMatchingCost += costNum;
      cashStats.estimatedPackagingCost += pkgCost;
      cashStats.estimatedReturnCost += retCost;
    }

    // Chỉ tiêu đối soát với màn "Đã thanh toán" của sàn: chỉ ghi nhận
    // khi có ngày sàn thực sự hoàn tất chuyển tiền cho người bán.
    if (order.settlementDate && hasActualRevenue) {
      cashStats.settledRevenue += actualRevNum;
    }
  }

  for (const loss of losses) {
    if (!loss.date) continue;
    const month = loss.date.substring(0, 7);
    if (!data[month]) data[month] = {};
    if (loss.shop) {
      const stats = getStats(month, loss.shop);
      stats.monthlyLossQty += Number(loss.qty) || 0;
      stats.monthlyLossValue += Number(loss.totalCostDeducted) || 0;
    } else {
      if (!globalLosses[month]) {
        globalLosses[month] = { qty: 0, value: 0 };
      }
      globalLosses[month].qty += Number(loss.qty) || 0;
      globalLosses[month].value += Number(loss.totalCostDeducted) || 0;
    }
  }

  for (const ad of ads) {
    if (ad.month && ad.shop) {
      const stats = getStats(ad.month, ad.shop);
      if (ad.source === 'DEDUCTED_FROM_REVENUE') {
        stats.deductedAds += Number(ad.amount) || 0;
      } else {
        stats.ads += Number(ad.amount) || 0;
      }
    }
  }

  const results = [];

  for (const month of Object.keys(data).sort()) {
    const shops = data[month];
    const totalStats = {
      month,
      shop: 'Tổng tất cả',
      totalOrders: 0, deliveredOrders: 0, returnedOrders: 0, pendingOrders: 0,
      expectedRevenue: 0, actualRevenue: 0, settledRevenue: 0, withdrawableRevenue: 0, orderProductCost: 0,
      estimatedMatchingCost: 0, monthlyLossQty: 0, monthlyLossValue: 0, ads: 0, deductedAds: 0,
      packagingCost: 0, estimatedPackagingCost: 0,
      returnCost: 0, estimatedReturnCost: 0,
      platformFee: 0, marketingFee: 0,
      isTotal: true
    };

    for (const shop of Object.keys(shops).sort()) {
      const s = shops[shop];
      const row = {
        month,
        shop,
        ...s,
        // Chú ý: KHÔNG trừ returnCost, platformFee, marketingFee ở đây vì actualRevenue của Shopee đã là con số NET bị trừ các loại phí này rồi.
        orderMonthProfit: s.actualRevenue - s.orderProductCost - s.packagingCost - s.ads - s.monthlyLossValue,
        cashMonthProfit: s.withdrawableRevenue - s.estimatedMatchingCost - s.estimatedPackagingCost - s.ads - s.monthlyLossValue
      };
      
      row.partnerShares = {};
      partners.forEach(p => {
        row.partnerShares[p.name] = row.cashMonthProfit * (p.share / 100);
      });
      
      results.push(row);

      totalStats.totalOrders += s.totalOrders;
      totalStats.deliveredOrders += s.deliveredOrders;
      totalStats.returnedOrders += s.returnedOrders;
      totalStats.pendingOrders += s.pendingOrders;
      totalStats.actualRevenue += s.actualRevenue;
      totalStats.settledRevenue += s.settledRevenue;
      totalStats.withdrawableRevenue += s.withdrawableRevenue;
      totalStats.orderProductCost += s.orderProductCost;
      totalStats.estimatedMatchingCost += s.estimatedMatchingCost;
      totalStats.monthlyLossQty += s.monthlyLossQty;
      totalStats.monthlyLossValue += s.monthlyLossValue;
      totalStats.ads += s.ads;
      totalStats.deductedAds += s.deductedAds;
      totalStats.packagingCost += s.packagingCost;
      totalStats.estimatedPackagingCost += s.estimatedPackagingCost;
      totalStats.returnCost += s.returnCost;
      totalStats.estimatedReturnCost += s.estimatedReturnCost;
      totalStats.expectedRevenue += s.expectedRevenue;
      totalStats.platformFee += s.platformFee;
      totalStats.marketingFee += s.marketingFee;
    }

    const gLoss = globalLosses[month] || { qty: 0, value: 0 };
    totalStats.monthlyLossQty += gLoss.qty;
    totalStats.monthlyLossValue += gLoss.value;

    totalStats.orderMonthProfit = totalStats.actualRevenue - totalStats.orderProductCost - totalStats.packagingCost - totalStats.ads - totalStats.monthlyLossValue;
    totalStats.cashMonthProfit = totalStats.withdrawableRevenue - totalStats.estimatedMatchingCost - totalStats.estimatedPackagingCost - totalStats.ads - totalStats.monthlyLossValue;
    
    totalStats.partnerShares = {};
    partners.forEach(p => {
      totalStats.partnerShares[p.name] = totalStats.cashMonthProfit * (p.share / 100);
    });

    results.push(totalStats);
  }

  return results;
}

export function calculateMarketplaceWalletSummary(orders = [], transactions = [], configuredShops = []) {
  const summaries = new Map(configuredShops.map(shop => [shop, {
    shop,
    settledRevenue: 0,
    withdrawn: 0,
    estimatedBalance: 0
  }]));

  const getSummary = (shop) => {
    if (!summaries.has(shop)) {
      summaries.set(shop, { shop, settledRevenue: 0, withdrawn: 0, estimatedBalance: 0 });
    }
    return summaries.get(shop);
  };

  orders.forEach(order => {
    if (!order.shop || !order.settlementDate || order.actualRevenue == null || order.actualRevenue === '') return;
    getSummary(order.shop).settledRevenue += Number(order.actualRevenue) || 0;
  });

  transactions.forEach(transaction => {
    if (transaction.type !== 'THU' || transaction.category !== 'Rút tiền từ Sàn' || !transaction.shop) return;
    getSummary(transaction.shop).withdrawn += Number(transaction.amount) || 0;
  });

  return Array.from(summaries.values())
    .map(summary => ({
      ...summary,
      estimatedBalance: summary.settledRevenue - summary.withdrawn
    }))
    .sort((a, b) => a.shop.localeCompare(b.shop, 'vi'));
}
