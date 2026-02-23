import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

export class CorrelationIdMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const cid = (req.header('x-correlation-id') ?? randomUUID()).toString();
    (req as Request & { correlationId?: string }).correlationId = cid;
    res.setHeader('x-correlation-id', cid);
    next();
  }
}
