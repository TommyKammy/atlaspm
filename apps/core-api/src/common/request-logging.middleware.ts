import type { NextFunction, Request, Response } from 'express';

export class RequestLoggingMiddleware {
  use(req: Request & { correlationId?: string; user?: { sub?: string } }, res: Response, next: NextFunction) {
    const correlationId = req.correlationId ?? 'unknown';
    const startedAt = Date.now();
    console.info(
      JSON.stringify({
        level: 'info',
        type: 'http.request.start',
        method: req.method,
        path: req.path,
        query: req.query,
        correlationId,
      }),
    );

    res.on('finish', () => {
      const durationMs = Date.now() - startedAt;
      console.info(
        JSON.stringify({
          level: 'info',
          type: 'http.request.end',
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs,
          userId: req.user?.sub ?? 'anonymous',
          correlationId,
        }),
      );
    });
    next();
  }
}
