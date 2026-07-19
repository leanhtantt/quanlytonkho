import crypto from 'node:crypto';
import { prisma } from '../prismaClient';
import { HEAVY_TX_OPTIONS } from '../transactionOptions';
import { BusinessError } from '../errors/BusinessError';

const ACCESS_TOKEN_REFRESH_WINDOW_MS = 30 * 60 * 1000;

// 2 lần thử x 8s = tối đa 16s, phải luôn nhỏ hơn timeout 20s của HEAVY_TX_OPTIONS
// vì refreshAccessToken gọi Shopee bên trong transaction đang giữ khóa ShopeeShop.
const FETCH_TIMEOUT_MS = 8_000;

const SHOPEE_HOSTS = {
  sandbox: 'https://openplatform.sandbox.test-stable.shopee.sg',
  live: 'https://partner.shopeemobile.com',
} as const;

type ShopeeEnvironment = keyof typeof SHOPEE_HOSTS;
type ShopeePrimitive = string | number | boolean | bigint;

interface ShopeeConfig {
  partnerId: string;
  partnerKey: string;
  environment: ShopeeEnvironment;
  host: string;
  redirectUrl: string;
}

interface ShopeeRequestOptions {
  method?: 'GET' | 'POST';
  query?: Record<string, ShopeePrimitive | undefined>;
  body?: unknown;
}

interface ShopeeResponse {
  error?: unknown;
  message?: unknown;
  request_id?: unknown;
}

interface ShopeeShopRecord {
  id: bigint;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  isActive: boolean;
}

interface TokenDates {
  expiresAt: Date;
  authExpiresAt: Date | null;
}

export interface ShopeeTokenResponse extends ShopeeResponse {
  access_token: string;
  refresh_token: string;
  expire_in: number;
  refresh_token_expire_in?: number;
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error('Thiếu biến môi trường ' + name + '.');
  }
  return value;
}

export function loadShopeeConfig(): ShopeeConfig {
  const environment = (process.env.SHOPEE_ENV || 'sandbox').trim().toLowerCase();
  if (environment !== 'sandbox' && environment !== 'live') {
    throw new Error('SHOPEE_ENV chỉ nhận sandbox hoặc live.');
  }

  const partnerId = readRequiredEnv('SHOPEE_PARTNER_ID');
  if (!/^\d+$/.test(partnerId)) {
    throw new Error('SHOPEE_PARTNER_ID phải là số nguyên.');
  }

  return {
    partnerId,
    partnerKey: readRequiredEnv('SHOPEE_PARTNER_KEY'),
    environment,
    host: SHOPEE_HOSTS[environment],
    redirectUrl: readRequiredEnv('SHOPEE_REDIRECT_URL'),
  };
}

function sign(baseString: string, partnerKey: string): string {
  return crypto.createHmac('sha256', partnerKey).update(baseString).digest('hex');
}

export function signShopeePublicRequest(
  partnerId: string,
  partnerKey: string,
  path: string,
  timestamp: number,
): string {
  return sign(partnerId + path + timestamp, partnerKey);
}

export function signShopeeShopRequest(
  partnerId: string,
  partnerKey: string,
  path: string,
  timestamp: number,
  accessToken: string,
  shopId: bigint,
): string {
  return sign(partnerId + path + timestamp + accessToken + String(shopId), partnerKey);
}

function getShopeeError(payload: ShopeeResponse): string | null {
  if (payload.error === undefined || payload.error === null || payload.error === '') {
    return null;
  }
  return String(payload.error);
}

function mapShopeeError(payload: ShopeeResponse): void {
  const error = getShopeeError(payload);
  if (!error) return;

  const message = typeof payload.message === 'string' && payload.message.trim()
    ? ': ' + payload.message.trim()
    : '';
  throw new BusinessError('Shopee trả lỗi ' + error + message + '.');
}

function validateTokenResponse(token: ShopeeTokenResponse, now: number, action: string): TokenDates {
  if (
    typeof token.access_token !== 'string' || !token.access_token.trim()
    || typeof token.refresh_token !== 'string' || !token.refresh_token.trim()
    || !Number.isFinite(token.expire_in) || token.expire_in <= 0
  ) {
    throw new Error('Shopee trả về token ' + action + ' không đầy đủ.');
  }

  const authExpiresAt = Number.isFinite(token.refresh_token_expire_in) && (token.refresh_token_expire_in || 0) > 0
    ? new Date(now + Number(token.refresh_token_expire_in) * 1000)
    : null;

  return {
    expiresAt: new Date(now + token.expire_in * 1000),
    authExpiresAt,
  };
}

export class ShopeeClient {
  constructor(
    private readonly config: ShopeeConfig = loadShopeeConfig(),
    private readonly now: () => number = Date.now,
  ) {}

  getAuthorizationUrl(): string {
    const path = '/api/v2/shop/auth_partner';
    const timestamp = this.timestamp();
    const url = this.createUrl(path, {
      partner_id: this.config.partnerId,
      timestamp,
      sign: signShopeePublicRequest(this.config.partnerId, this.config.partnerKey, path, timestamp),
      redirect: this.config.redirectUrl,
    });
    return url.toString();
  }

  async exchangeAuthorizationCode(
    code: string,
    shopId: bigint,
    region = this.config.environment === 'live' ? 'VN' : 'SG',
  ): Promise<ShopeeTokenResponse> {
    const token = await this.requestPublic<ShopeeTokenResponse>('/api/v2/auth/token/get', {
      method: 'POST',
      body: {
        code,
        partner_id: Number(this.config.partnerId),
        shop_id: Number(shopId),
      },
    });
    const dates = validateTokenResponse(token, this.now(), 'đổi authorization code');

    await prisma.shopeeShop.upsert({
      where: { id: shopId },
      update: {
        region,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: dates.expiresAt,
        authExpiresAt: dates.authExpiresAt,
        isActive: true,
      },
      create: {
        id: shopId,
        region,
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: dates.expiresAt,
        authExpiresAt: dates.authExpiresAt,
      },
    });

    return token;
  }

  async getShopInfo<T = ShopeeResponse>(shopId: bigint): Promise<T> {
    return this.requestForShop<T>(shopId, '/api/v2/shop/get_shop_info');
  }

  async requestPublic<T>(path: string, options: ShopeeRequestOptions = {}): Promise<T> {
    const timestamp = this.timestamp();
    return this.send<T>(path, {
      ...(options.query || {}),
      partner_id: this.config.partnerId,
      timestamp,
      sign: signShopeePublicRequest(this.config.partnerId, this.config.partnerKey, path, timestamp),
    }, options);
  }

  async requestForShop<T>(shopId: bigint, path: string, options: ShopeeRequestOptions = {}): Promise<T> {
    const shop = await this.getUsableShop(shopId);
    const timestamp = this.timestamp();

    return this.send<T>(path, {
      ...(options.query || {}),
      partner_id: this.config.partnerId,
      timestamp,
      sign: signShopeeShopRequest(
        this.config.partnerId,
        this.config.partnerKey,
        path,
        timestamp,
        shop.accessToken,
        shop.id,
      ),
      access_token: shop.accessToken,
      shop_id: shop.id,
    }, options);
  }

  private async getUsableShop(shopId: bigint): Promise<ShopeeShopRecord> {
    const shop = await prisma.shopeeShop.findUnique({ where: { id: shopId } });
    if (!shop || !shop.isActive) {
      throw new BusinessError('Shop Shopee chưa được kết nối hoặc đã ngắt kết nối.');
    }

    if (shop.expiresAt.getTime() - this.now() < ACCESS_TOKEN_REFRESH_WINDOW_MS) {
      return this.refreshAccessToken(shopId);
    }

    return shop;
  }

  private async refreshAccessToken(shopId: bigint): Promise<ShopeeShopRecord> {
    return prisma.$transaction(async (tx) => {
      const [shop] = await tx.$queryRaw<ShopeeShopRecord[]>`
        SELECT "id", "accessToken", "refreshToken", "expiresAt", "isActive"
        FROM "ShopeeShop"
        WHERE "id" = ${shopId}
        FOR UPDATE
      `;

      if (!shop || !shop.isActive) {
        throw new BusinessError('Shop Shopee chưa được kết nối hoặc đã ngắt kết nối.');
      }

      // Một request khác có thể đã refresh token trong lúc request này chờ khóa.
      if (shop.expiresAt.getTime() - this.now() >= ACCESS_TOKEN_REFRESH_WINDOW_MS) {
        return shop;
      }

      const token = await this.requestPublic<ShopeeTokenResponse>('/api/v2/auth/access_token/get', {
        method: 'POST',
        body: {
          partner_id: Number(this.config.partnerId),
          refresh_token: shop.refreshToken,
          shop_id: Number(shop.id),
        },
      });
      const dates = validateTokenResponse(token, this.now(), 'refresh');

      return tx.shopeeShop.update({
        where: { id: shop.id },
        data: {
          accessToken: token.access_token,
          refreshToken: token.refresh_token,
          expiresAt: dates.expiresAt,
          authExpiresAt: dates.authExpiresAt,
        },
      });
    }, HEAVY_TX_OPTIONS);
  }

  private timestamp(): number {
    return Math.floor(this.now() / 1000);
  }

  private createUrl(path: string, query: Record<string, ShopeePrimitive | undefined>): URL {
    const url = new URL(this.config.host + path);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  }

  private async send<T>(
    path: string,
    query: Record<string, ShopeePrimitive | undefined>,
    options: ShopeeRequestOptions,
  ): Promise<T> {
    const response = await this.fetchWithSingleRetry(this.createUrl(path, query), options);
    const responseText = await response.text();

    let payload: ShopeeResponse;
    try {
      payload = responseText ? JSON.parse(responseText) : {};
    } catch {
      throw new Error('Shopee trả response không phải JSON.');
    }

    mapShopeeError(payload);
    if (!response.ok) {
      throw new Error('Shopee trả HTTP ' + response.status + '.');
    }

    return payload as T;
  }

  private async fetchWithSingleRetry(url: URL, options: ShopeeRequestOptions): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await fetch(url, {
          method: options.method || 'GET',
          headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError instanceof Error && lastError.name === 'TimeoutError') {
      throw new Error(
        'Shopee không phản hồi sau ' + (FETCH_TIMEOUT_MS / 1000) + ' giây (đã thử 2 lần). Kiểm tra mạng/VPN tới ' + this.config.host + '.',
      );
    }

    throw lastError;
  }
}
