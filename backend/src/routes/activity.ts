import { Prisma } from '@prisma/client';
import { RequestHandler, Router } from 'express';
import { z } from 'zod';
import { prisma } from '../prismaClient';

const emptyToUndefined = (value: unknown) => (
  typeof value === 'string' && value.trim() ? value.trim() : undefined
);

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  actorUid: z.preprocess(emptyToUndefined, z.string().max(128).optional()),
  resource: z.preprocess(emptyToUndefined, z.string().max(100).optional()),
  action: z.preprocess(emptyToUndefined, z.string().max(100).optional()),
  from: z.preprocess(emptyToUndefined, z.string().max(40).optional()),
  to: z.preprocess(emptyToUndefined, z.string().max(40).optional()),
}).strict();

function parseDate(value: string | undefined, endOfDay: boolean) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && endOfDay) {
    date.setHours(23, 59, 59, 999);
  }
  return date;
}

export const listActivity: RequestHandler = async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const filters = parsed.data;
  const from = parseDate(filters.from, false);
  const to = parseDate(filters.to, true);
  if (from === null || to === null) {
    return res.status(400).json({ error: 'Khoảng ngày không hợp lệ.' });
  }
  if (from && to && from > to) {
    return res.status(400).json({ error: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.' });
  }

  const where: Prisma.ActivityLogWhereInput = {
    ...(filters.actorUid ? { actorUid: filters.actorUid } : {}),
    ...(filters.resource ? { resource: filters.resource } : {}),
    ...(filters.action ? { action: filters.action } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.activityLog.count({ where }),
  ]);

  return res.json({
    data,
    total,
    page: filters.page,
    pageSize: filters.pageSize,
  });
};

export const activityRouter = Router();

activityRouter.get('/', listActivity);
