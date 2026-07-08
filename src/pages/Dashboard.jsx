import { Package, ShoppingCart, DollarSign, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
  { name: 'Mon', revenue: 4000, orders: 24 },
  { name: 'Tue', revenue: 3000, orders: 13 },
  { name: 'Wed', revenue: 2000, orders: 98 },
  { name: 'Thu', revenue: 2780, orders: 39 },
  { name: 'Fri', revenue: 1890, orders: 48 },
  { name: 'Sat', revenue: 2390, orders: 38 },
  { name: 'Sun', revenue: 3490, orders: 43 },
];

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
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>Overview of your store's performance</p>
        </div>
        <button className="btn btn-primary">
          <ShoppingCart size={18} />
          New Order
        </button>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', 
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        <StatCard 
          title="Total Revenue" 
          value="$24,562" 
          icon={DollarSign} 
          trend="vs last month" 
          trendValue="+12.5%" 
          type="increase"
        />
        <StatCard 
          title="Total Orders" 
          value="456" 
          icon={ShoppingCart} 
          trend="vs last month" 
          trendValue="+5.2%" 
          type="increase"
        />
        <StatCard 
          title="Total Products" 
          value="1,240" 
          icon={Package} 
          trend="In inventory" 
          trendValue="0" 
          type="neutral"
        />
        <StatCard 
          title="Low Stock" 
          value="12" 
          icon={AlertCircle} 
          trend="Needs restock" 
          trendValue="-2" 
          type="decrease"
        />
      </div>

      <div className="card" style={{ height: '400px', marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1.5rem', fontSize: '1.125rem' }}>Revenue & Orders Overview</h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'var(--color-text-muted)'}} />
            <YAxis yAxisId="left" orientation="left" stroke="var(--color-primary)" axisLine={false} tickLine={false} />
            <YAxis yAxisId="right" orientation="right" stroke="var(--color-success)" axisLine={false} tickLine={false} />
            <Tooltip 
              contentStyle={{ backgroundColor: 'var(--color-bg-surface)', borderColor: 'var(--color-border)', borderRadius: 'var(--radius-md)' }}
              itemStyle={{ color: 'var(--color-text-base)' }}
            />
            <Bar yAxisId="left" dataKey="revenue" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            <Bar yAxisId="right" dataKey="orders" fill="var(--color-success)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
