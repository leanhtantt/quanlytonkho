import { useMemo } from 'react';
import { useAppStore } from '../store/appStoreContext';
import { calculateProfitAnalytics } from '../domain/profitAnalytics';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';

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

  // Colors for shops
  const colors = [
    'var(--color-primary)',
    'var(--color-info)',
    'var(--color-warning)',
    'var(--color-danger)',
    'var(--color-accent)',
    'var(--color-success)'
  ];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Phân Tích Lợi Nhuận</h1>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem', height: '400px' }}>
        <h3>Biểu đồ Lợi Nhuận Theo Tháng Sàn Thanh Toán</h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="name" tick={{ fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} tickFormatter={(val) => new Intl.NumberFormat('vi-VN', { notation: "compact", compactDisplay: "short" }).format(val)} />
            <Tooltip
              formatter={(value) => formatCurrency(value)}
              contentStyle={{ backgroundColor: 'var(--color-bg-surface)', borderColor: 'var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-base)' }}
            />
            <Legend />
            {shops.map((s, idx) => (
              <Bar key={s} dataKey={s} fill={colors[idx % colors.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h3>Bảng Phân Tích Lợi Nhuận</h3>
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
                <tr key={i} className={row.isTotal ? 'profit-total-row' : ''} style={{ fontWeight: row.isTotal ? 'bold' : 'normal', backgroundColor: row.isTotal ? 'var(--color-bg-subtle)' : 'transparent' }}>
                  <td>{row.month}</td>
                  <td>{row.shop}</td>
                  <td>{row.totalOrders}</td>
                  <td>{row.deliveredOrders}</td>
                  <td>{row.returnedOrders}</td>
                  <td>{row.pendingOrders}</td>
                  <td style={{ color: 'var(--color-success)' }}>{formatCurrency(row.actualRevenue)}</td>
                  <td style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{formatCurrency(row.settledRevenue)}</td>
                  <td style={{ color: 'var(--color-danger)' }}>{formatCurrency(row.orderProductCost)}</td>
                  <td style={{ color: 'var(--color-danger)' }}>{formatCurrency(row.estimatedMatchingCost)}</td>
                  <td>{row.monthlyLossQty}</td>
                  <td style={{ color: 'var(--color-danger)' }}>{formatCurrency(row.monthlyLossValue)}</td>
                  <td style={{ color: 'var(--color-danger)' }}>{formatCurrency(row.packagingCost)}</td>
                  <td style={{ color: 'var(--color-danger)' }}>{formatCurrency(row.ads)}</td>
                  <td style={{ color: 'var(--color-info)', fontWeight: 600 }}>{formatCurrency(getWithdrawnAmount(row))}</td>
                  <td style={{ color: row.orderMonthProfit < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>{formatCurrency(row.orderMonthProfit)}</td>
                  <td style={{ color: row.cashMonthProfit < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>{formatCurrency(row.cashMonthProfit)}</td>
                  {partners.map(p => (
                    <td key={p.name} style={{ color: row.partnerShares[p.name] < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                      {formatCurrency(row.partnerShares[p.name])}
                    </td>
                  ))}
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={17 + partners.length} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>Chưa có dữ liệu</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={24} style={{ color: 'var(--color-primary)' }} />
            Báo cáo Chi phí Ẩn
          </h2>
          <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>QC Shopee tự trừ trong đơn chỉ theo dõi; QC nạp từ Ví Shopee hoặc ngân hàng được trừ trong lợi nhuận.</span>
        </div>
        
        <div className="table-responsive profit-table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Tháng</th>
                <th>Kênh Bán</th>
                <th>Doanh thu Gốc</th>
                <th style={{ color: 'var(--color-danger)' }}>Phí Sàn</th>
                <th style={{ color: 'var(--color-danger)' }}>Phí Khuyến Mãi</th>
                <th style={{ color: 'var(--color-danger)' }}>Phí Hoàn Hàng</th>
                <th style={{ color: 'var(--color-danger)' }}>QC trừ doanh thu</th>
                <th style={{ color: 'var(--color-danger)' }}>Tổng QC</th>
                <th style={{ color: 'var(--color-danger)' }}>Tỉ lệ Hút máu (%)</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => {
                const totalHidden = row.platformFee + row.marketingFee + row.returnCost + row.deductedAds;
                const ratio = row.expectedRevenue > 0 ? (totalHidden / row.expectedRevenue * 100).toFixed(1) : 0;
                
                return (
                  <tr key={i} style={row.isTotal ? { fontWeight: 'bold', background: 'var(--color-bg-secondary)' } : {}}>
                    <td>{row.month}</td>
                    <td>{row.shop}</td>
                    <td style={{ color: 'var(--color-primary)' }}>{formatCurrency(row.expectedRevenue)}</td>
                    <td style={{ color: 'var(--color-danger)' }}>{formatCurrency(row.platformFee)}</td>
                    <td style={{ color: 'var(--color-danger)' }}>{formatCurrency(row.marketingFee)}</td>
                    <td style={{ color: 'var(--color-danger)' }}>{formatCurrency(row.returnCost)}</td>
                    <td style={{ color: 'var(--color-danger)' }}>{formatCurrency(row.deductedAds)}</td>
                    <td style={{ color: 'var(--color-danger)', fontWeight: 600 }}>{formatCurrency(row.deductedAds + row.ads)}</td>
                    <td style={{ color: 'var(--color-danger)', fontWeight: 'bold' }}>{ratio}%</td>
                  </tr>
                );
              })}
              {data.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>Chưa có dữ liệu</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
