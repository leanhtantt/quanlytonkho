import { Prisma } from '@prisma/client';
import {
  ActivitySnapshot,
  getActivityContext,
  PendingActivityLog,
  restorePendingActivityLogs,
  takePendingActivityLogs,
} from './activityContext';
import { prisma } from '../prismaClient';

export interface ActivityLogInput {
  action: string;
  resource: string;
  targetId?: string | null;
  targetLabel?: string | null;
  before?: ActivitySnapshot | null;
  after?: ActivitySnapshot | null;
}

function activityLogData(log: PendingActivityLog | ActivityLogInput) {
  const context = getActivityContext();
  if (!context) return null;

  return {
    actorUid: context.uid,
    actorEmail: context.email,
    action: log.action,
    resource: log.resource,
    targetId: log.targetId ?? null,
    targetLabel: log.targetLabel ?? null,
    before: (log.before ?? undefined) as Prisma.InputJsonValue | undefined,
    after: (log.after ?? undefined) as Prisma.InputJsonValue | undefined,
    ipAddress: context.ipAddress ?? null,
  };
}

export async function writeActivityLog(log: ActivityLogInput) {
  const data = activityLogData(log);
  if (!data) return;
  await prisma.activityLog.create({ data });
}

export async function flushActivityLogs() {
  const logs = takePendingActivityLogs();
  if (!logs.length) return;

  const entries = logs.map(activityLogData).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  if (!entries.length) return;

  try {
    await prisma.activityLog.createMany({ data: entries });
  } catch (error) {
    restorePendingActivityLogs(logs);
    throw error;
  }
}
