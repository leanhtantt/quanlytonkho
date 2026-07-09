import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, ShoppingCart, Truck, ShieldAlert, TrendingUp } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Orders from './pages/Orders';
import Purchases from './pages/Purchases';
import Losses from './pages/Losses';
import Profit from './pages/Profit';
import Treasury from './pages/Treasury';
import Settings from './pages/Settings';
import Login from './pages/Login';
import { useAuth } from './lib/AuthContext';
import { Wallet, Settings as SettingsIcon, LogOut } from 'lucide-react';
import { useAppStore } from './store/appStoreContext';

function Sidebar() {
  const location = useLocation();
  const { logout, user } = useAuth();

  const menuItems = [
    { path: '/', name: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { path: '/purchases', name: 'Nhập Hàng', icon: <Truck size={20} /> },
    { path: '/products', name: 'Tồn Kho', icon: <Package size={20} /> },
    { path: '/orders', name: 'Xuất Bán', icon: <ShoppingCart size={20} /> },
    { path: '/losses', name: 'Hao Hụt', icon: <ShieldAlert size={20} /> },
    { path: '/profit', name: 'Lợi Nhuận', icon: <TrendingUp size={20} /> },
    { path: '/treasury', name: 'Sổ Quỹ', icon: <Wallet size={20} /> },
    { path: '/settings', name: 'Cài Đặt', icon: <SettingsIcon size={20} /> },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">
          <Package size={24} />
        </div>
        <span>Cưới Hỏi BAP</span>
      </div>
      <nav className="nav-list" aria-label="Điều hướng chính">
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
      </nav>
      <div className="sidebar-footer">
        <span className="sidebar-user-email" title={user?.email}>{user?.email}</span>
        <button className="nav-item logout-btn" onClick={logout}>
          <LogOut size={20} />
          Đăng xuất
        </button>
      </div>
    </div>
  );
}

function App() {
  const { user } = useAuth();
  const { loading } = useAppStore();

  // ponytail: no auth = login page, no router needed for unauthenticated state
  if (!user) return <Login />;
  
  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <p>Đang tải dữ liệu...</p>
      </div>
    );
  }

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
              <Route path="/treasury" element={<Treasury />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </div>
        </div>
      </div>
    </Router>
  );
}

export default App;

