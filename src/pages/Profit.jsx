import { useMemo } from 'react';
import { useAppStore } from '../store/appStoreContext';
import { calculateProfitAnalytics } from '../domain/profitAnalytics';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { IconTrendingUp as TrendingUp } from '@tabler/icons-react';
import PageHeader from '../components/ui/PageHeader';
import HistoryRangeControl from '../components/HistoryRangeControl';
import EmptyState from '../components/ui/EmptyState';

function formatCurrency(value) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);
}

export default function Profit() {
  const {
    orders, losses, ads, shops: configuredShops, partners,
    defaultPackagingCost, transactions
  } = useAppStore();

  // Extract unique shops from orders for the dropdown
  const shops = useMemo(() => {
    const s = new Set([...configuredShops, ...orders.map(o => o.shop).filter(Boolean)]);
    return Array.from(s).sort();
  }, [configuredShops, orders]);

  const withdrawalsByMonthAndShop = useMemo(() => {
    const map = {};
    transactions
      .filter(transaction => transaction.type === 'THU' && transaction.category === 'Rút tiền từ Sàn' && transaction.shop)
      .forEach(transaction => {
        const month = String(transaction.date || '').substring(0, 7);
        if (!month) return;
        const key = `${month}::${transaction.shop}`;
        map[key] = (map[key] || 0) + (Number(transaction.amount) || 0);
      });
    return map;
  }, [transactions]);

  const getWithdrawnAmount = (row) => {
    if (!row.isTotal) return withdrawalsByMonthAndShop[`${row.month}::${row.shop}`] || 0;
    return Object.entries(withdrawalsByMonthAndShop)
      .filter(([key]) => key.startsWith(`${row.month}::`))
      .reduce((sum, [, amount]) => sum + amount, 0);
  };

  const data = useMemo(() => calculateProfitAnalytics(orders, losses, ads, partners, defaultPackagingCost), [orders, losses, ads, partners, defaultPackagingCost]);

  // For the chart, we want cashMonthProfit by month, grouped by shop.
  // The easiest way for Recharts BarChart is an array of objects where each object is a month:
  // { name: '2024-05', 'Shopee': 30000, 'Tiktok': 10000 }
  const chartData = useMemo(() => {
    const map = {};
    data.forEach(row => {
      if (row.isTotal) return;
      if (!map[row.month]) map[row.month] = { name: row.month };
      map[row.month][row.shop] = row.cashMonthProfit;
    });
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const chartTokens = [
    'var(--chart-1)',
    'var(--chart-2)',
    'var(--chart-3)',
    'var(--chart-4)',
    'var(--chart-5)',
    'var(--chart-6)'
  ];

  return (
    <div>
      <PageHeader
        title="Phân Tích Lợi Nhuận"
        description="Theo dõi lợi nhuận, dòng tiền và chi phí theo kỳ thanh toán"
      />
      <HistoryRangeControl />

      <section className="card profit-chart-card" aria-labelledby="profit-chart-title">
        <h2 id="profit-chart-title" className="h3">Biểu đồ Lợi Nhuận Theo Tháng Sàn Thanh Toán</h2>
        {chartData.length > 0 ? (
          <div className="profit-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => new Intl.NumberFormat('vi-VN', { notation: 'compact', compactDisplay: 'short' }).format(val)} />
                <Tooltip
                  formatter={(value) => formatCurrency(value)}
                  wrapperClassName="profit-chart-tooltip"
                />
                <Legend />
                {shops.map((s, idx) => (
                  <Bar key={s} dataKey={s} fill={chartTokens[idx % chartTokens.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            className="profit-chart-empty"
            icon={TrendingUp}
            title="Chưa có dữ liệu biểu đồ lợi nhuận"
            description="Biểu đồ sẽ xuất hiện khi có đơn hàng và kỳ thanh toán."
          />
        )}
      </section>

      <section className="card profit-analysis-card" aria-labelledby="profit-analysis-title">
        <h2 id="profit-analysis-title" className="h3">Bảng Phân Tích Lợi Nhuận</h2>
        <div className="table-responsive profit-table-container profit-analysis-table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Tháng</th>
                <th>Shop</th>
                <th>Tổng đơn</th>
                <th>Đã giao</th>
                <th>Hoàn</th>
                <th>Chưa đối soát</th>
                <th>Doanh thu theo đơn</th>
                <th>Sàn đã thanh toán</th>
                <th>Vốn (Thực)</th>
                <th>Vốn theo kỳ thanh toán</th>
                <th>SL Hao hụt</th>
                <th>Giá trị Hao hụt</th>
                <th>Đóng gói</th>
                <th>QC nạp thủ công</th>
                <th>Đã rút về</th>
                <th>LN Đơn hàng</th>
                <th>LN Dòng tiền</th>
                {partners.map(p => (
                  <th key={p.name}>Cổ phần {p.name} ({p.share}%)</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className={row.isTotal ? 'profit-total-row' : ''}>
                  <td>{row.month}</td>
                  <td>{row.shop}</td>
                  <td className="num">{row.totalOrders}</td>
                  <td className="num">{row.deliveredOrders}</td>
                  <td className="num">{row.returnedOrders}</td>
                  <td className="num">{row.pendingOrders}</td>
                  <td className="num profit-value--income">{formatCurrency(row.actualRevenue)}</td>
                  <td className="num profit-value--primary">{formatCurrency(row.settledRevenue)}</td>
                  <td className="num profit-value--expense">{formatCurrency(row.orderProductCost)}</td>
                  <td className="num profit-value--expense">{formatCurrency(row.estimatedMatchingCost)}</td>
                  <td className="num">{row.monthlyLossQty}</td>
                  <td className="num profit-value--expense">{formatCurrency(row.monthlyLossValue)}</td>
                  <td className="num profit-value--expense">{formatCurrency(row.packagingCost)}</td>
                  <td className="num profit-value--expense">{formatCurrency(row.ads)}</td>
                  <td className="num profit-value--info">{formatCurrency(getWithdrawnAmount(row))}</td>
                  <td className={`num ${row.orderMonthProfit < 0 ? 'profit-value--expense' : 'profit-value--income'}`}>{formatCurrency(row.orderMonthProfit)}</td>
                  <td className={`num ${row.cashMonthProfit < 0 ? 'profit-value--expense' : 'profit-value--income'}`}>{formatCurrency(row.cashMonthProfit)}</td>
                  {partners.map(p => (
                    <td key={p.name} className={`num ${row.partnerShares[p.name] < 0 ? 'profit-value--expense' : 'profit-value--income'}`}>
                      {formatCurrency(row.partnerShares[p.name])}
                    </td>
                  ))}
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={17 + partners.length} className="profit-empty-cell"><EmptyState icon={TrendingUp} title="Chưa có dữ liệu lợi nhuận" description="Dữ liệu sẽ xuất hiện khi có đơn hàng và kỳ thanh toán." /></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card profit-hidden-cost-card" aria-labelledby="hidden-cost-title">
        <div className="profit-section-heading">
          <h2 id="hidden-cost-title" className="h3 profit-section-heading__title">
            <TrendingUp size={24} aria-hidden="true" />
            Báo cáo Chi phí Ẩn
          </h2>
          <p>QC Shopee tự trừ trong đơn chỉ theo dõi; QC nạp từ Ví Shopee hoặc ngân hàng được trừ trong lợi nhuận.</p>
        </div>
        
        <div className="table-responsive profit-table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Tháng</th>
                <th>Kênh Bán</th>
                <th>Doanh thu Gốc</th>
                <th className="profit-heading--expense">Phí Sàn</th>
                <th className="profit-heading--expense">Phí Khuyến Mãi</th>
                <th className="profit-heading--expense">Phí Hoàn Hàng</th>
                <th className="profit-heading--expense">QC trừ doanh thu</th>
                <th className="profit-heading--expense">Tổng QC</th>
                <th className="profit-heading--expense">Tỉ lệ Hút máu (%)</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => {
                const totalHidden = row.platformFee + row.marketingFee + row.returnCost + row.deductedAds;
                const ratio = row.expectedRevenue > 0 ? (totalHidden / row.expectedRevenue * 100).toFixed(1) : 0;
                
                return (
                  <tr key={i} className={row.isTotal ? 'profit-total-row' : ''}>
                    <td>{row.month}</td>
                    <td>{row.shop}</td>
                    <td className="num profit-value--primary">{formatCurrency(row.expectedRevenue)}</td>
                    <td className="num profit-value--expense">{formatCurrency(row.platformFee)}</td>
                    <td className="num profit-value--expense">{formatCurrency(row.marketingFee)}</td>
                    <td className="num profit-value--expense">{formatCurrency(row.returnCost)}</td>
                    <td className="num profit-value--expense">{formatCurrency(row.deductedAds)}</td>
                    <td className="num profit-value--expense profit-value--strong">{formatCurrency(row.deductedAds + row.ads)}</td>
                    <td className="num profit-value--expense profit-value--strong">{ratio}%</td>
                  </tr>
                );
              })}
              {data.length === 0 && (
                <tr>
                  <td colSpan={9} className="profit-empty-cell"><EmptyState icon={TrendingUp} title="Chưa có dữ liệu chi phí" description="Báo cáo sẽ được tổng hợp cùng dữ liệu đơn hàng." /></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}
