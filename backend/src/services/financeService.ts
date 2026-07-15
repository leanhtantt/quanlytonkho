import { prisma } from '../prismaClient';
import { HEAVY_TX_OPTIONS } from '../transactionOptions';
import { deductStockFIFO } from './inventoryService';

async function writeLossEffects(tx: any, lossId: string, productId: string, qty: number) {
  const fifoResult = await deductStockFIFO(productId, qty, 'LOSS', lossId, tx);

  await tx.ledgerEntry.create({
    data: {
      account: 'INVENTORY_LOSS',
      direction: 'DEBIT',
      amount: fifoResult.totalCogs,
      referenceType: 'LOSS',
      referenceId: lossId
    }
  });

  return fifoResult;
}

async function reverseLossEffects(tx: any, lossId: string) {
  const outTransactions = await tx.stockTransaction.findMany({
    where: { referenceType: 'LOSS', referenceId: lossId, type: 'OUT' }
  });

  for (const transaction of outTransactions) {
    await tx.inventoryBatch.update({
      where: { id: transaction.batchId },
      data: { qtyRemaining: { increment: -transaction.qty } }
    });
  }

  await tx.stockTransaction.deleteMany({ where: { referenceType: 'LOSS', referenceId: lossId } });
  await tx.ledgerEntry.deleteMany({ where: { referenceType: 'LOSS', referenceId: lossId } });
}

export async function recordLoss(productId: string, qty: number, reason: string, occurredAt?: Date) {
  return prisma.$transaction(async (tx) => {
    const loss = await tx.loss.create({
      data: { productId, qty, reason, ...(occurredAt ? { occurredAt } : {}) }
    });

    const fifoResult = await writeLossEffects(tx, loss.id, productId, qty);

    return { loss, deductions: fifoResult.deductions, totalLossValue: fifoResult.totalCogs };
  }, HEAVY_TX_OPTIONS);
}

export async function replaceLoss(lossId: string, productId: string, qty: number, reason: string, occurredAt?: Date) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.loss.findUnique({ where: { id: lossId } });
    if (!existing) throw new Error('Không tìm thấy phiếu hao hụt.');

    await reverseLossEffects(tx, lossId);
    const loss = await tx.loss.update({
      where: { id: lossId },
      data: { productId, qty, reason, ...(occurredAt ? { occurredAt } : {}) }
    });

    const fifoResult = await writeLossEffects(tx, loss.id, productId, qty);

    return { loss, deductions: fifoResult.deductions, totalLossValue: fifoResult.totalCogs };
  }, HEAVY_TX_OPTIONS);
}

export async function deleteLoss(lossId: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.loss.findUnique({ where: { id: lossId } });
    if (!existing) throw new Error('Không tìm thấy phiếu hao hụt.');

    await reverseLossEffects(tx, lossId);
    await tx.loss.delete({ where: { id: lossId } });
  }, HEAVY_TX_OPTIONS);
}
