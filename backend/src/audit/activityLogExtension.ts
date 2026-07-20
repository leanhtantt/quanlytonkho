import { Prisma, PrismaClient } from '@prisma/client';
import { ActivitySnapshot, queueActivityLog } from './activityContext';

type AuditModel = {
  resource: 'products' | 'purchases' | 'orders' | 'losses' | 'treasury' | 'settings';
  delegate: string;
  label: (record: Record<string, unknown>) => string | null;
};

const auditModels: Record<string, AuditModel> = {
  Product: {
    resource: 'products',
    delegate: 'product',
    label: record => joinLabel(record.sku, record.name),
  },
  PurchaseOrder: {
    resource: 'purchases',
    delegate: 'purchaseOrder',
    label: record => stringValue(record.code) || stringValue(record.id),
  },
  Order: {
    resource: 'orders',
    delegate: 'order',
    label: record => stringValue(record.externalCode) || stringValue(record.id),
  },
  Loss: {
    resource: 'losses',
    delegate: 'loss',
    label: record => joinLabel('Hao hụt', record.reason) || stringValue(record.id),
  },
  InventoryAdjustment: {
    resource: 'products',
    delegate: 'inventoryAdjustment',
    label: record => joinLabel('Điều chỉnh tồn', record.reason) || stringValue(record.id),
  },
  TreasuryTransaction: {
    resource: 'treasury',
    delegate: 'treasuryTransaction',
    label: record => joinLabel(record.type, record.description || record.category) || stringValue(record.id),
  },
  MonthlyAdExpense: {
    resource: 'treasury',
    delegate: 'monthlyAdExpense',
    label: record => joinLabel('Chi phí quảng cáo', record.month, record.channel) || stringValue(record.id),
  },
  AdAdvanceReimbursement: {
    resource: 'treasury',
    delegate: 'adAdvanceReimbursement',
    label: record => joinLabel('Hoàn ứng quảng cáo', record.adExpenseId) || stringValue(record.id),
  },
  AppSettings: {
    resource: 'settings',
    delegate: 'appSettings',
    label: () => 'Cài đặt hệ thống',
  },
  ShopeeItemMap: {
    resource: 'settings',
    delegate: 'shopeeItemMap',
    label: record => joinLabel('Shopee mapping', record.itemId, record.modelId, record.productId),
  },
};

function stringValue(value: unknown) {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function joinLabel(...values: unknown[]) {
  const parts = values.flatMap(value => {
    const string = stringValue(value);
    return string ? [string] : [];
  });
  return parts.length ? parts.join(' — ') : null;
}

function toSnapshot(value: unknown): ActivitySnapshot | null {
  if (!value || typeof value !== 'object') return null;

  const serialized = JSON.stringify(value, (_key, current) => (
    typeof current === 'bigint' ? current.toString() : current
  ));
  return serialized ? JSON.parse(serialized) as ActivitySnapshot : null;
}

function stableJson(value: unknown) {
  return JSON.stringify(value, (_key, current) => (
    typeof current === 'bigint' ? current.toString() : current
  ));
}

function onlyUpdatedAtChanged(before: ActivitySnapshot | null, after: ActivitySnapshot | null) {
  if (!before || !after) return false;

  const changedKeys = new Set([
    ...Object.keys(before),
    ...Object.keys(after),
  ].filter(key => stableJson(before[key]) !== stableJson(after[key])));

  return changedKeys.size > 0 && [...changedKeys].every(key => key === 'updatedAt');
}

function targetId(record: ActivitySnapshot | null, args: Record<string, any>) {
  const recordId = record?.id;
  if (typeof recordId === 'string') return recordId;

  const where = args.where as Record<string, unknown> | undefined;
  if (!where) return null;
  return Object.values(where).find(value => typeof value === 'string') as string | undefined ?? null;
}

async function findBefore(
  client: PrismaClient,
  config: AuditModel,
  args: Record<string, any>,
) {
  const where = args.where;
  if (!where) return null;

  const delegate = (client as unknown as Record<string, any>)[config.delegate];
  if (!delegate?.findUnique) return null;
  return delegate.findUnique({ where });
}

interface AuditOperationParams {
  baseClient: PrismaClient;
  model: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
}

export async function auditCrudOperation({
  baseClient,
  model,
  operation,
  args,
  query,
}: AuditOperationParams) {
  const config = auditModels[model];
  if (!config || !['create', 'update', 'delete', 'upsert'].includes(operation)) {
    return query(args);
  }

  const operationArgs = args as Record<string, any>;
  const beforeRecord = operation === 'create'
    ? null
    : await findBefore(baseClient, config, operationArgs);
  const result = await query(args);
  const before = toSnapshot(beforeRecord);
  const after = operation === 'delete' ? null : toSnapshot(result);
  const action = operation === 'upsert'
    ? (before ? 'update' : 'create')
    : operation;

  if (action === 'update' && onlyUpdatedAtChanged(before, after)) {
    return result;
  }

  const labelRecord = (after || before) ?? {};
  queueActivityLog({
    action,
    resource: config.resource,
    targetId: targetId(after || before, operationArgs),
    targetLabel: config.label(labelRecord),
    before,
    after,
  });
  return result;
}

/**
 * Prisma's query extension is based on the official audit-log-context sample,
 * adapted for this app's existing append-only ActivityLog schema. It only queues
 * events here; the response middleware flushes them after the business query (or
 * its enclosing transaction) has completed, avoiding a nested audit write.
 */
export function createActivityLogExtension(baseClient: PrismaClient) {
  return Prisma.defineExtension(client => client.$extends({
    name: 'activity-log',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return auditCrudOperation({ baseClient, model, operation, args, query });
        },
      },
    },
  }));
}
