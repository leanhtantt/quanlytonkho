export function calculateProfitAnalytics(orders, losses, ads, partners = [], defaultPackagingCost = 1000) {
  const data = {};
  const globalLosses = {};

  const getStats = (month, shop) => {
    if (!data[month]) data[month] = {};
    if (!data[month][shop]) {
      data[month][shop] = {
        totalOrders: 0, deliveredOrders: 0, returnedOrders: 0,
        expectedRevenue: 0, actualRevenue: 0, withdrawableRevenue: 0, orderProductCost: 0,
        estimatedMatchingCost: 0, monthlyLossQty: 0, monthlyLossValue: 0, ads: 0,
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
    const status = order.status || '';
    const norm = status.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd');
    if (status === 'Đã giao' || norm.includes('da giao')) {
      stats.deliveredOrders += 1;
    }
    if (status === 'Hoàn hàng' || norm.includes('hoan') || (order.items && order.items.length > 0 && order.items.every(item => item.isReturned))) {
      stats.returnedOrders += 1;
    }

    const hasActualRevenue = order.actualRevenue != null && order.actualRevenue !== '';
    const actualRevNum = hasActualRevenue ? Number(order.actualRevenue) : 0;
    const costNum = Number(order.totalCost) || 0;
    const pkgCost = order.packagingFee !== undefined ? Number(order.packagingFee) : defaultPackagingCost;
    const retCost = order.returnFee !== undefined ? Number(order.returnFee) : 0;
    const platFee = Number(order.platformFee) || 0;
    const mktFee = Number(order.marketingFee) || 0;
    
    // Tính doanh thu dự kiến (giá ưu đãi * số lượng)
    const expectedRev = order.items.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0);

    stats.expectedRevenue += expectedRev;
    stats.actualRevenue += actualRevNum;
    stats.orderProductCost += costNum;
    stats.packagingCost += pkgCost;
    stats.returnCost += retCost;
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
    if (hasActualRevenue || (status === 'Hoàn hàng' && retCost > 0)) {
      // Đối với đơn hoàn, khi xác nhận hoàn (hoặc có doanh thu thực tế = 0), ta ghi nhận phí hoàn vào dòng tiền tháng đối soát.
      // Tuy nhiên nếu đơn chưa đối soát (chưa về hàng/chưa trừ tiền), cashMonth sẽ là dự kiến.
      cashStats.withdrawableRevenue += actualRevNum;
      cashStats.estimatedMatchingCost += costNum;
      cashStats.estimatedPackagingCost += pkgCost;
      cashStats.estimatedReturnCost += retCost;
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
      stats.ads += Number(ad.amount) || 0;
    }
  }

  const results = [];

  for (const month of Object.keys(data).sort()) {
    const shops = data[month];
    const totalStats = {
      month,
      shop: 'Tổng tất cả',
      totalOrders: 0, deliveredOrders: 0, returnedOrders: 0,
      expectedRevenue: 0, actualRevenue: 0, withdrawableRevenue: 0, orderProductCost: 0,
      estimatedMatchingCost: 0, monthlyLossQty: 0, monthlyLossValue: 0, ads: 0,
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
      totalStats.actualRevenue += s.actualRevenue;
      totalStats.withdrawableRevenue += s.withdrawableRevenue;
      totalStats.orderProductCost += s.orderProductCost;
      totalStats.estimatedMatchingCost += s.estimatedMatchingCost;
      totalStats.monthlyLossQty += s.monthlyLossQty;
      totalStats.monthlyLossValue += s.monthlyLossValue;
      totalStats.ads += s.ads;
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

