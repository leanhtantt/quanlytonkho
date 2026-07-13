import { prisma } from '../prismaClient';
import { planFifoDeductions } from './inventoryMath';

export async function deductStockFIFO(
  productId: string,
  requestedQty: number,
  referenceType: string,
  referenceId: string,
  providedTx?: any,
  options: { strict?: boolean } = {}
) {
  const strict = options.strict !== false; // default true
  const run = async (tx: any) => {
    // 1. Get available batches ordered by receivedAt (FIFO)
    // We use queryRaw for row-level locking (SELECT FOR UPDATE)
    const availableBatches = await tx.$queryRaw<
      { id: string; qtyRemaining: number; unitCost: number }[]
    >`
      SELECT id, "qtyRemaining", "unitCost" 
      FROM "InventoryBatch" 
      WHERE "productId" = ${productId} AND "qtyRemaining" > 0 
      ORDER BY "receivedAt" ASC 
      FOR UPDATE
    `;

    const plan = planFifoDeductions(availableBatches, requestedQty);

    if (plan.remaining > 0 && strict) {
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { sku: true, name: true }
      });
      const sku = product?.sku || productId;
      const productName = product?.name ? ` – ${product.name}` : '';
      throw new Error(`Không đủ tồn kho cho SKU ${sku}${productName}. Tồn khả dụng: ${plan.deductedQty}, cần: ${requestedQty}, thiếu: ${plan.remaining}.`);
    }

    for (const deduction of plan.deductions) {
      // Update batch
      await tx.$executeRaw`
        UPDATE "InventoryBatch" 
        SET "qtyRemaining" = "qtyRemaining" - ${deduction.qty}, "updatedAt" = NOW()
        WHERE id = ${deduction.batchId}
      `;

      // Record stock transaction (OUT)
      await tx.stockTransaction.create({
        data: {
          productId,
          batchId: deduction.batchId,
          type: 'OUT',
          qty: -deduction.qty,
          unitCost: deduction.unitCost,
          referenceType,
          referenceId,
        }
      });

    }

    return {
      success: true,
      deductedQty: plan.deductedQty,
      totalCogs: plan.totalCogs,
      deductions: plan.deductions
    };
  };

  return providedTx ? run(providedTx) : prisma.$transaction(run);
}
