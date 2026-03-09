import type { NextFunction, Response } from 'express';
import { describe, expect, test, vi, afterEach } from 'vitest';
import { RequestLoggingMiddleware } from '../src/common/request-logging.middleware';

type RequestLike = {
  method: string;
  path: string;
  query: Record<string, unknown>;
  correlationId?: string;
  user?: { sub?: string };
};

type ResponseLike = Pick<Response, 'statusCode'> & {
  on: (event: 'finish', listener: () => void) => void;
};

describe('RequestLoggingMiddleware', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('logs user identity on request start and end', () => {
    const middleware = new RequestLoggingMiddleware();
    const request: RequestLike = {
      method: 'GET',
      path: '/tasks',
      query: { projectId: 'project-1' },
      correlationId: 'corr-123',
      user: { sub: 'user-123' },
    };

    let finishListener: (() => void) | undefined;
    const response: ResponseLike = {
      statusCode: 200,
      on(event, listener) {
        if (event === 'finish') {
          finishListener = listener;
        }
      },
    };

    const next = vi.fn<NextFunction>();
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    middleware.use(request as never, response as never, next);
    finishListener?.();

    expect(next).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledTimes(2);

    const startLog = JSON.parse(infoSpy.mock.calls[0][0] as string);
    expect(startLog).toMatchObject({
      level: 'info',
      type: 'http.request.start',
      method: 'GET',
      path: '/tasks',
      query: { projectId: 'project-1' },
      correlationId: 'corr-123',
      userId: 'user-123',
    });

    const endLog = JSON.parse(infoSpy.mock.calls[1][0] as string);
    expect(endLog).toMatchObject({
      level: 'info',
      type: 'http.request.end',
      method: 'GET',
      path: '/tasks',
      statusCode: 200,
      correlationId: 'corr-123',
      userId: 'user-123',
    });
    expect(typeof endLog.durationMs).toBe('number');
  });
});
