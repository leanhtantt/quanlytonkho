import { AsyncLocalStorage } from 'node:async_hooks';

export type ActivitySnapshot = Record<string, unknown>;

export interface PendingActivityLog {
  action: string;
  resource: string;
  targetId?: string | null;
  targetLabel?: string | null;
  before?: ActivitySnapshot | null;
  after?: ActivitySnapshot | null;
}

export interface ActivityContext {
  uid: string;
  email: string;
  ipAddress?: string | null;
  pendingLogs: PendingActivityLog[];
}

const activityContextStorage = new AsyncLocalStorage<ActivityContext>();

export function runWithActivityContext<T>(
  context: Omit<ActivityContext, 'pendingLogs'>,
  callback: () => T,
) {
  return activityContextStorage.run({ ...context, pendingLogs: [] }, callback);
}

export function getActivityContext() {
  return activityContextStorage.getStore();
}

export function queueActivityLog(log: PendingActivityLog) {
  activityContextStorage.getStore()?.pendingLogs.push(log);
}

export function takePendingActivityLogs() {
  const context = activityContextStorage.getStore();
  return context ? context.pendingLogs.splice(0) : [];
}

export function restorePendingActivityLogs(logs: PendingActivityLog[]) {
  activityContextStorage.getStore()?.pendingLogs.unshift(...logs);
}
