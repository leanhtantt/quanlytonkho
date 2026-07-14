import { useCallback, useEffect, useState } from 'react';
import { IconClipboardText, IconRefresh } from '@tabler/icons-react';
import { api } from '../lib/api';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import FormField from '../components/ui/FormField';
import Modal from '../components/ui/Modal';
import PageHeader from '../components/ui/PageHeader';
import Skeleton from '../components/ui/Skeleton';
import { toast } from '../components/ui/toastHelper';

const PAGE_SIZE = 25;

const resourceOptions = [
  ['products', 'Tồn kho'],
  ['purchases', 'Nhập hàng'],
  ['orders', 'Xuất bán'],
  ['losses', 'Điều chỉnh kho'],
  ['treasury', 'Sổ quỹ'],
  ['settings', 'Cài đặt'],
  ['users', 'Người dùng'],
  ['auth', 'Xác thực'],
];

const actionOptions = [
  ['login', 'Đăng nhập'],
  ['create', 'Tạo'],
  ['update', 'Cập nhật'],
  ['delete', 'Xóa'],
  ['disable', 'Vô hiệu hóa'],
  ['reset-password', 'Đặt lại mật khẩu'],
];

const resourceLabels = Object.fromEntries(resourceOptions);
const actionLabels = Object.fromEntries(actionOptions);

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium' }).format(date);
}

function actionVariant(action) {
  if (action === 'delete' || action === 'disable') return 'danger';
  if (action === 'update' || action === 'reset-password') return 'warning';
  if (action === 'login') return 'info';
  return 'success';
}

function formatSnapshot(value) {
  if (!value) return '—';
  return JSON.stringify(value, null, 2);
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <FormField label={label}>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Tất cả</option>
        {options.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select>
    </FormField>
  );
}

export default function Activity() {
  const [draftFilters, setDraftFilters] = useState({ actorUid: '', resource: '', action: '', from: '', to: '' });
  const [filters, setFilters] = useState({ actorUid: '', resource: '', action: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState([]);
  const [total, setTotal] = useState(0);
  const [selectedLog, setSelectedLog] = useState(null);

  const loadActivity = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.getActivity({ ...filters, page, pageSize: PAGE_SIZE });
      setActivity(Array.isArray(result?.data) ? result.data : []);
      setTotal(Number(result?.total) || 0);
    } catch (error) {
      toast.error(error.message || 'Không thể tải lịch sử hoạt động.');
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const applyFilters = (event) => {
    event.preventDefault();
    setFilters(draftFilters);
    setPage(1);
  };

  const resetFilters = () => {
    const empty = { actorUid: '', resource: '', action: '', from: '', to: '' };
    setDraftFilters(empty);
    setFilters(empty);
    setPage(1);
  };

  const updateDraftFilter = (key, value) => {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <div>
      <PageHeader
        title="Lịch sử hoạt động"
        description="Theo dõi các thao tác quan trọng trên hệ thống."
        actions={<Button variant="secondary" icon={IconRefresh} onClick={loadActivity} loading={loading}>Làm mới</Button>}
      />

      <section className="card activity-filter-card">
        <form className="activity-filter-form" onSubmit={applyFilters}>
          <FormField label="UID người thực hiện">
            <input
              type="search"
              placeholder="Nhập UID..."
              value={draftFilters.actorUid}
              onChange={(event) => updateDraftFilter('actorUid', event.target.value)}
            />
          </FormField>
          <FilterSelect label="Đối tượng" value={draftFilters.resource} onChange={(value) => updateDraftFilter('resource', value)} options={resourceOptions} />
          <FilterSelect label="Hành động" value={draftFilters.action} onChange={(value) => updateDraftFilter('action', value)} options={actionOptions} />
          <FormField label="Từ ngày"><input type="date" value={draftFilters.from} onChange={(event) => updateDraftFilter('from', event.target.value)} /></FormField>
          <FormField label="Đến ngày"><input type="date" value={draftFilters.to} onChange={(event) => updateDraftFilter('to', event.target.value)} /></FormField>
          <div className="activity-filter-actions">
            <Button type="submit">Lọc</Button>
            <Button type="button" variant="secondary" onClick={resetFilters}>Xóa lọc</Button>
          </div>
        </form>
      </section>

      {loading ? (
        <section className="card" aria-busy="true"><Skeleton lines={7} /></section>
      ) : activity.length === 0 ? (
        <EmptyState
          icon={IconClipboardText}
          title="Chưa có lịch sử hoạt động"
          description="Thao tác mới sẽ xuất hiện tại đây."
        />
      ) : (
        <>
          <section className="card">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Thời gian</th>
                    <th>Người thực hiện</th>
                    <th>Hành động</th>
                    <th>Đối tượng</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.map((log) => (
                    <tr
                      key={log.id}
                      className="activity-log-row"
                      tabIndex={0}
                      onClick={() => setSelectedLog(log)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedLog(log);
                        }
                      }}
                      aria-label={`Xem chi tiết thao tác ${actionLabels[log.action] || log.action}`}
                    >
                      <td>{formatDate(log.createdAt)}</td>
                      <td>{log.actorEmail || log.actorUid || '—'}</td>
                      <td><Badge variant={actionVariant(log.action)}>{actionLabels[log.action] || log.action}</Badge></td>
                      <td>{log.targetLabel || log.targetId || resourceLabels[log.resource] || log.resource}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="activity-pagination" aria-label="Phân trang lịch sử hoạt động">
            <span>{total.toLocaleString('vi-VN')} bản ghi</span>
            <div>
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Trước</Button>
              <span>Trang {page}/{totalPages}</span>
              <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Sau</Button>
            </div>
          </div>
        </>
      )}

      <Modal
        open={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        title="Chi tiết hoạt động"
        footer={<Button onClick={() => setSelectedLog(null)}>Đóng</Button>}
      >
        <dl className="activity-detail-list">
          <div><dt>Thời gian</dt><dd>{formatDate(selectedLog?.createdAt)}</dd></div>
          <div><dt>Người thực hiện</dt><dd>{selectedLog?.actorEmail || selectedLog?.actorUid || '—'}</dd></div>
          <div><dt>Hành động</dt><dd>{actionLabels[selectedLog?.action] || selectedLog?.action || '—'}</dd></div>
          <div><dt>Đối tượng</dt><dd>{selectedLog?.targetLabel || selectedLog?.targetId || selectedLog?.resource || '—'}</dd></div>
        </dl>
        <div className="activity-snapshots">
          <section>
            <h3 className="h3">Trước khi thay đổi</h3>
            <pre>{formatSnapshot(selectedLog?.before)}</pre>
          </section>
          <section>
            <h3 className="h3">Sau khi thay đổi</h3>
            <pre>{formatSnapshot(selectedLog?.after)}</pre>
          </section>
        </div>
      </Modal>
    </div>
  );
}
