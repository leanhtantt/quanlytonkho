import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { IconLayoutDashboard as LayoutDashboard, IconPackage as Package, IconShoppingCart as ShoppingCart, IconTruck as Truck, IconShieldExclamation as ShieldAlert, IconTrendingUp as TrendingUp } from '@tabler/icons-react';
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
import { IconWallet as Wallet, IconSettings as SettingsIcon, IconLogout as LogOut } from '@tabler/icons-react';
import { useAppStore } from './store/appStoreContext';

import HealthStatus from './components/HealthStatus';
import AppToaster from './components/ui/Toast';
import Button from './components/ui/Button';
import Skeleton from './components/ui/Skeleton';

function Sidebar() {
  const location = useLocation();
  const { logout, user } = useAuth();

  const menuItems = [
    { path: '/', name: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { path: '/purchases', name: 'Nhập Hàng', icon: <Truck size={20} /> },
    { path: '/products', name: 'Tồn Kho', icon: <Package size={20} /> },
    { path: '/orders', name: 'Xuất Bán', icon: <ShoppingCart size={20} /> },
    { path: '/losses', name: 'Điều Chỉnh Kho', icon: <ShieldAlert size={20} /> },
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
        <span>Phụ kiện Decor</span>
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
        <div style={{ marginBottom: '12px', padding: '0 16px' }}>
          <HealthStatus />
        </div>
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
  const { user, loading: authLoading, isUnauthorized, profileError, logout } = useAuth();
  const { loading } = useAppStore();

  if (authLoading) {
    return (
      <div className="login-page">
        <div className="login-card" aria-busy="true">
          <Skeleton width="180px" height="28px" />
          <Skeleton lines={2} />
        </div>
      </div>
    );
  }

  if (!user) return <Login />;

  if (isUnauthorized) {
    return (
      <div className="login-page">
        <section className="login-card" aria-labelledby="access-denied-title">
          <h2 id="access-denied-title">Tài khoản chưa được cấp quyền</h2>
          <p>Tài khoản của bạn chưa được cấp quyền, liên hệ quản trị viên.</p>
          <Button onClick={logout}>Đăng xuất</Button>
        </section>
      </div>
    );
  }

  if (profileError) {
    return (
      <div className="login-page">
        <section className="login-card" aria-labelledby="profile-error-title">
          <h2 id="profile-error-title">Không thể tải quyền truy cập</h2>
          <p>Vui lòng kiểm tra kết nối API hoặc đăng nhập lại.</p>
          <Button onClick={logout}>Đăng xuất</Button>
        </section>
      </div>
    );
  }
  
  if (loading) {
    return (
      <>
        <AppToaster />
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <p>Đang tải dữ liệu...</p>
      </div>
      </>
    );
  }

  return (
    <Router>
      <AppToaster />
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
