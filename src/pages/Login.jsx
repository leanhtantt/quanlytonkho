import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { IconPackage as Package } from '@tabler/icons-react';
import Button from '../components/ui/Button';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(
        err.code === 'auth/invalid-credential'
          ? 'Email hoặc mật khẩu không đúng'
          : err.message
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <span className="login-logo-mark" aria-hidden="true">
            <Package size={28} />
          </span>
          <div>
            <span className="login-brand-name">Phụ kiện Decor</span>
            <span className="login-brand-caption">Quản lý bán hàng & tồn kho</span>
          </div>
        </div>

        <div className="login-heading">
          <p className="login-eyebrow">Chào mừng trở lại</p>
          <h1>Đăng nhập</h1>
          <p>Truy cập không gian quản trị của cửa hàng.</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </label>

        <label>
          Mật khẩu
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
        </label>

        <Button type="submit" size="lg" loading={loading} className="login-submit">
          {loading ? 'Đang xử lý...' : 'Đăng nhập'}
        </Button>
      </form>
    </div>
  );
}
