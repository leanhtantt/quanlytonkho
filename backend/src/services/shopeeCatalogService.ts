import { prisma } from '../prismaClient';
import { BusinessError } from '../errors/BusinessError';
import { normalizeSkuCode } from './productResolver';
import { ShopeeClient } from './shopeeClient';

const ITEM_PAGE_SIZE = 100;
const BASE_INFO_BATCH_SIZE = 50;
const MODEL_REQUEST_CONCURRENCY = 5;
const MAX_ITEM_PAGES = 100;

interface ShopeeItemListEntry {
  item_id?: number;
}

interface ShopeeItemListResponse {
  response?: {
    item?: ShopeeItemListEntry[];
    total_count?: number;
    has_next_page?: boolean;
    next_offset?: number;
    next?: string | number;
  };
}

interface ShopeeBaseItem {
  item_id?: number;
  item_name?: string;
  item_sku?: string;
  has_model?: boolean;
}

interface ShopeeBaseInfoResponse {
  response?: {
    item_list?: ShopeeBaseItem[];
  };
}

interface ShopeeModel {
  model_id?: number;
  model_name?: string;
  model_sku?: string;
}

interface ShopeeModelListResponse {
  response?: {
    model?: ShopeeModel[];
  };
}

export interface ShopeeMappingInput {
  itemId: string;
  modelId: string;
  productId: string | null;
}

type CatalogProduct = {
  id: string;
  sku: string;
  name: string;
  aliases: string[];
};

type CatalogMappingProduct = Pick<CatalogProduct, 'id' | 'sku' | 'name'>;

export type ShopeeCatalogRow = {
  itemId: string;
  modelId: string;
  itemName: string;
  modelName: string | null;
  shopeeSku: string;
  mappedProduct: CatalogMappingProduct | null;
  suggestedProduct: CatalogMappingProduct | null;
};

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function asPositiveId(value: unknown): bigint | null {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) return null;
  return BigInt(Number(value));
}

function toMappingProduct(product: CatalogProduct | undefined): CatalogMappingProduct | null {
  if (!product) return null;
  return { id: product.id, sku: product.sku, name: product.name };
}

async function listItemIds(client: ShopeeClient, shopId: bigint): Promise<bigint[]> {
  const itemIds: bigint[] = [];
  let offset = 0;

  for (let page = 0; page < MAX_ITEM_PAGES; page += 1) {
    const payload = await client.requestForShop<ShopeeItemListResponse>(
      shopId,
      '/api/v2/product/get_item_list',
      { query: { offset, page_size: ITEM_PAGE_SIZE, item_status: 'NORMAL' } },
    );
    const response = payload.response;
    if (
      !response
      || (response.item !== undefined && !Array.isArray(response.item))
      || (response.item === undefined && Number(response.total_count || 0) > 0)
    ) {
      throw new Error('Shopee trả danh sách sản phẩm không đúng định dạng.');
    }

    for (const item of response.item || []) {
      const itemId = asPositiveId(item.item_id);
      if (itemId) itemIds.push(itemId);
    }

    if (!response.has_next_page) return [...new Set(itemIds)];
    const nextOffset = Number(response.next_offset ?? response.next);
    if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset) {
      throw new Error('Shopee trả offset phân trang sản phẩm không hợp lệ.');
    }
    offset = nextOffset;
  }

  throw new Error('Danh sách sản phẩm Shopee vượt giới hạn phân trang an toàn.');
}

async function getBaseItems(client: ShopeeClient, shopId: bigint, itemIds: bigint[]): Promise<ShopeeBaseItem[]> {
  const items: ShopeeBaseItem[] = [];
  for (const itemIdBatch of chunk(itemIds, BASE_INFO_BATCH_SIZE)) {
    const payload = await client.requestForShop<ShopeeBaseInfoResponse>(
      shopId,
      '/api/v2/product/get_item_base_info',
      { query: { item_id_list: itemIdBatch.join(',') } },
    );
    if (!payload.response || !Array.isArray(payload.response.item_list)) {
      throw new Error('Shopee trả thông tin sản phẩm không đúng định dạng.');
    }
    items.push(...payload.response.item_list);
  }
  return items;
}

async function getModelsByItem(
  client: ShopeeClient,
  shopId: bigint,
  items: Array<{ itemId: bigint; item: ShopeeBaseItem }>,
): Promise<Map<string, ShopeeModel[]>> {
  const modelsByItem = new Map<string, ShopeeModel[]>();
  const modelItems = items.filter(({ item }) => item.has_model === true);

  for (const requestBatch of chunk(modelItems, MODEL_REQUEST_CONCURRENCY)) {
    const responses = await Promise.all(requestBatch.map(async ({ itemId }) => {
      const payload = await client.requestForShop<ShopeeModelListResponse>(
        shopId,
        '/api/v2/product/get_model_list',
        { query: { item_id: itemId } },
      );
      if (!payload.response || !Array.isArray(payload.response.model)) {
        throw new Error(`Shopee trả phân loại của item ${itemId.toString()} không đúng định dạng.`);
      }
      if (payload.response.model.length === 0) {
        throw new Error(`Shopee báo item ${itemId.toString()} có phân loại nhưng không trả phân loại nào.`);
      }
      return [itemId.toString(), payload.response.model] as const;
    }));
    for (const [itemId, models] of responses) modelsByItem.set(itemId, models);
  }

  return modelsByItem;
}

export async function getShopeeCatalog(shopId: bigint, client = new ShopeeClient()) {
  const shop = await prisma.shopeeShop.findUnique({
    where: { id: shopId },
    select: { id: true, isActive: true },
  });
  if (!shop?.isActive) throw new BusinessError('Shop Shopee chưa được kết nối hoặc đã ngắt kết nối.');

  const itemIds = await listItemIds(client, shopId);
  const [baseItems, dbProducts, existingMappings] = await Promise.all([
    getBaseItems(client, shopId, itemIds),
    prisma.product.findMany({
      where: { status: 'active' },
      include: { skuAliases: true },
      orderBy: [{ displayOrder: 'asc' }, { sku: 'asc' }],
    }),
    prisma.shopeeItemMap.findMany({ where: { shopId } }),
  ]);

  const validItems = baseItems.flatMap(item => {
    const itemId = asPositiveId(item.item_id);
    return itemId ? [{ itemId, item }] : [];
  });
  const modelsByItem = await getModelsByItem(client, shopId, validItems);
  const products: CatalogProduct[] = dbProducts.map(product => ({
    id: product.id,
    sku: product.sku,
    name: product.name,
    aliases: product.skuAliases.map(alias => alias.sku),
  }));
  const productById = new Map(products.map(product => [product.id, product]));
  const productByCode = new Map<string, CatalogProduct>();
  for (const product of products) {
    for (const code of [product.sku, ...product.aliases]) {
      const normalized = normalizeSkuCode(code);
      if (normalized) productByCode.set(normalized, product);
    }
  }
  const mappingByTarget = new Map(existingMappings.map(mapping => [
    `${mapping.itemId.toString()}:${mapping.modelId.toString()}`,
    mapping.productId,
  ]));

  const rows: ShopeeCatalogRow[] = [];
  for (const { itemId, item } of validItems) {
    const models = modelsByItem.get(itemId.toString()) || [];
    const targets = models.length > 0
      ? models.flatMap(model => {
        const modelId = asPositiveId(model.model_id);
        return modelId ? [{ modelId, model }] : [];
      })
      : [{ modelId: 0n, model: null }];

    for (const { modelId, model } of targets) {
      const shopeeSku = String(model?.model_sku || item.item_sku || '').trim();
      const mappedProduct = productById.get(mappingByTarget.get(`${itemId.toString()}:${modelId.toString()}`) || '');
      const suggestedProduct = mappedProduct || productByCode.get(normalizeSkuCode(shopeeSku));
      rows.push({
        itemId: itemId.toString(),
        modelId: modelId.toString(),
        itemName: String(item.item_name || `Item #${itemId.toString()}`).trim(),
        modelName: model ? String(model.model_name || `Model #${modelId.toString()}`).trim() : null,
        shopeeSku,
        mappedProduct: toMappingProduct(mappedProduct),
        suggestedProduct: mappedProduct ? null : toMappingProduct(suggestedProduct),
      });
    }
  }

  return { shopId: shopId.toString(), products, rows };
}

export async function saveShopeeMappings(shopId: bigint, mappings: ShopeeMappingInput[]) {
  const shop = await prisma.shopeeShop.findUnique({
    where: { id: shopId },
    select: { id: true, isActive: true },
  });
  if (!shop?.isActive) throw new BusinessError('Shop Shopee chưa được kết nối hoặc đã ngắt kết nối.');

  const productIds = [...new Set(mappings.flatMap(mapping => mapping.productId ? [mapping.productId] : []))];
  const existingProducts = await prisma.product.findMany({
    where: { id: { in: productIds }, status: 'active' },
    select: { id: true },
  });
  if (existingProducts.length !== productIds.length) {
    throw new BusinessError('Có sản phẩm nội bộ không tồn tại hoặc đã ngừng hoạt động.');
  }

  const existingMappings = await prisma.shopeeItemMap.findMany({
    where: { shopId },
    select: { itemId: true, modelId: true },
  });
  const existingTargets = new Set(existingMappings.map(mapping => (
    `${mapping.itemId.toString()}:${mapping.modelId.toString()}`
  )));

  const operations = mappings.flatMap(mapping => {
    const target = {
      shopId_itemId_modelId: {
        shopId,
        itemId: BigInt(mapping.itemId),
        modelId: BigInt(mapping.modelId),
      },
    };
    if (!mapping.productId) {
      return existingTargets.has(`${mapping.itemId}:${mapping.modelId}`)
        ? [prisma.shopeeItemMap.delete({ where: target })]
        : [];
    }
    return [prisma.shopeeItemMap.upsert({
      where: target,
      update: { productId: mapping.productId },
      create: {
        shopId,
        itemId: BigInt(mapping.itemId),
        modelId: BigInt(mapping.modelId),
        productId: mapping.productId,
      },
    })];
  });
  if (operations.length > 0) await prisma.$transaction(operations);

  return { saved: mappings.filter(mapping => mapping.productId).length, total: mappings.length };
}
