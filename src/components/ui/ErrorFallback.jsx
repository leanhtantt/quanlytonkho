import { IconAlertTriangle } from '@tabler/icons-react';
import Button from './Button';

/**
 * Fallback UI hiển thị khi ErrorBoundary bắt được lỗi runtime.
 * Dùng component chuẩn, không phụ thuộc state nào của app.
 */
export default function ErrorFallback({ error, resetError }) {
  return (
    <div className="login-page">
      <section className="login-card" aria-labelledby="error-fallback-title">
        <div className="login-brand">
          <IconAlertTriangle size={48} className="login-brand-icon" style={{ color: 'var(--color-danger)' }} />
        </div>
        <h2 id="error-fallback-title" className="login-heading">Đã xảy ra lỗi</h2>
        <p>Ứng dụng gặp sự cố không mong muốn. Vui lòng thử tải lại trang.</p>
        {import.meta.env.DEV && error && (
          <pre className="text-caption" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 'var(--space-4)', textAlign: 'left' }}>
            {error.message || String(error)}
          </pre>
        )}
        <div style={{ marginTop: 'var(--space-4)', display: 'flex', gap: 'var(--space-2)', justifyContent: 'center' }}>
          <Button onClick={() => window.location.reload()}>Tải lại trang</Button>
          {resetError && <Button variant="secondary" onClick={resetError}>Thử lại</Button>}
        </div>
      </section>
    </div>
  );
}
