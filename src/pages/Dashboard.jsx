import { useMemo, useState } from 'react';
import { IconPackage as Package, IconShoppingCart as ShoppingCart, IconCurrencyDollar as DollarSign, IconAlertCircle as AlertCircle, IconCalendar as CalendarDays } from '@tabler/icons-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAppStore } from '../store/appStoreContext';
import { calculateProfitAnalytics } from '../domain/profitAnalytics';
import { calculateDailyDashboard, getLocalDateKey } from '../domain/dashboardAnalytics';
import PageHeader from '../components/ui/PageHeader';
import Badge from '../components/ui/Badge';
import EmptyState from '../components/ui/EmptyState';
import StatCard from '../components/ui/StatCard';

function formatCurrency(value) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);
}

function formatDate(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

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
      <PageHeader
        title="Tổng quan Kinh doanh"
        description="Theo dõi hiệu quả bán hàng và tồn kho"
        className="dashboard-header"
        actions={<div className="dashboard-date-control">
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
        </div>}
      />

      <section className="dashboard-section" aria-labelledby="daily-shop-title">
        <div className="dashboard-section-heading">
          <div>
            <h2 id="daily-shop-title">Doanh thu và số đơn theo shop</h2>
            <p>Ngày {formatDate(selectedDate)} · Doanh thu thực tế nếu đã đối soát, tạm tính theo giá bán nếu chưa đối soát.</p>
          </div>
          <Badge>{dailySummary.total.orderCount} đơn</Badge>
        </div>

        <div className="table-responsive">
          <table className="dashboard-summary-table">
            <thead>
              <tr>
                <th>Shop</th>
                <th className="dashboard-number-cell num">Doanh thu</th>
                <th className="dashboard-number-cell num">Số đơn</th>
              </tr>
            </thead>
            <tbody>
              {dailySummary.shops.map(shop => (
                <tr key={shop.shop}>
                  <td>{shop.shop}</td>
                  <td className="dashboard-number-cell num">{formatCurrency(shop.revenue)}</td>
                  <td className="dashboard-number-cell num">{shop.orderCount}</td>
                </tr>
              ))}
              <tr className="dashboard-total-row">
                <td>{dailySummary.total.shop}</td>
                <td className="dashboard-number-cell num">{formatCurrency(dailySummary.total.revenue)}</td>
                <td className="dashboard-number-cell num">{dailySummary.total.orderCount}</td>
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
          <Badge>{dailySummary.products.length} sản phẩm</Badge>
        </div>

        <div className="table-responsive">
          <table className="dashboard-product-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Sản phẩm</th>
                <th className="dashboard-number-cell num">Số lượng bán</th>
                <th className="dashboard-number-cell num">Số đơn</th>
                <th className="dashboard-number-cell num">Giá trị theo giá bán</th>
              </tr>
            </thead>
            <tbody>
              {dailySummary.products.length > 0 ? dailySummary.products.map(product => (
                <tr key={product.productId}>
                  <td><strong>{product.sku}</strong></td>
                  <td>{product.name}</td>
                  <td className="dashboard-number-cell num">{product.quantity}</td>
                  <td className="dashboard-number-cell num">{product.orderCount}</td>
                  <td className="dashboard-number-cell num">{formatCurrency(product.salesValue)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="5" className="dashboard-empty-cell">
                    <EmptyState
                      icon={Package}
                      title="Chưa có sản phẩm bán trong ngày"
                      description="Thử chọn ngày khác để xem dữ liệu bán hàng."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="dashboard-stat-grid">
        <StatCard label="Tổng Doanh thu" value={formatCurrency(totalRevenue)} icon={DollarSign} description="Tất cả thời gian" trend={<Badge variant="success">Thực thu</Badge>} />
        <StatCard label="Tổng Đơn hàng" value={totalOrders} icon={ShoppingCart} description="Tất cả thời gian" trend={<Badge variant="success">Đơn</Badge>} />
        <StatCard label="Sản phẩm trong kho" value={totalProducts} icon={Package} description="Mã hàng hóa" trend={<Badge variant="info">Mã</Badge>} />
        <StatCard label="Sắp Hết Hàng" value={lowStockCount} icon={AlertCircle} description="Tồn kho < 10" trend={<Badge variant="danger">Cảnh báo</Badge>} />
      </div>

      <div className="card dashboard-chart-card">
        <h3>Biểu đồ Doanh thu & Đơn hàng theo tháng</h3>
        <div className="dashboard-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} />
              <YAxis yAxisId="left" orientation="left" stroke="var(--chart-1)" axisLine={false} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" stroke="var(--chart-2)" axisLine={false} tickLine={false} />
              <Tooltip
                wrapperClassName="dashboard-chart-tooltip"
                formatter={(value, name) => [name === 'revenue' ? formatCurrency(value) : value, name === 'revenue' ? 'Doanh thu' : 'Đơn hàng']}
              />
              <Bar yAxisId="left" name="revenue" dataKey="revenue" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="right" name="orders" dataKey="orders" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
