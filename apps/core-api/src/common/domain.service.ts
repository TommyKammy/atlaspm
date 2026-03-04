import { Injectable, ForbiddenException, NotFoundException, ConflictException, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, ProjectRole, TaskStatus, TaskType, UserStatus, WorkspaceRole } from '@prisma/client';
import {
  applyTaskProgressAutomation,
  deriveTaskCompletionTransition as deriveTaskCompletionTransitionInDomain,
  normalizeTaskProgressForType,
  type TaskStatus as DomainTaskStatus,
  type TaskType as DomainTaskType,
} from '@atlaspm/domain';
import { templateDefinition } from '../rules/rule-definition';
import type { AuthUser } from './types';

@Injectable()
export class DomainService {
  private static readonly defaultRuleTemplateKeys = ['progress_to_done', 'progress_to_in_progress'] as const;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  isDefaultRuleTemplateKey(templateKey: string): boolean {
    return DomainService.defaultRuleTemplateKeys.includes(templateKey as typeof DomainService.defaultRuleTemplateKeys[number]);
  }

  async ensureUser(sub: string, email?: string, name?: string) {
    const existing = await this.prisma.user.findUnique({ where: { id: sub } });
    if (!existing) {
      return this.prisma.user.create({
        data: { id: sub, email, displayName: name, status: UserStatus.ACTIVE },
      });
    }
    return this.prisma.user.update({
      where: { id: sub },
      data: {
        email,
        displayName: existing.displayName ?? name,
      },
    });
  }

  async syncAuthenticatedUser(user: AuthUser) {
    const existing = await this.prisma.user.findUnique({ where: { id: user.sub } });
    const now = new Date();
    if (!existing) {
      return this.prisma.user.create({
        data: {
          id: user.sub,
          email: user.email,
          displayName: user.name,
          status: UserStatus.ACTIVE,
          lastSeenAt: now,
        },
      });
    }
    if (existing.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException('User is suspended');
    }
    return this.prisma.user.update({
      where: { id: user.sub },
      data: {
        email: user.email,
        displayName: existing.displayName ?? user.name,
        lastSeenAt: now,
      },
    });
  }

  async ensureDefaultWorkspaceForUser(sub: string) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          let membership = await tx.workspaceMembership.findFirst({
            where: { userId: sub },
            include: { workspace: true },
          });

          if (!membership) {
            const ws = await tx.workspace.create({ data: { name: 'Default Workspace' } });
            membership = await tx.workspaceMembership.create({
              data: { workspaceId: ws.id, userId: sub, role: WorkspaceRole.WS_ADMIN },
              include: { workspace: true },
            });
          }

          return membership.workspace;
        }, {
          maxWait: 5000,
          timeout: 10000,
          isolationLevel: 'Serializable',
        });
      } catch (error) {
        const maybePrismaError = error as { code?: string; message?: string };
        const isRetryableTxnConflict =
          maybePrismaError.code === 'P2034' ||
          maybePrismaError.message?.includes('write conflict') ||
          maybePrismaError.message?.includes('deadlock') ||
          maybePrismaError.message?.includes('serialization');

        if (!isRetryableTxnConflict || attempt === 2) {
          const membership = await this.prisma.workspaceMembership.findFirst({
            where: { userId: sub },
            include: { workspace: true },
          });
          if (membership) {
            return membership.workspace;
          }
          throw error;
        }
      }
    }

    throw new ConflictException('Failed to ensure default workspace');
  }

  async requireWorkspaceRole(workspaceId: string, userId: string, min: WorkspaceRole) {
    const membership = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!membership) throw new NotFoundException('Workspace membership not found');
    const rank: Record<WorkspaceRole, number> = { WS_MEMBER: 1, WS_ADMIN: 2 };
    if (rank[membership.role] < rank[min]) throw new ForbiddenException('Insufficient workspace role');
    return membership;
  }

  async requireWorkspaceMembership(workspaceId: string, userId: string) {
    const membership = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!membership) throw new NotFoundException('Workspace membership not found');
    return membership;
  }

  async requireProjectRole(projectId: string, userId: string, min: ProjectRole) {
    const membership = await this.prisma.projectMembership.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!membership) throw new NotFoundException('Project membership not found');
    const rank: Record<ProjectRole, number> = { VIEWER: 1, MEMBER: 2, ADMIN: 3 };
    if (rank[membership.role] < rank[min]) throw new ForbiddenException('Insufficient role');
    return membership;
  }

  async appendAuditOutbox(args: {
    tx: Prisma.TransactionClient;
    actor: string;
    entityType: string;
    entityId: string;
    action: string;
    beforeJson?: unknown;
    afterJson?: unknown;
    correlationId?: string;
    outboxType: string;
    payload: unknown;
  }) {
    const correlationId = args.correlationId ?? 'test-correlation-id';
    const beforeJson =
      args.beforeJson === undefined
        ? undefined
        : args.beforeJson === null
          ? Prisma.JsonNull
          : (args.beforeJson as Prisma.InputJsonValue);
    const afterJson =
      args.afterJson === undefined
        ? undefined
        : args.afterJson === null
          ? Prisma.JsonNull
          : (args.afterJson as Prisma.InputJsonValue);
    const payload =
      args.payload === null ? Prisma.JsonNull : (args.payload as Prisma.InputJsonValue);

    await args.tx.auditEvent.create({
      data: {
        actor: args.actor,
        entityType: args.entityType,
        entityId: args.entityId,
        action: args.action,
        beforeJson,
        afterJson,
        correlationId,
      },
    });
    await args.tx.outboxEvent.create({
      data: {
        type: args.outboxType,
        payload,
        correlationId,
      },
    });
  }

  async ensureProjectDefaults(projectId: string, actor: string, correlationId: string) {
    const tx = this.prisma;
    const defaultSection = await tx.section.findFirst({ where: { projectId, isDefault: true } });
    if (!defaultSection) {
      const section = await tx.section.create({
        data: { projectId, name: 'No Section', isDefault: true, position: 1000 },
      });
      await this.appendAuditOutbox({
        tx,
        actor,
        entityType: 'Section',
        entityId: section.id,
        action: 'section.created.default',
        afterJson: section,
        correlationId,
        outboxType: 'section.created',
        payload: section,
      });
    }

    const templates = [
      { name: 'Progress to Done', templateKey: 'progress_to_done' },
      { name: 'Progress to In Progress', templateKey: 'progress_to_in_progress' },
    ] as const;
    for (const tpl of templates) {
      const rule = await tx.rule.upsert({
        where: { projectId_templateKey: { projectId, templateKey: tpl.templateKey } },
        create: {
          projectId,
          name: tpl.name,
          templateKey: tpl.templateKey,
          definition: templateDefinition(tpl.templateKey) as Prisma.InputJsonValue,
          enabled: true,
          cooldownSec: 60,
        },
        update: {
          definition: templateDefinition(tpl.templateKey) as Prisma.InputJsonValue,
        },
      });
      await this.appendAuditOutbox({
        tx,
        actor,
        entityType: 'Rule',
        entityId: rule.id,
        action: 'rule.ensure_template',
        afterJson: rule,
        correlationId,
        outboxType: 'rule.created',
        payload: rule,
      });
    }
  }

  async ensureProjectDefaultsInTx(
    tx: Prisma.TransactionClient,
    projectId: string,
    actor: string,
    correlationId: string,
  ) {
    const defaultSection = await tx.section.findFirst({ where: { projectId, isDefault: true } });
    if (!defaultSection) {
      const section = await tx.section.create({
        data: { projectId, name: 'No Section', isDefault: true, position: 1000 },
      });
      await this.appendAuditOutbox({
        tx,
        actor,
        entityType: 'Section',
        entityId: section.id,
        action: 'section.created.default',
        afterJson: section,
        correlationId,
        outboxType: 'section.created',
        payload: section,
      });
    }

    const templates = [
      { name: 'Progress to Done', templateKey: 'progress_to_done' },
      { name: 'Progress to In Progress', templateKey: 'progress_to_in_progress' },
    ] as const;
    for (const tpl of templates) {
      const existing = await tx.rule.findUnique({
        where: { projectId_templateKey: { projectId, templateKey: tpl.templateKey } },
      });
      if (existing) {
        if (!existing.definition) {
          await tx.rule.update({
            where: { id: existing.id },
            data: { definition: templateDefinition(tpl.templateKey) as Prisma.InputJsonValue },
          });
        }
        continue;
      }
      const rule = await tx.rule.create({
        data: {
          projectId,
          name: tpl.name,
          templateKey: tpl.templateKey,
          definition: templateDefinition(tpl.templateKey) as Prisma.InputJsonValue,
          enabled: true,
          cooldownSec: 60,
        },
      });
      await this.appendAuditOutbox({
        tx,
        actor,
        entityType: 'Rule',
        entityId: rule.id,
        action: 'rule.ensure_template',
        afterJson: rule,
        correlationId,
        outboxType: 'rule.created',
        payload: rule,
      });
    }
  }

  ensureProgressRange(progressPercent?: number) {
    if (progressPercent === undefined) return;
    if (!Number.isInteger(progressPercent) || progressPercent < 0 || progressPercent > 100) {
      throw new ConflictException('progressPercent must be int 0..100');
    }
  }

  deriveTaskProgressAutomation(progress: number, currentStatus: TaskStatus, completedAt: Date | null, now: Date = new Date()) {
    const result = applyTaskProgressAutomation({
      status: this.toDomainTaskStatus(currentStatus),
      progressPercent: progress,
      completedAt,
      now,
    });
    return {
      status: this.fromDomainTaskStatus(result.status),
      completedAt: result.completedAt,
    };
  }

  deriveNormalizedTaskProgress(input: {
    taskType: TaskType;
    progress: number;
    status: TaskStatus;
    hasStatusOverride: boolean;
    hasProgressOverride: boolean;
  }) {
    return normalizeTaskProgressForType({
      taskType: this.toDomainTaskType(input.taskType),
      progressPercent: input.progress,
      status: this.toDomainTaskStatus(input.status),
      hasStatusOverride: input.hasStatusOverride,
      hasProgressOverride: input.hasProgressOverride,
    });
  }

  deriveTaskCompletionTransition(input: {
    taskType: TaskType;
    done: boolean;
    completedAt: Date | null;
    now?: Date;
  }) {
    const result = deriveTaskCompletionTransitionInDomain({
      taskType: this.toDomainTaskType(input.taskType),
      done: input.done,
      completedAt: input.completedAt,
      now: input.now,
    });
    return {
      status: this.fromDomainTaskStatus(result.status),
      progressPercent: result.progressPercent,
      completedAt: result.completedAt,
      action: result.action,
    };
  }

  private toDomainTaskStatus(status: TaskStatus): DomainTaskStatus {
    switch (status) {
      case TaskStatus.TODO:
        return 'TODO';
      case TaskStatus.IN_PROGRESS:
        return 'IN_PROGRESS';
      case TaskStatus.DONE:
        return 'DONE';
      case TaskStatus.BLOCKED:
        return 'BLOCKED';
      default:
        return this.unhandledStatus(status as never, 'prisma->domain');
    }
  }

  private fromDomainTaskStatus(status: DomainTaskStatus): TaskStatus {
    switch (status) {
      case 'TODO':
        return TaskStatus.TODO;
      case 'IN_PROGRESS':
        return TaskStatus.IN_PROGRESS;
      case 'DONE':
        return TaskStatus.DONE;
      case 'BLOCKED':
        return TaskStatus.BLOCKED;
      default:
        return this.unhandledStatus(status as never, 'domain->prisma');
    }
  }

  private toDomainTaskType(taskType: TaskType): DomainTaskType {
    switch (taskType) {
      case TaskType.TASK:
        return 'TASK';
      case TaskType.MILESTONE:
        return 'MILESTONE';
      case TaskType.APPROVAL:
        return 'APPROVAL';
      default:
        return this.unhandledStatus(taskType as never, 'prisma-task-type->domain');
    }
  }

  private unhandledStatus(value: never, direction: string): never {
    throw new Error(`Unhandled task status mapping (${direction}): ${String(value)}`);
  }
}
