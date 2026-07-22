import { prisma } from '../prismaClient';

type Deduction = { purchaseId: string; qty: number; costVnd: number };

export interface ReferenceCostMaps {
  totalByReference: Map<string, number>;
  deductionsByReferenceProduct: Map<string, Deduction[]>;
}

function referenceProductKey(referenceId: string, productId: string) {
  return `${referenceId}:${productId}`;
}

export async function getReferenceCostMaps(
  referenceType: 'ORDER' | 'LOSS',
  referenceIds: string[],
): Promise<ReferenceCostMaps> {
  const totalByReference = new Map<string, number>();
  const deductionsByReferenceProduct = new Map<string, Deduction[]>();
  const transactionTotals = new Map<string, number>();
  if (referenceIds.length === 0) return { totalByReference, deductionsByReferenceProduct };

  const [transactions, ledgers] = await Promise.all([
    prisma.stockTransaction.findMany({
      where: { referenceType, referenceId: { in: referenceIds }, type: 'OUT' },
      include: {
        batch: {
          include: {
            purchaseItem: { include: { purchaseOrder: { select: { code: true } } } },
            inventoryAdjustment: { select: { id: true } },
          },
        },
      },
    }),
    prisma.ledgerEntry.findMany({
      where: referenceType === 'ORDER'
        ? {
          account: 'COGS',
          referenceId: { in: referenceIds },
          referenceType: { in: ['ORDER', 'ORDER_REVERSAL'] },
        }
        : { account: 'INVENTORY_LOSS', referenceType: 'LOSS', referenceId: { in: referenceIds } },
      select: { referenceId: true, direction: true, amount: true },
    }),
  ]);

  for (const entry of ledgers) {
    const sign = entry.direction === 'CREDIT' ? -1 : 1;
    totalByReference.set(entry.referenceId, (totalByReference.get(entry.referenceId) || 0) + sign * Number(entry.amount));
  }

  for (const transaction of transactions) {
    const key = referenceProductKey(transaction.referenceId, transaction.productId);
    const deductions = deductionsByReferenceProduct.get(key) || [];
    const purchaseId = transaction.batch.purchaseItem?.purchaseOrder.code
      || (transaction.batch.inventoryAdjustment ? `ADJUSTMENT-${transaction.batch.inventoryAdjustment.id}` : transaction.batchId);
    deductions.push({
      purchaseId,
      qty: Math.abs(transaction.qty),
      costVnd: Number(transaction.unitCost),
    });
    deductionsByReferenceProduct.set(key, deductions);
    transactionTotals.set(
      transaction.referenceId,
      (transactionTotals.get(transaction.referenceId) || 0) + Math.abs(transaction.qty) * Number(transaction.unitCost),
    );
  }
  for (const [referenceId, total] of transactionTotals) {
    if (!totalByReference.has(referenceId)) totalByReference.set(referenceId, total);
  }

  return { totalByReference, deductionsByReferenceProduct };
}

export function deductionsFor(costs: ReferenceCostMaps, referenceId: string, productId: string) {
  const batchesDeducted = costs.deductionsByReferenceProduct.get(referenceProductKey(referenceId, productId)) || [];
  return {
    batchesDeducted,
    totalCostDeducted: batchesDeducted.reduce((sum, deduction) => sum + deduction.qty * deduction.costVnd, 0),
  };
}

export async function getInventorySnapshot() {
  const [products, activeBatches, purchaseTotals, adjustmentTotals, stockTotals] = await Promise.all([
    prisma.product.findMany({ include: { skuAliases: true } }),
    prisma.inventoryBatch.findMany({
      where: { qtyRemaining: { gt: 0 } },
      include: {
        purchaseItem: { include: { purchaseOrder: { select: { code: true } } } },
        inventoryAdjustment: { select: { id: true } },
      },
      orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.inventoryBatch.groupBy({
      by: ['productId'],
      where: { purchaseItemId: { not: null } },
      _sum: { qtyInitial: true },
    }),
    prisma.inventoryAdjustment.groupBy({ by: ['productId'], _sum: { qty: true } }),
    prisma.stockTransaction.groupBy({
      by: ['productId', 'type', 'referenceType'],
      _sum: { qty: true },
    }),
  ]);

  const purchaseByProduct = new Map(purchaseTotals.map(row => [row.productId, row._sum.qtyInitial || 0]));
  const adjustmentByProduct = new Map(adjustmentTotals.map(row => [row.productId, row._sum.qty || 0]));
  const transactionByProduct = new Map<string, typeof stockTotals>();
  for (const row of stockTotals) {
    const values = transactionByProduct.get(row.productId) || [];
    values.push(row);
    transactionByProduct.set(row.productId, values);
  }

  return products.map(product => {
    const batches = activeBatches.filter(batch => batch.productId === product.id).map(batch => ({
      purchaseId: batch.purchaseItem?.purchaseOrder.code
        || (batch.inventoryAdjustment ? `ADJUSTMENT-${batch.inventoryAdjustment.id}` : batch.id),
      date: batch.receivedAt.toISOString().split('T')[0],
      qtyOriginal: batch.qtyInitial,
      qtyRemaining: batch.qtyRemaining,
      costVnd: Number(batch.unitCost),
    }));
    const rows = transactionByProduct.get(product.id) || [];
    const soldOut = Math.abs(rows.find(row => row.type === 'OUT' && row.referenceType === 'ORDER')?._sum.qty || 0);
    const soldReturned = rows.find(row => row.type === 'RETURN' && row.referenceType === 'ORDER_REVERSAL')?._sum.qty || 0;
    const totalLost = Math.abs(rows.find(row => row.type === 'OUT' && row.referenceType === 'LOSS')?._sum.qty || 0);
    return {
      id: product.id,
      sku: product.sku,
      name: product.name,
      imageId: product.imageId,
      aliases: product.skuAliases.map(alias => alias.sku),
      displayOrder: product.displayOrder,
      totalImported: purchaseByProduct.get(product.id) || 0,
      totalSold: Math.max(0, soldOut - soldReturned),
      totalLost,
      totalAdjusted: adjustmentByProduct.get(product.id) || 0,
      stock: batches.reduce((sum, batch) => sum + batch.qtyRemaining, 0),
      batches,
    };
  });
}

function applyTransactionBalance(balances: Record<string, number>, transaction: {
  type: string; account: string | null; fromAccount: string | null; toAccount: string | null; amount: unknown;
}) {
  const amount = Number(transaction.amount) || 0;
  if (transaction.type === 'THU' && transaction.account) balances[transaction.account] = (balances[transaction.account] || 0) + amount;
  if (transaction.type === 'CHI' && transaction.account) balances[transaction.account] = (balances[transaction.account] || 0) - amount;
  if (transaction.type === 'CHUYEN') {
    if (transaction.fromAccount) balances[transaction.fromAccount] = (balances[transaction.fromAccount] || 0) - amount;
    if (transaction.toAccount) balances[transaction.toAccount] = (balances[transaction.toAccount] || 0) + amount;
  }
}

export async function getTreasurySnapshot(from?: Date) {
  const [settings, transactions, settledOrders, realizedOrders, ads, lossLedgers] = await Promise.all([
    prisma.appSettings.findUnique({ where: { id: 'default' }, select: { accounts: true, partners: true, shops: true } }),
    prisma.treasuryTransaction.findMany({
      select: {
        date: true, type: true, account: true, fromAccount: true, toAccount: true,
        category: true, person: true, shop: true, amount: true,
      },
    }),
    prisma.order.findMany({
      where: { settlementDate: { not: null }, actualRevenue: { not: null } },
      select: { channel: true, actualRevenue: true },
    }),
    prisma.order.findMany({
      where: { actualRevenue: { not: null } },
      select: { id: true, actualRevenue: true, packagingFee: true },
    }),
    prisma.monthlyAdExpense.findMany({
      include: { reimbursements: true },
    }),
    prisma.ledgerEntry.findMany({
      where: { account: 'INVENTORY_LOSS', referenceType: 'LOSS', direction: 'DEBIT' },
      select: { amount: true },
    }),
  ]);

  const configuredAccounts = Array.isArray(settings?.accounts) ? settings.accounts.filter((value): value is string => typeof value === 'string') : [];
  const balances = Object.fromEntries(configuredAccounts.map(account => [account, 0]));
  const openingBalances = Object.fromEntries(configuredAccounts.map(account => [account, 0]));
  const capital: Record<string, { contributed: number; withdrawn: number }> = {};
  const configuredPartners = Array.isArray(settings?.partners) ? settings.partners : [];
  for (const partner of configuredPartners) {
    if (partner && typeof partner === 'object' && 'name' in partner && typeof partner.name === 'string') {
      capital[partner.name] = { contributed: 0, withdrawn: 0 };
    }
  }
  for (const transaction of transactions) {
    applyTransactionBalance(balances, transaction);
    if (from && transaction.date < from) applyTransactionBalance(openingBalances, transaction);
    const amount = Number(transaction.amount) || 0;
    if (transaction.person && !capital[transaction.person]) capital[transaction.person] = { contributed: 0, withdrawn: 0 };
    if (transaction.category === 'Nhận vốn góp' && transaction.person) capital[transaction.person].contributed += amount;
    if (transaction.category === 'Rút vốn / Chia lợi nhuận' && transaction.person) capital[transaction.person].withdrawn += amount;
  }

  const wallets = new Map<string, { shop: string; settledRevenue: number; withdrawn: number; walletAdSpend: number; advanceReimbursements: number; estimatedBalance: number }>();
  const configuredShops = Array.isArray(settings?.shops) ? settings.shops.filter((value): value is string => typeof value === 'string') : [];
  const wallet = (shop: string) => {
    if (!wallets.has(shop)) wallets.set(shop, { shop, settledRevenue: 0, withdrawn: 0, walletAdSpend: 0, advanceReimbursements: 0, estimatedBalance: 0 });
    return wallets.get(shop)!;
  };
  for (const shop of configuredShops) wallet(shop);
  for (const order of settledOrders) wallet(order.channel).settledRevenue += Number(order.actualRevenue) || 0;
  for (const transaction of transactions) {
    if (transaction.type === 'THU' && transaction.category === 'Rút tiền từ Sàn' && transaction.shop) {
      wallet(transaction.shop).withdrawn += Number(transaction.amount) || 0;
    }
  }
  for (const ad of ads) {
    if (ad.source === 'SHOPEE_WALLET') wallet(ad.channel).walletAdSpend += Number(ad.amount) || 0;
    for (const reimbursement of ad.reimbursements) {
      if (reimbursement.source === 'SHOPEE_WALLET') wallet(ad.channel).advanceReimbursements += Number(reimbursement.amount) || 0;
    }
  }
  const marketplaceWallets = [...wallets.values()].map(value => ({
    ...value,
    estimatedBalance: value.settledRevenue - value.withdrawn - value.walletAdSpend - value.advanceReimbursements,
  })).sort((a, b) => a.shop.localeCompare(b.shop, 'vi'));

  const realizedIds = realizedOrders.map(order => order.id);
  const orderLedgers = realizedIds.length > 0 ? await prisma.ledgerEntry.findMany({
    where: {
      account: 'COGS', referenceId: { in: realizedIds },
      referenceType: { in: ['ORDER', 'ORDER_REVERSAL'] },
    },
    select: { direction: true, amount: true },
  }) : [];
  const netCogs = orderLedgers.reduce((sum, entry) => sum + (entry.direction === 'CREDIT' ? -1 : 1) * Number(entry.amount), 0);
  const realizedRevenue = realizedOrders.reduce((sum, order) => sum + Number(order.actualRevenue || 0), 0);
  const packaging = realizedOrders.reduce((sum, order) => sum + Number(order.packagingFee || 0), 0);
  const lossCost = lossLedgers.reduce((sum, entry) => sum + Number(entry.amount), 0);
  const manualAdCost = ads.filter(ad => ad.source !== 'DEDUCTED_FROM_REVENUE').reduce((sum, ad) => sum + Number(ad.amount), 0);

  return {
    balances,
    openingBalances,
    capital,
    marketplaceWallets,
    totalCashProfit: realizedRevenue - netCogs - packaging - lossCost - manualAdCost,
  };
}
