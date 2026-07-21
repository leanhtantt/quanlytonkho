import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  ledgerFindFirst: vi.fn(),
  ledgerCreate: vi.fn(),
  stockFindMany: vi.fn(),
  stockCreate: vi.fn(),
  batchUpdate: vi.fn(),
  orderCreate: vi.fn(),
  orderItemCreate: vi.fn(),
  orderUpdate: vi.fn(),
  deductStockFIFO: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../prismaClient', () => {
  const tx = {
    $queryRaw: mocks.queryRaw,
    ledgerEntry: { findFirst: mocks.ledgerFindFirst, create: mocks.ledgerCreate },
    stockTransaction: { findMany: mocks.stockFindMany, create: mocks.stockCreate },
    inventoryBatch: { update: mocks.batchUpdate },
    order: { create: mocks.orderCreate, update: mocks.orderUpdate },
    orderItem: { create: mocks.orderItemCreate },
  };
  return {
    prisma: {
      $transaction: mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx)),
      order: { update: mocks.orderUpdate },
    },
  };
});

vi.mock('./inventoryService', () => ({ deductStockFIFO: mocks.deductStockFIFO }));

import { createOrder, reverseCancelledOrder, updateOrderStatus } from './orderService';

describe('createOrder', () => {
  it('uses the shared FIFO path and writes the COGS ledger in one transaction', async () => {
    mocks.orderCreate.mockResolvedValue({ id: 'order-1' });
    mocks.deductStockFIFO.mockResolvedValue({ totalCogs: 25_000 });
    mocks.orderUpdate.mockResolvedValue({ id: 'order-1', expectedRevenue: 40_000 });

    await createOrder({
      externalCode: 'SHOPEE-1', channel: 'Shopee', orderedAt: new Date('2026-07-21T00:00:00Z'),
      status: '\u0110ang giao', packagingFee: 1_000, returnFee: 0, platformFee: 0, marketingFee: 0,
      actualRevenue: null, settlementDate: null, note: null,
      items: [{ productId: 'product-1', skuAtOrder: 'SKU-1', qty: 2, sellingPrice: 20_000, isReturned: false }],
    });

    expect(mocks.deductStockFIFO).toHaveBeenCalledWith(
      'product-1', 2, 'ORDER', 'order-1', expect.anything(), { strict: false },
    );
    expect(mocks.ledgerCreate).toHaveBeenCalledWith({ data: {
      account: 'COGS', direction: 'DEBIT', amount: 25_000,
      referenceType: 'ORDER', referenceId: 'order-1',
    } });
    expect(mocks.orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'order-1' }, data: { expectedRevenue: 40_000 },
    }));
  });
});

describe('updateOrderStatus', () => {
  it('updates only the status column without opening the FIFO/ledger transaction', async () => {
    vi.clearAllMocks();
    mocks.orderUpdate.mockResolvedValue({ id: 'order-1', status: '\u0110\u00e3 giao' });
    await updateOrderStatus('order-1', '\u0110\u00e3 giao');

    expect(mocks.orderUpdate).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { status: '\u0110\u00e3 giao' },
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.stockFindMany).not.toHaveBeenCalled();
    expect(mocks.ledgerCreate).not.toHaveBeenCalled();
  });
});

describe('reverseCancelledOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async callback => callback({
      $queryRaw: mocks.queryRaw,
      ledgerEntry: { findFirst: mocks.ledgerFindFirst, create: mocks.ledgerCreate },
      stockTransaction: { findMany: mocks.stockFindMany, create: mocks.stockCreate },
      inventoryBatch: { update: mocks.batchUpdate },
      order: { create: mocks.orderCreate, update: mocks.orderUpdate },
      orderItem: { create: mocks.orderItemCreate },
    }));
    mocks.queryRaw.mockResolvedValue([{ id: 'order-1', status: 'Đang giao' }]);
    mocks.ledgerFindFirst.mockResolvedValue(null);
    mocks.stockFindMany.mockResolvedValue([
      { productId: 'product-1', batchId: 'batch-1', qty: -2, unitCost: 10_000 },
      { productId: 'product-1', batchId: 'batch-2', qty: -1, unitCost: 12_000 },
    ]);
    mocks.orderUpdate.mockResolvedValue({ id: 'order-1', status: 'Đã hủy' });
  });

  it('creates append-only stock and COGS compensation without deleting history', async () => {
    const result = await reverseCancelledOrder('order-1');

    expect(mocks.batchUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: 'batch-1' }, data: { qtyRemaining: { increment: 2 } },
    });
    expect(mocks.stockCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      type: 'RETURN', qty: 2, referenceType: 'ORDER_REVERSAL', referenceId: 'order-1',
    }) });
    expect(mocks.ledgerCreate).toHaveBeenCalledWith({ data: {
      account: 'COGS', direction: 'CREDIT', amount: 32_000,
      referenceType: 'ORDER_REVERSAL', referenceId: 'order-1',
    } });
    expect(result.reversed).toBe(true);
  });

  it('is idempotent when a reversal ledger entry already exists', async () => {
    mocks.ledgerFindFirst.mockResolvedValue({ id: 'reversal-1' });

    const result = await reverseCancelledOrder('order-1');

    expect(result.reversed).toBe(false);
    expect(mocks.stockFindMany).not.toHaveBeenCalled();
    expect(mocks.ledgerCreate).not.toHaveBeenCalled();
  });
});
