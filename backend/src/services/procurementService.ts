import { prisma } from '../prismaClient';

interface PurchaseInput {
  code: string;
  supplier?: string;
  receivedAt: Date;
  notes?: string;
  items: {
    productId: string;
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

export async function createPurchaseOrder(input: PurchaseInput) {
  return await prisma.$transaction(async (tx) => {
    // 1. Calculate totals for allocation
    const totalOrderCost = input.items.reduce((sum, item) => sum + item.totalCost, 0);
    const totalOrderWeight = input.items.reduce((sum, item) => sum + item.totalWeight, 0);

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
    for (const item of input.items) {
      // Calculate allocation ratios
      const costRatio = totalOrderCost > 0 ? item.totalCost / totalOrderCost : 0;
      const weightRatio = totalOrderWeight > 0 ? item.totalWeight / totalOrderWeight : 0;

      const allocatedDiscount = input.totalDiscount * costRatio;
      const allocatedCompensation = input.totalCompensation * costRatio;
      const allocatedPurchaseFee = input.purchaseFee * costRatio;
      
      const allocatedDomesticShipping = input.domesticShippingFee * weightRatio;
      const allocatedInternationalShipping = input.internationalShippingFee * weightRatio;

      const finalTotalCost = item.totalCost 
        - allocatedDiscount 
        - allocatedCompensation 
        + allocatedPurchaseFee 
        + allocatedDomesticShipping 
        + allocatedInternationalShipping;

      const unitCost = finalTotalCost / item.qty;

      // 4. Create Purchase Item
      const pItem = await tx.purchaseItem.create({
        data: {
          purchaseOrderId: po.id,
          productId: item.productId,
          qty: item.qty,
          totalCost: item.totalCost,
          totalWeight: item.totalWeight,
        }
      });

      // 5. Create Inventory Batch
      const batch = await tx.inventoryBatch.create({
        data: {
          productId: item.productId,
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
          productId: item.productId,
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
  });
}
