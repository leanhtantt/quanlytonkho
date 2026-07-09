import { prisma } from '../prismaClient';
import { deductStockFIFO } from './inventoryService';

export async function recordLoss(productId: string, qty: number, reason: string) {
  return await prisma.$transaction(async (tx) => {
    // 1. Record the Loss entry
    const loss = await tx.loss.create({
      data: {
        productId,
        qty,
        reason
      }
    });

    // 2. Deduct from Inventory using FIFO
    const fifoResult = await deductStockFIFO(productId, qty, 'LOSS', loss.id, tx);

    // 3. Record in Ledger as expense
    await tx.ledgerEntry.create({
      data: {
        account: 'INVENTORY_LOSS',
        direction: 'DEBIT',
        amount: fifoResult.totalCogs,
        referenceType: 'LOSS',
        referenceId: loss.id
      }
    });

    return {
      loss,
      deductions: fifoResult.deductions,
      totalLossValue: fifoResult.totalCogs
    };
  });
}
