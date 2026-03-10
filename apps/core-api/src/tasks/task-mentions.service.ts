import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DomainService } from '../common/domain.service';
import type { AppRequest } from '../common/types';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class TaskMentionsService {
  constructor(
    @Inject(DomainService) private readonly domain: DomainService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  extractMentionUserIdsFromComment(body: string) {
    const ids = new Set<string>();
    const regex = /@\[(?<id>[a-zA-Z0-9:_-]+)\|[^\]]+\]/g;
    let match = regex.exec(body);
    while (match) {
      const id = match.groups?.id?.trim();
      if (id) ids.add(id);
      match = regex.exec(body);
    }
    return [...ids];
  }

  extractMentionUserIdsFromDoc(node: unknown): string[] {
    const ids = new Set<string>();
    const walk = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        for (const item of value) walk(item);
        return;
      }
      const item = value as Record<string, unknown>;
      if (item.type === 'mention' && item.attrs && typeof item.attrs === 'object') {
        const mentionId = (item.attrs as Record<string, unknown>).id;
        if (typeof mentionId === 'string' && mentionId.trim()) ids.add(mentionId.trim());
      }
      if (Array.isArray(item.marks)) {
        for (const mark of item.marks) {
          if (
            mark &&
            typeof mark === 'object' &&
            (mark as Record<string, unknown>).type === 'mention' &&
            (mark as Record<string, unknown>).attrs &&
            typeof (mark as Record<string, unknown>).attrs === 'object'
          ) {
            const mentionId = ((mark as Record<string, unknown>).attrs as Record<string, unknown>).id;
            if (typeof mentionId === 'string' && mentionId.trim()) ids.add(mentionId.trim());
          }
        }
      }
      walk(item.content);
    };
    walk(node);
    return [...ids];
  }

  async syncTaskMentions(
    tx: Prisma.TransactionClient,
    input: { taskId: string; sourceType: 'description' | 'comment'; sourceId: string; mentionedUserIds: string[] },
    req: AppRequest,
  ) {
    const sourceId = input.sourceId ?? '';
    const task = await tx.task.findUniqueOrThrow({ where: { id: input.taskId }, select: { projectId: true } });
    const uniqueIncoming = [...new Set(input.mentionedUserIds)].filter(Boolean);
    const validUsers = uniqueIncoming.length
      ? await tx.projectMembership.findMany({
          where: {
            projectId: task.projectId,
            userId: { in: uniqueIncoming },
          },
          select: { userId: true },
        })
      : [];
    const validUserIds = new Set(validUsers.map((item) => item.userId));
    const finalUserIds = uniqueIncoming.filter((id) => validUserIds.has(id));

    const existing = await tx.taskMention.findMany({
      where: { taskId: input.taskId, sourceType: input.sourceType, sourceId },
    });
    const existingSet = new Set(existing.map((item) => item.mentionedUserId));
    const toCreate = finalUserIds.filter((id) => !existingSet.has(id));
    const toDelete = existing.filter((item) => !finalUserIds.includes(item.mentionedUserId));

    for (const userId of toCreate) {
      const created = await tx.taskMention.create({
        data: { taskId: input.taskId, mentionedUserId: userId, sourceType: input.sourceType, sourceId },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: input.taskId,
        action: 'task.mention.created',
        afterJson: created,
        correlationId: req.correlationId,
        outboxType: 'task.mention.created',
        payload: {
          taskId: input.taskId,
          mentionedUserId: userId,
          sourceType: input.sourceType,
          sourceId,
        },
      });
      await this.notifications.upsertMentionNotification(tx, {
        userId,
        projectId: task.projectId,
        taskId: input.taskId,
        sourceType: input.sourceType,
        sourceId,
        triggeredByUserId: req.user.sub,
        actor: req.user.sub,
        correlationId: req.correlationId,
      });
    }

    for (const mention of toDelete) {
      await tx.taskMention.delete({ where: { id: mention.id } });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: input.taskId,
        action: 'task.mention.deleted',
        beforeJson: mention,
        correlationId: req.correlationId,
        outboxType: 'task.mention.deleted',
        payload: {
          taskId: input.taskId,
          mentionedUserId: mention.mentionedUserId,
          sourceType: input.sourceType,
          sourceId,
        },
      });
    }
  }
}
