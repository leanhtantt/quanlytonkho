import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clearCache: vi.fn(),
  firebaseCreateUser: vi.fn(),
  firebaseDeleteUser: vi.fn(),
  firebaseGetUser: vi.fn(),
  firebaseUpdateUser: vi.fn(),
  revokeRefreshTokens: vi.fn(),
  prismaFindMany: vi.fn(),
  prismaCreate: vi.fn(),
  prismaFindUnique: vi.fn(),
  prismaUpdate: vi.fn(),
  writeActivityLog: vi.fn(),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    createUser: mocks.firebaseCreateUser,
    deleteUser: mocks.firebaseDeleteUser,
    getUser: mocks.firebaseGetUser,
    updateUser: mocks.firebaseUpdateUser,
    revokeRefreshTokens: mocks.revokeRefreshTokens,
  }),
}));

vi.mock('../middlewares/authMiddleware', () => ({
  clearUserAuthorizationCache: mocks.clearCache,
}));

vi.mock('../prismaClient', () => ({
  prisma: {
    user: {
      findMany: mocks.prismaFindMany,
      create: mocks.prismaCreate,
      findUnique: mocks.prismaFindUnique,
      update: mocks.prismaUpdate,
    },
  },
}));

vi.mock('../audit/activityLogService', () => ({
  writeActivityLog: mocks.writeActivityLog,
}));

import { createUser, resetUserPassword, updateUser } from './users';

function createResponse() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response;
}

function createRequest(body: unknown, uid?: string) {
  return {
    body,
    params: uid ? { uid } : {},
    user: { uid: 'admin-uid' },
    isAdmin: true,
  };
}

const validPermissions = {
  orders: ['view', 'create'],
  products: ['view'],
};

const activeDbUser = {
  id: 'staff-uid',
  email: 'staff@example.com',
  displayName: 'Nhân viên',
  role: 'staff',
  permissions: validPermissions,
  isActive: true,
  createdAt: new Date('2026-07-14T00:00:00.000Z'),
};

describe('users API handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.firebaseCreateUser.mockResolvedValue({
      uid: 'staff-uid',
      email: 'staff@example.com',
    });
    mocks.firebaseDeleteUser.mockResolvedValue(undefined);
    mocks.firebaseGetUser.mockResolvedValue({
      uid: 'staff-uid',
      email: 'staff@example.com',
      displayName: 'Nhân viên',
      disabled: false,
      customClaims: {},
    });
    mocks.firebaseUpdateUser.mockResolvedValue({ uid: 'staff-uid' });
    mocks.revokeRefreshTokens.mockResolvedValue(undefined);
    mocks.prismaFindUnique.mockResolvedValue(activeDbUser);
    mocks.prismaCreate.mockResolvedValue(activeDbUser);
    mocks.prismaUpdate.mockResolvedValue(activeDbUser);
    mocks.writeActivityLog.mockResolvedValue(undefined);
  });

  it('từ chối tạo user có role admin trước khi gọi Firebase', async () => {
    const response = createResponse();

    await createUser(
      createRequest({
        email: 'admin@example.com',
        password: 'secret123',
        role: 'admin',
        permissions: {},
      }) as never,
      response as never,
      vi.fn()
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(mocks.firebaseCreateUser).not.toHaveBeenCalled();
  });

  it('từ chối permissions có resource hoặc action không hợp lệ', async () => {
    const response = createResponse();

    await createUser(
      createRequest({
        email: 'staff@example.com',
        password: 'secret123',
        role: 'staff',
        permissions: { unknown: ['view'], orders: ['approve'] },
      }) as never,
      response as never,
      vi.fn()
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(mocks.firebaseCreateUser).not.toHaveBeenCalled();
  });

  it('không cho cấp quyền activity hoặc users qua API quản lý user', async () => {
    const response = createResponse();

    await createUser(
      createRequest({
        email: 'staff@example.com',
        password: 'secret123',
        role: 'staff',
        permissions: { activity: ['view'], users: ['view'] },
      }) as never,
      response as never,
      vi.fn()
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(mocks.firebaseCreateUser).not.toHaveBeenCalled();
  });

  it('tạo Firebase user và User record hợp lệ, không truyền custom claim', async () => {
    const response = createResponse();

    await createUser(
      createRequest({
        email: 'STAFF@example.com',
        password: 'secret123',
        displayName: 'Nhân viên',
        role: 'staff',
        permissions: validPermissions,
      }) as never,
      response as never,
      vi.fn()
    );

    expect(mocks.firebaseCreateUser).toHaveBeenCalledWith({
      email: 'staff@example.com',
      password: 'secret123',
      displayName: 'Nhân viên',
      disabled: false,
    });
    expect(mocks.prismaCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        id: 'staff-uid',
        role: 'staff',
        permissions: validPermissions,
        createdBy: 'admin-uid',
      }),
    }));
    expect(mocks.clearCache).toHaveBeenCalledWith('staff-uid');
    expect(mocks.writeActivityLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'create',
      resource: 'users',
      targetId: 'staff-uid',
    }));
    expect(response.status).toHaveBeenCalledWith(201);
  });

  it('rollback Firebase user nếu Prisma create lỗi', async () => {
    mocks.prismaCreate.mockRejectedValue(new Error('database unavailable'));
    const response = createResponse();

    await createUser(
      createRequest({
        email: 'staff@example.com',
        password: 'secret123',
        role: 'viewer',
        permissions: {},
      }) as never,
      response as never,
      vi.fn()
    );

    expect(mocks.firebaseDeleteUser).toHaveBeenCalledWith('staff-uid');
    expect(response.status).toHaveBeenCalledWith(500);
  });

  it('từ chối nâng role thành admin qua PUT', async () => {
    const response = createResponse();

    await updateUser(
      createRequest({ role: 'admin' }, 'staff-uid') as never,
      response as never,
      vi.fn()
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(mocks.firebaseGetUser).not.toHaveBeenCalled();
    expect(mocks.prismaUpdate).not.toHaveBeenCalled();
  });

  it('disable user, revoke refresh token và xóa authorization cache', async () => {
    const disabledUser = { ...activeDbUser, isActive: false };
    mocks.prismaUpdate.mockResolvedValue(disabledUser);
    const response = createResponse();

    await updateUser(
      createRequest({ isActive: false }, 'staff-uid') as never,
      response as never,
      vi.fn()
    );

    expect(mocks.firebaseUpdateUser).toHaveBeenCalledWith('staff-uid', { disabled: true });
    expect(mocks.revokeRefreshTokens).toHaveBeenCalledWith('staff-uid');
    expect(mocks.prismaUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'staff-uid' },
      data: { isActive: false },
    }));
    expect(mocks.clearCache).toHaveBeenCalledWith('staff-uid');
    expect(mocks.writeActivityLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'disable',
      resource: 'users',
      targetId: 'staff-uid',
    }));
    expect(response.json).toHaveBeenCalledWith(disabledUser);
  });

  it('chặn sửa target có custom claim admin', async () => {
    mocks.firebaseGetUser.mockResolvedValue({
      uid: 'target-admin',
      disabled: false,
      customClaims: { admin: true },
    });
    const response = createResponse();

    await updateUser(
      createRequest({ isActive: false }, 'target-admin') as never,
      response as never,
      vi.fn()
    );

    expect(response.status).toHaveBeenCalledWith(403);
    expect(mocks.firebaseUpdateUser).not.toHaveBeenCalled();
    expect(mocks.prismaUpdate).not.toHaveBeenCalled();
  });

  it('đặt lại mật khẩu user thường qua Firebase Admin', async () => {
    const response = createResponse();

    await resetUserPassword(
      createRequest({ password: 'new-secret-123' }, 'staff-uid') as never,
      response as never,
      vi.fn()
    );

    expect(mocks.firebaseUpdateUser).toHaveBeenCalledWith('staff-uid', {
      password: 'new-secret-123',
    });
    expect(mocks.clearCache).toHaveBeenCalledWith('staff-uid');
    expect(mocks.writeActivityLog).toHaveBeenCalledWith({
      action: 'reset-password',
      resource: 'users',
      targetId: 'staff-uid',
      targetLabel: 'staff@example.com',
    });
    expect(response.json).toHaveBeenCalledWith({ success: true });
  });

  it('chặn reset password target có custom claim admin', async () => {
    mocks.firebaseGetUser.mockResolvedValue({
      uid: 'target-admin',
      disabled: false,
      customClaims: { admin: true },
    });
    const response = createResponse();

    await resetUserPassword(
      createRequest({ password: 'new-secret-123' }, 'target-admin') as never,
      response as never,
      vi.fn()
    );

    expect(response.status).toHaveBeenCalledWith(403);
    expect(mocks.firebaseUpdateUser).not.toHaveBeenCalled();
  });
});
