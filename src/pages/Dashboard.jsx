import { useMemo } from 'react';
import { Package, ShoppingCart, DollarSign, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAppStore } from '../store/appStoreContext';
import { calculateProfitAnalytics } from '../domain/profitAnalytics';

function formatCurrency(value) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);
}

const StatCard = ({ title, value, icon: Icon, trend, trendValue, type }) => {
  return (
    <div className="card animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>
            {title}
          </p>
          <h3 style={{ fontSize: '1.875rem', fontWeight: 700 }}>{value}</h3>
        </div>
        <div style={{ 
          padding: '0.75rem', 
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--color-bg-hover)',
          color: 'var(--color-primary)'
        }}>
          <Icon size={24} />
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
};

export default function Dashboard() {
  const { inventory, orders, losses, ads, partners } = useAppStore();

  const { chartData, totalRevenue, totalOrders } = useMemo(() => {
    const profitData = calculateProfitAnalytics(orders, losses, ads, partners);
    const chart = [];
    let rev = 0;
    let ord = 0;

    profitData.forEach(row => {
      if (row.isTotal) {
        chart.push({
          name: row.month,
          revenue: row.actualRevenue,
          orders: row.totalOrders
        });
        rev += row.actualRevenue;
        ord += row.totalOrders;
      }
    });

    return { chartData: chart, totalRevenue: rev, totalOrders: ord };
  }, [orders, losses, ads, partners]);

  const totalProducts = inventory.length;
  const lowStockCount = inventory.filter(p => p.stock < 10).length;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tổng quan Kinh doanh</h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>Theo dõi hiệu quả bán hàng và tồn kho</p>
        </div>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        <StatCard 
          title="Tổng Doanh thu" 
          value={formatCurrency(totalRevenue)} 
          icon={DollarSign} 
          trend="Tất cả thời gian" 
          trendValue="Thực thu" 
          type="increase"
        />
        <StatCard 
          title="Tổng Đơn hàng" 
          value={totalOrders} 
          icon={ShoppingCart} 
          trend="Tất cả thời gian" 
          trendValue="Đơn" 
          type="increase"
        />
        <StatCard 
          title="Sản phẩm trong kho" 
          value={totalProducts} 
          icon={Package} 
          trend="Mã hàng hóa" 
          trendValue="Mã" 
          type="neutral"
        />
        <StatCard 
          title="Sắp Hết Hàng" 
          value={lowStockCount} 
          icon={AlertCircle} 
          trend="Tồn kho < 10" 
          trendValue="Cảnh báo" 
          type="decrease"
        />
      </div>

      <div className="card" style={{ height: '400px', marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1.5rem', fontSize: '1.125rem' }}>Biểu đồ Doanh thu & Đơn hàng theo tháng</h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'var(--color-text-muted)'}} />
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
  );
}
