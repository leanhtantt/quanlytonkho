import { describe, expect, it } from 'vitest';
import { dateWhere, pageWindow, paginatedResponse, parseListPagination } from './listPagination';

describe('list pagination query', () => {
  it('keeps legacy mode when no supported query param is present', () => {
    const result = parseListPagination({});
    expect(result).toEqual({
      success: true,
      data: { enabled: false, from: undefined, to: undefined, page: 1, limit: 50 },
    });
  });

  it('builds an inclusive UTC date range and page window', () => {
    const result = parseListPagination({ from: '2026-07-01', to: '2026-07-31', page: '3', limit: '20' });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data).toMatchObject({ enabled: true, page: 3, limit: 20 });
    expect(result.data.from?.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(result.data.to?.toISOString()).toBe('2026-07-31T23:59:59.999Z');
    expect(dateWhere('orderedAt', result.data)).toEqual({
      orderedAt: { gte: result.data.from, lte: result.data.to },
    });
    expect(pageWindow(result.data)).toEqual({ skip: 40, take: 20 });
    expect(paginatedResponse(['order'], 41, result.data)).toEqual({
      items: ['order'], total: 41, page: 3, limit: 20,
    });
  });

  it('enables pagination when only page or date is supplied', () => {
    expect(parseListPagination({ page: '2' })).toMatchObject({
      success: true, data: { enabled: true, page: 2, limit: 50 },
    });
    expect(parseListPagination({ from: '2026-07-01' })).toMatchObject({
      success: true, data: { enabled: true, page: 1, limit: 50 },
    });
  });

  it('rejects invalid ranges and unsafe page sizes', () => {
    expect(parseListPagination({ from: '2026-02-30' }).success).toBe(false);
    expect(parseListPagination({ from: '2026-08-01', to: '2026-07-01' })).toEqual({
      success: false,
      error: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.',
    });
    expect(parseListPagination({ limit: '201' }).success).toBe(false);
    expect(parseListPagination({ page: '0' }).success).toBe(false);
    expect(parseListPagination({ page: '1000001' }).success).toBe(false);
  });
});
