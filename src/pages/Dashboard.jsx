import { useMemo, useState } from 'react';
import { Package, ShoppingCart, DollarSign, AlertCircle, CalendarDays } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAppStore } from '../store/appStoreContext';
import { calculateProfitAnalytics } from '../domain/profitAnalytics';
import { calculateDailyDashboard, getLocalDateKey } from '../domain/dashboardAnalytics';

function formatCurrency(value) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);
}

function formatDate(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

const StatCard = ({ title, value, icon: Icon, trend, trendValue, type }) => (
  <div className="card animate-fade-in">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>
          {title}
        </p>
        <h3 style={{ fontSize: '1.875rem', fontWeight: 700 }}>{value}</h3>
      </div>
      <div className="dashboard-stat-icon">
        <Icon size={24} aria-hidden="true" />
      </div>
    </div>
    <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
      <span className={`badge ${type === 'increase' ? 'badge-success' : type === 'decrease' ? 'badge-danger' : 'badge-warning'}`}>
        {trendValue}
      </span>
      <span style={{ color: 'var(--color-text-muted)' }}>{trend}</span>
    </div>
  </div>
);

export default function Dashboard() {
  const { inventory, orders, losses, ads, partners, shops } = useAppStore();
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateKey());

  const dailySummary = useMemo(
    () => calculateDailyDashboard(orders, shops, selectedDate),
    [orders, shops, selectedDate]
  );

  const { chartData, totalRevenue, totalOrders } = useMemo(() => {
    const profitData = calculateProfitAnalytics(orders, losses, ads, partners);
    const chart = [];
    let revenue = 0;
    let orderCount = 0;

    profitData.forEach(row => {
      if (!row.isTotal) return;
      chart.push({ name: row.month, revenue: row.actualRevenue, orders: row.totalOrders });
      revenue += row.actualRevenue;
      orderCount += row.totalOrders;
    });

    return { chartData: chart, totalRevenue: revenue, totalOrders: orderCount };
  }, [orders, losses, ads, partners]);

  const totalProducts = inventory.length;
  const lowStockCount = inventory.filter(product => product.stock < 10).length;

  return (
    <div className="animate-fade-in">
      <div className="page-header dashboard-header">
        <div>
          <h1 className="page-title">Tổng quan Kinh doanh</h1>
          <p className="dashboard-subtitle">Theo dõi hiệu quả bán hàng và tồn kho</p>
        </div>
        <div className="dashboard-date-control">
          <label htmlFor="dashboard-date">
            <CalendarDays size={17} aria-hidden="true" />
            Ngày cần xem
          </label>
          <input
            id="dashboard-date"
            type="date"
            value={selectedDate}
            onChange={event => setSelectedDate(event.target.value)}
          />
        </div>
      </div>

      <section className="dashboard-section" aria-labelledby="daily-shop-title">
        <div className="dashboard-section-heading">
          <div>
            <h2 id="daily-shop-title">Doanh thu và số đơn theo shop</h2>
            <p>Ngày {formatDate(selectedDate)} · Doanh thu thực tế nếu đã đối soát, tạm tính theo giá bán nếu chưa đối soát.</p>
          </div>
          <span className="badge badge-info">{dailySummary.total.orderCount} đơn</span>
        </div>

        <div className="table-responsive">
          <table className="dashboard-summary-table">
            <thead>
              <tr>
                <th>Shop</th>
                <th className="dashboard-number-cell">Doanh thu</th>
                <th className="dashboard-number-cell">Số đơn</th>
              </tr>
            </thead>
            <tbody>
              {dailySummary.shops.map(shop => (
                <tr key={shop.shop}>
                  <td>{shop.shop}</td>
                  <td className="dashboard-number-cell">{formatCurrency(shop.revenue)}</td>
                  <td className="dashboard-number-cell">{shop.orderCount}</td>
                </tr>
              ))}
              <tr className="dashboard-total-row">
                <td>{dailySummary.total.shop}</td>
                <td className="dashboard-number-cell">{formatCurrency(dailySummary.total.revenue)}</td>
                <td className="dashboard-number-cell">{dailySummary.total.orderCount}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="dashboard-section" aria-labelledby="daily-product-title">
        <div className="dashboard-section-heading">
          <div>
            <h2 id="daily-product-title">Sản phẩm đã bán trong ngày</h2>
            <p>Tổng hợp tất cả shop, không tính sản phẩm đã đánh dấu hoàn hàng.</p>
          </div>
          <span className="badge badge-info">{dailySummary.products.length} sản phẩm</span>
        </div>

        <div className="table-responsive">
          <table className="dashboard-product-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Sản phẩm</th>
                <th className="dashboard-number-cell">Số lượng bán</th>
                <th className="dashboard-number-cell">Số đơn</th>
                <th className="dashboard-number-cell">Giá trị theo giá bán</th>
              </tr>
            </thead>
            <tbody>
              {dailySummary.products.length > 0 ? dailySummary.products.map(product => (
                <tr key={product.productId}>
                  <td><strong>{product.sku}</strong></td>
                  <td>{product.name}</td>
                  <td className="dashboard-number-cell">{product.quantity}</td>
                  <td className="dashboard-number-cell">{product.orderCount}</td>
                  <td className="dashboard-number-cell">{formatCurrency(product.salesValue)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="5" className="dashboard-empty-state">Chưa có sản phẩm nào được bán trong ngày này.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="dashboard-stat-grid">
        <StatCard title="Tổng Doanh thu" value={formatCurrency(totalRevenue)} icon={DollarSign} trend="Tất cả thời gian" trendValue="Thực thu" type="increase" />
        <StatCard title="Tổng Đơn hàng" value={totalOrders} icon={ShoppingCart} trend="Tất cả thời gian" trendValue="Đơn" type="increase" />
        <StatCard title="Sản phẩm trong kho" value={totalProducts} icon={Package} trend="Mã hàng hóa" trendValue="Mã" type="neutral" />
        <StatCard title="Sắp Hết Hàng" value={lowStockCount} icon={AlertCircle} trend="Tồn kho < 10" trendValue="Cảnh báo" type="decrease" />
      </div>

      <div className="card dashboard-chart-card">
        <h3>Biểu đồ Doanh thu & Đơn hàng theo tháng</h3>
        <div className="dashboard-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-text-muted)' }} />
              <YAxis yAxisId="left" orientation="left" stroke="var(--color-primary)" axisLine={false} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" stroke="var(--color-success)" axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--color-bg-surface)', borderColor: 'var(--color-border)', borderRadius: 'var(--radius-md)' }}
                itemStyle={{ color: 'var(--color-text-base)' }}
                formatter={(value, name) => [name === 'revenue' ? formatCurrency(value) : value, name === 'revenue' ? 'Doanh thu' : 'Đơn hàng']}
              />
              <Bar yAxisId="left" name="revenue" dataKey="revenue" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="right" name="orders" dataKey="orders" fill="var(--color-success)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
