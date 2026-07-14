import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createMany: vi.fn(),
}));

vi.mock('../prismaClient', () => ({
  prisma: {
    activityLog: { createMany: mocks.createMany },
  },
}));

import { auditCrudOperation } from './activityLogExtension';
import { runWithActivityContext } from './activityContext';
import { flushActivityLogs } from './activityLogService';

describe('ActivityLog Prisma extension', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ghi update đơn hàng với before/after và email của người thực hiện', async () => {
    mocks.createMany.mockResolvedValue({ count: 1 });
    const before = {
      id: 'order-id',
      externalCode: 'DH-001',
      status: 'Đang giao',
      updatedAt: new Date('2026-07-14T08:00:00.000Z'),
    };
    const after = {
      ...before,
      status: 'Đã giao',
      updatedAt: new Date('2026-07-14T09:00:00.000Z'),
    };
    const baseClient = {
      order: { findUnique: vi.fn().mockResolvedValue(before) },
    };

    await runWithActivityContext({
      uid: 'staff-uid',
      email: 'staff@example.com',
      ipAddress: '127.0.0.1',
    }, async () => {
      await auditCrudOperation({
        baseClient: baseClient as never,
        model: 'Order',
        operation: 'update',
        args: { where: { id: 'order-id' }, data: { status: 'Đã giao' } },
        query: vi.fn().mockResolvedValue(after),
      });
      await flushActivityLogs();
    });

    expect(mocks.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        actorUid: 'staff-uid',
        actorEmail: 'staff@example.com',
        action: 'update',
        resource: 'orders',
        targetId: 'order-id',
        targetLabel: 'DH-001',
        before: expect.objectContaining({ status: 'Đang giao' }),
        after: expect.objectContaining({ status: 'Đã giao' }),
      })],
    });
  });

  it('bỏ qua update chỉ thay đổi updatedAt', async () => {
    const baseClient = {
      product: { findUnique: vi.fn().mockResolvedValue({ id: 'p-1', sku: 'SP-1', updatedAt: 'old' }) },
    };

    await runWithActivityContext({ uid: 'staff-uid', email: 'staff@example.com' }, async () => {
      await auditCrudOperation({
        baseClient: baseClient as never,
        model: 'Product',
        operation: 'update',
        args: { where: { id: 'p-1' }, data: { updatedAt: new Date() } },
        query: vi.fn().mockResolvedValue({ id: 'p-1', sku: 'SP-1', updatedAt: 'new' }),
      });
      await flushActivityLogs();
    });

    expect(mocks.createMany).not.toHaveBeenCalled();
  });
});
