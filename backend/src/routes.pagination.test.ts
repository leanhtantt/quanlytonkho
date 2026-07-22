import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  allow: (_req: unknown, _res: unknown, next: () => void) => next(),
  purchaseFindMany: vi.fn(),
  purchaseCount: vi.fn(),
  orderFindMany: vi.fn(),
  orderCount: vi.fn(),
  lossFindMany: vi.fn(),
  lossCount: vi.fn(),
  treasuryFindMany: vi.fn(),
  treasuryCount: vi.fn(),
}));

vi.mock('./prismaClient', () => ({
  prisma: {
    purchaseOrder: { findMany: mocks.purchaseFindMany, count: mocks.purchaseCount },
    order: { findMany: mocks.orderFindMany, count: mocks.orderCount },
    loss: { findMany: mocks.lossFindMany, count: mocks.lossCount },
    treasuryTransaction: { findMany: mocks.treasuryFindMany, count: mocks.treasuryCount },
  },
}));

vi.mock('firebase-admin/app', () => ({ getApps: () => [{}], initializeApp: vi.fn() }));
vi.mock('firebase-admin/storage', () => ({ getStorage: vi.fn() }));
vi.mock('./middlewares/authMiddleware', () => ({
  requireAdmin: mocks.allow,
  requirePermission: () => mocks.allow,
}));
vi.mock('./routes/users', () => ({ usersRouter: mocks.allow }));
vi.mock('./routes/activity', () => ({ activityRouter: mocks.allow }));
vi.mock('./middlewares/activityLogMiddleware', () => ({ flushActivityLogsBeforeResponse: mocks.allow }));
vi.mock('./audit/loginActivity', () => ({ writeLoginActivityOnce: vi.fn() }));

vi.mock('./services/historyReadService', () => ({
  getReferenceCostMaps: vi.fn().mockResolvedValue({ totalByReference: new Map(), deductionsByReferenceProduct: new Map() }),
  deductionsFor: vi.fn().mockReturnValue({ totalCostDeducted: 0, batchesDeducted: [] }),
  getInventorySnapshot: vi.fn().mockResolvedValue([]),
  getTreasurySnapshot: vi.fn().mockResolvedValue({ balances: {}, openingBalances: {}, capital: {}, marketplaceWallets: [], totalCashProfit: 0 }),
}));
import { apiRouter } from './routes';

function getHandler(path: string) {
  const layer = (apiRouter as any).stack.find((entry: any) => entry.route?.path === path && entry.route.methods.get);
  return layer.route.stack[0].handle;
}

function createResponse() {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response;
}

const purchase = {
  id: 'purchase-db-id', code: 'PO-1', receivedAt: new Date('2026-07-02T00:00:00.000Z'),
  purchaseFee: 0, domesticShipping: 0, intlShipping: 0, totalDiscount: 0, totalCompensation: 0,
  purchaseItems: [],
};
const order = {
  id: 'order-db-id', externalCode: 'ORDER-1', channel: 'Shopee', orderedAt: new Date('2026-07-03T00:00:00.000Z'),
  settlementDate: null, expectedRevenue: 100, actualRevenue: null, packagingFee: 0, returnFee: 0,
  platformFee: 0, marketingFee: 0, orderItems: [],
};
const loss = {
  id: 'loss-db-id', productId: 'product-1', qty: 1, reason: 'Hỏng', occurredAt: new Date('2026-07-04T00:00:00.000Z'),
  product: { sku: 'SKU-1', name: 'Product 1' },
};
const transaction = {
  id: 'treasury-db-id', date: new Date('2026-07-05T00:00:00.000Z'), amount: 500,
};

const cases = [
  {
    path: '/purchases', field: 'receivedAt', row: purchase,
    findMany: mocks.purchaseFindMany, count: mocks.purchaseCount,
  },
  {
    path: '/orders', field: 'orderedAt', row: order,
    findMany: mocks.orderFindMany, count: mocks.orderCount,
  },
  {
    path: '/losses', field: 'occurredAt', row: loss,
    findMany: mocks.lossFindMany, count: mocks.lossCount,
  },
  {
    path: '/treasury/transactions', field: 'date', row: transaction,
    findMany: mocks.treasuryFindMany, count: mocks.treasuryCount,
  },
];

describe('S3 list pagination routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const testCase of cases) {
      testCase.findMany.mockResolvedValue([testCase.row]);
      testCase.count.mockResolvedValue(7);
    }
  });

  it.each(cases)('keeps the legacy array response for $path without params', async testCase => {
    const response = createResponse();
    await getHandler(testCase.path)({ query: {} }, response);

    expect(testCase.count).not.toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith(expect.any(Array));
    expect(response.json.mock.calls[0][0]).toHaveLength(1);
  });

  it.each(cases)('returns a stable filtered page for $path', async testCase => {
    const response = createResponse();
    await getHandler(testCase.path)({
      query: { from: '2026-07-01', to: '2026-07-31', page: '2', limit: '3' },
    }, response);

    const expectedRange = {
      gte: new Date('2026-07-01T00:00:00.000Z'),
      lte: new Date('2026-07-31T23:59:59.999Z'),
    };
    expect(testCase.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { [testCase.field]: expectedRange },
      skip: 3,
      take: 3,
      orderBy: [{ [testCase.field]: 'desc' }, { id: 'desc' }],
    }));
    expect(testCase.count).toHaveBeenCalledWith({ where: { [testCase.field]: expectedRange } });
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      items: expect.any(Array), total: 7, page: 2, limit: 3,
    }));
  });

  it('returns 400 before querying when the range is invalid', async () => {
    const response = createResponse();
    await getHandler('/orders')({ query: { from: '2026-08-01', to: '2026-07-01' } }, response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({ error: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.' });
    expect(mocks.orderFindMany).not.toHaveBeenCalled();
  });
});
