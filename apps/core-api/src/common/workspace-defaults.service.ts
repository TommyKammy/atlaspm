import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { Prisma, WorkspaceRole } from '@prisma/client';
import { templateDefinition } from '../rules/rule-definition';
import { PrismaService } from '../prisma/prisma.service';
import { AuditOutboxService } from './audit-outbox.service';

@Injectable()
export class WorkspaceDefaultsService {
  private static readonly serializableRetryDelaysMs = [10, 25, 50, 100, 200, 400];

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditOutboxService) private readonly auditOutbox: AuditOutboxService,
  ) {}

  private static isRetryableTransactionConflict(error: unknown) {
    const maybePrismaError = error as { code?: string; message?: string };
    return (
      maybePrismaError.code === 'P2034' ||
      maybePrismaError.message?.includes('write conflict') ||
      maybePrismaError.message?.includes('deadlock') ||
      maybePrismaError.message?.includes('serialization')
    );
  }

  async ensureDefaultWorkspaceForUser(sub: string) {
    for (let attempt = 0; attempt < WorkspaceDefaultsService.serializableRetryDelaysMs.length; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
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
          },
          {
            maxWait: 5000,
            timeout: 10000,
            isolationLevel: 'Serializable',
          },
        );
      } catch (error) {
        if (
          !WorkspaceDefaultsService.isRetryableTransactionConflict(error) ||
          attempt === WorkspaceDefaultsService.serializableRetryDelaysMs.length - 1
        ) {
          const membership = await this.prisma.workspaceMembership.findFirst({
            where: { userId: sub },
            include: { workspace: true },
          });
          if (membership) {
            return membership.workspace;
          }
          throw error;
        }

        const membership = await this.prisma.workspaceMembership.findFirst({
          where: { userId: sub },
          include: { workspace: true },
        });
        if (membership) {
          return membership.workspace;
        }

        const delayMs = WorkspaceDefaultsService.serializableRetryDelaysMs[attempt];
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw new ConflictException('Failed to ensure default workspace');
  }

  async ensureProjectDefaults(projectId: string, actor: string, correlationId: string) {
    for (let attempt = 0; attempt < WorkspaceDefaultsService.serializableRetryDelaysMs.length; attempt += 1) {
      try {
        await this.prisma.$transaction(
          async (tx) => {
            await this.ensureProjectDefaultsInTx(tx, projectId, actor, correlationId);
          },
          {
            maxWait: 5000,
            timeout: 10000,
            isolationLevel: 'Serializable',
          },
        );
        return;
      } catch (error) {
        if (
          !WorkspaceDefaultsService.isRetryableTransactionConflict(error) ||
          attempt === WorkspaceDefaultsService.serializableRetryDelaysMs.length - 1
        ) {
          throw error;
        }

        const delayMs = WorkspaceDefaultsService.serializableRetryDelaysMs[attempt];
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
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
      await this.auditOutbox.appendAuditOutbox({
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
      const definition = templateDefinition(tpl.templateKey) as Prisma.InputJsonValue;
      const existing = await tx.rule.findUnique({
        where: { projectId_templateKey: { projectId, templateKey: tpl.templateKey } },
      });
      if (existing) {
        if (JSON.stringify(existing.definition) !== JSON.stringify(definition)) {
          const rule = await tx.rule.update({
            where: { id: existing.id },
            data: { definition },
          });
          await this.auditOutbox.appendAuditOutbox({
            tx,
            actor,
            entityType: 'Rule',
            entityId: rule.id,
            action: 'rule.ensure_template',
            beforeJson: existing,
            afterJson: rule,
            correlationId,
            outboxType: 'rule.updated',
            payload: rule,
          });
        }
        continue;
      }
      const rule = await tx.rule.create({
        data: {
          projectId,
          name: tpl.name,
          templateKey: tpl.templateKey,
          definition,
          enabled: true,
          cooldownSec: 60,
        },
      });
      await this.auditOutbox.appendAuditOutbox({
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
}
