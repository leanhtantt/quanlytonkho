import { RequestHandler, Router } from 'express';
import { prisma } from './prismaClient';
import { z } from 'zod';
import { createPurchaseOrder, deletePurchaseOrder, replacePurchaseOrder } from './services/procurementService';
import { deleteLoss, recordLoss, replaceLoss } from './services/financeService';
import { createSurplusAdjustment, deleteSurplusAdjustment, replaceSurplusAdjustment } from './services/inventoryAdjustmentService';
import { createOrder, replaceOrder, deleteOrder, OrderInput } from './services/orderService';
import { randomUUID } from 'crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { AuthRequest, PermissionAction, requireAdmin, requirePermission } from './middlewares/authMiddleware';
import { usersRouter } from './routes/users';
import { activityRouter } from './routes/activity';
import { flushActivityLogsBeforeResponse } from './middlewares/activityLogMiddleware';
import { writeLoginActivityOnce } from './audit/loginActivity';
import { findProductByCode, normalizeSkuCode, resolveProductsByCodes } from './services/productResolver';

if (!getApps().length) {
  initializeApp({ projectId: 'tanle-dev', storageBucket: 'tanle-dev.firebasestorage.app' });
}

export const apiRouter = Router();

apiRouter.use(flushActivityLogsBeforeResponse);

apiRouter.get('/me', async (req, res) => {
  const authReq = req as AuthRequest;
  const isAdmin = authReq.isAdmin === true;
  const userRecord = authReq.userRecord;

  try {
    await writeLoginActivityOnce(authReq);
  } catch (error) {
    console.error('Không thể ghi ActivityLog đăng nhập:', error);
  }

  res.json({
    uid: authReq.user?.uid,
    email: authReq.user?.email ?? userRecord?.email ?? null,
    role: isAdmin ? 'admin' : userRecord?.role,
    isAdmin,
    permissions: isAdmin ? {} : (userRecord?.permissions ?? {}),
    isActive: isAdmin ? true : (userRecord?.isActive ?? false),
  });
});

apiRouter.use('/users', requireAdmin);
apiRouter.use('/users', usersRouter);
apiRouter.use('/activity', requirePermission('activity', 'view'));
apiRouter.use('/activity', activityRouter);

const actionsByMethod: Record<string, PermissionAction> = {
  GET: 'view',
  POST: 'create',
  PUT: 'update',
  DELETE: 'delete',
};

function requireResourcePermission(resource: string): RequestHandler {
  return (req, res, next) => {
    const action = actionsByMethod[req.method];
    if (!action) return res.status(405).json({ error: 'Method not allowed' });
    return requirePermission(resource, action)(req, res, next);
  };
}

apiRouter.use('/products', requireResourcePermission('products'));
apiRouter.use('/purchases', requireResourcePermission('purchases'));
apiRouter.use('/orders', requireResourcePermission('orders'));
apiRouter.use('/losses', requireResourcePermission('losses'));
apiRouter.use('/inventory', requireResourcePermission('products'));
apiRouter.use('/inventory-adjustments', requireResourcePermission('products'));
apiRouter.use('/product-images', requireResourcePermission('products'));
apiRouter.use('/settings', requireResourcePermission('settings'));
apiRouter.use('/treasury', requireResourcePermission('treasury'));
apiRouter.use('/ads', requireResourcePermission('treasury'));
apiRouter.use('/dashboard', requireResourcePermission('dashboard'));

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
  note: z.string().max(2000).nullable().optional(),
  items: z.array(z.object({
    productId: z.string(),
    sku: z.string().optional(),
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
  date: z.string().optional(),
});

const inventoryAdjustmentSchema = z.object({
  productId: z.string(),
  qty: z.number().int().positive(),
  unitCost: z.number().nonnegative(),
  reason: z.string().min(1),
  date: z.string(),
});

const settingsSchema = z.object({
  partners: z.any().optional(),
  accounts: z.any().optional(),
  shops: z.array(z.string().trim().min(1)).optional(),
  packagingCost: z.number().nonnegative().optional(),
  returnFee: z.number().nonnegative().optional(),
});

const productImageSchema = z.object({
  productId: z.string().min(1),
  dataUrl: z.string().startsWith('data:image/'),
});

const productOrderSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1).refine(
    ids => new Set(ids).size === ids.length,
    { message: 'Danh sách sản phẩm không được trùng mã.' }
  ),
});

const skuRenameSchema = z.object({
  sku: z.string().trim().min(1).max(100),
});


function mapProductWithAliases(product: any) {
  return {
    ...product,
    aliases: (product.skuAliases || []).map((alias: any) => alias.sku),
    skuAliases: undefined,
  };
}

const treasuryTransactionSchema = z.object({
  id: z.string().optional(),
  date: z.string().or(z.date()),
  type: z.enum(['THU', 'CHI', 'CHUYEN']),
  account: z.string().optional().nullable(),
  fromAccount: z.string().optional().nullable(),
  toAccount: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  person: z.string().optional().nullable(),
  shop: z.string().optional().nullable(),
  amount: z.number().positive(),
  description: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});

const adExpenseSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  shop: z.string().trim().min(1),
  amount: z.number().positive(),
  source: z.enum(['DEDUCTED_FROM_REVENUE', 'SHOPEE_WALLET', 'SELF_FUNDED', 'PERSONAL_ADVANCE']),
  account: z.string().trim().optional().nullable(),
  advancedBy: z.string().trim().optional().nullable(),
  date: z.string().optional().nullable(),
  note: z.string().max(1000).optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.source === 'SELF_FUNDED' && !data.account) {
    ctx.addIssue({ code: 'custom', path: ['account'], message: 'Tài khoản chi là bắt buộc với quảng cáo tự nạp.' });
  }
  if (data.source === 'PERSONAL_ADVANCE' && !data.advancedBy) {
    ctx.addIssue({ code: 'custom', path: ['advancedBy'], message: 'Người ứng tiền là bắt buộc.' });
  }
});

const adAdvanceReimbursementSchema = z.object({
  amount: z.number().positive(),
  source: z.enum(['TREASURY_ACCOUNT', 'SHOPEE_WALLET']),
  account: z.string().trim().optional().nullable(),
  date: z.string().min(1),
  note: z.string().max(1000).optional().nullable(),
}).superRefine((data, ctx) => {
  if (data.source === 'TREASURY_ACCOUNT' && !data.account) {
    ctx.addIssue({ code: 'custom', path: ['account'], message: 'Tài khoản hoàn ứng là bắt buộc.' });
  }
});

function mapAdExpense(expense: any) {
  return {
    ...expense,
    shop: expense.channel,
    amount: Number(expense.amount),
    date: expense.spentAt ? expense.spentAt.toISOString().split('T')[0] : null,
    reimbursements: (expense.reimbursements || []).map((reimbursement: any) => ({
      ...reimbursement,
      amount: Number(reimbursement.amount),
      date: reimbursement.date.toISOString().split('T')[0],
    })),
  };
}

function mapTreasuryTransaction(transaction: any) {
  return {
    ...transaction,
    date: transaction.date.toISOString().split('T')[0],
    amount: Number(transaction.amount),
  };
}

// --- Products ---
apiRouter.get('/products', async (req, res) => {
  const products = await prisma.product.findMany({ include: { skuAliases: true } });
  res.json(products.map(mapProductWithAliases));
});

apiRouter.post('/products', async (req, res) => {
  const body = { ...req.body };
  if (body.id && !body.sku) body.sku = body.id;
  
  const parsed = productSchema.safeParse(body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  
  try {
    const normalizedSku = normalizeSkuCode(parsed.data.sku);
    const alias = await prisma.productSkuAlias.findUnique({
      where: { sku: normalizedSku },
      include: { product: { include: { skuAliases: true } } }
    });
    if (alias) return res.json(mapProductWithAliases(alias.product));

    const product = await prisma.product.upsert({
      where: { sku: normalizedSku },
      update: { name: parsed.data.name, status: parsed.data.status, imageId: parsed.data.imageId },
      create: { ...parsed.data, sku: normalizedSku },
      include: { skuAliases: true }
    });
    res.json(mapProductWithAliases(product));
  } catch (error: any) {
    console.error("Error upserting product:", error);
    res.status(500).json({ error: 'Failed to create/update product' });
  }
});

apiRouter.put('/products/:id/sku', async (req, res) => {
  const parsed = skuRenameSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const product = await prisma.product.findFirst({
      where: { OR: [{ id: req.params.id }, { sku: req.params.id }] },
      include: { skuAliases: true }
    });
    if (!product) return res.status(404).json({ error: 'Không tìm thấy sản phẩm.' });

    const newSku = normalizeSkuCode(parsed.data.sku);
    if (newSku === normalizeSkuCode(product.sku)) {
      return res.json(mapProductWithAliases(product));
    }

    const updated = await prisma.$transaction(async tx => {
      const conflictingProduct = await tx.product.findFirst({
        where: { sku: { equals: newSku, mode: 'insensitive' } }
      });
      if (conflictingProduct && conflictingProduct.id !== product.id) {
        throw new Error(`SKU ${newSku} đang được dùng cho sản phẩm khác.`);
      }

      const conflictingAlias = await tx.productSkuAlias.findUnique({ where: { sku: newSku } });
      if (conflictingAlias && conflictingAlias.productId !== product.id) {
        throw new Error(`SKU ${newSku} là mã cũ của sản phẩm khác.`);
      }

      if (conflictingAlias?.productId === product.id) {
        await tx.productSkuAlias.delete({ where: { sku: newSku } });
      }

      await tx.productSkuAlias.upsert({
        where: { sku: normalizeSkuCode(product.sku) },
        update: { productId: product.id },
        create: { sku: normalizeSkuCode(product.sku), productId: product.id }
      });

      return tx.product.update({
        where: { id: product.id },
        data: { sku: newSku },
        include: { skuAliases: true }
      });
    });

    res.json(mapProductWithAliases(updated));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.put('/products/reorder', async (req, res) => {
  const parsed = productOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const existingCount = await prisma.product.count({ where: { id: { in: parsed.data.productIds } } });
  if (existingCount !== parsed.data.productIds.length) {
    return res.status(400).json({ error: 'Danh sách có sản phẩm không tồn tại.' });
  }

  try {
    await prisma.$executeRaw`
      UPDATE "Product" AS p
      SET "displayOrder" = v.ord::integer
      FROM unnest(${parsed.data.productIds}::text[]) WITH ORDINALITY AS v(id, ord)
      WHERE p.id = v.id
    `;
  } catch (error: any) {
    console.error('reorder failed:', error);
    return res.status(500).json({ error: 'Kh\u00f4ng th\u1ec3 \u0111\u1ed5i th\u1ee9 t\u1ef1 s\u1ea3n ph\u1ea9m.' });
  }

  const products = await prisma.product.findMany({
    include: { skuAliases: true },
    orderBy: [{ displayOrder: 'asc' }, { sku: 'asc' }]
  });
  res.json(products.map(mapProductWithAliases));
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
      data: { name: req.body.name, status: req.body.status, imageId: req.body.imageId },
      include: { skuAliases: true }
    });
    res.json(mapProductWithAliases(updated));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// --- Purchases ---
apiRouter.get('/purchases', async (req, res) => {
  const purchases = await prisma.purchaseOrder.findMany({ 
    include: { purchaseItems: { include: { inventoryBatches: true, product: true } } }
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
      sku: pi.product.sku,
      name: pi.product.name,
      qty: pi.qty,
      totalVndPrice: Number(pi.totalCost),
      weightKg: pi.qty > 0 ? Number((Number(pi.totalWeight) / pi.qty).toFixed(3)) : 0,
      finalCostVnd: pi.inventoryBatches[0] ? Math.round(Number(pi.inventoryBatches[0].unitCost)) : 0
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
      // Match by SKU or internal id, case-insensitively (the frontend may
      // upper-case the value, which would corrupt a lower-case UUID).
      const prod = findProductByCode(dbProducts, it.productId);
      return {
        productId: prod?.id,
        sku: normalizeSkuCode(prod?.sku || it.productId),
        name: prod?.name || it.name || normalizeSkuCode(it.productId),
        qty: it.qty,
        totalCost: it.totalVndPrice,
        totalWeight: it.weightKg * it.qty
      };
    })
  };
}

// Reload a purchase order and map it to the shape the frontend expects (id = code, etc.).
async function loadMappedPurchase(poId: string) {
  const fullPo = await prisma.purchaseOrder.findUnique({
    where: { id: poId },
    include: { purchaseItems: { include: { inventoryBatches: true, product: true } } }
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
      sku: pi.product.sku,
      name: pi.product.name,
      qty: pi.qty,
      totalVndPrice: Number(pi.totalCost),
      weightKg: pi.qty > 0 ? Number((Number(pi.totalWeight) / pi.qty).toFixed(3)) : 0,
      finalCostVnd: pi.inventoryBatches[0] ? Math.round(Number(pi.inventoryBatches[0].unitCost)) : 0
    }))
  };
}

apiRouter.post('/purchases', async (req, res) => {
  const parsed = purchaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const data = parsed.data;
    const dbProducts = await resolveProductsByCodes(data.items.map(item => item.productId));
    const po = await createPurchaseOrder(buildPurchaseInput(data, dbProducts));

    const mapped = await loadMappedPurchase(po.id);
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
    const dbProducts = await resolveProductsByCodes(data.items.map(item => item.productId));
    const po = await replacePurchaseOrder(existing.id, buildPurchaseInput(data, dbProducts));

    const mapped = await loadMappedPurchase(po.id);
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
  const unresolved: string[] = [];
  const items = data.items.map((it: any) => {
    // Match by SKU or internal id, case-insensitively (see note in buildPurchaseInput).
    const prod = findProductByCode(dbProducts, it.productId) || findProductByCode(dbProducts, it.sku);
    if (!prod) unresolved.push(it.productId || '(trống)');
    return {
      productId: prod ? prod.id : it.productId,
      skuAtOrder: normalizeSkuCode(it.sku || prod?.sku || it.productId),
      qty: it.qty,
      sellingPrice: it.sellingPrice,
      isReturned: it.isReturned || false,
    };
  });
  if (unresolved.length > 0) {
    throw new Error(`Không tìm thấy sản phẩm với mã SKU: ${[...new Set(unresolved)].join(', ')}. Vui lòng tạo sản phẩm này trước khi tạo đơn.`);
  }
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
    note: data.note?.trim() || null,
    items
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
      sku: oi.skuAtOrder || oi.product?.sku || oi.productId,
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
      sku: oi.skuAtOrder || oi.product?.sku || oi.productId,
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
    const dbProducts = await resolveProductsByCodes(parsed.data.items.flatMap(item => [
      item.productId, item.sku,
    ]));
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
      const dbProducts = await resolveProductsByCodes(parsed.data.items.flatMap(item => [
        item.productId, item.sku,
      ]));
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
      if (b.note !== undefined) data.note = b.note == null ? null : (String(b.note).trim() || null);
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
    const dbProducts = await resolveProductsByCodes([parsed.data.productId]);
    const prod = findProductByCode(dbProducts, parsed.data.productId);
    const resolvedProductId = prod ? prod.id : req.body.productId;

    const occurredAt = parsed.data.date ? new Date(`${parsed.data.date}T00:00:00.000Z`) : undefined;
    const result = await recordLoss(resolvedProductId, parsed.data.qty, parsed.data.reason, occurredAt);
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
  res.json(transactions.map(mapTreasuryTransaction));
});

apiRouter.put('/losses/:id', async (req, res) => {
  const parsed = lossSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const dbProducts = await resolveProductsByCodes([parsed.data.productId]);
    const product = findProductByCode(dbProducts, parsed.data.productId);
    const resolvedProductId = product?.id || parsed.data.productId;
    const occurredAt = parsed.data.date ? new Date(`${parsed.data.date}T00:00:00.000Z`) : undefined;
    const result = await replaceLoss(req.params.id, resolvedProductId, parsed.data.qty, parsed.data.reason, occurredAt);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.delete('/losses/:id', async (req, res) => {
  try {
    await deleteLoss(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// --- Inventory surplus adjustments ---
apiRouter.get('/inventory-adjustments', async (_req, res) => {
  const adjustments = await prisma.inventoryAdjustment.findMany({
    include: { product: true },
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }]
  });
  res.json(adjustments.map(adjustment => ({
    ...adjustment,
    unitCost: Number(adjustment.unitCost),
    date: adjustment.occurredAt,
    name: adjustment.product.name,
    sku: adjustment.product.sku,
    type: 'SURPLUS'
  })));
});

apiRouter.post('/inventory-adjustments', async (req, res) => {
  const parsed = inventoryAdjustmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const dbProducts = await resolveProductsByCodes([parsed.data.productId]);
    const product = findProductByCode(dbProducts, parsed.data.productId);
    if (!product) throw new Error('Không tìm thấy sản phẩm.');
    const adjustment = await createSurplusAdjustment({
      ...parsed.data,
      productId: product.id,
      occurredAt: new Date(`${parsed.data.date}T00:00:00.000Z`)
    });
    res.json({ ...adjustment, unitCost: Number(adjustment.unitCost), name: product.name, sku: product.sku, date: adjustment.occurredAt, type: 'SURPLUS' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.put('/inventory-adjustments/:id', async (req, res) => {
  const parsed = inventoryAdjustmentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const dbProducts = await resolveProductsByCodes([parsed.data.productId]);
    const product = findProductByCode(dbProducts, parsed.data.productId);
    if (!product) throw new Error('Không tìm thấy sản phẩm.');
    const adjustment = await replaceSurplusAdjustment(req.params.id, {
      ...parsed.data,
      productId: product.id,
      occurredAt: new Date(`${parsed.data.date}T00:00:00.000Z`)
    });
    res.json({ ...adjustment, unitCost: Number(adjustment.unitCost), name: product.name, sku: product.sku, date: adjustment.occurredAt, type: 'SURPLUS' });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.delete('/inventory-adjustments/:id', async (req, res) => {
  try {
    await deleteSurplusAdjustment(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.post('/product-images', async (req, res) => {
  const parsed = productImageSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const match = parsed.data.dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (!match) return res.status(400).json({ error: 'Invalid image data' });
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 5 * 1024 * 1024) return res.status(400).json({ error: 'Image exceeds 5 MB' });

  const safeProductId = parsed.data.productId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const objectPath = `product-images/${safeProductId}/${Date.now()}.webp`;
  const downloadToken = randomUUID();
  const file = getStorage().bucket('tanle-dev.firebasestorage.app').file(objectPath);
  await file.save(buffer, {
    resumable: false,
    contentType: match[1],
    metadata: { metadata: { firebaseStorageDownloadTokens: downloadToken, productId: parsed.data.productId } }
  });

  const imageUrl = `https://firebasestorage.googleapis.com/v0/b/tanle-dev.firebasestorage.app/o/${encodeURIComponent(objectPath)}?alt=media&token=${downloadToken}`;
  res.json({ imageUrl });
});

apiRouter.delete('/product-images', async (req, res) => {
  const imageUrl = String(req.body?.imageUrl || '');
  const match = imageUrl.match(/\/o\/([^?]+)/);
  if (!imageUrl.includes('/b/tanle-dev.firebasestorage.app/') || !match) {
    return res.status(400).json({ error: 'Invalid Firebase Storage image URL' });
  }
  const objectPath = decodeURIComponent(match[1]);
  if (!objectPath.startsWith('product-images/')) return res.status(400).json({ error: 'Invalid image path' });

  await getStorage().bucket('tanle-dev.firebasestorage.app').file(objectPath).delete({ ignoreNotFound: true });
  res.json({ success: true });
});

apiRouter.post('/treasury/transactions', async (req, res) => {
  const parsed = treasuryTransactionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { id: _clientId, date, ...data } = parsed.data;
  const transaction = await prisma.treasuryTransaction.create({
    data: { ...data, date: new Date(date) }
  });
  res.json(mapTreasuryTransaction(transaction));
});

apiRouter.put('/treasury/transactions/:id', async (req, res) => {
  const parsed = treasuryTransactionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { id: _clientId, date, ...data } = parsed.data;
  const transaction = await prisma.treasuryTransaction.update({
    where: { id: req.params.id },
    data: { ...data, date: new Date(date) }
  });
  res.json(mapTreasuryTransaction(transaction));
});

apiRouter.delete('/treasury/transactions/:id', async (req, res) => {
  await prisma.treasuryTransaction.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// --- Advertising expenses ---
apiRouter.get('/ads', async (req, res) => {
  const expenses = await prisma.monthlyAdExpense.findMany({
    include: { reimbursements: { orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] } },
    orderBy: [{ month: 'desc' }, { createdAt: 'desc' }]
  });
  res.json(expenses.map(mapAdExpense));
});

apiRouter.post('/ads', async (req, res) => {
  const parsed = adExpenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  const expense = await prisma.$transaction(async tx => {
    let treasuryTransactionId: string | null = null;
    if (data.source === 'SELF_FUNDED') {
      const transaction = await tx.treasuryTransaction.create({
        data: {
          date: new Date(data.date || `${data.month}-01`),
          type: 'CHI',
          account: data.account,
          category: 'Tiền quảng cáo (Ads)',
          shop: data.shop,
          amount: data.amount,
          note: data.note?.trim() || null,
        }
      });
      treasuryTransactionId = transaction.id;
    }

    return tx.monthlyAdExpense.create({
      data: {
        month: data.month,
        channel: data.shop,
        amount: data.amount,
        source: data.source,
        account: data.source === 'SELF_FUNDED' ? data.account : null,
        advancedBy: data.source === 'PERSONAL_ADVANCE' ? data.advancedBy : null,
        spentAt: data.date ? new Date(data.date) : null,
        note: data.note?.trim() || null,
        treasuryTransactionId,
      }
    });
  });

  res.json(mapAdExpense(expense));
});

apiRouter.post('/ads/:id/reimbursements', async (req, res) => {
  const parsed = adAdvanceReimbursementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const data = parsed.data;
    await prisma.$transaction(async tx => {
      const expense = await tx.monthlyAdExpense.findUnique({
        where: { id: req.params.id },
        include: { reimbursements: true }
      });
      if (!expense) throw new Error('Không tìm thấy khoản quảng cáo.');
      if (expense.source !== 'PERSONAL_ADVANCE') throw new Error('Chỉ khoản cá nhân ứng trước mới được hoàn ứng.');

      const reimbursed = expense.reimbursements.reduce((sum, item) => sum + Number(item.amount), 0);
      const outstanding = Number(expense.amount) - reimbursed;
      if (data.amount > outstanding) throw new Error(`Số tiền hoàn ứng vượt quá công nợ còn lại ${outstanding.toLocaleString('vi-VN')} VND.`);

      let treasuryTransactionId: string | null = null;
      if (data.source === 'TREASURY_ACCOUNT') {
        const transaction = await tx.treasuryTransaction.create({
          data: {
            date: new Date(data.date),
            type: 'CHI',
            account: data.account,
            category: 'Hoàn ứng quảng cáo',
            person: expense.advancedBy,
            shop: expense.channel,
            amount: data.amount,
            note: data.note?.trim() || `Hoàn ứng quảng cáo ${expense.month}`,
          }
        });
        treasuryTransactionId = transaction.id;
      }

      await tx.adAdvanceReimbursement.create({
        data: {
          adExpenseId: expense.id,
          amount: data.amount,
          source: data.source,
          account: data.source === 'TREASURY_ACCOUNT' ? data.account : null,
          date: new Date(data.date),
          note: data.note?.trim() || null,
          treasuryTransactionId,
        }
      });
    });

    const updated = await prisma.monthlyAdExpense.findUnique({
      where: { id: req.params.id },
      include: { reimbursements: { orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] } }
    });
    res.json(mapAdExpense(updated));
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

apiRouter.delete('/ads/:id', async (req, res) => {
  try {
    await prisma.$transaction(async tx => {
      const expense = await tx.monthlyAdExpense.findUnique({
        where: { id: req.params.id },
        include: { reimbursements: true }
      });
      if (!expense) return;
      if (expense.reimbursements.length > 0) {
        throw new Error('Không thể xóa khoản quảng cáo đã có lịch sử hoàn ứng.');
      }
      if (expense.treasuryTransactionId) {
        await tx.treasuryTransaction.deleteMany({ where: { id: expense.treasuryTransactionId } });
      }
      await tx.monthlyAdExpense.delete({ where: { id: expense.id } });
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// --- Dashboard Stats (simplified) ---
apiRouter.get('/dashboard/stats', async (req, res) => {
  res.json({ message: "Not implemented yet" });
});
