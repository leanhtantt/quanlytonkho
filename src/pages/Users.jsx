import { useCallback, useEffect, useRef, useState } from 'react';
import { IconKey, IconPlus, IconRefresh, IconUsers } from '@tabler/icons-react';
import { api } from '../lib/api';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import EmptyState from '../components/ui/EmptyState';
import FormField from '../components/ui/FormField';
import Modal from '../components/ui/Modal';
import PageHeader from '../components/ui/PageHeader';
import Skeleton from '../components/ui/Skeleton';
import { toast } from '../components/ui/toastHelper';

const permissionResources = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'purchases', label: 'Nhập hàng' },
  { key: 'products', label: 'Tồn kho' },
  { key: 'orders', label: 'Xuất bán' },
  { key: 'losses', label: 'Điều chỉnh kho' },
  { key: 'profit', label: 'Lợi nhuận' },
  { key: 'treasury', label: 'Sổ quỹ' },
  { key: 'settings', label: 'Cài đặt' },
];

const permissionActions = [
  { key: 'view', label: 'Xem' },
  { key: 'create', label: 'Thêm' },
  { key: 'update', label: 'Sửa' },
  { key: 'delete', label: 'Xóa' },
];

const roleLabels = {
  manager: 'Quản lý',
  staff: 'Nhân viên',
  viewer: 'Chỉ xem',
};

function clonePermissions(permissions = {}) {
  return Object.fromEntries(
    Object.entries(permissions).map(([resource, actions]) => [resource, [...actions]]),
  );
}

function permissionsForRole(role) {
  const allActions = permissionActions.map((action) => action.key);

  if (role === 'manager') {
    return Object.fromEntries(permissionResources.map(({ key }) => [key, [...allActions]]));
  }

  if (role === 'staff') {
    return {
      dashboard: ['view'],
      purchases: ['view', 'create', 'update'],
      products: ['view', 'create', 'update'],
      orders: ['view', 'create', 'update'],
      losses: ['view', 'create', 'update'],
    };
  }

  return Object.fromEntries(permissionResources.map(({ key }) => [key, ['view']]));
}

function createUserDraft(role = 'staff') {
  return {
    email: '',
    displayName: '',
    password: '',
    role,
    permissions: permissionsForRole(role),
  };
}

function formatCreatedAt(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function PermissionMatrix({ permissions, onChange }) {
  const togglePermission = (resource, action, checked) => {
    const next = clonePermissions(permissions);
    const actions = new Set(next[resource] || []);

    if (checked) actions.add(action);
    else actions.delete(action);

    if (actions.size === 0) delete next[resource];
    else next[resource] = permissionActions
      .map(({ key }) => key)
      .filter((key) => actions.has(key));

    onChange(next);
  };

  return (
    <div className="table-responsive">
      <table className="table">
        <thead>
          <tr>
            <th>Tab</th>
            {permissionActions.map((action) => <th key={action.key} className="users-permission-table__action">{action.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {permissionResources.map((resource) => (
            <tr key={resource.key}>
              <td>{resource.label}</td>
              {permissionActions.map((action) => {
                const checked = permissions[resource.key]?.includes(action.key) || false;
                const inputId = `permission-${resource.key}-${action.key}`;

                return (
                  <td key={action.key} className="users-permission-table__action">
                    <input
                      id={inputId}
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => togglePermission(resource.key, action.key, event.target.checked)}
                      aria-label={`${resource.label}: ${action.label}`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState(() => createUserDraft());
  const [creating, setCreating] = useState(false);
  const [statusTarget, setStatusTarget] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [passwordConfirmationTarget, setPasswordConfirmationTarget] = useState(null);
  const [resettingPassword, setResettingPassword] = useState(false);
  const createEmailRef = useRef(null);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const result = await api.getUsers();
      setUsers(Array.isArray(result) ? result : []);
    } catch (error) {
      toast.error(error.message || 'Không thể tải danh sách người dùng.');
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const closeCreateModal = (force = false) => {
    if (creating && !force) return;
    setCreateOpen(false);
    setCreateDraft(createUserDraft());
  };

  const handleRoleChange = (role) => {
    setCreateDraft((current) => ({
      ...current,
      role,
      permissions: permissionsForRole(role),
    }));
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    if (createDraft.password.length < 6) {
      toast.error('Mật khẩu tạm thời phải có ít nhất 6 ký tự.');
      return;
    }

    setCreating(true);
    try {
      const createdUser = await api.createUser({
        email: createDraft.email.trim(),
        displayName: createDraft.displayName.trim() || null,
        password: createDraft.password,
        role: createDraft.role,
        permissions: createDraft.permissions,
      });
      setUsers((current) => [createdUser, ...current]);
      toast.success(`Đã tạo tài khoản ${createdUser.email}.`);
      closeCreateModal(true);
    } catch (error) {
      toast.error(error.message || 'Không thể tạo tài khoản.');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!statusTarget) return;

    const nextIsActive = !statusTarget.isActive;
    setUpdatingStatus(true);
    try {
      const updatedUser = await api.updateUser(statusTarget.id, { isActive: nextIsActive });
      setUsers((current) => current.map((user) => (
        user.id === updatedUser.id ? { ...user, ...updatedUser } : user
      )));
      toast.success(nextIsActive ? 'Đã kích hoạt tài khoản.' : 'Đã vô hiệu hóa tài khoản.');
      setStatusTarget(null);
    } catch (error) {
      toast.error(error.message || 'Không thể cập nhật trạng thái tài khoản.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const openResetPassword = (user) => {
    setPasswordTarget(user);
    setNewPassword('');
  };

  const requestPasswordReset = (event) => {
    event.preventDefault();
    if (newPassword.length < 6) {
      toast.error('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    setPasswordConfirmationTarget(passwordTarget);
    setPasswordTarget(null);
  };

  const handleResetPassword = async () => {
    if (!passwordConfirmationTarget) return;

    setResettingPassword(true);
    try {
      await api.resetUserPassword(passwordConfirmationTarget.id, newPassword);
      toast.success(`Đã đặt lại mật khẩu cho ${passwordConfirmationTarget.email}.`);
      setPasswordConfirmationTarget(null);
      setNewPassword('');
    } catch (error) {
      toast.error(error.message || 'Không thể đặt lại mật khẩu.');
    } finally {
      setResettingPassword(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Người dùng"
        description="Tạo tài khoản, cấp quyền và quản lý trạng thái truy cập."
        actions={(
          <div className="users-header-actions">
            <Button variant="secondary" icon={IconRefresh} onClick={loadUsers} loading={loadingUsers}>
              Làm mới
            </Button>
            <Button icon={IconPlus} onClick={() => setCreateOpen(true)}>
              Tạo người dùng
            </Button>
          </div>
        )}
      />

      {loadingUsers ? (
        <section className="card" aria-busy="true">
          <Skeleton lines={6} />
        </section>
      ) : users.length === 0 ? (
        <EmptyState
          icon={IconUsers}
          title="Chưa có người dùng"
          description="Tạo tài khoản đầu tiên để cấp quyền truy cập hệ thống."
          action={<Button icon={IconPlus} onClick={() => setCreateOpen(true)}>Tạo người dùng</Button>}
        />
      ) : (
        <section className="card">
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Tên</th>
                  <th>Vai trò</th>
                  <th>Trạng thái</th>
                  <th>Ngày tạo</th>
                  <th aria-label="Thao tác" />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="users-table__email">{user.email}</td>
                    <td>{user.displayName || '—'}</td>
                    <td>{roleLabels[user.role] || user.role}</td>
                    <td><Badge variant={user.isActive ? 'success' : 'danger'}>{user.isActive ? 'Đang hoạt động' : 'Đã vô hiệu hóa'}</Badge></td>
                    <td>{formatCreatedAt(user.createdAt)}</td>
                    <td>
                      <div className="users-row-actions">
                        <Button
                          size="sm"
                          variant={user.isActive ? 'danger' : 'secondary'}
                          onClick={() => setStatusTarget(user)}
                        >
                          {user.isActive ? 'Vô hiệu hóa' : 'Kích hoạt'}
                        </Button>
                        <Button size="sm" variant="secondary" icon={IconKey} onClick={() => openResetPassword(user)}>
                          Đặt lại mật khẩu
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <Modal
        open={createOpen}
        onClose={closeCreateModal}
        title="Tạo người dùng"
        initialFocusRef={createEmailRef}
        closeOnOverlayClick={!creating}
        closeOnEscape={!creating}
        footer={(
          <>
            <Button variant="secondary" onClick={closeCreateModal} disabled={creating}>Hủy</Button>
            <Button type="submit" form="create-user-form" loading={creating}>Tạo tài khoản</Button>
          </>
        )}
      >
        <form id="create-user-form" onSubmit={handleCreateUser}>
          <div className="users-modal-form">
            <FormField label="Email">
              <input
                ref={createEmailRef}
                type="email"
                value={createDraft.email}
                onChange={(event) => setCreateDraft((current) => ({ ...current, email: event.target.value }))}
                autoComplete="email"
                required
              />
            </FormField>
            <FormField label="Tên hiển thị" helpText="Có thể để trống.">
              <input
                type="text"
                value={createDraft.displayName}
                onChange={(event) => setCreateDraft((current) => ({ ...current, displayName: event.target.value }))}
                maxLength={100}
              />
            </FormField>
            <FormField label="Mật khẩu tạm">
              <input
                type="password"
                value={createDraft.password}
                onChange={(event) => setCreateDraft((current) => ({ ...current, password: event.target.value }))}
                autoComplete="new-password"
                minLength={6}
                required
              />
            </FormField>
            <FormField label="Vai trò">
              <select value={createDraft.role} onChange={(event) => handleRoleChange(event.target.value)}>
                <option value="manager">Quản lý</option>
                <option value="staff">Nhân viên</option>
                <option value="viewer">Chỉ xem</option>
              </select>
            </FormField>
          </div>

          <section className="users-permission-section" aria-labelledby="permission-matrix-title">
            <h3 id="permission-matrix-title" className="h3">Ma trận quyền</h3>
            <p className="users-permission-help">
              Đổi vai trò sẽ áp dụng quyền mẫu; bạn có thể điều chỉnh từng quyền trước khi tạo.
            </p>
            <PermissionMatrix
              permissions={createDraft.permissions}
              onChange={(permissions) => setCreateDraft((current) => ({ ...current, permissions }))}
            />
          </section>
        </form>
      </Modal>

      <Modal
        open={Boolean(passwordTarget)}
        onClose={() => !resettingPassword && setPasswordTarget(null)}
        title="Đặt lại mật khẩu"
        closeOnOverlayClick={!resettingPassword}
        closeOnEscape={!resettingPassword}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setPasswordTarget(null)} disabled={resettingPassword}>Hủy</Button>
            <Button type="submit" form="reset-user-password-form" loading={resettingPassword}>Tiếp tục</Button>
          </>
        )}
      >
        <form id="reset-user-password-form" onSubmit={requestPasswordReset}>
          <p className="users-reset-copy">Đặt mật khẩu mới cho <strong>{passwordTarget?.email}</strong>.</p>
          <FormField label="Mật khẩu mới">
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </FormField>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(statusTarget)}
        onClose={() => !updatingStatus && setStatusTarget(null)}
        onConfirm={handleUpdateStatus}
        title={statusTarget?.isActive ? 'Vô hiệu hóa tài khoản' : 'Kích hoạt tài khoản'}
        description={statusTarget?.isActive
          ? `Tài khoản ${statusTarget.email} sẽ không thể truy cập hệ thống.`
          : `Tài khoản ${statusTarget?.email} sẽ được phép đăng nhập lại theo quyền đã cấp.`}
        confirmLabel={statusTarget?.isActive ? 'Vô hiệu hóa' : 'Kích hoạt'}
        loading={updatingStatus}
      />

      <ConfirmDialog
        open={Boolean(passwordConfirmationTarget)}
        onClose={() => !resettingPassword && setPasswordConfirmationTarget(null)}
        onConfirm={handleResetPassword}
        title="Xác nhận đặt lại mật khẩu"
        description={`Bạn có chắc muốn đặt lại mật khẩu cho ${passwordConfirmationTarget?.email || ''}?`}
        confirmLabel="Đặt lại mật khẩu"
        loading={resettingPassword}
      />
    </div>
  );
}
