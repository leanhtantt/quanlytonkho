import { prisma } from '../prismaClient';
import { HEAVY_TX_OPTIONS } from '../transactionOptions';
import { allocatePurchaseItemCosts } from './procurementMath';

interface PurchaseInput {
  code: string;
  supplier?: string;
  receivedAt: Date;
  notes?: string;
  items: {
    productId?: string;
    sku: string;
    name: string;
    qty: number;
    totalCost: number; // Tong tien mua
    totalWeight: number; // Tong can nang
  }[];
  // Allocation totals
  totalDiscount: number;
  totalCompensation: number;
  purchaseFee: number;
  domesticShippingFee: number;
  internationalShippingFee: number;
}

// Core logic that runs inside a transaction. `tx` is the Prisma transaction client.
async function createPurchaseOrderTx(tx: any, input: PurchaseInput) {
  const allocations = allocatePurchaseItemCosts(input.items, {
    totalDiscount: input.totalDiscount,
    totalCompensation: input.totalCompensation,
    purchaseFee: input.purchaseFee,
    domesticShippingFee: input.domesticShippingFee,
    internationalShippingFee: input.internationalShippingFee,
  });

  // 2. Create the Purchase Order
  const po = await tx.purchaseOrder.create({
    data: {
      code: input.code,
      supplier: input.supplier,
      receivedAt: input.receivedAt,
      notes: input.notes,
      totalDiscount: input.totalDiscount,
      totalCompensation: input.totalCompensation,
      purchaseFee: input.purchaseFee,
      domesticShipping: input.domesticShippingFee,
      intlShipping: input.internationalShippingFee,
    }
  });

  // 3. Process items and allocate costs
  for (const [index, item] of input.items.entries()) {
    let productId = item.productId;
    if (!productId) {
      const product = await tx.product.upsert({
        where: { sku: item.sku },
        update: {},
        create: { sku: item.sku, name: item.name, status: 'active' }
      });
      productId = product.id;
    }

    const unitCost = allocations[index].unitCost;

    // 4. Create Purchase Item
    const pItem = await tx.purchaseItem.create({
      data: {
        purchaseOrderId: po.id,
        productId,
        qty: item.qty,
        totalCost: item.totalCost,
        totalWeight: item.totalWeight,
      }
    });

    // 5. Create Inventory Batch
    const batch = await tx.inventoryBatch.create({
      data: {
        productId,
        purchaseItemId: pItem.id,
        receivedAt: input.receivedAt,
        qtyInitial: item.qty,
        qtyRemaining: item.qty,
        unitCost: unitCost,
      }
    });

    // 6. Record Stock Transaction (IN)
    await tx.stockTransaction.create({
      data: {
        productId,
        batchId: batch.id,
        type: 'IN',
        qty: item.qty,
        unitCost: unitCost,
        referenceType: 'PURCHASE',
        referenceId: pItem.id,
      }
    });
  }

  return po;
}

// Delete a purchase order and everything it created (items, batches, stock transactions).
// Safety guard: refuse if any of the created stock has already been sold/used (FIFO deducted),
// otherwise inventory and accounting would be left inconsistent.
async function deletePurchaseOrderTx(tx: any, poId: string) {
  const po = await tx.purchaseOrder.findUnique({
    where: { id: poId },
    include: { purchaseItems: { include: { inventoryBatches: true } } }
  });
  if (!po) throw new Error('Không tìm thấy phiếu nhập để xóa.');

  const batchIds: string[] = [];
  for (const pItem of po.purchaseItems) {
    for (const batch of pItem.inventoryBatches) {
      // If some units have already left this batch, block the delete.
      if (batch.qtyRemaining !== batch.qtyInitial) {
        throw new Error(
          'Không thể xóa phiếu nhập này vì hàng trong lô đã được bán hoặc xuất bớt. ' +
          'Hãy hoàn tác các đơn/hao hụt liên quan trước.'
        );
      }
      batchIds.push(batch.id);
    }
  }

  // Delete in FK-safe order: stock transactions -> batches -> purchase items -> order.
  if (batchIds.length > 0) {
    await tx.stockTransaction.deleteMany({ where: { batchId: { in: batchIds } } });
    await tx.inventoryBatch.deleteMany({ where: { id: { in: batchIds } } });
  }
  
  // Extract productIds before deleting the items
  const productIds: string[] = Array.from(new Set(
    po.purchaseItems.map((p: { productId: string }) => p.productId)
  ));

  await tx.purchaseItem.deleteMany({ where: { purchaseOrderId: po.id } });
  await tx.purchaseOrder.delete({ where: { id: po.id } });

  return productIds;
}

async function cleanupUnusedProductsTx(tx: any, productIds: string[]) {
  for (const pid of productIds) {
    const hasPoItem = await tx.purchaseItem.findFirst({ where: { productId: pid } });
    const hasOrderItem = await tx.orderItem.findFirst({ where: { productId: pid } });
    const hasLoss = await tx.loss.findFirst({ where: { productId: pid } });
    const hasBatch = await tx.inventoryBatch.findFirst({ where: { productId: pid } });
    const hasTx = await tx.stockTransaction.findFirst({ where: { productId: pid } });
    
    if (!hasPoItem && !hasOrderItem && !hasLoss && !hasBatch && !hasTx) {
      await tx.product.delete({ where: { id: pid } });
    }
  }
}

export async function createPurchaseOrder(input: PurchaseInput) {
  return await prisma.$transaction((tx) => createPurchaseOrderTx(tx, input), HEAVY_TX_OPTIONS);
}

export async function deletePurchaseOrder(poId: string) {
  return await prisma.$transaction(async (tx) => {
    const productIds = await deletePurchaseOrderTx(tx, poId);
    await cleanupUnusedProductsTx(tx, productIds);
  }, HEAVY_TX_OPTIONS);
}

// Edit = reverse the old purchase order and recreate it with the same code, in one transaction.
export async function replacePurchaseOrder(poId: string, input: PurchaseInput) {
  return await prisma.$transaction(async (tx) => {
    const productIds = await deletePurchaseOrderTx(tx, poId);
    const po = await createPurchaseOrderTx(tx, input);
    await cleanupUnusedProductsTx(tx, productIds);
    return po;
  }, HEAVY_TX_OPTIONS);
}
