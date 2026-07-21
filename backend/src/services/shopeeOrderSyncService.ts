import { prisma } from '../prismaClient';
import { BusinessError } from '../errors/BusinessError';
import {
  createOrder,
  OrderInput,
  replaceOrder,
  reverseCancelledOrder,
  updateOrderStatus,
} from './orderService';
import { ShopeeClient } from './shopeeClient';

const LIST_PAGE_SIZE = 100;
const DETAIL_BATCH_SIZE = 50;
const MAX_LIST_PAGES = 100;
const INITIAL_LOOKBACK_SECONDS = 14 * 24 * 60 * 60;
const SYNC_OVERLAP_SECONDS = 5 * 60;

const IMPORTABLE_STATUSES = new Set([
  'READY_TO_SHIP',
  'PROCESSED',
  'SHIPPED',
  'TO_CONFIRM_RECEIVE',
  'COMPLETED',
]);

interface ShopeeOrderListResponse {
  response?: {
    order_list?: Array<{ order_sn?: string }>;
    more?: boolean;
    next_cursor?: string;
  };
}

interface ShopeeOrderItem {
  item_id?: number | string;
  model_id?: number | string;
  item_name?: string;
  model_name?: string;
  item_sku?: string;
  model_sku?: string;
  model_quantity_purchased?: number;
  model_discounted_price?: number;
  model_original_price?: number;
}

interface ShopeeOrderDetail {
  order_sn?: string;
  order_status?: string;
  create_time?: number;
  update_time?: number;
  item_list?: ShopeeOrderItem[];
}

interface ShopeeOrderDetailResponse {
  response?: { order_list?: ShopeeOrderDetail[] };
}

interface UnmappedItem {
  itemId: string;
  modelId: string;
  itemName: string;
  modelName: string | null;
  sku: string;
  qty: number;
}

function chunk<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function positiveBigInt(value: unknown, field: string) {
  try {
    const parsed = BigInt(String(value ?? ''));
    if (parsed <= 0n) throw new Error();
    return parsed;
  } catch {
    throw new Error(`Shopee trả ${field} không hợp lệ.`);
  }
}

function nonnegativeBigInt(value: unknown) {
  if (value === undefined || value === null || value === '') return 0n;
  try {
    const parsed = BigInt(String(value));
    if (parsed < 0n) throw new Error();
    return parsed;
  } catch {
    throw new Error('Shopee trả model_id không hợp lệ.');
  }
}

function positiveInteger(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`Shopee trả ${field} không hợp lệ.`);
  return parsed;
}

function nonnegativeMoney(value: unknown, field: string) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`Shopee kh\u00f4ng tr\u1ea3 ${field}.`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Shopee trả ${field} không hợp lệ.`);
  return parsed;
}

function orderStatus(value: unknown) {
  return String(value || '').trim().toUpperCase();
}

function internalStatus(status: string) {
  return status === 'COMPLETED' ? 'Đã giao' : 'Đang giao';
}

async function listUpdatedOrderSns(
  client: ShopeeClient,
  shopId: bigint,
  timeFrom: number,
  timeTo: number,
) {
  const orderSns: string[] = [];
  let cursor = '';

  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const payload = await client.requestForShop<ShopeeOrderListResponse>(
      shopId,
      '/api/v2/order/get_order_list',
      {
        query: {
          time_range_field: 'update_time',
          time_from: timeFrom,
          time_to: timeTo,
          page_size: LIST_PAGE_SIZE,
          cursor,
        },
      },
    );
    const response = payload.response;
    if (!response || (response.order_list !== undefined && !Array.isArray(response.order_list))) {
      throw new Error('Shopee trả danh sách đơn hàng không đúng định dạng.');
    }
    for (const order of response.order_list || []) {
      const orderSn = String(order.order_sn || '').trim();
      if (!orderSn) throw new Error('Shopee trả order_sn trống.');
      orderSns.push(orderSn);
    }
    if (!response.more) return [...new Set(orderSns)];
    const nextCursor = String(response.next_cursor || '').trim();
    if (!nextCursor || nextCursor === cursor) throw new Error('Shopee trả cursor đơn hàng không hợp lệ.');
    cursor = nextCursor;
  }
  throw new Error('Danh sách đơn Shopee vượt giới hạn phân trang an toàn.');
}

async function loadOrderDetails(client: ShopeeClient, shopId: bigint, orderSns: string[]) {
  const details: ShopeeOrderDetail[] = [];
  for (const orderSnBatch of chunk(orderSns, DETAIL_BATCH_SIZE)) {
    const payload = await client.requestForShop<ShopeeOrderDetailResponse>(
      shopId,
      '/api/v2/order/get_order_detail',
      {
        query: {
          order_sn_list: orderSnBatch.join(','),
          response_optional_fields: 'item_list',
        },
      },
    );
    if (!payload.response || !Array.isArray(payload.response.order_list)) {
      throw new Error('Shopee trả chi tiết đơn hàng không đúng định dạng.');
    }
    details.push(...payload.response.order_list);
  }

  const returned = new Set(details.map(detail => String(detail.order_sn || '').trim()).filter(Boolean));
  const missing = orderSns.filter(orderSn => !returned.has(orderSn));
  if (missing.length > 0) throw new Error(`Shopee không trả chi tiết cho đơn: ${missing.slice(0, 5).join(', ')}.`);
  return details;
}

function comparableItems(items: Array<Record<string, unknown>>) {
  return items.map(item => ({
    productId: String(item.productId),
    skuAtOrder: String(item.skuAtOrder),
    qty: Number(item.qty),
    sellingPrice: Number(item.sellingPrice),
    isReturned: Boolean(item.isReturned),
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function orderNeedsReplace(existing: any, input: OrderInput) {
  return JSON.stringify(comparableItems(existing.orderItems)) !== JSON.stringify(comparableItems(input.items));
}

function preserveReconciliation(existing: any, input: OrderInput): OrderInput {
  const existingMoney = (value: unknown, fallback: number) => value === undefined || value === null
    ? fallback
    : Number(value);
  return {
    ...input,
    packagingFee: existingMoney(existing.packagingFee, input.packagingFee),
    returnFee: existingMoney(existing.returnFee, input.returnFee),
    platformFee: existingMoney(existing.platformFee, input.platformFee),
    marketingFee: existingMoney(existing.marketingFee, input.marketingFee),
    actualRevenue: existing.actualRevenue === undefined || existing.actualRevenue === null
      ? input.actualRevenue
      : Number(existing.actualRevenue),
    settlementDate: existing.settlementDate === undefined
      ? input.settlementDate
      : existing.settlementDate,
    note: existing.note === undefined ? input.note : existing.note,
  };
}

function serializeIssue(issue: any) {
  return {
    id: issue.id,
    orderSn: issue.orderSn,
    orderStatus: issue.orderStatus,
    reason: issue.reason,
    unmappedItems: issue.unmappedItems,
    firstSeenAt: issue.firstSeenAt,
    lastSeenAt: issue.lastSeenAt,
  };
}

export async function getShopeeOrderSyncStatus(shopId: bigint) {
  const shop = await prisma.shopeeShop.findUnique({
    where: { id: shopId },
    select: { id: true, isActive: true, lastOrderSyncAt: true },
  });
  if (!shop?.isActive) throw new BusinessError('Shop Shopee chưa được kết nối hoặc đã ngắt kết nối.');
  const pendingIssues = await prisma.shopeeOrderSyncIssue.findMany({
    where: { shopId, resolvedAt: null },
    orderBy: { firstSeenAt: 'asc' },
  });
  return {
    shopId: shopId.toString(),
    lastOrderSyncAt: shop.lastOrderSyncAt,
    pendingIssues: pendingIssues.map(serializeIssue),
  };
}

export async function syncShopeeOrders(shopId: bigint, client = new ShopeeClient()) {
  const shop = await prisma.shopeeShop.findUnique({
    where: { id: shopId },
    select: { id: true, isActive: true, lastOrderSyncAt: true },
  });
  if (!shop?.isActive) throw new BusinessError('Shop Shopee chưa được kết nối hoặc đã ngắt kết nối.');

  const timeTo = Math.floor(Date.now() / 1000);
  const previousSync = shop.lastOrderSyncAt ? Math.floor(shop.lastOrderSyncAt.getTime() / 1000) : null;
  const timeFrom = Math.max(1, previousSync
    ? Math.min(previousSync - SYNC_OVERLAP_SECONDS, timeTo - 1)
    : timeTo - INITIAL_LOOKBACK_SECONDS);

  const [updatedOrderSns, unresolvedIssues] = await Promise.all([
    listUpdatedOrderSns(client, shopId, timeFrom, timeTo),
    prisma.shopeeOrderSyncIssue.findMany({ where: { shopId, resolvedAt: null } }),
  ]);
  const orderSns = [...new Set([...updatedOrderSns, ...unresolvedIssues.map(issue => issue.orderSn)])];
  const details = await loadOrderDetails(client, shopId, orderSns);
  const mappings = await prisma.shopeeItemMap.findMany({ where: { shopId } });
  const productIds = [...new Set(mappings.map(mapping => mapping.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, status: 'active' },
    select: { id: true, sku: true },
  });
  const productById = new Map(products.map(product => [product.id, product]));
  const mappingByTarget = new Map(mappings.map(mapping => [
    `${mapping.itemId.toString()}:${mapping.modelId.toString()}`,
    mapping.productId,
  ]));
  const existingOrders = await prisma.order.findMany({
    where: { externalCode: { in: orderSns } },
    include: { orderItems: true },
  });
  const orderBySn = new Map(existingOrders.map(order => [order.externalCode, order]));
  const issueBySn = new Map(unresolvedIssues.map(issue => [issue.orderSn, issue]));
  const settings = await prisma.appSettings.findUnique({
    where: { id: 'default' },
    select: { packagingCost: true },
  });
  const packagingFee = Number(settings?.packagingCost || 0);

  const result = { fetched: details.length, created: 0, updated: 0, unchanged: 0, reversed: 0, skipped: 0, pending: 0 };
  for (const detail of details) {
    const orderSn = String(detail.order_sn || '').trim();
    if (!orderSn) throw new Error('Shopee trả order_sn trống trong chi tiết đơn.');
    const status = orderStatus(detail.order_status);
    const existing = orderBySn.get(orderSn);

    if (status === 'CANCELLED') {
      if (existing) {
        const reversal = await reverseCancelledOrder(existing.id);
        if (reversal.reversed) result.reversed += 1;
        else result.unchanged += 1;
      } else {
        result.skipped += 1;
      }
      const issue = issueBySn.get(orderSn);
      if (issue) await prisma.shopeeOrderSyncIssue.update({ where: { id: issue.id }, data: { resolvedAt: new Date() } });
      continue;
    }
    if (!IMPORTABLE_STATUSES.has(status)) {
      result.skipped += 1;
      continue;
    }
    if (!Array.isArray(detail.item_list) || detail.item_list.length === 0) {
      throw new Error(`Shopee không trả item_list cho đơn ${orderSn}.`);
    }

    const unmappedItems: UnmappedItem[] = [];
    const items: OrderInput['items'] = [];
    for (const item of detail.item_list) {
      const itemId = positiveBigInt(item.item_id, 'item_id');
      const modelId = nonnegativeBigInt(item.model_id);
      const qty = positiveInteger(item.model_quantity_purchased, 'số lượng mua');
      const productId = mappingByTarget.get(`${itemId.toString()}:${modelId.toString()}`);
      const product = productId ? productById.get(productId) : null;
      const sku = String(item.model_sku || item.item_sku || product?.sku || '').trim();
      if (!product) {
        unmappedItems.push({
          itemId: itemId.toString(),
          modelId: modelId.toString(),
          itemName: String(item.item_name || `Item #${itemId.toString()}`),
          modelName: item.model_name ? String(item.model_name) : null,
          sku,
          qty,
        });
        continue;
      }
      items.push({
        productId: product.id,
        skuAtOrder: sku || product.sku,
        qty,
        sellingPrice: nonnegativeMoney(item.model_discounted_price ?? item.model_original_price, 'giá bán'),
        isReturned: false,
      });
    }

    if (unmappedItems.length > 0) {
      await prisma.shopeeOrderSyncIssue.upsert({
        where: { shopId_orderSn: { shopId, orderSn } },
        update: { orderStatus: status, reason: 'UNMAPPED_ITEM', unmappedItems, resolvedAt: null },
        create: { shopId, orderSn, orderStatus: status, reason: 'UNMAPPED_ITEM', unmappedItems },
      });
      result.pending += 1;
      continue;
    }

    const createTime = positiveInteger(detail.create_time, 'create_time');
    const input: OrderInput = {
      externalCode: orderSn,
      channel: 'Shopee',
      orderedAt: new Date(createTime * 1000),
      status: internalStatus(status),
      packagingFee,
      returnFee: 0,
      platformFee: 0,
      marketingFee: 0,
      actualRevenue: null,
      settlementDate: null,
      note: `Đồng bộ từ Shopee shop #${shopId.toString()}`,
      items,
    };

    if (!existing) {
      await createOrder(input);
      result.created += 1;
    } else if (orderNeedsReplace(existing, input)) {
      await replaceOrder(existing.id, preserveReconciliation(existing, input));
      result.updated += 1;
    } else if (existing.status !== input.status) {
      await updateOrderStatus(existing.id, input.status);
      result.updated += 1;
    } else {
      result.unchanged += 1;
    }
    const issue = issueBySn.get(orderSn);
    if (issue) await prisma.shopeeOrderSyncIssue.update({ where: { id: issue.id }, data: { resolvedAt: new Date() } });
  }

  await prisma.shopeeShop.update({
    where: { id: shopId },
    data: { lastOrderSyncAt: new Date(timeTo * 1000) },
  });
  const status = await getShopeeOrderSyncStatus(shopId);
  return { ...result, ...status };
}
