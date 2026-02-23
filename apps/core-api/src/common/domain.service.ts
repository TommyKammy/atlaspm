import { Injectable, ForbiddenException, NotFoundException, ConflictException, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, ProjectRole, TaskStatus } from '@prisma/client';

@Injectable()
export class DomainService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async ensureUser(sub: string, email?: string, name?: string) {
    return this.prisma.user.upsert({
      where: { id: sub },
      create: { id: sub, email, displayName: name },
      update: { email, displayName: name },
    });
  }

  async ensureDefaultWorkspaceForUser(sub: string) {
    let membership = await this.prisma.workspaceMembership.findFirst({ where: { userId: sub } });
    if (!membership) {
      const ws = await this.prisma.workspace.create({ data: { name: 'Default Workspace' } });
      membership = await this.prisma.workspaceMembership.create({
        data: { workspaceId: ws.id, userId: sub },
      });
    }
    return this.prisma.workspace.findUniqueOrThrow({ where: { id: membership.workspaceId } });
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
    ];
    for (const tpl of templates) {
      const rule = await tx.rule.upsert({
        where: { projectId_templateKey: { projectId, templateKey: tpl.templateKey } },
        create: { projectId, name: tpl.name, templateKey: tpl.templateKey, enabled: true, cooldownSec: 60 },
        update: {},
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
    ];
    for (const tpl of templates) {
      const existing = await tx.rule.findUnique({
        where: { projectId_templateKey: { projectId, templateKey: tpl.templateKey } },
      });
      if (existing) continue;
      const rule = await tx.rule.create({
        data: { projectId, name: tpl.name, templateKey: tpl.templateKey, enabled: true, cooldownSec: 60 },
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

  deriveStatusForProgress(progress: number, currentStatus: TaskStatus) {
    if (progress === 100) return TaskStatus.DONE;
    if (progress >= 0 && progress < 100) return TaskStatus.IN_PROGRESS;
    return currentStatus;
  }
}
