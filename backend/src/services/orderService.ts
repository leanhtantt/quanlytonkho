import { prisma } from '../prismaClient';
import { deductStockFIFO } from './inventoryService';

export interface OrderInput {
  externalCode: string;
  channel: string;
  orderedAt: Date;
  status: string;
  packagingFee: number;
  returnFee: number;
  platformFee: number;
  marketingFee: number;
  actualRevenue: number | null;
  settlementDate: Date | null;
  items: {
    productId: string; // must already be resolved to a real Product UUID
    qty: number;
    sellingPrice: number;
    isReturned: boolean;
  }[];
}

// Only the columns that live on the Order table (used by create and edit).
function orderColumns(input: OrderInput, expectedRevenue: number) {
  return {
    channel: input.channel,
    orderedAt: input.orderedAt,
    status: input.status,
    expectedRevenue,
    actualRevenue: input.actualRevenue,
    packagingFee: input.packagingFee,
    returnFee: input.returnFee,
    platformFee: input.platformFee,
    marketingFee: input.marketingFee,
    settlementDate: input.settlementDate,
  };
}

// Create the order's items, deduct stock (best-effort) and record the COGS ledger entry.
// Returns the expected revenue so the caller can store it on the order.
async function writeOrderItems(tx: any, orderId: string, items: OrderInput['items']) {
  let expectedRevenue = 0;
  let totalCogs = 0;

  for (const item of items) {
    await tx.orderItem.create({
      data: {
        orderId,
        productId: item.productId,
        qty: item.qty,
        sellingPrice: item.sellingPrice,
        isReturned: item.isReturned,
      }
    });

    if (!item.isReturned) {
      expectedRevenue += item.qty * item.sellingPrice;
      // strict:false — never block saving an order just because stock is short;
      // the frontend derives its own inventory and tolerates overselling.
      const fifo = await deductStockFIFO(item.productId, item.qty, 'ORDER', orderId, tx, { strict: false });
      totalCogs += fifo.totalCogs;
    }
  }

  await tx.ledgerEntry.create({
    data: {
      account: 'COGS',
      direction: 'DEBIT',
      amount: totalCogs,
      referenceType: 'ORDER',
      referenceId: orderId,
    }
  });

  return expectedRevenue;
}

// Undo everything an order did to inventory/accounting: give stock back to the
// exact batches it took from, then remove its stock transactions, ledger entries and items.
async function reverseOrderItems(tx: any, orderId: string) {
  const outTx = await tx.stockTransaction.findMany({
    where: { referenceType: 'ORDER', referenceId: orderId, type: 'OUT' }
  });
  for (const t of outTx) {
    // t.qty is stored negative (e.g. -3); increment by its absolute value.
    await tx.inventoryBatch.update({
      where: { id: t.batchId },
      data: { qtyRemaining: { increment: -t.qty } }
    });
  }
  await tx.stockTransaction.deleteMany({ where: { referenceType: 'ORDER', referenceId: orderId } });
  await tx.ledgerEntry.deleteMany({ where: { referenceType: 'ORDER', referenceId: orderId } });
  await tx.orderItem.deleteMany({ where: { orderId } });
}

export async function createOrder(input: OrderInput) {
  return await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: { externalCode: input.externalCode, ...orderColumns(input, 0) }
    });
    const expectedRevenue = await writeOrderItems(tx, order.id, input.items);
    return await tx.order.update({
      where: { id: order.id },
      data: { expectedRevenue }
    });
  });
}

// Edit an order by reversing its old items/stock and writing the new ones, in one transaction.
export async function replaceOrder(orderId: string, input: OrderInput) {
  return await prisma.$transaction(async (tx) => {
    await reverseOrderItems(tx, orderId);
    const expectedRevenue = await writeOrderItems(tx, orderId, input.items);
    return await tx.order.update({
      where: { id: orderId },
      data: orderColumns(input, expectedRevenue)
    });
  });
}

// Delete an order: give its stock back to inventory, then remove the order and its items.
export async function deleteOrder(orderId: string) {
  return await prisma.$transaction(async (tx) => {
    await reverseOrderItems(tx, orderId);
    await tx.order.delete({ where: { id: orderId } });
  });
}
