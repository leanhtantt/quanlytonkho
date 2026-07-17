import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  allow: (_req: unknown, _res: unknown, next: () => void) => next(),
  productFindMany: vi.fn(),
  aliasFindMany: vi.fn(),
  orderFindUnique: vi.fn(),
  orderFindMany: vi.fn(),
  createOrder: vi.fn(),
  replaceOrder: vi.fn(),
  deleteOrder: vi.fn(),
  createPurchaseOrder: vi.fn(),
  replacePurchaseOrder: vi.fn(),
  deletePurchaseOrder: vi.fn(),
  recordLoss: vi.fn(),
  replaceLoss: vi.fn(),
  deleteLoss: vi.fn(),
  createSurplusAdjustment: vi.fn(),
  replaceSurplusAdjustment: vi.fn(),
  deleteSurplusAdjustment: vi.fn(),
}));

vi.mock('./prismaClient', () => ({
  prisma: {
    product: { findMany: mocks.productFindMany },
    productSkuAlias: { findMany: mocks.aliasFindMany },
    order: { findUnique: mocks.orderFindUnique, findMany: mocks.orderFindMany },
  },
}));

vi.mock('./services/orderService', () => ({
  createOrder: mocks.createOrder,
  replaceOrder: mocks.replaceOrder,
  deleteOrder: mocks.deleteOrder,
}));

vi.mock('./services/procurementService', () => ({
  createPurchaseOrder: mocks.createPurchaseOrder,
  replacePurchaseOrder: mocks.replacePurchaseOrder,
  deletePurchaseOrder: mocks.deletePurchaseOrder,
}));

vi.mock('./services/financeService', () => ({
  recordLoss: mocks.recordLoss,
  replaceLoss: mocks.replaceLoss,
  deleteLoss: mocks.deleteLoss,
}));

vi.mock('./services/inventoryAdjustmentService', () => ({
  createSurplusAdjustment: mocks.createSurplusAdjustment,
  replaceSurplusAdjustment: mocks.replaceSurplusAdjustment,
  deleteSurplusAdjustment: mocks.deleteSurplusAdjustment,
}));

vi.mock('firebase-admin/app', () => ({
  getApps: () => [{}],
  initializeApp: vi.fn(),
}));

vi.mock('firebase-admin/storage', () => ({
  getStorage: vi.fn(),
}));

vi.mock('./middlewares/authMiddleware', () => ({
  requireAdmin: mocks.allow,
  requirePermission: () => mocks.allow,
}));

vi.mock('./routes/users', () => ({ usersRouter: mocks.allow }));
vi.mock('./routes/activity', () => ({ activityRouter: mocks.allow }));
vi.mock('./middlewares/activityLogMiddleware', () => ({
  flushActivityLogsBeforeResponse: mocks.allow,
}));
vi.mock('./audit/loginActivity', () => ({ writeLoginActivityOnce: vi.fn() }));

import { apiRouter } from './routes';

const product = {
  id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  sku: 'SKU-THUONG',
  name: 'Regular product',
  skuAliases: [],
};

const aliasProduct = {
  id: '11111111-2222-4333-8aaa-444444444444',
  sku: 'SKU-GOC',
  name: 'Alias product',
  skuAliases: [{ sku: 'SKU-ALIAS' }],
};

function orderPostHandler() {
  const layer = (apiRouter as any).stack.find((entry: any) => (
    entry.route?.path === '/orders' && entry.route.methods.post
  ));
  return layer.route.stack[0].handle;
}

function orderGetHandler() {
  const layer = (apiRouter as any).stack.find((entry: any) => (
    entry.route?.path === '/orders' && entry.route.methods.get
  ));
  return layer.route.stack[0].handle;
}

function createResponse() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response;
}

function createOrderBody(productId: string, sku?: string) {
  return {
    id: 'DH-S2-001',
    date: '2026-07-17',
    shop: 'Shopee',
    items: [{
      productId,
      sku,
      qty: 1,
      sellingPrice: 120000,
    }],
  };
}

function mappedOrder(productId: string) {
  return {
    id: 'order-db-id',
    externalCode: 'DH-S2-001',
    channel: 'Shopee',
    status: 'In delivery',
    orderedAt: new Date('2026-07-17T00:00:00.000Z'),
    expectedRevenue: 120000,
    actualRevenue: null,
    packagingFee: 0,
    returnFee: 0,
    platformFee: 0,
    marketingFee: 0,
    settlementDate: null,
    note: null,
    orderItems: [{
      productId,
      skuAtOrder: 'SKU-THUONG',
      qty: 1,
      sellingPrice: 120000,
      isReturned: false,
      product: { sku: 'SKU-THUONG', name: 'Regular product' },
    }],
  };
}

async function postOrder(body: ReturnType<typeof createOrderBody>) {
  const response = createResponse();
  mocks.createOrder.mockResolvedValue({ id: 'order-db-id' });
  mocks.orderFindUnique.mockResolvedValue(mappedOrder(product.id));
  await orderPostHandler()({ body }, response);
  return response;
}

describe('POST /orders product-code resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.productFindMany.mockResolvedValue([]);
    mocks.aliasFindMany.mockResolvedValue([]);
  });

  it('creates an order from a case-insensitive SKU', async () => {
    mocks.productFindMany.mockResolvedValue([product]);

    await postOrder(createOrderBody('sku-thuong'));

    expect(mocks.createOrder).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({ productId: product.id })],
    }));
    expect(mocks.productFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [{ sku: { in: ['SKU-THUONG'] } }] },
    }));
  });

  it('creates an order from an alias SKU', async () => {
    mocks.aliasFindMany.mockResolvedValue([{ product: aliasProduct }]);

    await postOrder(createOrderBody('sku-alias'));

    expect(mocks.createOrder).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({ productId: aliasProduct.id })],
    }));
    expect(mocks.aliasFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { sku: { in: ['SKU-ALIAS'] } },
    }));
  });

  it('creates an order from a case-insensitive UUID', async () => {
    mocks.productFindMany.mockResolvedValue([product]);

    await postOrder(createOrderBody(product.id.toUpperCase()));

    expect(mocks.createOrder).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({ productId: product.id })],
    }));
    expect(mocks.productFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [
          { sku: { in: [product.id.toUpperCase()] } },
          { id: { in: [product.id] } },
        ],
      },
    }));
  });

  it('lists orders newest first', async () => {
    mocks.orderFindMany.mockResolvedValue([mappedOrder(product.id)]);
    const response = createResponse();

    await orderGetHandler()({}, response);

    expect(mocks.orderFindMany).toHaveBeenCalledWith({
      include: { orderItems: { include: { product: true } } },
      orderBy: { orderedAt: 'desc' },
    });
    expect(response.json).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: 'DH-S2-001' }),
    ]));
  });

  it('keeps the existing error for a missing SKU', async () => {
    const response = await postOrder(createOrderBody('khong-ton-tai'));

    expect(mocks.createOrder).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      error: expect.stringContaining('khong-ton-tai'),
    });
  });
});
