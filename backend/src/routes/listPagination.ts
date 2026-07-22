import { z } from 'zod';

const PAGINATION_KEYS = ['from', 'to', 'page', 'limit'] as const;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_PAGE = 1_000_000;

const emptyToUndefined = (value: unknown) => (
  typeof value === 'string' && value.trim() === '' ? undefined : value
);

const querySchema = z.object({
  from: z.preprocess(emptyToUndefined, z.string().trim().max(40).optional()),
  to: z.preprocess(emptyToUndefined, z.string().trim().max(40).optional()),
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(MAX_PAGE).optional()),
  limit: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(MAX_LIMIT).optional()),
}).passthrough();

export interface ListPagination {
  enabled: boolean;
  from?: Date;
  to?: Date;
  page: number;
  limit: number;
}

type ParseResult =
  | { success: true; data: ListPagination }
  | { success: false; error: unknown };

function parseBoundary(value: string | undefined, endOfDay: boolean) {
  if (!value) return undefined;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
    const date = new Date(`${value}${suffix}`);
    return date.toISOString().slice(0, 10) === value ? date : null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseListPagination(query: unknown): ParseResult {
  const normalized = query && typeof query === 'object' ? query : {};
  const parsed = querySchema.safeParse(normalized);
  if (!parsed.success) return { success: false, error: parsed.error.flatten() };

  const from = parseBoundary(parsed.data.from, false);
  const to = parseBoundary(parsed.data.to, true);
  if (from === null || to === null) return { success: false, error: 'Khoảng ngày không hợp lệ.' };
  if (from && to && from > to) {
    return { success: false, error: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.' };
  }

  const enabled = PAGINATION_KEYS.some(key => Object.prototype.hasOwnProperty.call(normalized, key));
  return {
    success: true,
    data: {
      enabled,
      from,
      to,
      page: parsed.data.page ?? 1,
      limit: parsed.data.limit ?? DEFAULT_LIMIT,
    },
  };
}

export function dateWhere(field: string, pagination: ListPagination) {
  if (!pagination.from && !pagination.to) return undefined;
  return {
    [field]: {
      ...(pagination.from ? { gte: pagination.from } : {}),
      ...(pagination.to ? { lte: pagination.to } : {}),
    },
  };
}

export function pageWindow(pagination: ListPagination) {
  return {
    skip: (pagination.page - 1) * pagination.limit,
    take: pagination.limit,
  };
}

export function paginatedResponse<T>(items: T[], total: number, pagination: ListPagination) {
  return { items, total, page: pagination.page, limit: pagination.limit };
}
