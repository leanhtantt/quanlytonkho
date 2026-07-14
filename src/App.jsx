import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import {
  IconLayoutDashboard as LayoutDashboard,
  IconPackage as Package,
  IconShoppingCart as ShoppingCart,
  IconTruck as Truck,
  IconShieldExclamation as ShieldAlert,
  IconTrendingUp as TrendingUp,
  IconWallet as Wallet,
  IconSettings as SettingsIcon,
  IconLogout as LogOut,
  IconUsers as UsersIcon,
} from '@tabler/icons-react';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Orders from './pages/Orders';
import Purchases from './pages/Purchases';
import Losses from './pages/Losses';
import Profit from './pages/Profit';
import Treasury from './pages/Treasury';
import Settings from './pages/Settings';
import Users from './pages/Users';
import Login from './pages/Login';
import { useAuth } from './lib/AuthContext';
import { useAppStore } from './store/appStoreContext';
import HealthStatus from './components/HealthStatus';
import AppToaster from './components/ui/Toast';
import Button from './components/ui/Button';
import Skeleton from './components/ui/Skeleton';

const menuItems = [
  { path: '/', name: 'Dashboard', icon: LayoutDashboard, resource: 'dashboard' },
  { path: '/purchases', name: 'Nhập Hàng', icon: Truck, resource: 'purchases' },
  { path: '/products', name: 'Tồn Kho', icon: Package, resource: 'products' },
  { path: '/orders', name: 'Xuất Bán', icon: ShoppingCart, resource: 'orders' },
  { path: '/losses', name: 'Điều Chỉnh Kho', icon: ShieldAlert, resource: 'losses' },
  { path: '/profit', name: 'Lợi Nhuận', icon: TrendingUp, resource: 'profit' },
  { path: '/treasury', name: 'Sổ Quỹ', icon: Wallet, resource: 'treasury' },
  { path: '/settings', name: 'Cài Đặt', icon: SettingsIcon, resource: 'settings' },
  { path: '/users', name: 'Người dùng', icon: UsersIcon, adminOnly: true },
];

function getVisibleMenuItems(can, isAdmin) {
  return menuItems.filter((item) => (
    item.adminOnly ? isAdmin : can(item.resource, 'view')
  ));
}

function Sidebar() {
  const location = useLocation();
  const { logout, user, can, isAdmin } = useAuth();
  const visibleMenuItems = getVisibleMenuItems(can, isAdmin);

  return (
    <div className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">
          <Package size={24} />
        </div>
        <span>Phụ kiện Decor</span>
      </div>
      <nav className="nav-list" aria-label="Điều hướng chính">
        {visibleMenuItems.map((item) => {
          const Icon = item.icon;

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            >
              <Icon size={20} />
              {item.name}
            </Link>
          );
        })}
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

function RouteGuard({ allowed, fallbackPath, children }) {
  if (allowed) return children;
  if (fallbackPath) return <Navigate to={fallbackPath} replace />;

  return (
    <section className="login-page">
      <div className="login-card">
        <h2>Chưa có quyền truy cập</h2>
        <p>Tài khoản của bạn chưa được cấp quyền cho bất kỳ màn hình nào.</p>
      </div>
    </section>
  );
}

function App() {
  const { user, loading: authLoading, isUnauthorized, profileError, logout, can, isAdmin } = useAuth();
  const { loading } = useAppStore();
  const visibleMenuItems = getVisibleMenuItems(can, isAdmin);
  const fallbackPath = visibleMenuItems[0]?.path;

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

  if (!fallbackPath) {
    return (
      <>
        <AppToaster />
        <div className="login-page">
          <section className="login-card">
            <h2>Chưa có quyền truy cập</h2>
            <p>Tài khoản của bạn chưa được cấp quyền cho bất kỳ màn hình nào.</p>
            <Button onClick={logout}>Đăng xuất</Button>
          </section>
        </div>
      </>
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
              <Route path="/" element={<RouteGuard allowed={can('dashboard', 'view')} fallbackPath={fallbackPath}><Dashboard /></RouteGuard>} />
              <Route path="/purchases" element={<RouteGuard allowed={can('purchases', 'view')} fallbackPath={fallbackPath}><Purchases /></RouteGuard>} />
              <Route path="/products" element={<RouteGuard allowed={can('products', 'view')} fallbackPath={fallbackPath}><Products /></RouteGuard>} />
              <Route path="/orders" element={<RouteGuard allowed={can('orders', 'view')} fallbackPath={fallbackPath}><Orders /></RouteGuard>} />
              <Route path="/losses" element={<RouteGuard allowed={can('losses', 'view')} fallbackPath={fallbackPath}><Losses /></RouteGuard>} />
              <Route path="/profit" element={<RouteGuard allowed={can('profit', 'view')} fallbackPath={fallbackPath}><Profit /></RouteGuard>} />
              <Route path="/treasury" element={<RouteGuard allowed={can('treasury', 'view')} fallbackPath={fallbackPath}><Treasury /></RouteGuard>} />
              <Route path="/settings" element={<RouteGuard allowed={can('settings', 'view')} fallbackPath={fallbackPath}><Settings /></RouteGuard>} />
              <Route path="/users" element={<RouteGuard allowed={isAdmin} fallbackPath={fallbackPath}><Users /></RouteGuard>} />
              <Route path="*" element={<Navigate to={fallbackPath} replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </Router>
  );
}

export default App;
