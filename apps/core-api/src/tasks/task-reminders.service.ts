import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { ProjectRole } from '@prisma/client';
import { DomainService } from '../common/domain.service';
import type { AppRequest } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TaskRemindersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
  ) {}

  async getMyReminder(taskId: string, req: AppRequest) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id: taskId, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.VIEWER);
    const reminder = await this.prisma.taskReminder.findFirst({
      where: { taskId, userId: req.user.sub, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return reminder ?? null;
  }

  async upsertMyReminder(taskId: string, remindAtRaw: string, req: AppRequest) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id: taskId, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);
    const remindAt = new Date(remindAtRaw);
    if (Number.isNaN(+remindAt)) throw new ConflictException('Invalid remindAt');

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.taskReminder.findFirst({
        where: { taskId, userId: req.user.sub, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      const reminder = current
        ? await tx.taskReminder.update({
            where: { id: current.id },
            data: { remindAt, deletedAt: null },
          })
        : await tx.taskReminder.create({
            data: { taskId, userId: req.user.sub, remindAt },
          });

      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: taskId,
        action: 'task.reminder.set',
        beforeJson: current,
        afterJson: reminder,
        correlationId: req.correlationId,
        outboxType: 'task.reminder.set',
        payload: { taskId, userId: req.user.sub, remindAt: reminder.remindAt },
      });
      return reminder;
    });
  }

  async clearMyReminder(taskId: string, req: AppRequest) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id: taskId, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);
    const current = await this.prisma.taskReminder.findFirst({
      where: { taskId, userId: req.user.sub, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!current) return { ok: true };

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.taskReminder.update({
        where: { id: current.id },
        data: { deletedAt: new Date() },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: taskId,
        action: 'task.reminder.cleared',
        beforeJson: current,
        afterJson: deleted,
        correlationId: req.correlationId,
        outboxType: 'task.reminder.cleared',
        payload: { taskId, userId: req.user.sub },
      });
      return deleted;
    });
  }
}
