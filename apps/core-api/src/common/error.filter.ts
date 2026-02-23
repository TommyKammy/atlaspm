import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class GlobalErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { correlationId?: string }>();
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

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: 'HTTP_500',
        message: 'Internal server error',
        correlationId,
      },
    });
  }
}
