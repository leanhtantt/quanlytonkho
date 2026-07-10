import { Router } from 'express';
import { prisma } from './prismaClient';
import { z } from 'zod';
import { createPurchaseOrder, deletePurchaseOrder, replacePurchaseOrder } from './services/procurementService';
import { recordLoss } from './services/financeService';
import { createOrder, replaceOrder, deleteOrder, OrderInput } from './services/orderService';

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
  id: z.string(),
  date: z.string().or(z.date()),
  shop: z.string(),
  status: z.string().optional().default('Đang giao'),
  packagingFee: z.number().nonnegative().optional().default(0),
  returnFee: z.number().nonnegative().optional().default(0),
  platformFee: z.number().nonnegative().optional().default(0),
  marketingFee: z.number().nonnegative().optional().default(0),
  actualRevenue: z.number().nullable().optional(),
  settlementDate: z.string().nullable().optional(),
  items: z.array(z.object({
    productId: z.string(),
    name: z.string().optional(),
    qty: z.number().positive(),
    sellingPrice: z.number().nonnegative(),
    isReturned: z.boolean().optional().default(false),
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
// Turn the frontend order payload into the shape orderService expects,
// resolving each item's SKU/code to the real Product UUID.
function buildOrderInput(data: any, dbProducts: any[]): OrderInput {
  return {
    externalCode: data.id,
    channel: data.shop,
    orderedAt: new Date(data.date),
    status: data.status || 'Đang giao',
    packagingFee: data.packagingFee || 0,
    returnFee: data.returnFee || 0,
    platformFee: data.platformFee || 0,
    marketingFee: data.marketingFee || 0,
    actualRevenue: (data.actualRevenue === null || data.actualRevenue === undefined || data.actualRevenue === '')
      ? null : Number(data.actualRevenue),
    settlementDate: data.settlementDate ? new Date(data.settlementDate) : null,
    items: data.items.map((it: any) => {
      const prod = dbProducts.find(p => p.sku === it.productId || p.id === it.productId);
      return {
        productId: prod ? prod.id : it.productId,
        qty: it.qty,
        sellingPrice: it.sellingPrice,
        isReturned: it.isReturned || false,
      };
    })
  };
}

// Map a DB order (with items + products) to the shape the frontend expects.
async function loadMappedOrder(orderId: string) {
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    include: { orderItems: { include: { product: true } } }
  });
  if (!o) return null;
  return {
    ...o,
    id: o.externalCode,
    shop: o.channel,
    date: o.orderedAt.toISOString().split('T')[0],
    settlementDate: o.settlementDate ? o.settlementDate.toISOString().split('T')[0] : null,
    expectedRevenue: Number(o.expectedRevenue),
    actualRevenue: o.actualRevenue === null ? null : Number(o.actualRevenue),
    packagingFee: Number(o.packagingFee),
    returnFee: Number(o.returnFee),
    platformFee: Number(o.platformFee),
    marketingFee: Number(o.marketingFee),
    items: o.orderItems.map(oi => ({
      productId: oi.productId,
      sku: oi.product?.sku || oi.productId,
      name: oi.product?.name || oi.productId,
      qty: oi.qty,
      sellingPrice: Number(oi.sellingPrice),
      isReturned: oi.isReturned,
    }))
  };
}

apiRouter.get('/orders', async (req, res) => {
  const orders = await prisma.order.findMany({
    include: { orderItems: { include: { product: true } } }
  });
  const mapped = orders.map(o => ({
    ...o,
    id: o.externalCode,
    shop: o.channel,
    date: o.orderedAt.toISOString().split('T')[0],
    settlementDate: o.settlementDate ? o.settlementDate.toISOString().split('T')[0] : null,
    expectedRevenue: Number(o.expectedRevenue),
    actualRevenue: o.actualRevenue === null ? null : Number(o.actualRevenue),
    packagingFee: Number(o.packagingFee),
    returnFee: Number(o.returnFee),
    platformFee: Number(o.platformFee),
    marketingFee: Number(o.marketingFee),
    items: o.orderItems.map(oi => ({
      productId: oi.productId,
      sku: oi.product?.sku || oi.productId,
      name: oi.product?.name || oi.productId,
      qty: oi.qty,
      sellingPrice: Number(oi.sellingPrice),
      isReturned: oi.isReturned,
    }))
  }));
  res.json(mapped);
});

apiRouter.post('/orders', async (req, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const dbProducts = await prisma.product.findMany();
    const order = await createOrder(buildOrderInput(parsed.data, dbProducts));
    const mapped = await loadMappedOrder(order.id);
    res.json(mapped);
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

    if (Array.isArray(b.items) && b.items.length > 0) {
      // Full edit from the order form: reverse the old order and rewrite it.
      const body = { ...b, id: b.id || req.params.id };
      const parsed = orderSchema.safeParse(body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      const dbProducts = await prisma.product.findMany();
      await replaceOrder(existing.id, buildOrderInput(parsed.data, dbProducts));
    } else {
      // Partial inline update (e.g. reconciliation, editing a single fee): only touch columns.
      const data: any = {};
      if (b.status !== undefined) data.status = b.status;
      if (b.shop !== undefined) data.channel = b.shop;
      if (b.date !== undefined) data.orderedAt = new Date(b.date);
      if (b.packagingFee !== undefined) data.packagingFee = Number(b.packagingFee) || 0;
      if (b.returnFee !== undefined) data.returnFee = Number(b.returnFee) || 0;
      if (b.platformFee !== undefined) data.platformFee = Number(b.platformFee) || 0;
      if (b.marketingFee !== undefined) data.marketingFee = Number(b.marketingFee) || 0;
      if (b.settlementDate !== undefined) {
        data.settlementDate = b.settlementDate ? new Date(b.settlementDate) : null;
      }
      if (b.actualRevenue !== undefined) {
        data.actualRevenue = (b.actualRevenue === null || b.actualRevenue === '') ? null : Number(b.actualRevenue);
      }
      await prisma.order.update({ where: { id: existing.id }, data });
    }

    const mapped = await loadMappedOrder(existing.id);
    res.json(mapped);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.delete('/orders/:id', async (req, res) => {
  try {
    // The frontend id is the order's externalCode; resolve it to the real UUID.
    const existing = await prisma.order.findUnique({ where: { externalCode: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy đơn hàng.' });

    await deleteOrder(existing.id);
    res.json({ success: true });
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
