import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DomainService } from '../common/domain.service';
import { Prisma } from '@prisma/client';

export const NOTIFICATION_TYPE_MENTION = 'mention';
export const NOTIFICATION_TYPE_ASSIGNMENT = 'assignment';
export const NOTIFICATION_TYPE_DUE_DATE = 'due_date';
export const NOTIFICATION_TYPE_STATUS = 'status';
export const NOTIFICATION_TYPE_COMMENT = 'comment';

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
  ) {}

  async upsertMentionNotification(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      projectId: string;
      taskId: string;
      sourceType: string;
      sourceId?: string;
      triggeredByUserId?: string;
      actor: string;
      correlationId: string;
    },
  ) {
    const sourceId = input.sourceId ?? '';
    const existing = await tx.inboxNotification.findUnique({
      where: {
        userId_taskId_type_sourceType_sourceId: {
          userId: input.userId,
          taskId: input.taskId,
          type: NOTIFICATION_TYPE_MENTION,
          sourceType: input.sourceType,
          sourceId,
        },
      },
    });

    if (!existing) {
      const created = await tx.inboxNotification.create({
        data: {
          userId: input.userId,
          projectId: input.projectId,
          taskId: input.taskId,
          type: NOTIFICATION_TYPE_MENTION,
          sourceType: input.sourceType,
          sourceId,
          triggeredByUserId: input.triggeredByUserId,
          readAt: null,
        },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: input.actor,
        entityType: 'InboxNotification',
        entityId: created.id,
        action: 'notification.created',
        afterJson: created,
        correlationId: input.correlationId,
        outboxType: 'notification.created',
        payload: {
          notificationId: created.id,
          type: created.type,
          userId: created.userId,
          projectId: created.projectId,
          taskId: created.taskId,
          sourceType: created.sourceType,
          sourceId: created.sourceId,
        },
      });
      return created;
    }

    if (!existing.readAt && existing.triggeredByUserId === input.triggeredByUserId) {
      return existing;
    }

    const updated = await tx.inboxNotification.update({
      where: { id: existing.id },
      data: {
        readAt: null,
        triggeredByUserId: input.triggeredByUserId,
      },
    });
    await this.domain.appendAuditOutbox({
      tx,
      actor: input.actor,
      entityType: 'InboxNotification',
      entityId: updated.id,
      action: 'notification.reopened',
      beforeJson: existing,
      afterJson: updated,
      correlationId: input.correlationId,
      outboxType: 'notification.reopened',
      payload: {
        notificationId: updated.id,
        type: updated.type,
        userId: updated.userId,
        projectId: updated.projectId,
        taskId: updated.taskId,
        sourceType: updated.sourceType,
        sourceId: updated.sourceId,
      },
    });
    return updated;
  }

  async createTaskAssignmentNotification(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      projectId: string;
      taskId: string;
      triggeredByUserId?: string;
      actor: string;
      correlationId: string;
    },
  ) {
    const existing = await tx.inboxNotification.findUnique({
      where: {
        userId_taskId_type_sourceType_sourceId: {
          userId: input.userId,
          taskId: input.taskId,
          type: NOTIFICATION_TYPE_ASSIGNMENT,
          sourceType: 'task',
          sourceId: input.taskId,
        },
      },
    });

    if (!existing) {
      const created = await tx.inboxNotification.create({
        data: {
          userId: input.userId,
          projectId: input.projectId,
          taskId: input.taskId,
          type: NOTIFICATION_TYPE_ASSIGNMENT,
          sourceType: 'task',
          sourceId: input.taskId,
          triggeredByUserId: input.triggeredByUserId,
          readAt: null,
        },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: input.actor,
        entityType: 'InboxNotification',
        entityId: created.id,
        action: 'notification.created',
        afterJson: created,
        correlationId: input.correlationId,
        outboxType: 'notification.created',
        payload: {
          notificationId: created.id,
          type: created.type,
          userId: created.userId,
          projectId: created.projectId,
          taskId: created.taskId,
          sourceType: created.sourceType,
          sourceId: created.sourceId,
        },
      });
      return created;
    }

    if (!existing.readAt && existing.triggeredByUserId === input.triggeredByUserId) {
      return existing;
    }

    const updated = await tx.inboxNotification.update({
      where: { id: existing.id },
      data: {
        readAt: null,
        triggeredByUserId: input.triggeredByUserId,
      },
    });
    await this.domain.appendAuditOutbox({
      tx,
      actor: input.actor,
      entityType: 'InboxNotification',
      entityId: updated.id,
      action: 'notification.reopened',
      beforeJson: existing,
      afterJson: updated,
      correlationId: input.correlationId,
      outboxType: 'notification.reopened',
      payload: {
        notificationId: updated.id,
        type: updated.type,
        userId: updated.userId,
        projectId: updated.projectId,
        taskId: updated.taskId,
        sourceType: updated.sourceType,
        sourceId: updated.sourceId,
      },
    });
    return updated;
  }

  async createDueDateNotification(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      projectId: string;
      taskId: string;
      triggeredByUserId?: string;
      actor: string;
      correlationId: string;
    },
  ) {
    const sourceId = `${input.taskId}_due`;
    const existing = await tx.inboxNotification.findUnique({
      where: {
        userId_taskId_type_sourceType_sourceId: {
          userId: input.userId,
          taskId: input.taskId,
          type: NOTIFICATION_TYPE_DUE_DATE,
          sourceType: 'task',
          sourceId,
        },
      },
    });

    if (!existing) {
      const created = await tx.inboxNotification.create({
        data: {
          userId: input.userId,
          projectId: input.projectId,
          taskId: input.taskId,
          type: NOTIFICATION_TYPE_DUE_DATE,
          sourceType: 'task',
          sourceId,
          triggeredByUserId: input.triggeredByUserId,
          readAt: null,
        },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: input.actor,
        entityType: 'InboxNotification',
        entityId: created.id,
        action: 'notification.created',
        afterJson: created,
        correlationId: input.correlationId,
        outboxType: 'notification.created',
        payload: {
          notificationId: created.id,
          type: created.type,
          userId: created.userId,
          projectId: created.projectId,
          taskId: created.taskId,
          sourceType: created.sourceType,
          sourceId: created.sourceId,
        },
      });
      return created;
    }

    if (!existing.readAt && existing.triggeredByUserId === input.triggeredByUserId) {
      return existing;
    }

    const updated = await tx.inboxNotification.update({
      where: { id: existing.id },
      data: {
        readAt: null,
        triggeredByUserId: input.triggeredByUserId,
      },
    });
    await this.domain.appendAuditOutbox({
      tx,
      actor: input.actor,
      entityType: 'InboxNotification',
      entityId: updated.id,
      action: 'notification.reopened',
      beforeJson: existing,
      afterJson: updated,
      correlationId: input.correlationId,
      outboxType: 'notification.reopened',
      payload: {
        notificationId: updated.id,
        type: updated.type,
        userId: updated.userId,
        projectId: updated.projectId,
        taskId: updated.taskId,
        sourceType: updated.sourceType,
        sourceId: updated.sourceId,
      },
    });
    return updated;
  }

  async createStatusChangeNotification(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      projectId: string;
      taskId: string;
      triggeredByUserId?: string;
      actor: string;
      correlationId: string;
    },
  ) {
    const existing = await tx.inboxNotification.findUnique({
      where: {
        userId_taskId_type_sourceType_sourceId: {
          userId: input.userId,
          taskId: input.taskId,
          type: NOTIFICATION_TYPE_STATUS,
          sourceType: 'task',
          sourceId: input.taskId,
        },
      },
    });

    if (!existing) {
      const created = await tx.inboxNotification.create({
        data: {
          userId: input.userId,
          projectId: input.projectId,
          taskId: input.taskId,
          type: NOTIFICATION_TYPE_STATUS,
          sourceType: 'task',
          sourceId: input.taskId,
          triggeredByUserId: input.triggeredByUserId,
          readAt: null,
        },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: input.actor,
        entityType: 'InboxNotification',
        entityId: created.id,
        action: 'notification.created',
        afterJson: created,
        correlationId: input.correlationId,
        outboxType: 'notification.created',
        payload: {
          notificationId: created.id,
          type: created.type,
          userId: created.userId,
          projectId: created.projectId,
          taskId: created.taskId,
          sourceType: created.sourceType,
          sourceId: created.sourceId,
        },
      });
      return created;
    }

    if (!existing.readAt && existing.triggeredByUserId === input.triggeredByUserId) {
      return existing;
    }

    const updated = await tx.inboxNotification.update({
      where: { id: existing.id },
      data: {
        readAt: null,
        triggeredByUserId: input.triggeredByUserId,
      },
    });
    await this.domain.appendAuditOutbox({
      tx,
      actor: input.actor,
      entityType: 'InboxNotification',
      entityId: updated.id,
      action: 'notification.reopened',
      beforeJson: existing,
      afterJson: updated,
      correlationId: input.correlationId,
      outboxType: 'notification.reopened',
      payload: {
        notificationId: updated.id,
        type: updated.type,
        userId: updated.userId,
        projectId: updated.projectId,
        taskId: updated.taskId,
        sourceType: updated.sourceType,
        sourceId: updated.sourceId,
      },
    });
    return updated;
  }

  async createCommentNotification(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      projectId: string;
      taskId: string;
      commentId: string;
      triggeredByUserId?: string;
      actor: string;
      correlationId: string;
    },
  ) {
    const existing = await tx.inboxNotification.findUnique({
      where: {
        userId_taskId_type_sourceType_sourceId: {
          userId: input.userId,
          taskId: input.taskId,
          type: NOTIFICATION_TYPE_COMMENT,
          sourceType: 'comment',
          sourceId: input.commentId,
        },
      },
    });

    if (!existing) {
      const created = await tx.inboxNotification.create({
        data: {
          userId: input.userId,
          projectId: input.projectId,
          taskId: input.taskId,
          type: NOTIFICATION_TYPE_COMMENT,
          sourceType: 'comment',
          sourceId: input.commentId,
          triggeredByUserId: input.triggeredByUserId,
          readAt: null,
        },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: input.actor,
        entityType: 'InboxNotification',
        entityId: created.id,
        action: 'notification.created',
        afterJson: created,
        correlationId: input.correlationId,
        outboxType: 'notification.created',
        payload: {
          notificationId: created.id,
          type: created.type,
          userId: created.userId,
          projectId: created.projectId,
          taskId: created.taskId,
          sourceType: created.sourceType,
          sourceId: created.sourceId,
        },
      });
      return created;
    }

    if (!existing.readAt && existing.triggeredByUserId === input.triggeredByUserId) {
      return existing;
    }

    const updated = await tx.inboxNotification.update({
      where: { id: existing.id },
      data: {
        readAt: null,
        triggeredByUserId: input.triggeredByUserId,
      },
    });
    await this.domain.appendAuditOutbox({
      tx,
      actor: input.actor,
      entityType: 'InboxNotification',
      entityId: updated.id,
      action: 'notification.reopened',
      beforeJson: existing,
      afterJson: updated,
      correlationId: input.correlationId,
      outboxType: 'notification.reopened',
      payload: {
        notificationId: updated.id,
        type: updated.type,
        userId: updated.userId,
        projectId: updated.projectId,
        taskId: updated.taskId,
        sourceType: updated.sourceType,
        sourceId: updated.sourceId,
      },
    });
    return updated;
  }

  async listForUser(input: {
    userId: string;
    status: 'all' | 'unread';
    take: number;
  }) {
    return this.prisma.inboxNotification.findMany({
      where: {
        userId: input.userId,
        ...(input.status === 'unread' ? { readAt: null } : {}),
        project: {
          memberships: {
            some: { userId: input.userId },
          },
        },
      },
      include: {
        project: { select: { id: true, name: true } },
        task: { select: { id: true, title: true, deletedAt: true } },
        triggeredBy: { select: { id: true, displayName: true, email: true } },
      },
      orderBy: [{ readAt: 'asc' }, { createdAt: 'desc' }],
      take: input.take,
    });
  }

  async unreadCountForUser(userId: string) {
    return this.prisma.inboxNotification.count({
      where: {
        userId,
        readAt: null,
        project: {
          memberships: {
            some: { userId },
          },
        },
      },
    });
  }
}
