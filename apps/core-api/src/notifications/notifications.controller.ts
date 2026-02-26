import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { DomainService } from '../common/domain.service';
import { NotificationsService } from './notifications.service';

class ListNotificationsQuery {
  @IsOptional()
  @IsIn(['all', 'unread'])
  status?: 'all' | 'unread';

  @IsOptional()
  @IsString()
  take?: string;
}

class MarkNotificationReadBody {
  @IsOptional()
  @IsBoolean()
  read?: boolean;
}

@Controller()
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  @Get('notifications')
  async listNotifications(@CurrentRequest() req: AppRequest, @Query() query: ListNotificationsQuery) {
    const status = query.status === 'unread' ? 'unread' : 'all';
    const parsedTake = Number(query.take ?? 50);
    const take = Number.isFinite(parsedTake) ? Math.max(1, Math.min(100, Math.trunc(parsedTake))) : 50;
    return this.notifications.listForUser({ userId: req.user.sub, status, take });
  }

  @Get('notifications/unread-count')
  async unreadCount(@CurrentRequest() req: AppRequest) {
    const count = await this.notifications.unreadCountForUser(req.user.sub);
    return { count };
  }

  @Post('notifications/read-all')
  async markAllRead(@CurrentRequest() req: AppRequest) {
    const unread = await this.prisma.inboxNotification.findMany({
      where: {
        userId: req.user.sub,
        readAt: null,
        project: { memberships: { some: { userId: req.user.sub } } },
      },
      select: { id: true, userId: true, projectId: true, taskId: true },
    });
    if (!unread.length) return { updatedCount: 0 };

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const ids = unread.map((item) => item.id);
      await tx.inboxNotification.updateMany({ where: { id: { in: ids } }, data: { readAt: now } });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'User',
        entityId: req.user.sub,
        action: 'notification.read_all',
        afterJson: { updatedCount: ids.length, notificationIds: ids },
        correlationId: req.correlationId,
        outboxType: 'notification.read_all',
        payload: { userId: req.user.sub, notificationIds: ids },
      });
    });

    return { updatedCount: unread.length };
  }

  @Post('notifications/:id/read')
  async markRead(
    @Param('id') notificationId: string,
    @Body() body: MarkNotificationReadBody,
    @CurrentRequest() req: AppRequest,
  ) {
    const read = body.read !== false;
    const existing = await this.prisma.inboxNotification.findFirstOrThrow({
      where: {
        id: notificationId,
        userId: req.user.sub,
        project: { memberships: { some: { userId: req.user.sub } } },
      },
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.inboxNotification.update({
        where: { id: existing.id },
        data: { readAt: read ? new Date() : null },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'InboxNotification',
        entityId: next.id,
        action: read ? 'notification.read' : 'notification.unread',
        beforeJson: existing,
        afterJson: next,
        correlationId: req.correlationId,
        outboxType: read ? 'notification.read' : 'notification.unread',
        payload: {
          notificationId: next.id,
          userId: next.userId,
          projectId: next.projectId,
          taskId: next.taskId,
          readAt: next.readAt,
        },
      });
      return next;
    });

    return {
      id: updated.id,
      readAt: updated.readAt,
      taskId: updated.taskId,
      projectId: updated.projectId,
      type: updated.type,
    };
  }
}
