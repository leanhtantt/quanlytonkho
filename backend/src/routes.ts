import { Router } from 'express';
import { prisma } from './prismaClient';
import { z } from 'zod';
import { createPurchaseOrder } from './services/procurementService';
import { deductStockFIFO } from './services/inventoryService';
import { recordLoss } from './services/financeService';

export const apiRouter = Router();

// --- Zod Schemas ---
const productSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  status: z.string().optional().default('active'),
  imageId: z.string().optional().nullable(),
});

const purchaseSchema = z.object({
  supplier: z.string().optional(),
  receivedAt: z.string().or(z.date()),
  notes: z.string().optional(),
  items: z.array(z.object({
    productId: z.string(),
    qty: z.number().positive(),
    totalCost: z.number().nonnegative(),
    totalWeight: z.number().nonnegative().optional().default(0),
  })).min(1),
});

const orderSchema = z.object({
  channel: z.string(),
  externalCode: z.string(),
  orderedAt: z.string().or(z.date()),
  items: z.array(z.object({
    productId: z.string(),
    qty: z.number().positive(),
    sellingPrice: z.number().nonnegative(),
  })).min(1),
});

const lossSchema = z.object({
  productId: z.string(),
  qty: z.number().positive(),
  reason: z.string(),
});

const settingsSchema = z.object({
  partners: z.any().optional(),
  accounts: z.any().optional(),
  packagingCost: z.number().nonnegative().optional(),
  returnFee: z.number().nonnegative().optional(),
});

// --- Products ---
apiRouter.get('/products', async (req, res) => {
  const products = await prisma.product.findMany();
  res.json(products);
});

apiRouter.post('/products', async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const product = await prisma.product.create({ data: parsed.data });
  res.json(product);
});

apiRouter.put('/products/:id', async (req, res) => {
  const product = await prisma.product.update({
    where: { id: req.params.id },
    data: { sku: req.body.sku, name: req.body.name, status: req.body.status, imageId: req.body.imageId }
  });
  res.json(product);
});

// --- Purchases ---
apiRouter.get('/purchases', async (req, res) => {
  const purchases = await prisma.purchaseOrder.findMany({ 
    include: { purchaseItems: { include: { inventoryBatches: true } } } 
  });
  const mapped = purchases.map(p => ({
    ...p,
    id: p.code,
    date: p.receivedAt.toISOString().split('T')[0],
    purchasingFee: Number(p.purchaseFee),
    domesticShipping: Number(p.domesticShipping),
    intlShipping: Number(p.intlShipping),
    discountVnd: Number(p.totalDiscount),
    compensationVnd: Number(p.totalCompensation),
    totalIntlShipping: Number(p.intlShipping),
    items: p.purchaseItems.map(pi => ({
      ...pi,
      qty: pi.qty,
      totalVndPrice: Number(pi.totalCost),
      weightKg: pi.qty > 0 ? Number((Number(pi.totalWeight) / pi.qty).toFixed(3)) : 0,
      finalCostVnd: pi.inventoryBatches[0] ? Number(pi.inventoryBatches[0].unitCost) : 0
    }))
  }));
  res.json(mapped);
});

apiRouter.post('/purchases', async (req, res) => {
  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const po = await createPurchaseOrder(req.body);
    res.json(po);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.put('/purchases/:id', async (req, res) => {
  const po = await prisma.purchaseOrder.update({
    where: { id: req.params.id },
    data: req.body
  });
  res.json(po);
});

// --- Orders ---
apiRouter.get('/orders', async (req, res) => {
  const orders = await prisma.order.findMany({ include: { orderItems: true } });
  const mapped = orders.map(o => ({
    ...o,
    id: o.externalCode,
    date: o.orderedAt.toISOString().split('T')[0],
    items: o.orderItems.map(oi => ({
      ...oi,
      qty: oi.qty
    }))
  }));
  res.json(mapped);
});

apiRouter.post('/orders', async (req, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  
  try {
    const { channel, externalCode, orderedAt, items } = req.body;
    const order = await prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          channel,
          externalCode,
          orderedAt: new Date(orderedAt),
          status: 'SHIPPING',
          expectedRevenue: items.reduce((sum: number, it: any) => sum + it.qty * it.sellingPrice, 0)
        }
      });

      let totalCogs = 0;
      for (const item of items) {
        const fifoResult = await deductStockFIFO(item.productId, item.qty, 'ORDER', createdOrder.id, tx);
        totalCogs += fifoResult.totalCogs;

        await tx.orderItem.create({
          data: {
            orderId: createdOrder.id,
            productId: item.productId,
            qty: item.qty,
            sellingPrice: item.sellingPrice
          }
        });
      }

      await tx.ledgerEntry.create({
        data: {
          account: 'COGS',
          direction: 'DEBIT',
          amount: totalCogs,
          referenceType: 'ORDER',
          referenceId: createdOrder.id
        }
      });
      return createdOrder;
    });
    res.json(order);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.put('/orders/:id', async (req, res) => {
  const order = await prisma.order.update({
    where: { id: req.params.id },
    data: req.body
  });
  res.json(order);
});

// --- Losses ---
apiRouter.get('/losses', async (req, res) => {
  const losses = await prisma.loss.findMany({ include: { product: true } });
  const mapped = losses.map(l => ({
    ...l,
    name: l.product?.name,
    sku: l.product?.sku,
    date: l.occurredAt
  }));
  res.json(mapped);
});

apiRouter.post('/losses', async (req, res) => {
  const parsed = lossSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const result = await recordLoss(req.body.productId, req.body.qty, req.body.reason);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// --- Inventory ---
apiRouter.get('/inventory', async (req, res) => {
  const products = await prisma.product.findMany();
  const batches = await prisma.inventoryBatch.findMany({ where: { qtyRemaining: { gt: 0 } } });
  
  const inventory = products.map(p => {
    const pBatches = batches.filter(b => b.productId === p.id);
    const totalQty = pBatches.reduce((sum, b) => sum + b.qtyRemaining, 0);
    const totalCost = pBatches.reduce((sum, b) => sum + (b.qtyRemaining * Number(b.unitCost)), 0);
    return {
      productId: p.id,
      sku: p.sku,
      name: p.name,
      totalQty,
      avgUnitCost: totalQty > 0 ? totalCost / totalQty : 0,
      batches: pBatches
    };
  });
  res.json(inventory);
});

// --- Settings ---
apiRouter.get('/settings', async (req, res) => {
  let settings = await prisma.appSettings.findUnique({ where: { id: 'default' } });
  if (!settings) {
    settings = await prisma.appSettings.create({
      data: { id: 'default', partners: [], accounts: [] }
    });
  }
  res.json(settings);
});

apiRouter.put('/settings', async (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const settings = await prisma.appSettings.upsert({
    where: { id: 'default' },
    update: parsed.data,
    create: { id: 'default', partners: [], accounts: [], ...parsed.data }
  });
  res.json(settings);
});

// --- Treasury ---
apiRouter.get('/treasury/transactions', async (req, res) => {
  const transactions = await prisma.treasuryTransaction.findMany();
  res.json(transactions);
});

apiRouter.post('/treasury/transactions', async (req, res) => {
  const transaction = await prisma.treasuryTransaction.create({ data: req.body });
  res.json(transaction);
});

apiRouter.put('/treasury/transactions/:id', async (req, res) => {
  const transaction = await prisma.treasuryTransaction.update({
    where: { id: req.params.id },
    data: req.body
  });
  res.json(transaction);
});

apiRouter.delete('/treasury/transactions/:id', async (req, res) => {
  await prisma.treasuryTransaction.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// --- Dashboard Stats (simplified) ---
apiRouter.get('/dashboard/stats', async (req, res) => {
  res.json({ message: "Not implemented yet" });
});
