import { useState, useMemo } from 'react';
import { useAppStore } from '../store/appStoreContext';
import { calculateProfitAnalytics } from '../domain/profitAnalytics';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Wallet, Trash2 } from 'lucide-react';

function formatCurrency(value) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);
}

export default function Profit() {
  const {
    orders, losses, ads, addAd, deleteAd, shops: configuredShops, partners,
    defaultPackagingCost, transactions, addTransaction, accounts
  } = useAppStore();

  const [adMonth, setAdMonth] = useState('');
  const [adShop, setAdShop] = useState('');
  const [adAmount, setAdAmount] = useState('');
  const [adSource, setAdSource] = useState('DEDUCTED_FROM_REVENUE');
  const [adAccount, setAdAccount] = useState(accounts[0] || '');
  const [adDate, setAdDate] = useState(new Date().toISOString().split('T')[0]);
  const [adNote, setAdNote] = useState('');
  const [withdrawalDate, setWithdrawalDate] = useState(new Date().toISOString().split('T')[0]);
  const [withdrawalShop, setWithdrawalShop] = useState('');
  const [withdrawalAccount, setWithdrawalAccount] = useState(accounts[0] || '');
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalNote, setWithdrawalNote] = useState('');

  // Extract unique shops from orders for the dropdown
  const shops = useMemo(() => {
    const s = new Set([...configuredShops, ...orders.map(o => o.shop).filter(Boolean)]);
    return Array.from(s).sort();
  }, [configuredShops, orders]);

  const handleSaveAd = async (e) => {
    e.preventDefault();
    if (!adMonth || !adShop || Number(adAmount) <= 0) return;
    if (adSource === 'SELF_FUNDED' && !adAccount) return;

    try {
      await addAd({
        month: adMonth,
        shop: adShop,
        amount: Number(adAmount),
        source: adSource,
        account: adSource === 'SELF_FUNDED' ? adAccount : null,
        date: adSource === 'SELF_FUNDED' ? adDate : null,
        note: adNote.trim() || null,
      });
      setAdAmount('');
      setAdNote('');
    } catch (error) {
      alert(`Không thể lưu chi phí quảng cáo: ${error.message}`);
    }
  };

  const handleSaveWithdrawal = async (e) => {
    e.preventDefault();
    if (!withdrawalDate || !withdrawalShop || !withdrawalAccount || Number(withdrawalAmount) <= 0) return;

    try {
      await addTransaction({
        date: withdrawalDate,
        type: 'THU',
        account: withdrawalAccount,
        category: 'Rút tiền từ Sàn',
        shop: withdrawalShop,
        amount: Number(withdrawalAmount),
        note: withdrawalNote.trim()
      });
      setWithdrawalAmount('');
      setWithdrawalNote('');
      alert('Đã ghi nhận tiền rút về tài khoản.');
    } catch (error) {
      alert(`Không thể lưu tiền rút về: ${error.message}`);
    }
  };

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
            <input type="number" min="1" value={adAmount} onChange={e => setAdAmount(e.target.value)} required />
          </div>
          <div style={{ flex: '1 1 230px' }}>
            <label>Nguồn quảng cáo</label>
            <select value={adSource} onChange={e => setAdSource(e.target.value)}>
              <option value="DEDUCTED_FROM_REVENUE">Đã trừ từ doanh thu</option>
              <option value="SELF_FUNDED">Shop tự nạp</option>
            </select>
          </div>
          {adSource === 'SELF_FUNDED' && (
            <>
              <div style={{ flex: '1 1 180px' }}>
                <label>Ngày chi</label>
                <input type="date" value={adDate} onChange={e => setAdDate(e.target.value)} required />
              </div>
              <div style={{ flex: '1 1 180px' }}>
                <label>Tài khoản chi</label>
                <select value={adAccount} onChange={e => setAdAccount(e.target.value)} required>
                  <option value="">Chọn tài khoản</option>
                  {accounts.map(account => <option key={account} value={account}>{account}</option>)}
                </select>
              </div>
            </>
          )}
          <div style={{ flex: '2 1 240px' }}>
            <label>Ghi chú</label>
            <input type="text" value={adNote} onChange={e => setAdNote(e.target.value)} placeholder="VD: QC Shopee tháng 7" />
          </div>
          <button type="submit" className="btn btn-primary">Lưu chi phí</button>
        </form>
        {ads.length > 0 && (
          <div className="table-responsive" style={{ marginTop: '1rem', maxHeight: '260px' }}>
            <table className="table">
              <thead><tr><th>Tháng</th><th>Shop</th><th>Nguồn</th><th>Tài khoản</th><th>Số tiền</th><th>Ghi chú</th><th></th></tr></thead>
              <tbody>
                {ads.map(ad => (
                  <tr key={ad.id}>
                    <td>{ad.month}</td><td>{ad.shop}</td>
                    <td>{ad.source === 'SELF_FUNDED' ? 'Shop tự nạp' : 'Đã trừ doanh thu'}</td>
                    <td>{ad.account || '-'}</td>
                    <td>{formatCurrency(ad.amount)}</td><td>{ad.note || '-'}</td>
                    <td><button className="btn" aria-label={`Xóa chi phí quảng cáo ${ad.shop} ${ad.month}`} onClick={() => deleteAd(ad.id)} style={{ padding: '4px', color: 'var(--color-danger)' }}><Trash2 size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Wallet size={20} style={{ color: 'var(--color-primary)' }} />
          Nhập Tiền Rút Về Tài Khoản
        </h3>
        <p style={{ color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
          Khoản này được ghi vào Sổ Quỹ để theo dõi dòng tiền thực nhận, không cộng lại vào doanh thu hoặc lợi nhuận.
        </p>
        <form onSubmit={handleSaveWithdrawal} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', marginTop: '1rem' }}>
          <div style={{ flex: '1 1 160px' }}>
            <label>Ngày rút</label>
            <input type="date" value={withdrawalDate} onChange={e => setWithdrawalDate(e.target.value)} required />
          </div>
          <div style={{ flex: '1 1 200px' }}>
            <label>Shop</label>
            <select value={withdrawalShop} onChange={e => setWithdrawalShop(e.target.value)} required>
              <option value="">Chọn shop</option>
              {shops.map(shop => <option key={shop} value={shop}>{shop}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <label>Tài khoản nhận</label>
            <select value={withdrawalAccount} onChange={e => setWithdrawalAccount(e.target.value)} required>
              <option value="">Chọn tài khoản</option>
              {accounts.map(account => <option key={account} value={account}>{account}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <label>Số tiền (VND)</label>
            <input type="number" min="1" value={withdrawalAmount} onChange={e => setWithdrawalAmount(e.target.value)} required />
          </div>
          <div style={{ flex: '2 1 220px' }}>
            <label>Ghi chú</label>
            <input type="text" value={withdrawalNote} onChange={e => setWithdrawalNote(e.target.value)} placeholder="VD: Rút tiền Shopee tuần 2" />
          </div>
          <button type="submit" className="btn btn-primary">Ghi nhận tiền về</button>
        </form>
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
                <th>QC tự nạp</th>
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
          <span style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>QC đã trừ doanh thu chỉ theo dõi; QC tự nạp đã được trừ trong lợi nhuận.</span>
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
