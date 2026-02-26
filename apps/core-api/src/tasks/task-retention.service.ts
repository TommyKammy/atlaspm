import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DomainService } from '../common/domain.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TaskRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TaskRetentionService.name);
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
  ) {}

  onModuleInit() {
    if (!this.isWorkerEnabled()) {
      this.logger.log('task retention worker disabled by env');
      return;
    }
    const intervalMs = this.getIntervalMs();
    this.timer = setInterval(() => {
      void this.runScheduledTick();
    }, intervalMs);
    this.timer.unref?.();
    void this.runScheduledTick();
    this.logger.log(`task retention worker started intervalMs=${intervalMs} retentionDays=${this.getRetentionDays()}`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async processExpiredDeletes(now = new Date()) {
    const cutoff = new Date(now.getTime() - this.getRetentionDays() * 24 * 60 * 60 * 1000);
    const candidates = await this.prisma.task.findMany({
      where: { deletedAt: { not: null, lte: cutoff } },
      select: { id: true, projectId: true, deletedAt: true, deletedByUserId: true, title: true },
      orderBy: { deletedAt: 'asc' },
      take: this.getBatchSize(),
    });
    if (candidates.length === 0) return 0;

    const batchId = randomUUID();
    const taskIds = candidates.map((task) => task.id);

    const deletedCount = await this.prisma.$transaction(async (tx) => {
      for (const task of candidates) {
        await this.domain.appendAuditOutbox({
          tx,
          actor: 'retention-worker',
          entityType: 'Task',
          entityId: task.id,
          action: 'task.purged',
          beforeJson: {
            taskId: task.id,
            projectId: task.projectId,
            title: task.title,
            deletedAt: task.deletedAt,
            deletedByUserId: task.deletedByUserId,
          },
          afterJson: {
            taskId: task.id,
            projectId: task.projectId,
            purgedAt: now,
            retentionDays: this.getRetentionDays(),
            batchId,
          },
          correlationId: `task-retention-${batchId}-${task.id}`,
          outboxType: 'task.purged',
          payload: {
            taskId: task.id,
            projectId: task.projectId,
            deletedAt: task.deletedAt,
            purgedAt: now,
            retentionDays: this.getRetentionDays(),
            batchId,
          },
        });
      }

      const deleted = await tx.task.deleteMany({ where: { id: { in: taskIds } } });
      return deleted.count;
    });

    this.logger.log(
      JSON.stringify({
        level: 'info',
        source: 'core-api',
        event: 'task.retention.purged',
        batchId,
        deletedCount,
        cutoff: cutoff.toISOString(),
        retentionDays: this.getRetentionDays(),
      }),
    );

    return deletedCount;
  }

  private async runScheduledTick() {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const deletedCount = await this.processExpiredDeletes(new Date());
      if (deletedCount > 0) {
        this.logger.log(`task retention worker purged count=${deletedCount}`);
      }
    } catch (error) {
      this.logger.error(
        `task retention worker tick failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.inFlight = false;
    }
  }

  private isWorkerEnabled() {
    return process.env.TASK_RETENTION_WORKER_ENABLED === 'true';
  }

  private getIntervalMs() {
    const raw = Number(process.env.TASK_RETENTION_WORKER_INTERVAL_MS ?? 60 * 60 * 1000);
    if (Number.isFinite(raw) && raw >= 10_000) return Math.floor(raw);
    return 60 * 60 * 1000;
  }

  private getRetentionDays() {
    const raw = Number(process.env.TASK_RETENTION_DAYS ?? 30);
    if (Number.isFinite(raw) && raw >= 1) return Math.floor(raw);
    return 30;
  }

  private getBatchSize() {
    const raw = Number(process.env.TASK_RETENTION_BATCH_SIZE ?? 100);
    if (Number.isFinite(raw) && raw >= 1) return Math.floor(raw);
    return 100;
  }
}
