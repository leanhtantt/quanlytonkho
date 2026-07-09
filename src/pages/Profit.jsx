import { useState, useMemo } from 'react';
import { useAppStore } from '../store/appStoreContext';
import { calculateProfitAnalytics } from '../domain/profitAnalytics';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';

function formatCurrency(value) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);
}

export default function Profit() {
  const { orders, losses, ads, setAds, partners, defaultPackagingCost } = useAppStore();

  const [adMonth, setAdMonth] = useState('');
  const [adShop, setAdShop] = useState('');
  const [adAmount, setAdAmount] = useState('');

  // Extract unique shops from orders for the dropdown
  const shops = useMemo(() => {
    const s = new Set(orders.map(o => o.shop).filter(Boolean));
    return Array.from(s).sort();
  }, [orders]);

  const handleSaveAd = (e) => {
    e.preventDefault();
    if (!adMonth || !adShop || !adAmount) return;

    setAds(prev => {
      const existing = prev.find(a => a.month === adMonth && a.shop === adShop);
      if (existing) {
        return prev.map(a => a.month === adMonth && a.shop === adShop ? { ...a, amount: Number(adAmount) } : a);
      }
      return [...prev, { month: adMonth, shop: adShop, amount: Number(adAmount) }];
    });
    setAdAmount('');
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

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3>Nhập Chi Phí Quảng Cáo</h3>
        <form onSubmit={handleSaveAd} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', marginTop: '1rem' }}>
          <div style={{ flex: '1 1 160px' }}>
            <label>Tháng</label>
            <input type="month" value={adMonth} onChange={e => setAdMonth(e.target.value)} required />
          </div>
          <div style={{ flex: '1 1 220px' }}>
            <label>Shop</label>
            <input
              type="text"
              list="ad-shops"
              value={adShop}
              onChange={e => setAdShop(e.target.value)}
              placeholder="Chọn hoặc nhập shop..."
              required
            />
            <datalist id="ad-shops">
              {shops.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <label>Chi phí (VND)</label>
            <input type="number" value={adAmount} onChange={e => setAdAmount(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary">Lưu chi phí</button>
        </form>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem', height: '400px' }}>
        <h3>Biểu đồ Lợi Nhuận Dòng Tiền (Cash-Month Profit)</h3>
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
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Tháng</th>
                <th>Shop</th>
                <th>Tổng đơn</th>
                <th>Đã giao</th>
                <th>Hoàn</th>
                <th>Doanh thu (Thực)</th>
                <th>Doanh thu (+15d)</th>
                <th>Vốn (Thực)</th>
                <th>Vốn (+15d)</th>
                <th>SL Hao hụt</th>
                <th>Giá trị Hao hụt</th>
                <th>Đóng gói</th>
                <th>QC</th>
                <th>LN Đơn hàng</th>
                <th>LN Dòng tiền</th>
                {partners.map(p => (
                  <th key={p.name}>Cổ phần {p.name} ({p.share}%)</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} style={{ fontWeight: row.isTotal ? 'bold' : 'normal', backgroundColor: row.isTotal ? 'var(--color-bg-subtle)' : 'transparent' }}>
                  <td>{row.month}</td>
                  <td>{row.shop}</td>
                  <td>{row.totalOrders}</td>
                  <td>{row.deliveredOrders}</td>
                  <td>{row.returnedOrders}</td>
                  <td style={{ color: 'var(--color-success)' }}>{formatCurrency(row.actualRevenue)}</td>
                  <td style={{ color: 'var(--color-success)' }}>{formatCurrency(row.withdrawableRevenue)}</td>
                  <td style={{ color: 'var(--color-danger)' }}>{formatCurrency(row.orderProductCost)}</td>
                  <td style={{ color: 'var(--color-danger)' }}>{formatCurrency(row.estimatedMatchingCost)}</td>
                  <td>{row.monthlyLossQty}</td>
                  <td style={{ color: 'var(--color-danger)' }}>{formatCurrency(row.monthlyLossValue)}</td>
                  <td style={{ color: 'var(--color-danger)' }}>{formatCurrency(row.packagingCost)}</td>
                  <td style={{ color: 'var(--color-danger)' }}>{formatCurrency(row.ads)}</td>
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
                  <td colSpan={15 + partners.length} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>Chưa có dữ liệu</td>
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
          <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>*(Chỉ mang tính chất theo dõi để tối ưu, không trừ vào lợi nhuận)*</span>
        </div>
        
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Tháng</th>
                <th>Kênh Bán</th>
                <th>Doanh thu Gốc</th>
                <th style={{ color: 'var(--color-danger)' }}>Phí Sàn</th>
                <th style={{ color: 'var(--color-danger)' }}>Phí Khuyến Mãi</th>
                <th style={{ color: 'var(--color-danger)' }}>Phí Hoàn Hàng</th>
                <th style={{ color: 'var(--color-danger)' }}>Tỉ lệ Hút máu (%)</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => {
                const totalHidden = row.platformFee + row.marketingFee + row.returnCost;
                const ratio = row.expectedRevenue > 0 ? (totalHidden / row.expectedRevenue * 100).toFixed(1) : 0;
                
                return (
                  <tr key={i} style={row.isTotal ? { fontWeight: 'bold', background: 'var(--color-bg-secondary)' } : {}}>
                    <td>{row.month}</td>
                    <td>{row.shop}</td>
                    <td style={{ color: 'var(--color-primary)' }}>{formatCurrency(row.expectedRevenue)}</td>
                    <td style={{ color: 'var(--color-danger)' }}>{formatCurrency(row.platformFee)}</td>
                    <td style={{ color: 'var(--color-danger)' }}>{formatCurrency(row.marketingFee)}</td>
                    <td style={{ color: 'var(--color-danger)' }}>{formatCurrency(row.returnCost)}</td>
                    <td style={{ color: 'var(--color-danger)', fontWeight: 'bold' }}>{ratio}%</td>
                  </tr>
                );
              })}
              {data.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>Chưa có dữ liệu</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
