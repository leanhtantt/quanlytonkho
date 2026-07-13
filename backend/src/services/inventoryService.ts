import { prisma } from '../prismaClient';

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

    let remainingToDeduct = requestedQty;
    let totalCogs = 0;
    const deductions = [];

    for (const batch of availableBatches) {
      if (remainingToDeduct <= 0) break;

      const deductQty = Math.min(batch.qtyRemaining, remainingToDeduct);
      
      // Update batch
      await tx.$executeRaw`
        UPDATE "InventoryBatch" 
        SET "qtyRemaining" = "qtyRemaining" - ${deductQty}, "updatedAt" = NOW() 
        WHERE id = ${batch.id}
      `;

      // Record stock transaction (OUT)
      await tx.stockTransaction.create({
        data: {
          productId,
          batchId: batch.id,
          type: 'OUT',
          qty: -deductQty,
          unitCost: batch.unitCost,
          referenceType,
          referenceId,
        }
      });

      totalCogs += deductQty * batch.unitCost;
      remainingToDeduct -= deductQty;
      deductions.push({ batchId: batch.id, qty: deductQty, unitCost: batch.unitCost });
    }

    if (remainingToDeduct > 0 && strict) {
      const product = await tx.product.findUnique({
        where: { id: productId },
        select: { sku: true, name: true }
      });
      const sku = product?.sku || productId;
      const productName = product?.name ? ` – ${product.name}` : '';
      const availableQty = requestedQty - remainingToDeduct;
      throw new Error(`Không đủ tồn kho cho SKU ${sku}${productName}. Tồn khả dụng: ${availableQty}, cần: ${requestedQty}, thiếu: ${remainingToDeduct}.`);
    }

    return {
      success: true,
      deductedQty: requestedQty - remainingToDeduct,
      totalCogs,
      deductions
    };
  };

  return providedTx ? run(providedTx) : prisma.$transaction(run);
}
