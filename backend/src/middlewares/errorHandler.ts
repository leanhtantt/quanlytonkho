import type { NextFunction, Request, Response } from 'express';
import { BusinessError } from '../errors/BusinessError';

export const GENERIC_SERVER_ERROR_MESSAGE = 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.';

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  if (error instanceof BusinessError) {
    return res.status(400).json({ error: error.message });
  }

  console.error('Unhandled error ' + req.method + ' ' + req.originalUrl + ':', error);
  return res.status(500).json({ error: GENERIC_SERVER_ERROR_MESSAGE });
}
