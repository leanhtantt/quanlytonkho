import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock('firebase-admin/app', () => ({
  getApps: () => [{}],
  initializeApp: vi.fn(),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: mocks.verifyIdToken }),
}));

vi.mock('../prismaClient', () => ({
  prisma: { user: { findUnique: mocks.findUnique } },
}));

import {
  AuthRequest,
  clearUserAuthorizationCache,
  requireAdmin,
  requireAuth,
  requirePermission,
} from './authMiddleware';

function createResponse() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response;
}

function createRequest(token = 'valid-token') {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as AuthRequest;
}

describe('requireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearUserAuthorizationCache();
  });

  it('từ chối request không có Bearer token', async () => {
    const req = createRequest('');
    const res = createResponse();
    const next = vi.fn();

    await requireAuth(req, res as never, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('cho admin claim boolean true đi qua mà không đọc bảng User', async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: 'admin-uid', admin: true });
    const req = createRequest();
    const res = createResponse();
    const next = vi.fn();

    await requireAuth(req, res as never, next);

    expect(req.isAdmin).toBe(true);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it('không coi claim admin dạng chuỗi là admin', async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: 'user-uid', admin: 'true' });
    mocks.findUnique.mockResolvedValue(null);
    const res = createResponse();

    await requireAuth(createRequest(), res as never, vi.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.findUnique).toHaveBeenCalledOnce();
  });

  it('default-deny khi không có User record', async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: 'unknown-uid' });
    mocks.findUnique.mockResolvedValue(null);
    const res = createResponse();

    await requireAuth(createRequest(), res as never, vi.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Forbidden: Tài khoản chưa được quản trị viên cấp quyền.',
    });
  });

  it('default-deny khi User bị vô hiệu hóa', async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: 'disabled-uid' });
    mocks.findUnique.mockResolvedValue({
      id: 'disabled-uid',
      email: 'disabled@example.com',
      role: 'staff',
      permissions: {},
      isActive: false,
    });
    const res = createResponse();

    await requireAuth(createRequest(), res as never, vi.fn());

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Forbidden: Tài khoản đã bị vô hiệu hóa.',
    });
  });

  it('gắn User record active và dùng cache cho request tiếp theo', async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: 'staff-uid' });
    mocks.findUnique.mockResolvedValue({
      id: 'staff-uid',
      email: 'staff@example.com',
      role: 'staff',
      permissions: { orders: ['view'] },
      isActive: true,
    });

    const firstReq = createRequest();
    const secondReq = createRequest();
    await requireAuth(firstReq, createResponse() as never, vi.fn());
    await requireAuth(secondReq, createResponse() as never, vi.fn());

    expect(firstReq.userRecord?.permissions).toEqual({ orders: ['view'] });
    expect(mocks.findUnique).toHaveBeenCalledOnce();
  });
});

describe('requirePermission', () => {
  it('cho admin đi qua mọi quyền', () => {
    const next = vi.fn();
    requirePermission('orders', 'delete')(
      { isAdmin: true } as AuthRequest,
      createResponse() as never,
      next
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it('cho user có đúng action đi qua và từ chối action còn thiếu', () => {
    const req = {
      userRecord: {
        id: 'staff-uid',
        email: 'staff@example.com',
        role: 'staff',
        permissions: { orders: ['view'] },
        isActive: true,
      },
    } as unknown as AuthRequest;
    const allowedNext = vi.fn();
    const deniedNext = vi.fn();
    const deniedResponse = createResponse();

    requirePermission('orders', 'view')(req, createResponse() as never, allowedNext);
    requirePermission('orders', 'delete')(req, deniedResponse as never, deniedNext);

    expect(allowedNext).toHaveBeenCalledOnce();
    expect(deniedResponse.status).toHaveBeenCalledWith(403);
    expect(deniedNext).not.toHaveBeenCalled();
  });

  it('trả 403 cho user không có quyền xem activity', () => {
    const response = createResponse();
    const next = vi.fn();
    const req = {
      userRecord: {
        id: 'staff-uid',
        email: 'staff@example.com',
        role: 'staff',
        permissions: { orders: ['view'] },
        isActive: true,
      },
    } as unknown as AuthRequest;

    requirePermission('activity', 'view')(req, response as never, next);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireAdmin', () => {
  it('từ chối user thường với 403', () => {
    const response = createResponse();
    const next = vi.fn();

    requireAdmin({ isAdmin: false } as AuthRequest, response as never, next);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('chỉ cho claim admin boolean true đi qua', () => {
    const next = vi.fn();

    requireAdmin({ isAdmin: true } as AuthRequest, createResponse() as never, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
