import { Inject, Injectable } from '@nestjs/common';
import { Prisma, ProjectRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DomainService } from '../common/domain.service';
import {
  InboxNotificationType,
  NOTIFICATION_TYPE_APPROVAL_APPROVED,
  NOTIFICATION_TYPE_APPROVAL_REJECTED,
  NOTIFICATION_TYPE_APPROVAL_REQUESTED,
  NOTIFICATION_TYPE_ASSIGNMENT,
  NOTIFICATION_TYPE_COMMENT,
  NOTIFICATION_TYPE_DUE_DATE,
  NOTIFICATION_TYPE_MENTION,
  NOTIFICATION_TYPE_STATUS,
  normalizeInboxNotificationType,
} from './notification-taxonomy';

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
  ) {}

  private async upsertNotification(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      projectId: string;
      taskId?: string | null;
      statusUpdateId?: string | null;
      type: InboxNotificationType;
      sourceType: string;
      sourceId?: string;
      triggeredByUserId?: string;
      actor: string;
      correlationId: string;
    },
  ) {
    const sourceId =
      input.sourceId !== undefined && input.sourceId !== ''
        ? input.sourceId
        : input.sourceType === 'description' && input.taskId
          ? input.taskId
          : '';
    const existing = await tx.inboxNotification.findUnique({
      where: {
        userId_projectId_type_sourceType_sourceId: {
          userId: input.userId,
          projectId: input.projectId,
          type: input.type,
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
          taskId: input.taskId ?? null,
          statusUpdateId: input.statusUpdateId ?? null,
          type: input.type,
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
          statusUpdateId: created.statusUpdateId,
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
        statusUpdateId: updated.statusUpdateId,
        sourceType: updated.sourceType,
        sourceId: updated.sourceId,
      },
    });
    return updated;
  }

  async upsertMentionNotification(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      projectId: string;
      taskId?: string | null;
      statusUpdateId?: string | null;
      sourceType: string;
      sourceId?: string;
      triggeredByUserId?: string;
      actor: string;
      correlationId: string;
    },
  ) {
    return this.upsertNotification(tx, {
      userId: input.userId,
      projectId: input.projectId,
      taskId: input.taskId,
      statusUpdateId: input.statusUpdateId,
      type: NOTIFICATION_TYPE_MENTION,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      triggeredByUserId: input.triggeredByUserId,
      actor: input.actor,
      correlationId: input.correlationId,
    });
  }

  private async listAccessibleProjectIds(userId: string) {
    const memberships = await this.prisma.projectMembership.findMany({
      where: { userId },
      select: { projectId: true },
    });

    return memberships.map((membership) => membership.projectId);
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
    return this.upsertNotification(tx, {
      userId: input.userId,
      projectId: input.projectId,
      taskId: input.taskId,
      type: NOTIFICATION_TYPE_ASSIGNMENT,
      sourceType: 'task',
      sourceId: input.taskId,
      triggeredByUserId: input.triggeredByUserId,
      actor: input.actor,
      correlationId: input.correlationId,
    });
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
    return this.upsertNotification(tx, {
      userId: input.userId,
      projectId: input.projectId,
      taskId: input.taskId,
      type: NOTIFICATION_TYPE_DUE_DATE,
      sourceType: 'task',
      sourceId: `${input.taskId}_due`,
      triggeredByUserId: input.triggeredByUserId,
      actor: input.actor,
      correlationId: input.correlationId,
    });
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
    return this.upsertNotification(tx, {
      userId: input.userId,
      projectId: input.projectId,
      taskId: input.taskId,
      type: NOTIFICATION_TYPE_STATUS,
      sourceType: 'task',
      sourceId: input.taskId,
      triggeredByUserId: input.triggeredByUserId,
      actor: input.actor,
      correlationId: input.correlationId,
    });
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
    return this.upsertNotification(tx, {
      userId: input.userId,
      projectId: input.projectId,
      taskId: input.taskId,
      type: NOTIFICATION_TYPE_COMMENT,
      sourceType: 'comment',
      sourceId: input.commentId,
      triggeredByUserId: input.triggeredByUserId,
      actor: input.actor,
      correlationId: input.correlationId,
    });
  }

  async createApprovalRequestedNotification(
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
    return this.upsertNotification(tx, {
      userId: input.userId,
      projectId: input.projectId,
      taskId: input.taskId,
      type: NOTIFICATION_TYPE_APPROVAL_REQUESTED,
      sourceType: 'task',
      sourceId: input.taskId,
      triggeredByUserId: input.triggeredByUserId,
      actor: input.actor,
      correlationId: input.correlationId,
    });
  }

  async createApprovalResponseNotification(
    tx: Prisma.TransactionClient,
    input: {
      userId: string;
      projectId: string;
      taskId: string;
      status: 'APPROVED' | 'REJECTED';
      triggeredByUserId?: string;
      actor: string;
      correlationId: string;
    },
  ) {
    return this.upsertNotification(tx, {
      userId: input.userId,
      projectId: input.projectId,
      taskId: input.taskId,
      type:
        input.status === 'APPROVED'
          ? NOTIFICATION_TYPE_APPROVAL_APPROVED
          : NOTIFICATION_TYPE_APPROVAL_REJECTED,
      sourceType: 'task',
      sourceId: input.taskId,
      triggeredByUserId: input.triggeredByUserId,
      actor: input.actor,
      correlationId: input.correlationId,
    });
  }

  async listForUser(input: {
    userId: string;
    status: 'all' | 'unread';
    take: number;
  }) {
    const accessibleProjectIds = await this.listAccessibleProjectIds(input.userId);
    if (!accessibleProjectIds.length) {
      return [];
    }

    const notifications = await this.prisma.inboxNotification.findMany({
      where: {
        userId: input.userId,
        projectId: { in: accessibleProjectIds },
        ...(input.status === 'unread' ? { readAt: null } : {}),
      },
      include: {
        project: { select: { id: true, name: true } },
        task: { select: { id: true, title: true, deletedAt: true } },
        statusUpdate: { select: { id: true, summary: true, health: true, createdAt: true } },
        triggeredBy: { select: { id: true, displayName: true, email: true } },
      },
      orderBy:
        input.status === 'unread'
          ? [{ createdAt: 'desc' }]
          : [{ readAt: 'asc' }, { createdAt: 'desc' }],
      take: input.take,
    });
    return notifications.map((notification) => ({
      ...notification,
      type: normalizeInboxNotificationType(notification.type),
    }));
  }

  async unreadCountForUser(userId: string) {
    const accessibleProjectIds = await this.listAccessibleProjectIds(userId);
    if (!accessibleProjectIds.length) {
      return 0;
    }

    return this.prisma.inboxNotification.count({
      where: {
        userId,
        projectId: { in: accessibleProjectIds },
        readAt: null,
      },
    });
  }

  async listDeliveryFailuresForUser(input: {
    userId: string;
    take: number;
  }) {
    const adminMemberships = await this.prisma.projectMembership.findMany({
      where: {
        userId: input.userId,
        role: ProjectRole.ADMIN,
      },
      select: {
        project: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    if (!adminMemberships.length) {
      return [];
    }

    const projectMap = new Map(adminMemberships.map((membership) => [membership.project.id, membership.project]));
    const pageSize = Math.max(input.take * 4, 100);
    const maxScanned = Math.max(pageSize * 10, 1_000);
    const results: Array<{
      eventId: string;
      type: string;
      project: { id: string; name: string };
      status: 'dead_lettered' | 'retrying';
      deliveryAttempts: number;
      nextRetryAt: Date | null;
      deadLetteredAt: Date | null;
      lastError: string | null;
      createdAt: Date;
      correlationId: string;
      retryable: boolean;
    }> = [];

    for (let skip = 0; results.length < input.take && skip < maxScanned; skip += pageSize) {
      const candidateEvents = await this.prisma.outboxEvent.findMany({
        where: {
          deliveredAt: null,
          deliveryAttempts: { gt: 0 },
        },
        orderBy: [
          { deadLetteredAt: { sort: 'desc', nulls: 'last' } },
          { nextRetryAt: 'asc' },
          { createdAt: 'desc' },
        ],
        take: pageSize,
        skip,
      });
      if (!candidateEvents.length) {
        break;
      }

      const mappedEvents = await this.mapDeliveryFailureEvents(candidateEvents, projectMap);
      results.push(...mappedEvents);

      if (candidateEvents.length < pageSize) {
        break;
      }
    }

    return results.slice(0, input.take);
  }

  private async mapDeliveryFailureEvents(
    events: Array<{
      id: string;
      type: string;
      payload: Prisma.JsonValue;
      deliveryAttempts: number;
      nextRetryAt: Date | null;
      deadLetteredAt: Date | null;
      lastError: string | null;
      createdAt: Date;
      correlationId: string;
    }>,
    projectMap: Map<string, { id: string; name: string }>,
  ) {
    const taskIds = new Set<string>();
    const sectionIds = new Set<string>();
    for (const event of events) {
      for (const taskId of this.collectStringValues(event.payload, 'taskId')) {
        taskIds.add(taskId);
      }
      for (const sectionId of this.collectStringValues(event.payload, 'sectionId')) {
        sectionIds.add(sectionId);
      }
    }

    const [taskRows, sectionRows] = await Promise.all([
      taskIds.size
        ? this.prisma.task.findMany({
            where: { id: { in: [...taskIds] } },
            select: { id: true, projectId: true },
          })
        : Promise.resolve([]),
      sectionIds.size
        ? this.prisma.section.findMany({
            where: { id: { in: [...sectionIds] } },
            select: { id: true, projectId: true },
          })
        : Promise.resolve([]),
    ]);
    const taskProjectMap = new Map(taskRows.map((row) => [row.id, row.projectId]));
    const sectionProjectMap = new Map(sectionRows.map((row) => [row.id, row.projectId]));

    return events
      .map((event) => {
        const projectId = this.resolveProjectIdForEvent(event.payload, projectMap, taskProjectMap, sectionProjectMap);
        if (!projectId) {
          return null;
        }
        const project = projectMap.get(projectId);
        if (!project) {
          return null;
        }
        return {
          eventId: event.id,
          type: event.type,
          project,
          status: (event.deadLetteredAt ? 'dead_lettered' : 'retrying') as 'dead_lettered' | 'retrying',
          deliveryAttempts: event.deliveryAttempts,
          nextRetryAt: event.nextRetryAt,
          deadLetteredAt: event.deadLetteredAt,
          lastError: event.lastError,
          createdAt: event.createdAt,
          correlationId: event.correlationId,
          retryable: Boolean(event.deadLetteredAt),
        };
      })
      .filter((event): event is NonNullable<typeof event> => Boolean(event));
  }

  private resolveProjectIdForEvent(
    payload: unknown,
    adminProjects: Map<string, { id: string; name: string }>,
    taskProjectMap: Map<string, string>,
    sectionProjectMap: Map<string, string>,
  ) {
    for (const projectId of this.collectStringValues(payload, 'projectId')) {
      if (adminProjects.has(projectId)) {
        return projectId;
      }
    }

    for (const taskId of this.collectStringValues(payload, 'taskId')) {
      const projectId = taskProjectMap.get(taskId);
      if (projectId && adminProjects.has(projectId)) {
        return projectId;
      }
    }

    for (const sectionId of this.collectStringValues(payload, 'sectionId')) {
      const projectId = sectionProjectMap.get(sectionId);
      if (projectId && adminProjects.has(projectId)) {
        return projectId;
      }
    }

    return null;
  }

  private collectStringValues(value: unknown, key: string): string[] {
    const result = new Set<string>();
    const walk = (input: unknown) => {
      if (!input || typeof input !== 'object') return;
      if (Array.isArray(input)) {
        for (const item of input) {
          walk(item);
        }
        return;
      }
      const record = input as Record<string, unknown>;
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim()) {
        result.add(candidate);
      }
      for (const nested of Object.values(record)) {
        walk(nested);
      }
    };
    walk(value);
    return [...result];
  }
}
