import type { NextFunction, Request, Response } from 'express';

export class RequestLoggingMiddleware {
  use(req: Request & { correlationId?: string }, _res: Response, next: NextFunction) {
    const correlationId = req.correlationId ?? 'unknown';
    console.info(
      JSON.stringify({
        level: 'info',
        type: 'http.request',
        method: req.method,
        path: req.path,
        correlationId,
      }),
    );
    next();
  }
}
