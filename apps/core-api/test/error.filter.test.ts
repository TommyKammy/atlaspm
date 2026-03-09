import { type ArgumentsHost } from '@nestjs/common';
import { describe, expect, test, vi } from 'vitest';
import { GlobalErrorFilter } from '../src/common/error.filter';

type RequestLike = {
  url: string;
  path?: string;
  route?: { path?: string };
  method: string;
  body: Record<string, unknown>;
  query: Record<string, unknown>;
  params: Record<string, unknown>;
  correlationId?: string;
  user?: { sub?: string };
};

type ResponseLike = {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
};

function createHost(request: RequestLike, response: ResponseLike): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as ArgumentsHost;
}

describe('GlobalErrorFilter', () => {
  test('redacts sensitive request data in unexpected error logs', () => {
    const filter = new GlobalErrorFilter();
    const request: RequestLike = {
      url: '/projects/project-1/tasks?access_token=query-access-token',
      path: '/projects/project-1/tasks',
      route: { path: '/projects/:id/tasks' },
      method: 'POST',
      correlationId: 'corr-123',
      user: { sub: 'user-123' },
      body: {
        email: 'user@example.com',
        inviteCode: 'invite-code',
        password: 'super-secret',
        nested: {
          token: 'body-token',
          attachments: [
            { accessToken: 'attachment-token', name: 'contract.pdf' },
            {
              metadata: {
                apiKey: 'nested-api-key',
                inviterEmail: 'owner@example.com',
              },
            },
          ],
        },
      },
      query: {
        search: 'visible',
        access_token: 'query-access-token',
        invitedEmail: 'friend@example.com',
      },
      params: {
        taskId: 'task-1',
        invitationId: 'invite-1',
        token: 'param-token',
      },
    };

    const response: ResponseLike = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const errorSpy = vi.spyOn((filter as { logger: { error: (...args: unknown[]) => void } }).logger, 'error');

    filter.catch(new Error('boom'), createHost(request, response));

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Internal Server Error',
        path: '/projects/project-1/tasks',
        route: '/projects/:id/tasks',
        method: 'POST',
        correlationId: 'corr-123',
        user: 'user-123',
        body: {
          email: '[REDACTED]',
          inviteCode: '[REDACTED]',
          password: '[REDACTED]',
          nested: {
            token: '[REDACTED]',
            attachments: [
              { accessToken: '[REDACTED]', name: 'contract.pdf' },
              {
                metadata: {
                  apiKey: '[REDACTED]',
                  inviterEmail: '[REDACTED]',
                },
              },
            ],
          },
        },
        query: {
          search: 'visible',
          access_token: '[REDACTED]',
          invitedEmail: '[REDACTED]',
        },
        params: {
          taskId: 'task-1',
          invitationId: '[REDACTED]',
          token: '[REDACTED]',
        },
      }),
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'HTTP_500',
        message: 'Internal server error',
        correlationId: 'corr-123',
      },
    });
  });
});
