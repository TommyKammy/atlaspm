import { describe, expect, it, vi } from 'vitest';
import type { IntegrationProvider } from '../src/integrations/integration-provider.contract';
import { IntegrationProviderRegistry } from '../src/integrations/integration-provider.registry';
import { IntegrationRuntimeService } from '../src/integrations/integration-runtime.service';

function createProvider(overrides?: Partial<IntegrationProvider>): IntegrationProvider {
  return {
    key: 'slack',
    displayName: 'Slack',
    async authorize() {
      return { status: 'pending', message: 'Connect Slack in admin settings' };
    },
    async sync() {
      return { status: 'completed', nextCursor: 'cursor-2', message: 'Sync complete' };
    },
    async handleWebhook() {
      return { accepted: true, responseBody: { ok: true } };
    },
    describeJobs() {
      return [];
    },
    ...overrides,
  };
}

describe('IntegrationRuntimeService', () => {
  it('updates provider auth status using the shared provider contract', async () => {
    const provider = createProvider();
    const prisma = {
      integrationProviderConfig: {
        update: vi.fn(async () => undefined),
      },
      integrationSyncState: {
        upsert: vi.fn(),
        updateMany: vi.fn(),
        update: vi.fn(),
      },
    };

    const service = new IntegrationRuntimeService(
      prisma as any,
      new IntegrationProviderRegistry([provider]),
    );

    const result = await service.authorizeProvider({
      providerKey: 'slack',
      providerConfigId: 'cfg-1',
      workspaceId: 'ws-1',
      actorUserId: 'user-1',
      callbackUrl: 'https://atlaspm.test/callback/slack',
    });

    expect(result).toEqual({
      status: 'pending',
      message: 'Connect Slack in admin settings',
    });
    expect(prisma.integrationProviderConfig.update).toHaveBeenCalledWith({
      where: { id: 'cfg-1' },
      data: {
        status: 'PENDING',
      },
    });
  });

  it('skips duplicate sync execution when the persisted scope is already running', async () => {
    const provider = createProvider({
      sync: vi.fn(async () => {
        throw new Error('sync should not be called');
      }),
    });
    const prisma = {
      integrationProviderConfig: {
        update: vi.fn(async () => undefined),
      },
      integrationSyncState: {
        upsert: vi.fn(async () => undefined),
        updateMany: vi.fn(async () => ({ count: 0 })),
        update: vi.fn(async () => undefined),
      },
    };

    const service = new IntegrationRuntimeService(
      prisma as any,
      new IntegrationProviderRegistry([provider]),
    );

    const result = await service.runSyncJob({
      providerKey: 'slack',
      providerConfigId: 'cfg-1',
      workspaceId: 'ws-1',
      actorUserId: 'user-1',
      scope: 'tasks',
      reason: 'manual',
    });

    expect(result).toEqual({
      status: 'skipped',
      message: 'A sync is already running for this provider scope.',
    });
    expect(provider.sync).not.toHaveBeenCalled();
    expect(prisma.integrationSyncState.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.integrationSyncState.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.integrationSyncState.update).not.toHaveBeenCalled();
  });

  it('persists sync lifecycle state for a successful provider sync', async () => {
    const provider = createProvider();
    const prisma = {
      integrationProviderConfig: {
        update: vi.fn(async () => undefined),
      },
      integrationSyncState: {
        upsert: vi.fn(async () => undefined),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async () => undefined),
      },
    };

    const service = new IntegrationRuntimeService(
      prisma as any,
      new IntegrationProviderRegistry([provider]),
    );

    const result = await service.runSyncJob({
      providerKey: 'slack',
      providerConfigId: 'cfg-1',
      workspaceId: 'ws-1',
      actorUserId: 'user-1',
      scope: 'tasks',
      reason: 'manual',
      cursor: 'cursor-1',
    });

    expect(result).toEqual({
      status: 'completed',
      nextCursor: 'cursor-2',
      message: 'Sync complete',
    });
    expect(prisma.integrationSyncState.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.integrationSyncState.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.integrationSyncState.update).toHaveBeenCalledWith({
      where: {
        providerConfigId_scope: {
          providerConfigId: 'cfg-1',
          scope: 'tasks',
        },
      },
      data: expect.objectContaining({
        status: 'SUCCEEDED',
        cursor: 'cursor-2',
        lastErrorCode: null,
        lastErrorMessage: null,
        lastSyncedAt: expect.any(Date),
        finishedAt: expect.any(Date),
      }),
    });
  });

  it('keeps queued async syncs in RUNNING and preserves the previous lastSyncedAt', async () => {
    const provider = createProvider({
      sync: vi.fn(async () => ({
        status: 'queued',
        nextCursor: 'cursor-queued',
        message: 'Queued for background processing',
      })),
    });
    const prisma = {
      integrationProviderConfig: {
        update: vi.fn(async () => undefined),
      },
      integrationSyncState: {
        upsert: vi.fn(async () => undefined),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async () => undefined),
      },
    };

    const service = new IntegrationRuntimeService(
      prisma as any,
      new IntegrationProviderRegistry([provider]),
    );

    const result = await service.runSyncJob({
      providerKey: 'slack',
      providerConfigId: 'cfg-1',
      workspaceId: 'ws-1',
      actorUserId: 'user-1',
      scope: 'tasks',
      reason: 'scheduled',
      cursor: 'cursor-1',
    });

    expect(result).toEqual({
      status: 'queued',
      nextCursor: 'cursor-queued',
      message: 'Queued for background processing',
    });

    const updateArgs = prisma.integrationSyncState.update.mock.calls[0][0];
    expect(updateArgs.data.status).toBe('RUNNING');
    expect(updateArgs.data.cursor).toBe('cursor-queued');
    expect(updateArgs.data).not.toHaveProperty('lastSyncedAt');
    expect(updateArgs.data).not.toHaveProperty('finishedAt');
  });

  it('rethrows a sanitized provider error so the global logger cannot leak secrets', async () => {
    const providerError = Object.assign(
      new Error('Bearer super-secret-token xoxb-1234567890'),
      { code: 'SLACK_AUTH_FAILED' },
    );
    const provider = createProvider({
      sync: vi.fn(async () => {
        throw providerError;
      }),
    });
    const prisma = {
      integrationProviderConfig: {
        update: vi.fn(async () => undefined),
      },
      integrationSyncState: {
        upsert: vi.fn(async () => undefined),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async () => undefined),
      },
    };

    const service = new IntegrationRuntimeService(
      prisma as any,
      new IntegrationProviderRegistry([provider]),
    );

    await expect(
      service.runSyncJob({
        providerKey: 'slack',
        providerConfigId: 'cfg-1',
        workspaceId: 'ws-1',
        actorUserId: 'user-1',
        scope: 'tasks',
        reason: 'manual',
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Bearer [redacted] [redacted-token]');
      expect((error as Error & { code?: string }).code).toBe('SLACK_AUTH_FAILED');
      expect((error as Error & { cause?: unknown }).cause).toBe(providerError);
      return true;
    });

    expect(prisma.integrationSyncState.update).toHaveBeenCalledWith({
      where: {
        providerConfigId_scope: {
          providerConfigId: 'cfg-1',
          scope: 'tasks',
        },
      },
      data: expect.objectContaining({
        status: 'FAILED',
        lastErrorCode: 'SLACK_AUTH_FAILED',
        lastErrorMessage: 'Bearer [redacted] [redacted-token]',
      }),
    });
  });
});
