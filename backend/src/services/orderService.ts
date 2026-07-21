import { prisma } from '../prismaClient';
import { HEAVY_TX_OPTIONS } from '../transactionOptions';
import { deductStockFIFO } from './inventoryService';
import { BusinessError } from '../errors/BusinessError';

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
  note: string | null;
  items: {
    productId: string; // must already be resolved to a real Product UUID
    skuAtOrder: string;
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
    note: input.note,
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
        skuAtOrder: item.skuAtOrder,
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
  }, HEAVY_TX_OPTIONS);
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
  }, HEAVY_TX_OPTIONS);
}

// Status transitions do not change inventory or accounting, so keep them out of
// replaceOrder (which intentionally rebuilds order items, FIFO and COGS).
export async function updateOrderStatus(orderId: string, status: string) {
  return await prisma.order.update({
    where: { id: orderId },
    data: { status },
  });
}

// Cancel an imported order without deleting its accounting history. The compensating
// stock and COGS entries make the reversal append-only and idempotent.
export async function reverseCancelledOrder(orderId: string) {
  return await prisma.$transaction(async (tx) => {
    const [lockedOrder] = await tx.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT id, status FROM "Order" WHERE id = ${orderId} FOR UPDATE
    `;
    if (!lockedOrder) throw new BusinessError('Không tìm thấy đơn hàng cần đảo.');

    const existingReversal = await tx.ledgerEntry.findFirst({
      where: { referenceType: 'ORDER_REVERSAL', referenceId: orderId },
    });
    if (existingReversal) {
      const order = lockedOrder.status === 'Đã hủy'
        ? lockedOrder
        : await tx.order.update({ where: { id: orderId }, data: { status: 'Đã hủy' } });
      return { order, reversed: false };
    }

    const outTransactions = await tx.stockTransaction.findMany({
      where: { referenceType: 'ORDER', referenceId: orderId, type: 'OUT' },
    });
    let reversedCogs = 0;
    for (const transaction of outTransactions) {
      const returnedQty = -transaction.qty;
      await tx.inventoryBatch.update({
        where: { id: transaction.batchId },
        data: { qtyRemaining: { increment: returnedQty } },
      });
      await tx.stockTransaction.create({
        data: {
          productId: transaction.productId,
          batchId: transaction.batchId,
          type: 'RETURN',
          qty: returnedQty,
          unitCost: transaction.unitCost,
          referenceType: 'ORDER_REVERSAL',
          referenceId: orderId,
        },
      });
      reversedCogs += returnedQty * Number(transaction.unitCost);
    }

    await tx.ledgerEntry.create({
      data: {
        account: 'COGS',
        direction: 'CREDIT',
        amount: reversedCogs,
        referenceType: 'ORDER_REVERSAL',
        referenceId: orderId,
      },
    });
    const order = await tx.order.update({
      where: { id: orderId },
      data: { status: 'Đã hủy' },
    });
    return { order, reversed: true };
  }, HEAVY_TX_OPTIONS);
}

// Delete an order: give its stock back to inventory, then remove the order and its items.
export async function deleteOrder(orderId: string) {
  return await prisma.$transaction(async (tx) => {
    await reverseOrderItems(tx, orderId);
    await tx.order.delete({ where: { id: orderId } });
  }, HEAVY_TX_OPTIONS);
}
