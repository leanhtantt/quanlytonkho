import { RequestHandler } from 'express';
import { flushActivityLogs } from '../audit/activityLogService';

/** Flush queued Prisma audit events only after the route's business work succeeded. */
export const flushActivityLogsBeforeResponse: RequestHandler = (_req, res, next) => {
  const originalJson = res.json.bind(res);
  let flushing = false;

  res.json = ((body: unknown) => {
    if (flushing || res.statusCode >= 400) return originalJson(body);

    flushing = true;
    void flushActivityLogs()
      .catch(error => {
        console.error('Không thể ghi ActivityLog:', error);
      })
      .finally(() => originalJson(body));

    return res;
  }) as typeof res.json;

  next();
};
