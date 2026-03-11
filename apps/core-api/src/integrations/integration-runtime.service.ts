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
    const existingState = await this.prisma.integrationSyncState.findUnique({
      where: {
        providerConfigId_scope: {
          providerConfigId: input.providerConfigId,
          scope: input.scope,
        },
      },
    });

    if (
      existingState?.status === 'RUNNING' &&
      !this.isStaleRunningSync(existingState.startedAt ?? null)
    ) {
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

    const startedAt = new Date();
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
        status: 'RUNNING',
        cursor: input.cursor ?? null,
        startedAt,
        metadata: {
          providerKey: input.providerKey,
          lastReason: input.reason,
        } as Prisma.InputJsonValue,
      },
      update: {
        status: 'RUNNING',
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
      await this.prisma.integrationSyncState.update({
        where: {
          providerConfigId_scope: {
            providerConfigId: input.providerConfigId,
            scope: input.scope,
          },
        },
        data: {
          status: result.status === 'completed' ? 'SUCCEEDED' : 'IDLE',
          cursor: result.nextCursor ?? input.cursor ?? null,
          lastSyncedAt: result.status === 'completed' ? finishedAt : null,
          nextSyncAt: null,
          finishedAt,
          lastErrorCode: null,
          lastErrorMessage: null,
          metadata: {
            providerKey: input.providerKey,
            lastReason: input.reason,
            lastResultStatus: result.status,
            lastMessage: this.sanitizeMessage(result.message),
          } as Prisma.InputJsonValue,
        },
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

      throw error;
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

  private isStaleRunningSync(startedAt: Date | null): boolean {
    if (!startedAt) {
      return true;
    }
    return Date.now() - startedAt.getTime() > RUNNING_SYNC_STALE_MS;
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
      .replace(/\b(api key|access token|refresh token|signing secret|token|secret|password)\s*[:=]?\s*\S+/gi, '$1 [redacted]')
      .slice(0, 500);
  }

  private logStructuredEvent(event: string, details: Record<string, unknown>): void {
    this.logger.log(JSON.stringify({ event, ...details }));
  }
}
