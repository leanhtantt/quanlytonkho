import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  shopFindUnique: vi.fn(),
  shopUpdate: vi.fn(),
}));

vi.mock('../prismaClient', () => ({
  prisma: {
    shopeeShop: {
      findUnique: mocks.shopFindUnique,
      update: mocks.shopUpdate,
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
      .update(config.partnerId + path + timestamp + 'access-token' + 227758409)
      .digest('hex');

    expect(signShopeePublicRequest(config.partnerId, config.partnerKey, path, timestamp)).toBe(expectedPublic);
    expect(
      signShopeeShopRequest(config.partnerId, config.partnerKey, path, timestamp, 'access-token', 227758409),
    ).toBe(expectedShop);
  });

  it('refreshes a token about to expire, persists both rotated tokens, then calls get_shop_info', async () => {
    mocks.shopFindUnique.mockResolvedValue({
      id: 227758409,
      accessToken: 'old-access-token',
      refreshToken: 'old-refresh-token',
      expiresAt: new Date(now + 29 * 60 * 1000),
      isActive: true,
    });
    mocks.shopUpdate.mockResolvedValue({
      id: 227758409,
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

    const result = await new ShopeeClient(config as never, () => now).getShopInfo<Record<string, unknown>>(227758409);

    expect(mocks.shopUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 227758409 },
      data: expect.objectContaining({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresAt: new Date(now + 14_400_000),
      }),
    }));
    expect(result.shop_name).toBe('Sandbox shop');

    const refreshUrl = new URL(mocks.fetch.mock.calls[0][0]);
    const shopUrl = new URL(mocks.fetch.mock.calls[1][0]);
    expect(refreshUrl.pathname).toBe('/api/v2/auth/access_token/get');
    expect(refreshUrl.searchParams.get('access_token')).toBeNull();
    expect(shopUrl.pathname).toBe('/api/v2/shop/get_shop_info');
    expect(shopUrl.searchParams.get('access_token')).toBe('new-access-token');
    expect(shopUrl.searchParams.get('shop_id')).toBe('227758409');
  });

  it('retries once for a network failure', async () => {
    mocks.fetch
      .mockRejectedValueOnce(new TypeError('network unavailable'))
      .mockResolvedValueOnce(response({ error: '', request_id: 'request-id' }));

    await new ShopeeClient(config as never, () => now).requestPublic('/api/v2/public/get_shop_info_by_shop_id');

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
