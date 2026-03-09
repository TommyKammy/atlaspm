import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { redactLogData } from './log-redaction';

@Catch()
export class GlobalErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { correlationId?: string; user?: { sub?: string } }>();
    const res = ctx.getResponse<Response>();
    const correlationId = req.correlationId ?? 'unknown';

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message =
        typeof body === 'object' && body !== null && 'message' in body
          ? (body as { message?: string }).message ?? exception.message
          : exception.message;

      res.status(status).json({
        error: {
          code: `HTTP_${status}`,
          message,
          correlationId,
          details: body,
        },
      });
      return;
    }

    const errorMessage = exception instanceof Error ? exception.message : 'Unknown error';
    const errorStack = exception instanceof Error ? exception.stack : undefined;
    const path = req.path ?? req.url;
    const route = req.route?.path ?? path;

    this.logger.error({
      message: 'Internal Server Error',
      path,
      route,
      method: req.method,
      body: redactLogData(req.body),
      query: redactLogData(req.query),
      params: redactLogData(req.params),
      user: req.user?.sub ?? 'anonymous',
      error: errorMessage,
      stack: errorStack,
      correlationId,
      timestamp: new Date().toISOString(),
    });

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 'HTTP_500',
        message: 'Internal server error',
        correlationId,
      },
    });
  }
}
