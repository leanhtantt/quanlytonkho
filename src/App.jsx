import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, ShoppingCart, Truck, ShieldAlert, TrendingUp } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Orders from './pages/Orders';
import Purchases from './pages/Purchases';
import Losses from './pages/Losses';
import Profit from './pages/Profit';

function Sidebar() {
  const location = useLocation();

  const menuItems = [
    { path: '/', name: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { path: '/purchases', name: 'Nhập Hàng', icon: <Truck size={20} /> },
    { path: '/products', name: 'Tồn Kho', icon: <Package size={20} /> },
    { path: '/orders', name: 'Xuất Bán', icon: <ShoppingCart size={20} /> },
    { path: '/losses', name: 'Hao Hụt', icon: <ShieldAlert size={20} /> },
    { path: '/profit', name: 'Lợi Nhuận', icon: <TrendingUp size={20} /> },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <div style={{ background: 'var(--color-primary)', color: 'white', padding: '6px', borderRadius: '8px', display: 'flex' }}>
          <Package size={24} />
        </div>
        <span>Cưới Hỏi BAP</span>
      </div>
      <div style={{ marginTop: '2rem' }}>
        {menuItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
          >
            {item.icon}
            {item.name}
          </Link>
        ))}
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <div className="app-container">
        <Sidebar />
        <div className="main-content">
          <div className="page-wrapper">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/purchases" element={<Purchases />} />
              <Route path="/products" element={<Products />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/losses" element={<Losses />} />
              <Route path="/profit" element={<Profit />} />
            </Routes>
          </div>
        </div>
      </div>
    </Router>
  );
}

export default App;
