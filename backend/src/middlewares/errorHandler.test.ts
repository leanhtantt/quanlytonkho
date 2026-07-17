import { describe, expect, it, vi } from 'vitest';
import { BusinessError } from '../errors/BusinessError';
import { errorHandler, GENERIC_SERVER_ERROR_MESSAGE } from './errorHandler';

function createResponse() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response;
}

describe('errorHandler', () => {
  it('returns the existing business message as a 400 response', () => {
    const response = createResponse();

    errorHandler(
      new BusinessError('Không đủ tồn kho.'),
      { method: 'POST', originalUrl: '/api/orders' } as any,
      response as any,
      vi.fn(),
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({ error: 'Không đủ tồn kho.' });
  });

  it('logs unexpected errors and does not expose their details to clients', () => {
    const response = createResponse();
    const error = new Error('Prisma connection password should not reach the client');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    errorHandler(error, { method: 'POST', originalUrl: '/api/orders' } as any, response as any, vi.fn());

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ error: GENERIC_SERVER_ERROR_MESSAGE });
    expect(response.json).not.toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('password') }));
    expect(log).toHaveBeenCalledWith('Unhandled error POST /api/orders:', error);
    log.mockRestore();
  });
});
