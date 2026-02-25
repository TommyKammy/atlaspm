import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { DomainService } from '../common/domain.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReminderDeliveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReminderDeliveryService.name);
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
  ) {}

  onModuleInit() {
    if (process.env.REMINDER_WORKER_ENABLED === 'false') {
      this.logger.log('reminder worker disabled by env');
      return;
    }
    const intervalMs = this.getIntervalMs();
    this.timer = setInterval(() => {
      void this.runScheduledTick();
    }, intervalMs);
    this.timer.unref?.();
    void this.runScheduledTick();
    this.logger.log(`reminder worker started intervalMs=${intervalMs}`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async processDueReminders(now = new Date()) {
    const batchSize = this.getBatchSize();
    const dueReminders = await this.prisma.taskReminder.findMany({
      where: {
        deletedAt: null,
        sentAt: null,
        remindAt: { lte: now },
        task: { deletedAt: null },
        user: { status: UserStatus.ACTIVE },
      },
      include: {
        task: { select: { id: true, projectId: true, title: true } },
        user: { select: { id: true, email: true, displayName: true } },
      },
      orderBy: { remindAt: 'asc' },
      take: batchSize,
    });

    let processed = 0;
    for (const reminder of dueReminders) {
      const sentAt = new Date();
      const correlationId = `reminder-${reminder.id}-${sentAt.getTime()}`;
      const delivered = await this.prisma.$transaction(async (tx) => {
        const claim = await tx.taskReminder.updateMany({
          where: {
            id: reminder.id,
            deletedAt: null,
            sentAt: null,
            remindAt: { lte: now },
          },
          data: { sentAt },
        });
        if (!claim.count) return false;

        await this.domain.appendAuditOutbox({
          tx,
          actor: 'reminder-worker',
          entityType: 'Task',
          entityId: reminder.taskId,
          action: 'task.reminder.sent',
          beforeJson: { reminderId: reminder.id, remindAt: reminder.remindAt },
          afterJson: { reminderId: reminder.id, sentAt },
          correlationId,
          outboxType: 'task.reminder.sent',
          payload: {
            reminderId: reminder.id,
            taskId: reminder.taskId,
            projectId: reminder.task.projectId,
            remindAt: reminder.remindAt,
            sentAt,
            user: {
              id: reminder.user.id,
              email: reminder.user.email,
              displayName: reminder.user.displayName,
            },
          },
        });
        return true;
      });

      if (delivered) {
        processed += 1;
        this.logger.log(
          JSON.stringify({
            event: 'task.reminder.sent',
            reminderId: reminder.id,
            taskId: reminder.taskId,
            userId: reminder.userId,
            correlationId,
          }),
        );
      }
    }

    return processed;
  }

  private async runScheduledTick() {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const processed = await this.processDueReminders(new Date());
      if (processed > 0) {
        this.logger.log(`reminder worker delivered count=${processed}`);
      }
    } catch (error) {
      this.logger.error(
        `reminder worker tick failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.inFlight = false;
    }
  }

  private getIntervalMs() {
    const raw = Number(process.env.REMINDER_WORKER_INTERVAL_MS ?? 30_000);
    if (Number.isFinite(raw) && raw >= 1_000) return Math.floor(raw);
    return 30_000;
  }

  private getBatchSize() {
    const raw = Number(process.env.REMINDER_WORKER_BATCH_SIZE ?? 50);
    if (Number.isFinite(raw) && raw >= 1) return Math.floor(raw);
    return 50;
  }
}
