export function calculateProfitAnalytics(orders, losses, ads) {
  const data = {};
  const globalLosses = {};

  const getStats = (month, shop) => {
    if (!data[month]) data[month] = {};
    if (!data[month][shop]) {
      data[month][shop] = {
        totalOrders: 0, deliveredOrders: 0, returnedOrders: 0,
        actualRevenue: 0, withdrawableRevenue: 0, orderProductCost: 0,
        estimatedMatchingCost: 0, monthlyLossQty: 0, monthlyLossValue: 0, ads: 0
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

    stats.actualRevenue += actualRevNum;
    stats.orderProductCost += costNum;

    // Cash month shifting
    const dateObj = new Date(order.date);
    dateObj.setDate(dateObj.getDate() + 15);
    const cashMonth = dateObj.getFullYear() + '-' + String(dateObj.getMonth() + 1).padStart(2, '0');
    
    const cashStats = getStats(cashMonth, shop);
    if (hasActualRevenue) {
      cashStats.withdrawableRevenue += actualRevNum;
      cashStats.estimatedMatchingCost += costNum;
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
      actualRevenue: 0, withdrawableRevenue: 0, orderProductCost: 0,
      estimatedMatchingCost: 0, monthlyLossQty: 0, monthlyLossValue: 0, ads: 0,
      isTotal: true
    };

    for (const shop of Object.keys(shops).sort()) {
      const s = shops[shop];
      const row = {
        month,
        shop,
        ...s,
        orderMonthProfit: s.actualRevenue - s.orderProductCost - s.ads - s.monthlyLossValue,
        cashMonthProfit: s.withdrawableRevenue - s.estimatedMatchingCost - s.ads - s.monthlyLossValue
      };
      row.shopCapitalShare = row.cashMonthProfit / 4;
      row.eachPartnerShare = row.cashMonthProfit / 4;
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
    }

    const gLoss = globalLosses[month] || { qty: 0, value: 0 };
    totalStats.monthlyLossQty += gLoss.qty;
    totalStats.monthlyLossValue += gLoss.value;

    totalStats.orderMonthProfit = totalStats.actualRevenue - totalStats.orderProductCost - totalStats.ads - totalStats.monthlyLossValue;
    totalStats.cashMonthProfit = totalStats.withdrawableRevenue - totalStats.estimatedMatchingCost - totalStats.ads - totalStats.monthlyLossValue;
    totalStats.shopCapitalShare = totalStats.cashMonthProfit / 4;
    totalStats.eachPartnerShare = totalStats.cashMonthProfit / 4;
    results.push(totalStats);
  }

  return results;
}

