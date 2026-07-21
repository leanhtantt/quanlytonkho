import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  shopFindUnique: vi.fn(),
  shopUpdate: vi.fn(),
  issueFindMany: vi.fn(),
  issueUpsert: vi.fn(),
  issueUpdate: vi.fn(),
  mappingFindMany: vi.fn(),
  productFindMany: vi.fn(),
  orderFindMany: vi.fn(),
  settingsFindUnique: vi.fn(),
  createOrder: vi.fn(),
  replaceOrder: vi.fn(),
  reverseCancelledOrder: vi.fn(),
  updateOrderStatus: vi.fn(),
}));

vi.mock('../prismaClient', () => ({
  prisma: {
    shopeeShop: { findUnique: mocks.shopFindUnique, update: mocks.shopUpdate },
    shopeeOrderSyncIssue: {
      findMany: mocks.issueFindMany,
      upsert: mocks.issueUpsert,
      update: mocks.issueUpdate,
    },
    shopeeItemMap: { findMany: mocks.mappingFindMany },
    product: { findMany: mocks.productFindMany },
    order: { findMany: mocks.orderFindMany },
    appSettings: { findUnique: mocks.settingsFindUnique },
  },
}));

vi.mock('./orderService', () => ({
  createOrder: mocks.createOrder,
  replaceOrder: mocks.replaceOrder,
  reverseCancelledOrder: mocks.reverseCancelledOrder,
  updateOrderStatus: mocks.updateOrderStatus,
}));

import { syncShopeeOrders } from './shopeeOrderSyncService';

const SHOP_ID = 227_758_409n;
const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const CREATE_TIME = 1_720_000_000;

function detail(orderSn: string, overrides: Record<string, unknown> = {}) {
  return {
    order_sn: orderSn,
    order_status: 'READY_TO_SHIP',
    create_time: CREATE_TIME,
    item_list: [{
      item_id: 101,
      model_id: 0,
      item_name: 'Shopee item',
      item_sku: 'SKU-A',
      model_quantity_purchased: 1,
      model_discounted_price: 9_900,
    }],
    ...overrides,
  };
}

function clientFor(details: ReturnType<typeof detail>[]) {
  return {
    requestForShop: vi.fn(async (_shopId: bigint, path: string) => {
      if (path.endsWith('get_order_list')) {
        return { response: { order_list: details.map(order => ({ order_sn: order.order_sn })), more: false } };
      }
      return { response: { order_list: details } };
    }),
  };
}

describe('syncShopeeOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(1_730_000_000_000);
    mocks.shopFindUnique.mockResolvedValue({ id: SHOP_ID, isActive: true, lastOrderSyncAt: null });
    mocks.issueFindMany.mockResolvedValue([]);
    mocks.mappingFindMany.mockResolvedValue([{ itemId: 101n, modelId: 0n, productId: PRODUCT_ID }]);
    mocks.productFindMany.mockResolvedValue([{ id: PRODUCT_ID, sku: 'SKU-A' }]);
    mocks.orderFindMany.mockResolvedValue([]);
    mocks.settingsFindUnique.mockResolvedValue({ packagingCost: 1_000 });
    mocks.shopUpdate.mockResolvedValue({});
    mocks.reverseCancelledOrder.mockResolvedValue({ reversed: true });
  });

  it('imports a mapped READY_TO_SHIP order through createOrder with Shopee price', async () => {
    const result = await syncShopeeOrders(SHOP_ID, clientFor([detail('ORDER-1')]) as never);

    expect(mocks.createOrder).toHaveBeenCalledWith(expect.objectContaining({
      externalCode: 'ORDER-1',
      channel: 'Shopee',
      status: 'Đang giao',
      packagingFee: 1_000,
      items: [{
        productId: PRODUCT_ID,
        skuAtOrder: 'SKU-A',
        qty: 1,
        sellingPrice: 9_900,
        isReturned: false,
      }],
    }));
    expect(result.created).toBe(1);
    expect(mocks.shopUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: SHOP_ID } }));
  });

  it('queues an unmapped order and never touches order/FIFO/ledger services', async () => {
    mocks.mappingFindMany.mockResolvedValue([]);
    mocks.productFindMany.mockResolvedValue([]);

    const result = await syncShopeeOrders(SHOP_ID, clientFor([detail('ORDER-PENDING')]) as never);

    expect(mocks.issueUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { shopId_orderSn: { shopId: SHOP_ID, orderSn: 'ORDER-PENDING' } },
      create: expect.objectContaining({ reason: 'UNMAPPED_ITEM' }),
    }));
    expect(mocks.createOrder).not.toHaveBeenCalled();
    expect(mocks.replaceOrder).not.toHaveBeenCalled();
    expect(result.pending).toBe(1);
  });

  it('is idempotent when externalCode and financial lines are unchanged', async () => {
    mocks.orderFindMany.mockResolvedValue([{
      id: 'db-order-1',
      externalCode: 'ORDER-1',
      channel: 'Shopee',
      status: 'Đang giao',
      orderedAt: new Date(CREATE_TIME * 1000),
      packagingFee: 1_000,
      orderItems: [{
        productId: PRODUCT_ID,
        skuAtOrder: 'SKU-A',
        qty: 1,
        sellingPrice: 9_900,
        isReturned: false,
      }],
    }]);

    const result = await syncShopeeOrders(SHOP_ID, clientFor([detail('ORDER-1')]) as never);

    expect(mocks.createOrder).not.toHaveBeenCalled();
    expect(mocks.replaceOrder).not.toHaveBeenCalled();
    expect(result.unchanged).toBe(1);
  });

  it('updates COMPLETED status without rebuilding FIFO/ledger or touching reconciliation', async () => {
    mocks.orderFindMany.mockResolvedValue([{
      id: 'db-order-1', externalCode: 'ORDER-1', channel: 'Shopee', status: '\u0110ang giao',
      orderedAt: new Date(CREATE_TIME * 1000), packagingFee: 1_000,
      returnFee: 20_000, platformFee: 2_500, marketingFee: 500,
      actualRevenue: 6_900, settlementDate: new Date('2026-07-21T00:00:00Z'),
      orderItems: [{ productId: PRODUCT_ID, skuAtOrder: 'SKU-A', qty: 1, sellingPrice: 9_900, isReturned: false }],
    }]);

    const result = await syncShopeeOrders(
      SHOP_ID,
      clientFor([detail('ORDER-1', { order_status: 'COMPLETED' })]) as never,
    );
    expect(mocks.updateOrderStatus).toHaveBeenCalledWith('db-order-1', '\u0110\u00e3 giao');
    expect(mocks.replaceOrder).not.toHaveBeenCalled();
    expect(mocks.createOrder).not.toHaveBeenCalled();
    expect(result.updated).toBe(1);
  });

  it('preserves manual reconciliation when an imported item changes materially', async () => {
    const settlementDate = new Date('2026-07-21T00:00:00Z');
    mocks.orderFindMany.mockResolvedValue([{
      id: 'db-order-1', externalCode: 'ORDER-1', channel: 'Shopee', status: '\u0110ang giao',
      orderedAt: new Date(CREATE_TIME * 1000), packagingFee: 1_500,
      returnFee: 20_000, platformFee: 2_500, marketingFee: 500,
      actualRevenue: 6_900, settlementDate, note: '\u0110\u00e3 \u0111\u1ed1i so\u00e1t tay',
      orderItems: [{ productId: PRODUCT_ID, skuAtOrder: 'SKU-A', qty: 1, sellingPrice: 8_000, isReturned: false }],
    }]);

    await syncShopeeOrders(SHOP_ID, clientFor([detail('ORDER-1')]) as never);

    expect(mocks.replaceOrder).toHaveBeenCalledWith('db-order-1', expect.objectContaining({
      externalCode: 'ORDER-1',
      packagingFee: 1_500,
      returnFee: 20_000,
      platformFee: 2_500,
      marketingFee: 500,
      actualRevenue: 6_900,
      settlementDate,
      note: '\u0110\u00e3 \u0111\u1ed1i so\u00e1t tay',
    }));
    expect(mocks.updateOrderStatus).not.toHaveBeenCalled();
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it('reverses a recorded cancellation and skips unrecorded CANCELLED or UNPAID orders', async () => {
    const details = [
      detail('ORDER-CANCELLED', { order_status: 'CANCELLED' }),
      detail('ORDER-CANCELLED-NEW', { order_status: 'CANCELLED' }),
      detail('ORDER-UNPAID', { order_status: 'UNPAID' }),
    ];
    mocks.orderFindMany.mockResolvedValue([{
      id: 'db-cancelled', externalCode: 'ORDER-CANCELLED', channel: 'Shopee', status: 'Đang giao', orderItems: [],
    }]);

    const result = await syncShopeeOrders(SHOP_ID, clientFor(details) as never);

    expect(mocks.reverseCancelledOrder).toHaveBeenCalledOnce();
    expect(mocks.reverseCancelledOrder).toHaveBeenCalledWith('db-cancelled');
    expect(mocks.createOrder).not.toHaveBeenCalled();
    expect(result).toMatchObject({ reversed: 1, skipped: 2 });
  });

  it('rejects a mapped order when Shopee omits its selling price', async () => {
    const withoutPrice = detail('ORDER-NO-PRICE');
    (withoutPrice.item_list[0] as any).model_discounted_price = undefined;

    await expect(syncShopeeOrders(SHOP_ID, clientFor([withoutPrice]) as never)).rejects.toThrow('Shopee');
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it('paginates order list and batches detail requests at 50 orders', async () => {
    const orders = Array.from({ length: 51 }, (_, index) => detail(`ORDER-${index + 1}`));
    let listPage = 0;
    const client = {
      requestForShop: vi.fn(async (_shopId: bigint, path: string, options: any) => {
        if (path.endsWith('get_order_list')) {
          listPage += 1;
          return listPage === 1
            ? { response: { order_list: orders.slice(0, 25).map(order => ({ order_sn: order.order_sn })), more: true, next_cursor: 'next' } }
            : { response: { order_list: orders.slice(25).map(order => ({ order_sn: order.order_sn })), more: false } };
        }
        const requested = String(options.query.order_sn_list).split(',');
        return { response: { order_list: orders.filter(order => requested.includes(order.order_sn)) } };
      }),
    };

    const result = await syncShopeeOrders(SHOP_ID, client as never);

    expect(client.requestForShop).toHaveBeenCalledTimes(4);
    expect(result.created).toBe(51);
  });
});
