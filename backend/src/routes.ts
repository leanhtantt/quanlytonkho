import { Router } from 'express';
import { prisma } from './prismaClient';
import { z } from 'zod';
import { createPurchaseOrder, deletePurchaseOrder, replacePurchaseOrder } from './services/procurementService';
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
  id: z.string(),
  orderName: z.string().optional(),
  date: z.string().or(z.date()),
  notes: z.string().optional(),
  purchasingFee: z.number().nonnegative().optional().default(0),
  domesticShipping: z.number().nonnegative().optional().default(0),
  discountVnd: z.number().nonnegative().optional().default(0),
  compensationVnd: z.number().nonnegative().optional().default(0),
  totalIntlShipping: z.number().nonnegative().optional().default(0),
  items: z.array(z.object({
    productId: z.string(),
    name: z.string().optional(),
    qty: z.number().positive(),
    totalVndPrice: z.number().nonnegative(),
    weightKg: z.number().nonnegative().optional().default(0),
    finalCostVnd: z.number().nonnegative().optional().default(0),
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
  const body = { ...req.body };
  if (body.id && !body.sku) body.sku = body.id;
  
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const product = await prisma.product.create({ data: parsed.data });
  res.json(product);
});

apiRouter.put('/products/:id', async (req, res) => {
  try {
    let product = await prisma.product.findUnique({ where: { sku: req.params.id } });
    if (!product) {
      product = await prisma.product.findUnique({ where: { id: req.params.id } });
    }
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const updated = await prisma.product.update({
      where: { id: product.id },
      data: { sku: req.body.sku, name: req.body.name, status: req.body.status, imageId: req.body.imageId }
    });
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
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

// Turn the frontend purchase payload into the shape the procurement service expects,
// resolving each item's SKU/code to the real Product UUID.
function buildPurchaseInput(data: any, dbProducts: any[]) {
  return {
    code: data.id,
    supplier: data.orderName,
    receivedAt: new Date(data.date),
    notes: data.notes,
    totalDiscount: data.discountVnd,
    totalCompensation: data.compensationVnd,
    purchaseFee: data.purchasingFee,
    domesticShippingFee: data.domesticShipping,
    internationalShippingFee: data.totalIntlShipping,
    items: data.items.map((it: any) => {
      const prod = dbProducts.find(p => p.sku === it.productId || p.id === it.productId);
      return {
        productId: prod ? prod.id : it.productId,
        qty: it.qty,
        totalCost: it.totalVndPrice,
        totalWeight: it.weightKg * it.qty
      };
    })
  };
}

// Reload a purchase order and map it to the shape the frontend expects (id = code, etc.).
async function loadMappedPurchase(poId: string, data?: any) {
  const fullPo = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: { purchaseItems: { include: { inventoryBatches: true } } }
  });
  if (!fullPo) return null;
  return {
    ...fullPo,
    id: fullPo.code,
    date: fullPo.receivedAt.toISOString().split('T')[0],
    purchasingFee: Number(fullPo.purchaseFee),
    domesticShipping: Number(fullPo.domesticShipping),
    intlShipping: Number(fullPo.intlShipping),
    discountVnd: Number(fullPo.totalDiscount),
    compensationVnd: Number(fullPo.totalCompensation),
    totalIntlShipping: Number(fullPo.intlShipping),
    items: fullPo.purchaseItems.map(pi => ({
      ...pi,
      name: data?.items?.find((i: any) => i.productId === pi.productId)?.name || pi.productId,
      qty: pi.qty,
      totalVndPrice: Number(pi.totalCost),
      weightKg: pi.qty > 0 ? Number((Number(pi.totalWeight) / pi.qty).toFixed(3)) : 0,
      finalCostVnd: pi.inventoryBatches[0] ? Number(pi.inventoryBatches[0].unitCost) : 0
    }))
  };
}

apiRouter.post('/purchases', async (req, res) => {
  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const data = parsed.data;
    const dbProducts = await prisma.product.findMany();
    const po = await createPurchaseOrder(buildPurchaseInput(data, dbProducts));

    const mapped = await loadMappedPurchase(po.id, data);
    if (!mapped) return res.status(500).json({ error: 'Failed to load created PO' });
    res.json(mapped);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.put('/purchases/:id', async (req, res) => {
  try {
    // The frontend id is the purchase order's code; resolve it to the real UUID.
    const existing = await prisma.purchaseOrder.findUnique({ where: { code: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy phiếu nhập.' });

    const body = { ...req.body, id: req.body.id || req.params.id };
    const parsed = purchaseSchema.safeParse(body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const data = parsed.data;
    const dbProducts = await prisma.product.findMany();
    const po = await replacePurchaseOrder(existing.id, buildPurchaseInput(data, dbProducts));

    const mapped = await loadMappedPurchase(po.id, data);
    if (!mapped) return res.status(500).json({ error: 'Failed to load updated PO' });
    res.json(mapped);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.delete('/purchases/:id', async (req, res) => {
  try {
    // The frontend id is the purchase order's code; resolve it to the real UUID.
    const existing = await prisma.purchaseOrder.findUnique({ where: { code: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy phiếu nhập.' });

    await deletePurchaseOrder(existing.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
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

      const dbProducts = await tx.product.findMany();
      let totalCogs = 0;
      for (const item of items) {
        const prod = dbProducts.find(p => p.sku === item.productId || p.id === item.productId);
        const resolvedProductId = prod ? prod.id : item.productId;

        const fifoResult = await deductStockFIFO(resolvedProductId, item.qty, 'ORDER', createdOrder.id, tx);
        totalCogs += fifoResult.totalCogs;

        await tx.orderItem.create({
          data: {
            orderId: createdOrder.id,
            productId: resolvedProductId,
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
  try {
    // The frontend id is the order's externalCode; resolve it to the real UUID.
    const existing = await prisma.order.findUnique({ where: { externalCode: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy đơn hàng.' });

    const b = req.body || {};
    // Only write fields that actually exist as columns on Order.
    const data: any = {};
    if (b.status !== undefined) data.status = b.status;
    if (b.channel !== undefined) data.channel = b.channel;
    else if (b.shop !== undefined) data.channel = b.shop; // frontend calls the channel "shop"
    if (b.date !== undefined) data.orderedAt = new Date(b.date);
    if (b.actualRevenue !== undefined) {
      data.actualRevenue = (b.actualRevenue === null || b.actualRevenue === '') ? null : Number(b.actualRevenue);
    }

    await prisma.order.update({ where: { id: existing.id }, data });

    const withItems = await prisma.order.findUnique({
      where: { id: existing.id },
      include: { orderItems: true }
    });
    const mapped = {
      ...withItems,
      id: withItems!.externalCode,
      date: withItems!.orderedAt.toISOString().split('T')[0],
      items: withItems!.orderItems.map(oi => ({ ...oi, qty: oi.qty }))
    };
    // Preserve any frontend-only fields the caller sent (e.g. packagingFee) for this session;
    // canonical DB fields override. NOTE: those extra fields are not persisted yet (no columns).
    res.json({ ...b, ...mapped, items: b.items ?? mapped.items });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
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
    const dbProducts = await prisma.product.findMany();
    const prod = dbProducts.find(p => p.sku === req.body.productId || p.id === req.body.productId);
    const resolvedProductId = prod ? prod.id : req.body.productId;

    const result = await recordLoss(resolvedProductId, req.body.qty, req.body.reason);
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
