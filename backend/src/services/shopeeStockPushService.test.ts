import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  shopFindUnique: vi.fn(),
  mappingFindMany: vi.fn(),
  productFindMany: vi.fn(),
  batchGroupBy: vi.fn(),
  writeActivityLog: vi.fn(),
}));

vi.mock('../prismaClient', () => ({
  prisma: {
    shopeeShop: { findUnique: mocks.shopFindUnique },
    shopeeItemMap: { findMany: mocks.mappingFindMany },
    product: { findMany: mocks.productFindMany },
    inventoryBatch: { groupBy: mocks.batchGroupBy },
  },
}));

vi.mock('../audit/activityLogService', () => ({ writeActivityLog: mocks.writeActivityLog }));

import { previewShopeeStock, pushShopeeStock } from './shopeeStockPushService';

const SHOP_ID = 227_758_409n;

function mapping(itemId: bigint, modelId: bigint, productId: string) {
  return { id: `${itemId}:${modelId}`, shopId: SHOP_ID, itemId, modelId, productId };
}

function sellerStock(stock: number, locationId = 'SGZ') {
  return { seller_stock: [{ location_id: locationId, stock, if_saleable: true }] };
}

function clientWith(options: {
  baseItems: any[];
  modelsByItem?: Record<string, any[]>;
  update?: (body: any) => any;
}) {
  return {
    requestForShop: vi.fn(async (_shopId: bigint, path: string, request: any) => {
      if (path.endsWith('get_item_base_info')) return { response: { item_list: options.baseItems } };
      if (path.endsWith('get_model_list')) {
        return { response: { model: options.modelsByItem?.[String(request.query.item_id)] || [] } };
      }
      if (path.endsWith('update_stock')) return options.update?.(request.body);
      throw new Error(`Unexpected path ${path}`);
    }),
  };
}

describe('Shopee stock push', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.shopFindUnique.mockResolvedValue({ id: SHOP_ID, shopName: 'Sandbox', isActive: true });
    mocks.mappingFindMany.mockResolvedValue([mapping(101n, 0n, 'product-1')]);
    mocks.productFindMany.mockResolvedValue([{ id: 'product-1', sku: 'SKU-1', name: 'Product 1' }]);
    mocks.batchGroupBy.mockResolvedValue([{ productId: 'product-1', _sum: { qtyRemaining: 7 } }]);
    mocks.writeActivityLog.mockResolvedValue(undefined);
  });

  it('previews app stock against the current saleable Shopee warehouse', async () => {
    const client = clientWith({
      baseItems: [{ item_id: 101, item_name: 'Shopee item', has_model: false, stock_info_v2: sellerStock(3) }],
    });

    const result = await previewShopeeStock(SHOP_ID, client as never);

    expect(result.summary).toEqual({ total: 1, ready: 1, unchanged: 0, blocked: 0 });
    expect(result.rows[0]).toMatchObject({
      itemId: '101', modelId: '0', productSku: 'SKU-1', appStock: 7,
      shopeeStock: 3, locationId: 'SGZ', status: 'READY',
    });
  });

  it('groups mapped models of one item into one update_stock request', async () => {
    mocks.mappingFindMany.mockResolvedValue([
      mapping(202n, 301n, 'product-1'),
      mapping(202n, 302n, 'product-2'),
    ]);
    mocks.productFindMany.mockResolvedValue([
      { id: 'product-1', sku: 'BLUE', name: 'Blue' },
      { id: 'product-2', sku: 'RED', name: 'Red' },
    ]);
    mocks.batchGroupBy.mockResolvedValue([
      { productId: 'product-1', _sum: { qtyRemaining: 5 } },
      { productId: 'product-2', _sum: { qtyRemaining: 6 } },
    ]);
    const update = vi.fn((body: any) => ({
      response: {
        failure_list: [],
        success_list: body.stock_list.map((row: any) => ({
          model_id: row.model_id, location_id: 'SGZ', stock: row.seller_stock[0].stock,
        })),
      },
    }));
    const client = clientWith({
      baseItems: [{ item_id: 202, item_name: 'Variants', has_model: true }],
      modelsByItem: {
        '202': [
          { model_id: 301, model_name: 'Blue', stock_info_v2: sellerStock(1) },
          { model_id: 302, model_name: 'Red', stock_info_v2: sellerStock(2) },
        ],
      },
      update,
    });

    const result = await pushShopeeStock(SHOP_ID, client as never);

    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith({
      item_id: 202,
      stock_list: [
        { model_id: 301, seller_stock: [{ location_id: 'SGZ', stock: 5 }] },
        { model_id: 302, seller_stock: [{ location_id: 'SGZ', stock: 6 }] },
      ],
    });
    expect(result).toMatchObject({ status: 'SUCCESS', summary: { pushed: 2, failed: 0, blocked: 0 } });
    expect(mocks.writeActivityLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'PUSH_STOCK', resource: 'ShopeeStock', targetId: SHOP_ID.toString(),
      after: expect.objectContaining({ status: 'SUCCESS', pushed: 2 }),
    }));
  });

  it('does not call Shopee when stock is already unchanged', async () => {
    const client = clientWith({
      baseItems: [{ item_id: 101, item_name: 'Shopee item', stock_info_v2: sellerStock(7) }],
      update: vi.fn(),
    });

    const result = await pushShopeeStock(SHOP_ID, client as never);

    expect(client.requestForShop).toHaveBeenCalledTimes(1);
    expect(result.summary).toMatchObject({ pushed: 0, unchanged: 1, failed: 0 });
  });

  it('blocks one internal product mapped to multiple Shopee targets', async () => {
    mocks.mappingFindMany.mockResolvedValue([
      mapping(101n, 0n, 'product-1'),
      mapping(102n, 0n, 'product-1'),
    ]);
    const client = clientWith({
      baseItems: [
        { item_id: 101, item_name: 'Listing A', stock_info_v2: sellerStock(1) },
        { item_id: 102, item_name: 'Listing B', stock_info_v2: sellerStock(2) },
      ],
      update: vi.fn(),
    });

    const result = await pushShopeeStock(SHOP_ID, client as never);

    expect(result.summary).toMatchObject({ pushed: 0, blocked: 2, failed: 0 });
    expect(result.rows.every(row => row.status === 'BLOCKED')).toBe(true);
    expect(client.requestForShop).toHaveBeenCalledTimes(1);
  });

  it('continues other items and reports a partial result when one request fails', async () => {
    mocks.mappingFindMany.mockResolvedValue([
      mapping(101n, 0n, 'product-1'),
      mapping(102n, 0n, 'product-2'),
    ]);
    mocks.productFindMany.mockResolvedValue([
      { id: 'product-1', sku: 'SKU-1', name: 'Product 1' },
      { id: 'product-2', sku: 'SKU-2', name: 'Product 2' },
    ]);
    mocks.batchGroupBy.mockResolvedValue([
      { productId: 'product-1', _sum: { qtyRemaining: 7 } },
      { productId: 'product-2', _sum: { qtyRemaining: 8 } },
    ]);
    const client = clientWith({
      baseItems: [
        { item_id: 101, item_name: 'Listing A', stock_info_v2: sellerStock(1) },
        { item_id: 102, item_name: 'Listing B', stock_info_v2: sellerStock(2) },
      ],
      update: body => {
        if (body.item_id === 101) return { error: 'product.error_busi_update_stock_failed', response: { success_list: [], failure_list: [{ model_id: 0, failed_reason: 'stock is locked' }] } };
        return { response: { failure_list: [], success_list: [{ model_id: 0, location_id: 'SGZ', stock: 8 }] } };
      },
    });

    const result = await pushShopeeStock(SHOP_ID, client as never);

    expect(result).toMatchObject({ status: 'PARTIAL', summary: { pushed: 1, failed: 1, blocked: 0 } });
    expect(result.rows.find(row => row.itemId === '101')).toMatchObject({ status: 'FAILED', message: 'stock is locked' });
    expect(result.rows.find(row => row.itemId === '102')).toMatchObject({ status: 'SUCCESS', shopeeStock: 8 });
  });
});
