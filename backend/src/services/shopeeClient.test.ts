import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  shopFindUnique: vi.fn(),
  shopUpdate: vi.fn(),
  shopUpsert: vi.fn(),
  transaction: vi.fn(),
  shopQueryRaw: vi.fn(),
}));

vi.mock('../prismaClient', () => ({
  prisma: {
    $transaction: mocks.transaction,
    shopeeShop: {
      findUnique: mocks.shopFindUnique,
      update: mocks.shopUpdate,
      upsert: mocks.shopUpsert,
    },
  },
}));

import { BusinessError } from '../errors/BusinessError';
import {
  ShopeeClient,
  signShopeePublicRequest,
  signShopeeShopRequest,
} from './shopeeClient';

const now = new Date('2026-07-18T00:00:00.000Z').getTime();
const SHOP_ID = 227_758_409n;
const config = {
  partnerId: '1238615',
  partnerKey: 'partner-key',
  environment: 'sandbox',
  host: 'https://openplatform.sandbox.test-stable.shopee.sg',
  redirectUrl: 'https://example.com/shopee/callback',
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function transactionClient() {
  return {
    $queryRaw: mocks.shopQueryRaw,
    shopeeShop: {
      update: mocks.shopUpdate,
    },
  };
}

describe('ShopeeClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('signs public and shop-level requests with their distinct base strings', () => {
    const path = '/api/v2/shop/get_shop_info';
    const timestamp = 1_752_796_800;
    const expectedPublic = crypto
      .createHmac('sha256', config.partnerKey)
      .update(config.partnerId + path + timestamp)
      .digest('hex');
    const expectedShop = crypto
      .createHmac('sha256', config.partnerKey)
      .update(config.partnerId + path + timestamp + 'access-token' + String(SHOP_ID))
      .digest('hex');

    expect(signShopeePublicRequest(config.partnerId, config.partnerKey, path, timestamp)).toBe(expectedPublic);
    expect(
      signShopeeShopRequest(config.partnerId, config.partnerKey, path, timestamp, 'access-token', SHOP_ID),
    ).toBe(expectedShop);
  });

  it('validates and persists a newly exchanged authorization code token', async () => {
    mocks.fetch.mockResolvedValue(response({
      error: '',
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expire_in: 14_400,
    }));
    mocks.shopUpsert.mockResolvedValue({ id: SHOP_ID });

    const result = await new ShopeeClient(config as never, () => now)
      .exchangeAuthorizationCode('authorization-code', SHOP_ID);

    expect(result.access_token).toBe('access-token');
    expect(mocks.shopUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: SHOP_ID },
      update: expect.objectContaining({
        region: 'SG',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date(now + 14_400_000),
      }),
      create: expect.objectContaining({
        id: SHOP_ID,
        region: 'SG',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
    }));
  });

  it('reads the authoritative authorization expiry from get_shops_by_partner', async () => {
    mocks.fetch.mockResolvedValue(response({
      error: '',
      authed_shop_list: [{
        shop_id: Number(SHOP_ID),
        auth_time: 1_784_480_136,
        expire_time: 1_816_016_136,
        region: 'SG',
      }],
    }));

    const result = await new ShopeeClient(config as never, () => now).getShopAuthorization(SHOP_ID);

    expect(result).toEqual({
      authorizedAt: new Date(1_784_480_136_000),
      authExpiresAt: new Date(1_816_016_136_000),
      region: 'SG',
    });
    const url = new URL(mocks.fetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/v2/public/get_shops_by_partner');
    expect(url.searchParams.get('access_token')).toBeNull();
  });

  it('refreshes a token about to expire inside a locked transaction, then calls get_shop_info', async () => {
    const tx = transactionClient();
    mocks.transaction.mockImplementation((callback) => callback(tx));
    mocks.shopFindUnique.mockResolvedValue({
      id: SHOP_ID,
      accessToken: 'old-access-token',
      refreshToken: 'old-refresh-token',
      expiresAt: new Date(now + 29 * 60 * 1000),
      isActive: true,
    });
    mocks.shopQueryRaw.mockResolvedValue([{
      id: SHOP_ID,
      accessToken: 'old-access-token',
      refreshToken: 'old-refresh-token',
      expiresAt: new Date(now + 29 * 60 * 1000),
      isActive: true,
    }]);
    mocks.shopUpdate.mockResolvedValue({
      id: SHOP_ID,
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expiresAt: new Date(now + 4 * 60 * 60 * 1000),
      isActive: true,
    });
    mocks.fetch
      .mockResolvedValueOnce(response({
        error: '',
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expire_in: 14_400,
      }))
      .mockResolvedValueOnce(response({
        error: '',
        request_id: 'request-id',
        shop_name: 'Sandbox shop',
      }));

    const result = await new ShopeeClient(config as never, () => now).getShopInfo<Record<string, unknown>>(SHOP_ID);

    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.shopQueryRaw).toHaveBeenCalledOnce();
    expect(mocks.shopUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: SHOP_ID },
      data: expect.objectContaining({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresAt: new Date(now + 14_400_000),
      }),
    }));
    expect(mocks.shopUpdate.mock.calls[0][0].data).not.toHaveProperty('authExpiresAt');
    expect(result.shop_name).toBe('Sandbox shop');

    const refreshUrl = new URL(mocks.fetch.mock.calls[0][0]);
    const shopUrl = new URL(mocks.fetch.mock.calls[1][0]);
    expect(refreshUrl.pathname).toBe('/api/v2/auth/access_token/get');
    expect(refreshUrl.searchParams.get('access_token')).toBeNull();
    expect(shopUrl.pathname).toBe('/api/v2/shop/get_shop_info');
    expect(shopUrl.searchParams.get('access_token')).toBe('new-access-token');
    expect(shopUrl.searchParams.get('shop_id')).toBe(String(SHOP_ID));
  });

  it('refreshes only once when two requests reach the expiring token concurrently', async () => {
    const tx = transactionClient();
    let storedShop = {
      id: SHOP_ID,
      accessToken: 'old-access-token',
      refreshToken: 'old-refresh-token',
      expiresAt: new Date(now + 29 * 60 * 1000),
      isActive: true,
    };
    let previousTransaction = Promise.resolve();

    mocks.shopFindUnique.mockImplementation(async () => ({ ...storedShop }));
    mocks.shopQueryRaw.mockImplementation(async () => [{ ...storedShop }]);
    mocks.shopUpdate.mockImplementation(async ({ data }) => {
      storedShop = { ...storedShop, ...data };
      return { ...storedShop };
    });
    mocks.transaction.mockImplementation(async (callback) => {
      const waitForPrevious = previousTransaction;
      let releaseCurrent!: () => void;
      previousTransaction = new Promise<void>((resolve) => {
        releaseCurrent = resolve;
      });
      await waitForPrevious;
      try {
        return await callback(tx);
      } finally {
        releaseCurrent();
      }
    });
    mocks.fetch
      .mockResolvedValueOnce(response({
        error: '',
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expire_in: 14_400,
      }))
      .mockResolvedValueOnce(response({ error: '', request_id: 'request-id' }))
      .mockResolvedValueOnce(response({ error: '', request_id: 'request-id' }));

    await Promise.all([
      new ShopeeClient(config as never, () => now).getShopInfo(SHOP_ID),
      new ShopeeClient(config as never, () => now).getShopInfo(SHOP_ID),
    ]);

    const refreshCalls = mocks.fetch.mock.calls.filter(([url]) => (
      new URL(url).pathname === '/api/v2/auth/access_token/get'
    ));
    expect(refreshCalls).toHaveLength(1);
    expect(mocks.shopUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
  });

  it('retries once for a network failure', async () => {
    mocks.fetch
      .mockRejectedValueOnce(new TypeError('network unavailable'))
      .mockResolvedValueOnce(response({ error: '', request_id: 'request-id' }));

    await new ShopeeClient(config as never, () => now).requestPublic('/api/v2/public/get_shop_info_by_shop_id');

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('passes an abort signal so a hung request cannot block forever', async () => {
    mocks.fetch.mockResolvedValue(response({ error: '', request_id: 'request-id' }));

    await new ShopeeClient(config as never, () => now).requestPublic('/api/v2/public/get_shop_info_by_shop_id');

    expect(mocks.fetch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('turns repeated fetch timeouts into a plain Error naming the host', async () => {
    const timeoutError = Object.assign(new Error('The operation was aborted due to timeout'), {
      name: 'TimeoutError',
    });
    mocks.fetch.mockRejectedValue(timeoutError);

    const request = new ShopeeClient(config as never, () => now)
      .requestPublic('/api/v2/public/get_shop_info_by_shop_id');

    await expect(request).rejects.toThrow('Shopee không phản hồi sau 8 giây');
    await expect(request).rejects.not.toBeInstanceOf(BusinessError);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('maps Shopee error responses to BusinessError', async () => {
    mocks.fetch.mockResolvedValue(response({
      error: 'error_auth',
      message: 'access token is invalid',
    }));

    await expect(
      new ShopeeClient(config as never, () => now).requestPublic('/api/v2/public/get_shop_info_by_shop_id'),
    ).rejects.toBeInstanceOf(BusinessError);
  });
});
