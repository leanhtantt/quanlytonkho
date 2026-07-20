import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  shopFindUnique: vi.fn(),
  productFindMany: vi.fn(),
  mappingFindMany: vi.fn(),
  mappingUpsert: vi.fn(),
  mappingDelete: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../prismaClient', () => ({
  prisma: {
    shopeeShop: { findUnique: mocks.shopFindUnique },
    product: { findMany: mocks.productFindMany },
    shopeeItemMap: {
      findMany: mocks.mappingFindMany,
      upsert: mocks.mappingUpsert,
      delete: mocks.mappingDelete,
    },
    $transaction: mocks.transaction,
  },
}));

import { getShopeeCatalog, saveShopeeMappings } from './shopeeCatalogService';

const SHOP_ID = 227_758_409n;
const PRODUCT_A = '11111111-1111-4111-8111-111111111111';
const PRODUCT_B = '22222222-2222-4222-8222-222222222222';

describe('shopeeCatalogService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.shopFindUnique.mockResolvedValue({ id: SHOP_ID, isActive: true });
    mocks.productFindMany.mockResolvedValue([
      { id: PRODUCT_A, sku: 'SKU-A', name: 'Product A', skuAliases: [{ sku: 'OLD-A' }] },
      { id: PRODUCT_B, sku: 'SKU-B', name: 'Product B', skuAliases: [] },
    ]);
    mocks.mappingFindMany.mockResolvedValue([]);
    mocks.transaction.mockImplementation(async operations => Promise.all(operations));
  });

  it('flattens Shopee items/models and proposes exact SKU or alias matches', async () => {
    mocks.mappingFindMany.mockResolvedValue([{
      shopId: SHOP_ID,
      itemId: 101n,
      modelId: 0n,
      productId: PRODUCT_B,
    }]);
    const client = {
      requestForShop: vi.fn(async (_shopId: bigint, path: string) => {
        if (path.endsWith('get_item_list')) {
          return { response: { item: [{ item_id: 101 }, { item_id: 202 }], has_next_page: false } };
        }
        if (path.endsWith('get_item_base_info')) {
          return { response: { item_list: [
            { item_id: 101, item_name: 'No model', item_sku: 'OLD-A', has_model: false },
            { item_id: 202, item_name: 'With models', item_sku: '', has_model: true },
          ] } };
        }
        if (path.endsWith('get_model_list')) {
          return { response: { model: [
            { model_id: 11, model_name: 'Red', model_sku: 'sku-a' },
            { model_id: 12, model_name: 'Blue', model_sku: '' },
          ] } };
        }
        throw new Error('Unexpected Shopee path ' + path);
      }),
    };

    const result = await getShopeeCatalog(SHOP_ID, client as never);

    expect(result.products).toHaveLength(2);
    expect(result.rows).toEqual([
      expect.objectContaining({
        itemId: '101',
        modelId: '0',
        shopeeSku: 'OLD-A',
        mappedProduct: { id: PRODUCT_B, sku: 'SKU-B', name: 'Product B' },
        suggestedProduct: null,
      }),
      expect.objectContaining({
        itemId: '202',
        modelId: '11',
        shopeeSku: 'sku-a',
        mappedProduct: null,
        suggestedProduct: { id: PRODUCT_A, sku: 'SKU-A', name: 'Product A' },
      }),
      expect.objectContaining({
        itemId: '202',
        modelId: '12',
        mappedProduct: null,
        suggestedProduct: null,
      }),
    ]);
  });

  it('paginates item ids before loading base info', async () => {
    let listCalls = 0;
    const client = {
      requestForShop: vi.fn(async (_shopId: bigint, path: string, options: { query: Record<string, unknown> }) => {
        if (path.endsWith('get_item_list')) {
          listCalls += 1;
          return listCalls === 1
            ? { response: { item: [{ item_id: 101 }], has_next_page: true, next_offset: 1 } }
            : { response: { item: [{ item_id: 202 }], has_next_page: false } };
        }
        expect(options.query.item_id_list).toBe('101,202');
        return { response: { item_list: [] } };
      }),
    };

    await getShopeeCatalog(SHOP_ID, client as never);

    expect(listCalls).toBe(2);
  });

  it('accepts the empty item-list shape returned by Shopee sandbox', async () => {
    const client = {
      requestForShop: vi.fn().mockResolvedValue({
        error: '',
        response: { total_count: 0, has_next_page: false, next: '' },
      }),
    };

    const result = await getShopeeCatalog(SHOP_ID, client as never);

    expect(result.rows).toEqual([]);
  });

  it('rejects a missing item array when Shopee reports products', async () => {
    const client = {
      requestForShop: vi.fn().mockResolvedValue({
        response: { total_count: 1, has_next_page: false },
      }),
    };

    await expect(getShopeeCatalog(SHOP_ID, client as never)).rejects.toThrow('danh sách sản phẩm');
  });

  it('rejects an item marked with models when Shopee returns none', async () => {
    const client = {
      requestForShop: vi.fn(async (_shopId: bigint, path: string) => {
        if (path.endsWith('get_item_list')) {
          return { response: { item: [{ item_id: 202 }], has_next_page: false } };
        }
        if (path.endsWith('get_item_base_info')) {
          return { response: { item_list: [{ item_id: 202, item_name: 'With models', has_model: true }] } };
        }
        return { response: { model: [] } };
      }),
    };

    await expect(getShopeeCatalog(SHOP_ID, client as never)).rejects.toThrow('không trả phân loại nào');
  });

  it('upserts selected mappings and removes cleared mappings in one transaction', async () => {
    mocks.productFindMany.mockResolvedValue([{ id: PRODUCT_A }]);
    mocks.mappingUpsert.mockReturnValue(Promise.resolve({ id: 'map-1' }));
    mocks.mappingFindMany.mockResolvedValue([{ itemId: 202n, modelId: 12n }]);
    mocks.mappingDelete.mockReturnValue(Promise.resolve({ id: 'map-2' }));

    const result = await saveShopeeMappings(SHOP_ID, [
      { itemId: '101', modelId: '0', productId: PRODUCT_A },
      { itemId: '202', modelId: '12', productId: null },
    ]);

    expect(mocks.mappingUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { shopId_itemId_modelId: { shopId: SHOP_ID, itemId: 101n, modelId: 0n } },
      update: { productId: PRODUCT_A },
    }));
    expect(mocks.mappingDelete).toHaveBeenCalledWith({
      where: { shopId_itemId_modelId: { shopId: SHOP_ID, itemId: 202n, modelId: 12n } },
    });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(result).toEqual({ saved: 1, total: 2 });
  });

  it('rejects a mapping to an inactive or missing internal product', async () => {
    mocks.productFindMany.mockResolvedValue([]);

    await expect(saveShopeeMappings(SHOP_ID, [
      { itemId: '101', modelId: '0', productId: PRODUCT_A },
    ])).rejects.toThrow('không tồn tại hoặc đã ngừng hoạt động');
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
