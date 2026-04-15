import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IntegrationAuthorizationContext,
  IntegrationAuthorizationResult,
  IntegrationProvider,
  IntegrationSyncContext,
  IntegrationSyncResult,
  IntegrationWebhookContext,
  IntegrationWebhookResult,
  type IntegrationJobDefinition,
} from './integration-provider.contract';
import { GithubApiService } from './github-api.service';
import { GithubProviderSettings, type GithubIssue } from './github.types';
import { IntegrationCredentialsService } from './integration-credentials.service';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  IntegrationCredentialKind,
  IntegrationMappingDirection,
  TaskStatus,
  TaskType,
} from '@prisma/client';
import { Prisma } from '@prisma/client';

type ProviderConfigWithSettings = {
  id: string;
  workspaceId: string;
  settings: Prisma.JsonValue | null;
};

@Injectable()
export class GithubIntegrationProvider implements IntegrationProvider {
  readonly key = 'github' as const;
  readonly displayName = 'GitHub Issues';

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditOutboxService) private readonly auditOutbox: AuditOutboxService,
    @Inject(GithubApiService) private readonly githubApi: GithubApiService,
    @Inject(IntegrationCredentialsService)
    private readonly credentials: IntegrationCredentialsService,
  ) {}

  async authorize(context: IntegrationAuthorizationContext): Promise<IntegrationAuthorizationResult> {
    if (!context.providerConfigId) {
      throw new BadRequestException('providerConfigId is required');
    }

    const config = await this.getProviderConfig(context.providerConfigId);
    const settings = this.parseSettings(config.settings);
    const accessToken = await this.credentials.getCredential(
      context.providerConfigId,
      IntegrationCredentialKind.ACCESS_TOKEN,
    );

    const [user, repo] = await Promise.all([
      this.githubApi.getAuthenticatedUser(accessToken),
      this.githubApi.getRepo(settings.owner, settings.repo, accessToken),
    ]);

    await this.prisma.integrationProviderConfig.update({
      where: { id: context.providerConfigId },
      data: {
        settings: {
          ...settings,
          repoUrl: repo.html_url,
          accountLogin: user.login,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      status: 'connected',
      message: `Connected to ${repo.full_name} as ${user.login}.`,
    };
  }

  async sync(context: IntegrationSyncContext): Promise<IntegrationSyncResult> {
    const config = await this.getProviderConfig(context.providerConfigId);
    const settings = this.parseSettings(config.settings);
    const accessToken = await this.credentials.getCredential(
      context.providerConfigId,
      IntegrationCredentialKind.ACCESS_TOKEN,
    );
    const defaultSection = await this.prisma.section.findFirst({
      where: { projectId: settings.projectId, isDefault: true },
    });
    if (!defaultSection) {
      throw new NotFoundException('Default section missing for integration project');
    }

    const issues = await this.githubApi.listIssues({
      owner: settings.owner,
      repo: settings.repo,
      accessToken,
      since: context.cursor ?? undefined,
    });

    let importedCount = 0;
    let updatedCount = 0;
    let nextCursor = context.cursor ?? null;

    for (const issue of issues.filter((item) => !item.pull_request)) {
      const result = await this.upsertIssueTask({
        providerConfigId: context.providerConfigId,
        actorUserId: context.actorUserId,
        projectId: settings.projectId,
        sectionId: defaultSection.id,
        repoFullName: `${settings.owner}/${settings.repo}`,
        issue,
      });

      if (result === 'imported') {
        importedCount += 1;
      } else if (result === 'updated') {
        updatedCount += 1;
      }

      if (!nextCursor || issue.updated_at > nextCursor) {
        nextCursor = issue.updated_at;
      }
    }

    return {
      status: 'completed',
      nextCursor,
      importedCount,
      updatedCount,
      message: `Imported ${importedCount} and updated ${updatedCount} GitHub issues.`,
    };
  }

  async handleWebhook(context: IntegrationWebhookContext): Promise<IntegrationWebhookResult> {
    void context;
    return {
      accepted: false,
      responseBody: { ok: false, message: 'GitHub webhooks are not implemented yet.' },
    };
  }

  describeJobs(): IntegrationJobDefinition[] {
    return [
      {
        jobKey: 'github.issues.sync',
        trigger: 'sync',
        description: 'Imports GitHub issues into an AtlasPM project through the shared provider runtime.',
      },
      {
        jobKey: 'github.auth.validate',
        trigger: 'auth',
        description: 'Validates a GitHub access token and repository selection through the shared provider runtime.',
      },
    ];
  }

  private async upsertIssueTask(input: {
    providerConfigId: string;
    actorUserId: string;
    projectId: string;
    sectionId: string;
    repoFullName: string;
    issue: GithubIssue;
  }): Promise<'imported' | 'updated'> {
    return this.prisma.$transaction(async (tx) => {
      const mapping = await tx.integrationEntityMapping.findFirst({
        where: {
          providerConfigId: input.providerConfigId,
          entityType: 'task',
          externalId: `${input.issue.id}`,
        },
      });

      const title = input.issue.title;
      const description = this.buildTaskDescription(input.issue);
      const status = input.issue.state === 'closed' ? TaskStatus.DONE : TaskStatus.TODO;
      const progressPercent = status === TaskStatus.DONE ? 100 : 0;
      const completedAt = status === TaskStatus.DONE ? new Date(input.issue.updated_at) : null;
      const metadata = {
        issueNumber: input.issue.number,
        repoFullName: input.repoFullName,
        htmlUrl: input.issue.html_url,
      } as Prisma.InputJsonValue;

      if (mapping) {
        const existingTask = await tx.task.findUniqueOrThrow({ where: { id: mapping.internalId } });
        const updatedTask = await tx.task.update({
          where: { id: existingTask.id },
          data: {
            title,
            description,
            status,
            progressPercent,
            completedAt,
            tags: ['github', `github:${input.repoFullName}`],
          },
        });
        await tx.integrationEntityMapping.update({
          where: { id: mapping.id },
          data: {
            externalUpdatedAt: new Date(input.issue.updated_at),
            metadata,
          },
        });
        await this.auditOutbox.appendAuditOutbox({
          tx,
          actor: input.actorUserId,
          entityType: 'Task',
          entityId: updatedTask.id,
          action: 'task.updated',
          beforeJson: existingTask,
          afterJson: updatedTask,
          outboxType: 'task.updated',
          payload: { taskId: updatedTask.id, source: 'github' },
        });
        return 'updated';
      }

      const topTask = await tx.task.findFirst({
        where: { projectId: input.projectId, sectionId: input.sectionId, deletedAt: null },
        orderBy: { position: 'asc' },
      });
      const position = (topTask?.position ?? 1000) - 1000;

      const task = await tx.task.create({
        data: {
          projectId: input.projectId,
          sectionId: input.sectionId,
          title,
          description,
          status,
          type: TaskType.TASK,
          progressPercent,
          completedAt,
          position,
          tags: ['github', `github:${input.repoFullName}`],
        },
      });
      await tx.integrationEntityMapping.create({
        data: {
          providerConfigId: input.providerConfigId,
          entityType: 'task',
          direction: IntegrationMappingDirection.IMPORT,
          internalId: task.id,
          externalId: `${input.issue.id}`,
          externalUpdatedAt: new Date(input.issue.updated_at),
          metadata,
        },
      });
      await this.auditOutbox.appendAuditOutbox({
        tx,
        actor: input.actorUserId,
        entityType: 'Task',
        entityId: task.id,
        action: 'task.created',
        afterJson: task,
        outboxType: 'task.created',
        payload: { taskId: task.id, source: 'github' },
      });
      return 'imported';
    });
  }

  private async getProviderConfig(providerConfigId: string): Promise<ProviderConfigWithSettings> {
    const config = await this.prisma.integrationProviderConfig.findUnique({
      where: { id: providerConfigId },
      select: {
        id: true,
        workspaceId: true,
        settings: true,
      },
    });
    if (!config) {
      throw new NotFoundException('Integration provider config not found');
    }
    return config;
  }

  private parseSettings(settings: Prisma.JsonValue | null): GithubProviderSettings {
    const value = settings as Partial<GithubProviderSettings> | null;
    if (!value?.owner || !value.repo || !value.projectId) {
      throw new BadRequestException('GitHub integration settings are incomplete');
    }
    return {
      owner: value.owner,
      repo: value.repo,
      projectId: value.projectId,
      repoUrl: value.repoUrl,
      accountLogin: value.accountLogin,
    };
  }

  private buildTaskDescription(issue: GithubIssue): string {
    const body = issue.body?.trim();
    const parts = [`GitHub issue #${issue.number}`, issue.html_url];
    if (body) {
      parts.push('', body);
    }
    return parts.join('\n');
  }
}
