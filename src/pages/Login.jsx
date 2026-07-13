import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { IconPackage as Package } from '@tabler/icons-react';

export default function Login() {
  const { login, register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegister) {
        await register(email, password);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(
        err.code === 'auth/invalid-credential'
          ? 'Email hoặc mật khẩu không đúng'
          : err.code === 'auth/email-already-in-use'
            ? 'Email đã được sử dụng'
            : err.code === 'auth/weak-password'
              ? 'Mật khẩu phải ít nhất 6 ký tự'
              : err.message
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-logo">
          <Package size={32} />
          <span>Phụ kiện Decor</span>
        </div>
        <h2>{isRegister ? 'Tạo tài khoản' : 'Đăng nhập'}</h2>

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

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Đang xử lý...' : isRegister ? 'Đăng ký' : 'Đăng nhập'}
        </button>

        <p className="login-toggle">
          {isRegister ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}{' '}
          <button type="button" onClick={() => { setIsRegister(!isRegister); setError(''); }}>
            {isRegister ? 'Đăng nhập' : 'Đăng ký'}
          </button>
        </p>
      </form>
    </div>
  );
}
