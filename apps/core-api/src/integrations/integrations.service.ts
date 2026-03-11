import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IntegrationCredentialKind, IntegrationProviderKind, WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DomainService } from '../common/domain.service';
import { IntegrationRuntimeService } from './integration-runtime.service';
import { IntegrationCredentialsService } from './integration-credentials.service';
import { Prisma } from '@prisma/client';
import { GithubProviderSettings } from './github.types';

type GithubConnectInput = {
  workspaceId: string;
  actorUserId: string;
  correlationId: string;
  key: string;
  displayName: string;
  owner: string;
  repo: string;
  projectId: string;
  accessToken: string;
};

@Injectable()
export class IntegrationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
    @Inject(IntegrationRuntimeService)
    private readonly runtime: IntegrationRuntimeService,
    @Inject(IntegrationCredentialsService)
    private readonly credentials: IntegrationCredentialsService,
  ) {}

  async listWorkspaceIntegrations(workspaceId: string, actorUserId: string) {
    await this.domain.requireWorkspaceMembership(workspaceId, actorUserId);
    const configs = await this.prisma.integrationProviderConfig.findMany({
      where: { workspaceId },
      include: {
        credentials: {
          select: {
            kind: true,
            redactedValue: true,
            updatedAt: true,
          },
        },
        syncStates: {
          orderBy: { updatedAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return configs.map((config) => this.serializeConfig(config));
  }

  async connectGithub(input: GithubConnectInput) {
    await this.domain.requireWorkspaceRole(input.workspaceId, input.actorUserId, WorkspaceRole.WS_ADMIN);

    const project = await this.prisma.project.findUnique({
      where: { id: input.projectId },
      select: { id: true, workspaceId: true },
    });
    if (!project || project.workspaceId !== input.workspaceId) {
      throw new BadRequestException('projectId must belong to the same workspace');
    }

    const settings: GithubProviderSettings = {
      owner: input.owner,
      repo: input.repo,
      projectId: input.projectId,
    };

    const providerConfig = await this.prisma.integrationProviderConfig.create({
      data: {
        workspaceId: input.workspaceId,
        provider: IntegrationProviderKind.GITHUB,
        key: input.key,
        displayName: input.displayName,
        settings: settings as unknown as Prisma.InputJsonValue,
        createdByUserId: input.actorUserId,
        updatedByUserId: input.actorUserId,
      },
    });

    await this.credentials.upsertCredential(
      providerConfig.id,
      IntegrationCredentialKind.ACCESS_TOKEN,
      input.accessToken,
    );

    try {
      await this.runtime.authorizeProvider({
        providerKey: 'github',
        providerConfigId: providerConfig.id,
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
      });
    } catch (error) {
      await this.prisma.integrationProviderConfig.update({
        where: { id: providerConfig.id },
        data: {
          status: 'ERROR',
          updatedByUserId: input.actorUserId,
        },
      });
      throw error;
    }

    const refreshed = await this.getConfigOrThrow(providerConfig.id, input.workspaceId);
    await this.prisma.$transaction(async (tx) => {
      await this.domain.appendAuditOutbox({
        tx,
        actor: input.actorUserId,
        entityType: 'IntegrationProviderConfig',
        entityId: refreshed.id,
        action: 'integration.provider.connected',
        afterJson: this.auditSafeConfig(refreshed),
        correlationId: input.correlationId,
        outboxType: 'integration.provider.connected',
        payload: {
          providerConfigId: refreshed.id,
          workspaceId: refreshed.workspaceId,
          provider: refreshed.provider,
          status: refreshed.status,
        },
      });
    });

    return this.serializeConfig(refreshed);
  }

  async triggerSync(input: {
    workspaceId: string;
    providerConfigId: string;
    actorUserId: string;
    correlationId: string;
    scope: string;
  }) {
    await this.domain.requireWorkspaceRole(input.workspaceId, input.actorUserId, WorkspaceRole.WS_ADMIN);
    const config = await this.getConfigOrThrow(input.providerConfigId, input.workspaceId);
    const providerKey = config.provider === IntegrationProviderKind.GITHUB ? 'github' : 'slack';
    const result = await this.runtime.runSyncJob({
      providerKey,
      providerConfigId: config.id,
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      scope: input.scope,
      reason: 'manual',
    });

    if (result.status === 'completed') {
      await this.prisma.$transaction(async (tx) => {
        await this.domain.appendAuditOutbox({
          tx,
          actor: input.actorUserId,
          entityType: 'IntegrationProviderConfig',
          entityId: config.id,
          action: 'integration.sync.completed',
          afterJson: {
            scope: input.scope,
            status: result.status,
            importedCount: result.importedCount ?? 0,
            updatedCount: result.updatedCount ?? 0,
          },
          correlationId: input.correlationId,
          outboxType: 'integration.sync.completed',
          payload: {
            providerConfigId: config.id,
            workspaceId: input.workspaceId,
            scope: input.scope,
            importedCount: result.importedCount ?? 0,
            updatedCount: result.updatedCount ?? 0,
          },
        });
      });
    }

    return {
      ...result,
      providerKey,
      scope: input.scope,
    };
  }

  private async getConfigOrThrow(providerConfigId: string, workspaceId: string) {
    const config = await this.prisma.integrationProviderConfig.findFirst({
      where: {
        id: providerConfigId,
        workspaceId,
      },
      include: {
        credentials: {
          select: {
            kind: true,
            redactedValue: true,
            updatedAt: true,
          },
        },
        syncStates: {
          orderBy: { updatedAt: 'desc' },
        },
      },
    });
    if (!config) {
      throw new NotFoundException('Integration provider config not found');
    }
    return config;
  }

  private serializeConfig(config: Awaited<ReturnType<IntegrationsService['getConfigOrThrow']>>) {
    return {
      id: config.id,
      workspaceId: config.workspaceId,
      provider: config.provider,
      key: config.key,
      displayName: config.displayName,
      status: config.status,
      settings: config.settings,
      credentials: config.credentials.map((credential) => ({
        kind: credential.kind,
        redactedValue: credential.redactedValue,
        updatedAt: credential.updatedAt,
      })),
      syncStates: config.syncStates.map((syncState) => ({
        id: syncState.id,
        scope: syncState.scope,
        status: syncState.status,
        cursor: syncState.cursor,
        lastSyncedAt: syncState.lastSyncedAt,
        startedAt: syncState.startedAt,
        finishedAt: syncState.finishedAt,
        lastErrorCode: syncState.lastErrorCode,
        lastErrorMessage: syncState.lastErrorMessage,
        metadata: syncState.metadata,
      })),
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }

  private auditSafeConfig(config: Awaited<ReturnType<IntegrationsService['getConfigOrThrow']>>) {
    return {
      id: config.id,
      workspaceId: config.workspaceId,
      provider: config.provider,
      key: config.key,
      displayName: config.displayName,
      status: config.status,
      settings: config.settings,
      credentials: config.credentials.map((credential) => ({
        kind: credential.kind,
        redactedValue: credential.redactedValue,
      })),
    };
  }
}
