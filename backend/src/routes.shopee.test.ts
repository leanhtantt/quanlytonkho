import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const allow = vi.fn((_req: unknown, _res: unknown, next: () => void) => next());

  return {
    allow,
    requirePermission: vi.fn(() => allow),
    getAuthorizationUrl: vi.fn(),
    exchangeAuthorizationCode: vi.fn(),
    getShopInfo: vi.fn(),
    ShopeeClient: vi.fn(),
    shopFindMany: vi.fn(),
    shopFindUnique: vi.fn(),
    shopUpdate: vi.fn(),
  };
});

vi.mock('./prismaClient', () => ({
  prisma: {
    shopeeShop: {
      findMany: mocks.shopFindMany,
      findUnique: mocks.shopFindUnique,
      update: mocks.shopUpdate,
    },
  },
}));

vi.mock('./services/shopeeClient', () => ({
  ShopeeClient: mocks.ShopeeClient,
}));

vi.mock('./services/orderService', () => ({
  createOrder: vi.fn(),
  replaceOrder: vi.fn(),
  deleteOrder: vi.fn(),
}));
vi.mock('./services/procurementService', () => ({
  createPurchaseOrder: vi.fn(),
  replacePurchaseOrder: vi.fn(),
  deletePurchaseOrder: vi.fn(),
}));
vi.mock('./services/financeService', () => ({
  recordLoss: vi.fn(),
  replaceLoss: vi.fn(),
  deleteLoss: vi.fn(),
}));
vi.mock('./services/inventoryAdjustmentService', () => ({
  createSurplusAdjustment: vi.fn(),
  deleteSurplusAdjustment: vi.fn(),
  replaceSurplusAdjustment: vi.fn(),
}));
vi.mock('firebase-admin/app', () => ({ getApps: () => [{}], initializeApp: vi.fn() }));
vi.mock('firebase-admin/storage', () => ({ getStorage: vi.fn() }));
vi.mock('./middlewares/authMiddleware', () => ({
  requireAdmin: mocks.allow,
  requirePermission: mocks.requirePermission,
}));
vi.mock('./routes/users', () => ({ usersRouter: mocks.allow }));
vi.mock('./routes/activity', () => ({ activityRouter: mocks.allow }));
vi.mock('./middlewares/activityLogMiddleware', () => ({ flushActivityLogsBeforeResponse: mocks.allow }));
vi.mock('./audit/loginActivity', () => ({ writeLoginActivityOnce: vi.fn() }));

mocks.ShopeeClient.mockImplementation(function ShopeeClientMock() {
  return {
    getAuthorizationUrl: mocks.getAuthorizationUrl,
    exchangeAuthorizationCode: mocks.exchangeAuthorizationCode,
    getShopInfo: mocks.getShopInfo,
  };
});

import { apiRouter } from './routes';

const routePermissionCalls = mocks.requirePermission.mock.calls.map(call => [...call]);
const SHOP_ID = 227_758_409n;

const connectedShop = {
  id: SHOP_ID,
  shopName: 'Sandbox shop',
  region: 'SG',
  expiresAt: new Date('2026-07-18T04:00:00.000Z'),
  authExpiresAt: new Date('2027-07-18T00:00:00.000Z'),
  isActive: true,
  createdAt: new Date('2026-07-18T00:00:00.000Z'),
  updatedAt: new Date('2026-07-18T00:00:00.000Z'),
};

function getRouteHandler(path: string, method: 'get' | 'post') {
  const layer = (apiRouter as any).stack.find((entry: any) => (
    entry.route?.path === path && entry.route.methods[method]
  ));
  return layer.route.stack.at(-1).handle;
}

function createResponse() {
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response;
}

describe('Shopee SP2 routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
        mocks.ShopeeClient.mockImplementation(function ShopeeClientMock() {
      return {
        getAuthorizationUrl: mocks.getAuthorizationUrl,
        exchangeAuthorizationCode: mocks.exchangeAuthorizationCode,
        getShopInfo: mocks.getShopInfo,
      };
    });
  });

  it('binds settings permissions to every Shopee route', () => {
    expect(routePermissionCalls).toEqual(expect.arrayContaining([
      ['settings', 'view'],
      ['settings', 'update'],
      ['settings', 'update'],
      ['settings', 'update'],
    ]));
  });

  it('returns the authorization URL without exposing any token', async () => {
    mocks.getAuthorizationUrl.mockReturnValue('https://partner.shopeemobile.com/api/v2/shop/auth_partner?...');
    const response = createResponse();

    await getRouteHandler('/shopee/auth-url', 'get')({}, response, vi.fn());

    expect(mocks.getAuthorizationUrl).toHaveBeenCalledOnce();
    expect(response.json).toHaveBeenCalledWith({
      authorizationUrl: 'https://partner.shopeemobile.com/api/v2/shop/auth_partner?...',
    });
  });

  it('exchanges a one-time code through the client, stores the shop name, and returns safe metadata', async () => {
    mocks.exchangeAuthorizationCode.mockResolvedValue({ access_token: 'secret', refresh_token: 'secret' });
    mocks.getShopInfo.mockResolvedValue({ shop_name: 'Sandbox shop' });
    mocks.shopUpdate.mockResolvedValue(connectedShop);
    mocks.shopFindUnique.mockResolvedValue(connectedShop);
    const response = createResponse();

    await getRouteHandler('/shopee/connect', 'post')({
      body: { code: 'one-time-code', shop_id: SHOP_ID.toString() },
    }, response, vi.fn());

    expect(mocks.exchangeAuthorizationCode).toHaveBeenCalledWith('one-time-code', SHOP_ID);
    expect(mocks.getShopInfo).toHaveBeenCalledWith(SHOP_ID);
    expect(mocks.shopUpdate).toHaveBeenCalledWith({
      where: { id: SHOP_ID },
      data: { shopName: 'Sandbox shop' },
    });
    expect(response.status).toHaveBeenCalledWith(201);

    const body = response.json.mock.calls[0][0];
    expect(body.shop).toMatchObject({ id: SHOP_ID.toString(), shopName: 'Sandbox shop', isActive: true });
    expect(body.shop).not.toHaveProperty('accessToken');
    expect(body.shop).not.toHaveProperty('refreshToken');
  });

  it('rejects an invalid shop_id before calling Shopee', async () => {
    const response = createResponse();

    await getRouteHandler('/shopee/connect', 'post')({ body: { code: 'code', shop_id: '12.5' } }, response, vi.fn());

    expect(response.status).toHaveBeenCalledWith(400);
    expect(mocks.exchangeAuthorizationCode).not.toHaveBeenCalled();
  });

  it('lists safe connection metadata and disconnects by marking the shop inactive', async () => {
    mocks.shopFindMany.mockResolvedValue([connectedShop]);
    const listResponse = createResponse();
    await getRouteHandler('/shopee/shops', 'get')({}, listResponse, vi.fn());

    expect(listResponse.json.mock.calls[0][0]).toEqual({
      shops: [expect.objectContaining({ id: SHOP_ID.toString(), shopName: 'Sandbox shop' })],
    });

    mocks.shopFindUnique.mockResolvedValue({ id: SHOP_ID });
    mocks.shopUpdate.mockResolvedValue({ ...connectedShop, isActive: false });
    const disconnectResponse = createResponse();
    await getRouteHandler('/shopee/shops/:shopId/disconnect', 'post')({
      params: { shopId: SHOP_ID.toString() },
    }, disconnectResponse, vi.fn());

    expect(mocks.shopUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: SHOP_ID },
      data: { isActive: false },
    }));
    expect(disconnectResponse.json.mock.calls[0][0].shop).toMatchObject({ id: SHOP_ID.toString(), isActive: false });
  });
});
