import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
}));

vi.mock('../prismaClient', () => ({
  prisma: {
    activityLog: {
      findMany: mocks.findMany,
      count: mocks.count,
    },
  },
}));

import { listActivity } from './activity';

function createResponse() {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response;
}

describe('activity API handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([{ id: 'log-1', action: 'update' }]);
    mocks.count.mockResolvedValue(1);
  });

  it('phân trang và lọc theo actor, resource, action, khoảng ngày', async () => {
    const response = createResponse();

    await listActivity({
      query: {
        page: '2',
        pageSize: '10',
        actorUid: 'staff-uid',
        resource: 'orders',
        action: 'update',
        from: '2026-07-01',
        to: '2026-07-14',
      },
    } as never, response as never, vi.fn());

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 10,
      take: 10,
      where: expect.objectContaining({
        actorUid: 'staff-uid',
        resource: 'orders',
        action: 'update',
        createdAt: expect.objectContaining({
          gte: new Date('2026-07-01'),
          lte: new Date('2026-07-14T23:59:59.999'),
        }),
      }),
    }));
    expect(response.json).toHaveBeenCalledWith({
      data: [{ id: 'log-1', action: 'update' }],
      total: 1,
      page: 2,
      pageSize: 10,
    });
  });

  it('từ chối khoảng ngày không hợp lệ', async () => {
    const response = createResponse();

    await listActivity({ query: { from: 'not-a-date' } } as never, response as never, vi.fn());

    expect(response.status).toHaveBeenCalledWith(400);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
