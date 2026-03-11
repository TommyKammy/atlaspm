import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  IntegrationAuthorizationResult,
  IntegrationProviderKey,
  IntegrationSyncResult,
} from './integration-provider.contract';
import { IntegrationProviderRegistry } from './integration-provider.registry';

const RUNNING_SYNC_STALE_MS = 15 * 60 * 1000;

export interface AuthorizeProviderInput {
  providerKey: IntegrationProviderKey;
  providerConfigId: string;
  workspaceId: string;
  actorUserId: string;
  callbackUrl?: string;
  payload?: Record<string, unknown>;
}

export interface RunIntegrationSyncJobInput {
  providerKey: IntegrationProviderKey;
  providerConfigId: string;
  workspaceId: string;
  actorUserId: string;
  scope: string;
  reason: 'manual' | 'scheduled' | 'webhook';
  cursor?: string | null;
}

export interface RunIntegrationSyncJobResult {
  status: IntegrationSyncResult['status'] | 'skipped';
  nextCursor?: string | null;
  message?: string;
  importedCount?: number;
  updatedCount?: number;
}

@Injectable()
export class IntegrationRuntimeService {
  private readonly logger = new Logger(IntegrationRuntimeService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(IntegrationProviderRegistry)
    private readonly registry: IntegrationProviderRegistry,
  ) {}

  async authorizeProvider(input: AuthorizeProviderInput): Promise<IntegrationAuthorizationResult> {
    const provider = this.registry.get(input.providerKey);
    const result = await provider.authorize({
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      providerConfigId: input.providerConfigId,
      callbackUrl: input.callbackUrl,
      payload: input.payload,
    });

    await this.prisma.integrationProviderConfig.update({
      where: { id: input.providerConfigId },
      data: {
        status: this.mapAuthorizationStatus(result.status),
      },
    });

    this.logStructuredEvent('integration.auth.completed', {
      providerKey: input.providerKey,
      providerConfigId: input.providerConfigId,
      workspaceId: input.workspaceId,
      status: result.status,
    });

    return result;
  }

  async runSyncJob(input: RunIntegrationSyncJobInput): Promise<RunIntegrationSyncJobResult> {
    const provider = this.registry.get(input.providerKey);
    const startedAt = new Date();
    const claimed = await this.claimSyncExecution(input, startedAt);

    if (!claimed) {
      this.logStructuredEvent('integration.sync.skipped', {
        providerKey: input.providerKey,
        providerConfigId: input.providerConfigId,
        scope: input.scope,
        reason: 'already_running',
      });
      return {
        status: 'skipped',
        message: 'A sync is already running for this provider scope.',
      };
    }

    this.logStructuredEvent('integration.sync.started', {
      providerKey: input.providerKey,
      providerConfigId: input.providerConfigId,
      scope: input.scope,
      reason: input.reason,
    });

    try {
      const result = await provider.sync({
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        providerConfigId: input.providerConfigId,
        scope: input.scope,
        reason: input.reason,
        cursor: input.cursor,
      });

      const finishedAt = new Date();
      const stateUpdate: Prisma.IntegrationSyncStateUpdateInput = {
        status: this.mapSyncResultStatus(result.status),
        cursor: result.nextCursor ?? input.cursor ?? undefined,
        lastErrorCode: null,
        lastErrorMessage: null,
        metadata: {
          providerKey: input.providerKey,
          lastReason: input.reason,
          lastResultStatus: result.status,
          lastMessage: this.sanitizeMessage(result.message),
        } as Prisma.InputJsonValue,
      };

      if (result.status === 'completed') {
        stateUpdate.lastSyncedAt = finishedAt;
        stateUpdate.nextSyncAt = null;
        stateUpdate.finishedAt = finishedAt;
      } else if (result.status === 'not_supported') {
        stateUpdate.nextSyncAt = null;
        stateUpdate.finishedAt = finishedAt;
      }

      await this.prisma.integrationSyncState.update({
        where: {
          providerConfigId_scope: {
            providerConfigId: input.providerConfigId,
            scope: input.scope,
          },
        },
        data: stateUpdate,
      });

      this.logStructuredEvent('integration.sync.completed', {
        providerKey: input.providerKey,
        providerConfigId: input.providerConfigId,
        scope: input.scope,
        status: result.status,
      });

      return result;
    } catch (error) {
      const finishedAt = new Date();
      const sanitizedError = this.sanitizeError(error);

      await this.prisma.integrationSyncState.update({
        where: {
          providerConfigId_scope: {
            providerConfigId: input.providerConfigId,
            scope: input.scope,
          },
        },
        data: {
          status: 'FAILED',
          finishedAt,
          lastErrorCode: sanitizedError.code,
          lastErrorMessage: sanitizedError.message,
          metadata: {
            providerKey: input.providerKey,
            lastReason: input.reason,
            failedAt: finishedAt.toISOString(),
          } as Prisma.InputJsonValue,
        },
      });

      this.logStructuredEvent('integration.sync.failed', {
        providerKey: input.providerKey,
        providerConfigId: input.providerConfigId,
        scope: input.scope,
        errorCode: sanitizedError.code,
        errorMessage: sanitizedError.message,
      });

      throw this.createSanitizedException(sanitizedError, error);
    }
  }

  private mapAuthorizationStatus(
    status: IntegrationAuthorizationResult['status'],
  ): 'ACTIVE' | 'PENDING' | 'ERROR' {
    switch (status) {
      case 'connected':
        return 'ACTIVE';
      case 'pending':
        return 'PENDING';
      case 'not_supported':
        return 'ERROR';
    }
  }

  private async claimSyncExecution(
    input: RunIntegrationSyncJobInput,
    startedAt: Date,
  ): Promise<boolean> {
    await this.prisma.integrationSyncState.upsert({
      where: {
        providerConfigId_scope: {
          providerConfigId: input.providerConfigId,
          scope: input.scope,
        },
      },
      create: {
        providerConfigId: input.providerConfigId,
        scope: input.scope,
        status: 'IDLE',
        cursor: input.cursor ?? null,
        metadata: {
          providerKey: input.providerKey,
        } as Prisma.InputJsonValue,
      },
      update: {},
    });

    const claimedState = await this.prisma.integrationSyncState.updateMany({
      where: {
        providerConfigId: input.providerConfigId,
        scope: input.scope,
        OR: [
          { status: { not: 'RUNNING' } },
          { startedAt: null },
          { startedAt: { lt: new Date(startedAt.getTime() - RUNNING_SYNC_STALE_MS) } },
        ],
      },
      data: {
        status: 'RUNNING',
        cursor: input.cursor ?? undefined,
        startedAt,
        finishedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        metadata: {
          providerKey: input.providerKey,
          lastReason: input.reason,
        } as Prisma.InputJsonValue,
      },
    });

    return claimedState.count === 1;
  }

  private mapSyncResultStatus(status: IntegrationSyncResult['status']): 'SUCCEEDED' | 'RUNNING' | 'IDLE' {
    switch (status) {
      case 'completed':
        return 'SUCCEEDED';
      case 'queued':
        return 'RUNNING';
      case 'not_supported':
        return 'IDLE';
    }
  }

  private sanitizeError(error: unknown): { code: string; message: string } {
    if (error && typeof error === 'object') {
      const maybeError = error as { code?: string; message?: string };
      return {
        code: maybeError.code ?? 'INTEGRATION_SYNC_FAILED',
        message: this.sanitizeMessage(maybeError.message) ?? 'Integration sync failed',
      };
    }

    if (typeof error === 'string') {
      return {
        code: 'INTEGRATION_SYNC_FAILED',
        message: this.sanitizeMessage(error) ?? 'Integration sync failed',
      };
    }

    return {
      code: 'INTEGRATION_SYNC_FAILED',
      message: 'Integration sync failed',
    };
  }

  private sanitizeMessage(message: string | undefined): string | null {
    if (!message) {
      return null;
    }

    return message
      .replace(/\bBearer\s+[A-Za-z0-9._-]+\b/gi, 'Bearer [redacted]')
      .replace(/\bxox[a-z]-[A-Za-z0-9-]+\b/gi, '[redacted-token]')
      .replace(/(^|\s)(api key|access token|refresh token|signing secret|token|secret|password)\s*[:=]?\s*\S+/gi, '$1$2 [redacted]')
      .slice(0, 500);
  }

  private createSanitizedException(
    sanitizedError: { code: string; message: string },
    cause: unknown,
  ): Error & { code?: string; cause?: unknown } {
    const sanitizedException: Error & { code?: string; cause?: unknown } = new Error(
      sanitizedError.message,
    );
    sanitizedException.code = sanitizedError.code;
    sanitizedException.cause = cause;
    return sanitizedException;
  }

  private logStructuredEvent(event: string, details: Record<string, unknown>): void {
    this.logger.log(JSON.stringify({ event, ...details }));
  }
}
