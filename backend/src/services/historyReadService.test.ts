import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  stockFindMany: vi.fn(),
  ledgerFindMany: vi.fn(),
}));

vi.mock('../prismaClient', () => ({
  prisma: {
    stockTransaction: { findMany: mocks.stockFindMany },
    ledgerEntry: { findMany: mocks.ledgerFindMany },
  },
}));

import { deductionsFor, getReferenceCostMaps } from './historyReadService';

describe('history read cost snapshots', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses persisted FIFO deductions and nets reversal ledgers', async () => {
    mocks.stockFindMany.mockResolvedValue([{
      referenceId: 'ORDER-1', productId: 'PRODUCT-1', batchId: 'BATCH-1', qty: -2, unitCost: 16000,
      batch: { purchaseItem: { purchaseOrder: { code: 'PO-1' } }, inventoryAdjustment: null },
    }]);
    mocks.ledgerFindMany.mockResolvedValue([
      { referenceId: 'ORDER-1', direction: 'DEBIT', amount: 32000 },
      { referenceId: 'ORDER-1', direction: 'CREDIT', amount: 32000 },
    ]);

    const costs = await getReferenceCostMaps('ORDER', ['ORDER-1']);

    expect(costs.totalByReference.get('ORDER-1')).toBe(0);
    expect(deductionsFor(costs, 'ORDER-1', 'PRODUCT-1')).toEqual({
      totalCostDeducted: 32000,
      batchesDeducted: [{ purchaseId: 'PO-1', qty: 2, costVnd: 16000 }],
    });
  });
});
