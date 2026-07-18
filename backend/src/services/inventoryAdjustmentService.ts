import { prisma } from '../prismaClient';
import { randomUUID } from 'crypto';
import { HEAVY_TX_OPTIONS } from '../transactionOptions';
import { BusinessError } from '../errors/BusinessError';

interface SurplusInput {
  productId: string;
  qty: number;
  unitCost: number;
  reason: string;
  occurredAt: Date;
}

async function createAdjustmentEffects(tx: any, adjustmentId: string, input: SurplusInput) {
  const batch = await tx.inventoryBatch.create({
    data: {
      productId: input.productId,
      receivedAt: input.occurredAt,
      qtyInitial: input.qty,
      qtyRemaining: input.qty,
      unitCost: input.unitCost
    }
  });

  const adjustment = await tx.inventoryAdjustment.create({
    data: {
      id: adjustmentId,
      productId: input.productId,
      batchId: batch.id,
      qty: input.qty,
      unitCost: input.unitCost,
      reason: input.reason,
      occurredAt: input.occurredAt
    }
  });

  await tx.stockTransaction.create({
    data: {
      productId: input.productId,
      batchId: batch.id,
      type: 'IN',
      qty: input.qty,
      unitCost: input.unitCost,
      referenceType: 'ADJUSTMENT',
      referenceId: adjustment.id
    }
  });

  await tx.ledgerEntry.create({
    data: {
      account: 'INVENTORY_SURPLUS',
      direction: 'CREDIT',
      amount: input.qty * input.unitCost,
      referenceType: 'ADJUSTMENT',
      referenceId: adjustment.id
    }
  });

  return adjustment;
}

async function assertUnusedAndRemoveEffects(tx: any, adjustmentId: string) {
  const adjustment = await tx.inventoryAdjustment.findUnique({
    where: { id: adjustmentId },
    include: { batch: true }
  });
  if (!adjustment) throw new BusinessError('Không tìm thấy phiếu kiểm kê dư.');
  if (adjustment.batch.qtyRemaining !== adjustment.batch.qtyInitial) {
    throw new BusinessError('Lô hàng dư này đã được xuất dùng. Hãy tạo phiếu điều chỉnh ngược thay vì sửa/xóa lịch sử.');
  }

  await tx.stockTransaction.deleteMany({ where: { referenceType: 'ADJUSTMENT', referenceId: adjustmentId } });
  await tx.ledgerEntry.deleteMany({ where: { referenceType: 'ADJUSTMENT', referenceId: adjustmentId } });
  await tx.inventoryAdjustment.delete({ where: { id: adjustmentId } });
  await tx.inventoryBatch.delete({ where: { id: adjustment.batchId } });
}

export async function createSurplusAdjustment(input: SurplusInput) {
  return prisma.$transaction(async tx => createAdjustmentEffects(tx, randomUUID(), input), HEAVY_TX_OPTIONS);
}

export async function replaceSurplusAdjustment(adjustmentId: string, input: SurplusInput) {
  return prisma.$transaction(async tx => {
    await assertUnusedAndRemoveEffects(tx, adjustmentId);
    return createAdjustmentEffects(tx, adjustmentId, input);
  }, HEAVY_TX_OPTIONS);
}

export async function deleteSurplusAdjustment(adjustmentId: string) {
  return prisma.$transaction(async tx => {
    await assertUnusedAndRemoveEffects(tx, adjustmentId);
  }, HEAVY_TX_OPTIONS);
}
