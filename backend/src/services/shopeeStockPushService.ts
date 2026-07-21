import { prisma } from '../prismaClient';
import { BusinessError } from '../errors/BusinessError';
import { writeActivityLog } from '../audit/activityLogService';
import { ShopeeClient } from './shopeeClient';

const BASE_INFO_BATCH_SIZE = 50;
const MODEL_REQUEST_CONCURRENCY = 5;

interface SellerStock {
  location_id?: string;
  stock?: number;
  if_saleable?: boolean;
}

interface StockInfoV2 {
  seller_stock?: SellerStock[];
}

interface ShopeeBaseItem {
  item_id?: number;
  item_name?: string;
  has_model?: boolean;
  stock_info_v2?: StockInfoV2;
}

interface ShopeeBaseInfoResponse {
  response?: { item_list?: ShopeeBaseItem[] };
}

interface ShopeeModel {
  model_id?: number;
  model_name?: string;
  model_sku?: string;
  stock_info_v2?: StockInfoV2;
}

interface ShopeeModelListResponse {
  response?: { model?: ShopeeModel[] };
}

interface ShopeeStockResultEntry {
  model_id?: number;
  location_id?: string;
  stock?: number;
  error?: string;
  failed_reason?: string;
  message?: string;
}

interface ShopeeUpdateStockResponse {
  error?: unknown;
  message?: unknown;
  response?: {
    success_list?: ShopeeStockResultEntry[];
    failure_list?: ShopeeStockResultEntry[];
  };
}

export type ShopeeStockPushRowStatus = 'READY' | 'UNCHANGED' | 'BLOCKED' | 'SUCCESS' | 'FAILED';

export interface ShopeeStockPushRow {
  itemId: string;
  modelId: string;
  itemName: string;
  modelName: string | null;
  productId: string;
  productSku: string;
  productName: string;
  appStock: number | null;
  shopeeStock: number | null;
  locationId: string | null;
  status: ShopeeStockPushRowStatus;
  message: string | null;
}

function chunk<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function idString(value: unknown): string | null {
  try {
    const parsed = BigInt(String(value ?? ''));
    return parsed >= 0n ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function resultKey(modelId: string, locationId: string) {
  return `${modelId}:${locationId}`;
}

function isSafeShopeeId(value: string) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0;
}

function sellerStockFor(stockInfo: StockInfoV2 | undefined) {
  if (!Array.isArray(stockInfo?.seller_stock)) return [];
  return stockInfo.seller_stock.flatMap(stock => {
    const locationId = String(stock.location_id || '').trim();
    const quantity = Number(stock.stock);
    if (!locationId || !Number.isSafeInteger(quantity) || quantity < 0 || stock.if_saleable === false) return [];
    return [{ locationId, stock: quantity }];
  });
}

async function getBaseItems(client: ShopeeClient, shopId: bigint, itemIds: string[]) {
  const items: ShopeeBaseItem[] = [];
  for (const batch of chunk(itemIds, BASE_INFO_BATCH_SIZE)) {
    const payload = await client.requestForShop<ShopeeBaseInfoResponse>(
      shopId,
      '/api/v2/product/get_item_base_info',
      { query: { item_id_list: batch.join(',') } },
    );
    if (!payload.response || !Array.isArray(payload.response.item_list)) {
      throw new Error('Shopee trả thông tin tồn sản phẩm không đúng định dạng.');
    }
    items.push(...payload.response.item_list);
  }
  return items;
}

async function getModels(
  client: ShopeeClient,
  shopId: bigint,
  itemIds: string[],
) {
  const modelsByItem = new Map<string, ShopeeModel[]>();
  for (const batch of chunk(itemIds, MODEL_REQUEST_CONCURRENCY)) {
    const responses = await Promise.all(batch.map(async itemId => {
      const payload = await client.requestForShop<ShopeeModelListResponse>(
        shopId,
        '/api/v2/product/get_model_list',
        { query: { item_id: itemId } },
      );
      if (!payload.response || !Array.isArray(payload.response.model)) {
        throw new Error(`Shopee trả phân loại của item ${itemId} không đúng định dạng.`);
      }
      return [itemId, payload.response.model] as const;
    }));
    for (const [itemId, models] of responses) modelsByItem.set(itemId, models);
  }
  return modelsByItem;
}

async function buildPreview(shopId: bigint, client: ShopeeClient) {
  const shop = await prisma.shopeeShop.findUnique({
    where: { id: shopId },
    select: { id: true, shopName: true, isActive: true },
  });
  if (!shop?.isActive) throw new BusinessError('Shop Shopee chưa được kết nối hoặc đã ngắt kết nối.');

  const mappings = await prisma.shopeeItemMap.findMany({
    where: { shopId },
    orderBy: [{ itemId: 'asc' }, { modelId: 'asc' }],
  });
  if (mappings.length === 0) {
    return { shop, rows: [] as ShopeeStockPushRow[] };
  }

  const productIds = [...new Set(mappings.map(mapping => mapping.productId))];
  const itemIds = [...new Set(mappings.map(mapping => mapping.itemId.toString()))];
  const modelItemIds = [...new Set(mappings.filter(mapping => mapping.modelId > 0n).map(mapping => mapping.itemId.toString()))];
  const [products, stockTotals, baseItems, modelsByItem] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds }, status: 'active' },
      select: { id: true, sku: true, name: true },
    }),
    prisma.inventoryBatch.groupBy({
      by: ['productId'],
      where: { productId: { in: productIds } },
      _sum: { qtyRemaining: true },
    }),
    getBaseItems(client, shopId, itemIds),
    getModels(client, shopId, modelItemIds),
  ]);

  const productById = new Map(products.map(product => [product.id, product]));
  const stockByProduct = new Map(stockTotals.map(total => [total.productId, total._sum.qtyRemaining ?? 0]));
  const baseById = new Map(baseItems.flatMap(item => {
    const itemId = idString(item.item_id);
    return itemId ? [[itemId, item] as const] : [];
  }));
  const mappingCountByProduct = new Map<string, number>();
  for (const mapping of mappings) {
    mappingCountByProduct.set(mapping.productId, (mappingCountByProduct.get(mapping.productId) || 0) + 1);
  }

  const rows: ShopeeStockPushRow[] = mappings.map(mapping => {
    const itemId = mapping.itemId.toString();
    const modelId = mapping.modelId.toString();
    const product = productById.get(mapping.productId);
    const baseItem = baseById.get(itemId);
    const model = mapping.modelId > 0n
      ? modelsByItem.get(itemId)?.find(candidate => idString(candidate.model_id) === modelId)
      : null;
    const appStock = product ? stockByProduct.get(product.id) ?? 0 : null;
    const sellerStocks = sellerStockFor(model?.stock_info_v2 || baseItem?.stock_info_v2);

    const row: ShopeeStockPushRow = {
      itemId,
      modelId,
      itemName: String(baseItem?.item_name || `Item #${itemId}`),
      modelName: model ? String(model.model_name || `Model #${modelId}`) : null,
      productId: mapping.productId,
      productSku: product?.sku || '',
      productName: product?.name || '',
      appStock,
      shopeeStock: sellerStocks.length === 1 ? sellerStocks[0].stock : null,
      locationId: sellerStocks.length === 1 ? sellerStocks[0].locationId : null,
      status: 'BLOCKED',
      message: null,
    };

    if (!isSafeShopeeId(itemId) || !isSafeShopeeId(modelId)) {
      row.message = 'ID Shopee vượt giới hạn số nguyên an toàn để gửi API.';
    } else if (!product) row.message = 'Sản phẩm nội bộ không tồn tại, đã ngừng hoạt động hoặc mapping đã cũ.';
    else if (mappingCountByProduct.get(mapping.productId)! > 1) {
      row.message = 'Một sản phẩm nội bộ đang map tới nhiều listing/model; không thể nhân toàn bộ tồn cho từng nơi bán.';
    } else if (!baseItem) row.message = 'Shopee không còn trả item đã mapping.';
    else if (mapping.modelId > 0n && !model) row.message = 'Shopee không còn trả model đã mapping.';
    else if (!Number.isSafeInteger(appStock) || Number(appStock) < 0) row.message = 'Tồn app không phải số nguyên không âm hợp lệ.';
    else if (sellerStocks.length === 0) row.message = 'Shopee không trả kho seller đang bán cho item/model này.';
    else if (sellerStocks.length > 1) row.message = 'Listing dùng nhiều kho Shopee; SP5 chưa tự phân bổ tồn app giữa các kho.';
    else {
      row.status = Number(appStock) === row.shopeeStock ? 'UNCHANGED' : 'READY';
    }
    return row;
  });

  return { shop, rows };
}

function summarizePreview(rows: ShopeeStockPushRow[]) {
  return {
    total: rows.length,
    ready: rows.filter(row => row.status === 'READY').length,
    unchanged: rows.filter(row => row.status === 'UNCHANGED').length,
    blocked: rows.filter(row => row.status === 'BLOCKED').length,
  };
}

export async function previewShopeeStock(shopId: bigint, client = new ShopeeClient()) {
  const preview = await buildPreview(shopId, client);
  return {
    shopId: shopId.toString(),
    generatedAt: new Date(),
    summary: summarizePreview(preview.rows),
    rows: preview.rows,
  };
}

function responseMessage(entry: ShopeeStockResultEntry) {
  return String(entry.failed_reason || entry.error || entry.message || 'Shopee từ chối cập nhật tồn.');
}

async function recordPushActivity(
  shopId: bigint,
  shopName: string | null,
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED',
  summary: Record<string, number>,
  rows: ShopeeStockPushRow[],
) {
  try {
    await writeActivityLog({
      action: 'PUSH_STOCK',
      resource: 'ShopeeStock',
      targetId: shopId.toString(),
      targetLabel: shopName || `Shop #${shopId.toString()}`,
      after: {
        status,
        ...summary,
        errors: rows.filter(row => row.status === 'FAILED' || row.status === 'BLOCKED').slice(0, 20).map(row => ({
          itemId: row.itemId,
          modelId: row.modelId,
          productSku: row.productSku,
          message: row.message,
        })),
      },
    });
    return null;
  } catch (error) {
    console.error('Không thể ghi Activity Log đẩy tồn Shopee:', error);
    return 'Đẩy tồn đã chạy nhưng không ghi được Activity Log.';
  }
}

export async function pushShopeeStock(shopId: bigint, client = new ShopeeClient()) {
  let preview: Awaited<ReturnType<typeof buildPreview>>;
  try {
    preview = await buildPreview(shopId, client);
  } catch (error) {
    await recordPushActivity(shopId, null, 'FAILED', { total: 0, pushed: 0, unchanged: 0, blocked: 0, failed: 1 }, [{
      itemId: '', modelId: '', itemName: '', modelName: null, productId: '', productSku: '', productName: '',
      appStock: null, shopeeStock: null, locationId: null, status: 'FAILED',
      message: error instanceof Error ? error.message : 'Không thể chuẩn bị dữ liệu đẩy tồn.',
    }]);
    throw error;
  }

  const rows = preview.rows.map(row => ({ ...row }));
  const readyRows = rows.filter(row => row.status === 'READY');
  const rowsByItem = new Map<string, ShopeeStockPushRow[]>();
  for (const row of readyRows) {
    const itemRows = rowsByItem.get(row.itemId) || [];
    itemRows.push(row);
    rowsByItem.set(row.itemId, itemRows);
  }

  for (const [itemId, itemRows] of rowsByItem) {
    try {
      const payload = await client.requestForShop<ShopeeUpdateStockResponse>(
        shopId,
        '/api/v2/product/update_stock',
        {
          method: 'POST',
          body: {
            item_id: Number(itemId),
            stock_list: itemRows.map(row => ({
              model_id: Number(row.modelId),
              seller_stock: [{ location_id: row.locationId, stock: row.appStock }],
            })),
          },
          allowErrorPayload: true,
        },
      );
      const response = payload.response;
      if (!response || !Array.isArray(response.success_list) || !Array.isArray(response.failure_list)) {
        const envelopeError = String(payload.error || '').trim();
        const envelopeMessage = String(payload.message || '').trim();
        if (envelopeError) {
          throw new Error(`Shopee trả lỗi ${envelopeError}${envelopeMessage ? `: ${envelopeMessage}` : ''}.`);
        }
        throw new Error('Shopee trả kết quả cập nhật tồn không đúng định dạng.');
      }
      const failures = new Map(response.failure_list.flatMap(entry => {
        const modelId = idString(entry.model_id);
        const locationId = String(entry.location_id || '').trim();
        if (!modelId) return [];
        const key = locationId ? resultKey(modelId, locationId) : `model:${modelId}`;
        return [[key, responseMessage(entry)] as const];
      }));
      const successes = new Set(response.success_list.flatMap(entry => {
        const modelId = idString(entry.model_id);
        const locationId = String(entry.location_id || '').trim();
        return modelId && locationId ? [resultKey(modelId, locationId)] : [];
      }));
      for (const row of itemRows) {
        const key = resultKey(row.modelId, row.locationId!);
        const failureMessage = failures.get(key) || failures.get(`model:${row.modelId}`);
        if (failureMessage) {
          row.status = 'FAILED';
          row.message = failureMessage;
        } else if (successes.has(key)) {
          row.status = 'SUCCESS';
          row.shopeeStock = row.appStock;
          row.message = null;
        } else {
          row.status = 'FAILED';
          row.message = 'Shopee không xác nhận item/model trong success_list hoặc failure_list.';
        }
      }
    } catch (error) {
      for (const row of itemRows) {
        row.status = 'FAILED';
        row.message = error instanceof Error ? error.message : 'Không thể cập nhật tồn Shopee.';
      }
    }
  }

  const summary = {
    total: rows.length,
    pushed: rows.filter(row => row.status === 'SUCCESS').length,
    unchanged: rows.filter(row => row.status === 'UNCHANGED').length,
    blocked: rows.filter(row => row.status === 'BLOCKED').length,
    failed: rows.filter(row => row.status === 'FAILED').length,
  };
  const status = summary.failed > 0 || summary.blocked > 0 ? 'PARTIAL' : 'SUCCESS';
  const auditWarning = await recordPushActivity(shopId, preview.shop.shopName, status, summary, rows);

  return {
    shopId: shopId.toString(),
    pushedAt: new Date(),
    status,
    summary,
    auditWarning,
    rows,
  };
}
