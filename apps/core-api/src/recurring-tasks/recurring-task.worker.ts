import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DomainService } from '../common/domain.service';
import { RecurringFrequency, TaskStatus } from '@prisma/client';
import {
  calculateNextScheduledAtAfter,
  collectDueScheduledAtTimes,
  normalizeRecurringDate,
} from './recurrence-policy';

@Injectable()
export class RecurringTaskWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecurringTaskWorker.name);
  private processingInterval?: NodeJS.Timeout;
  private retryInterval?: NodeJS.Timeout;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
  ) {}

  onModuleInit() {
    const workerEnabled = process.env.RECURRING_WORKER_ENABLED !== 'false';
    if (!workerEnabled) {
      this.logger.log('Recurring task worker is disabled');
      return;
    }

    const processIntervalMs = parseInt(process.env.RECURRING_WORKER_INTERVAL_MS || '60000', 10);
    const retryIntervalMs = parseInt(process.env.RECURRING_WORKER_RETRY_INTERVAL_MS || '300000', 10);

    this.processingInterval = setInterval(() => {
      this.processDueRecurringTasks().catch((err) =>
        this.logger.error('Error in processDueRecurringTasks:', err),
      );
    }, processIntervalMs);

    this.retryInterval = setInterval(() => {
      this.retryFailedGenerations().catch((err) =>
        this.logger.error('Error in retryFailedGenerations:', err),
      );
    }, retryIntervalMs);

    this.logger.log(
      `Recurring task worker started (process: ${processIntervalMs}ms, retry: ${retryIntervalMs}ms)`,
    );

    this.processDueRecurringTasks().catch((err) =>
      this.logger.error('Error in initial processDueRecurringTasks:', err),
    );
  }

  onModuleDestroy() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
    }
    this.logger.log('Recurring task worker stopped');
  }

  async processDueRecurringTasks(): Promise<{ processed: number; errors: number }> {
    const now = normalizeRecurringDate(new Date());

    const rules = await this.prisma.recurringRule.findMany({
      where: {
        isActive: true,
        nextScheduledAt: {
          lte: now,
        },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
    });

    let processed = 0;
    let errors = 0;

    for (const rule of rules) {
      const dueScheduledAtTimes = collectDueScheduledAtTimes(rule, now);

      for (const scheduledAt of dueScheduledAtTimes) {
        try {
          await this.generateTaskForRule(rule, scheduledAt);
          processed++;
        } catch (error) {
          this.logger.error(
            `Failed to generate task for rule ${rule.id} at ${scheduledAt.toISOString()}:`,
            error,
          );
          await this.recordGenerationError(rule.id, error as Error, scheduledAt);
          errors++;
          break;
        }
      }
    }

    return { processed, errors };
  }

  private async generateTaskForRule(rule: {
    id: string;
    projectId: string;
    sectionId: string;
    title: string;
    description: string | null;
    assigneeUserId: string | null;
    priority: import('@prisma/client').Priority | null;
    tags: string[];
    frequency: RecurringFrequency;
    interval: number;
    daysOfWeek: number[];
    dayOfMonth: number | null;
    startDate: Date;
    nextScheduledAt: Date | null;
  }, scheduledAt: Date) {
    const normalizedScheduledAt = normalizeRecurringDate(scheduledAt);

    const maxPositionTask = await this.prisma.task.findFirst({
      where: { sectionId: rule.sectionId, deletedAt: null },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const nextPosition = (maxPositionTask?.position ?? 0) + 1000;

    try {
      await this.prisma.$transaction(async (tx) => {
        const generation = await tx.recurringTaskGeneration.create({
          data: {
            ruleId: rule.id,
            scheduledAt: normalizedScheduledAt,
            status: 'pending',
          },
        });

        const task = await tx.task.create({
          data: {
            projectId: rule.projectId,
            sectionId: rule.sectionId,
            title: rule.title,
            description: rule.description,
            status: TaskStatus.TODO,
            progressPercent: 0,
            priority: rule.priority,
            assigneeUserId: rule.assigneeUserId,
            tags: rule.tags,
            position: nextPosition,
            recurringRuleId: rule.id,
          },
        });

        await tx.recurringTaskGeneration.update({
          where: { id: generation.id },
          data: {
            taskId: task.id,
            status: 'completed',
          },
        });

        const nextScheduledAt = calculateNextScheduledAtAfter(
          {
            frequency: rule.frequency,
            interval: rule.interval,
            daysOfWeek: rule.daysOfWeek,
            dayOfMonth: rule.dayOfMonth,
            startDate: rule.startDate,
          },
          normalizedScheduledAt,
        );

        await tx.recurringRule.update({
          where: { id: rule.id },
          data: {
            lastGeneratedAt: new Date(),
            nextScheduledAt,
          },
        });

        await this.domain.appendAuditOutbox({
          tx,
          actor: 'system:recurring-worker',
          entityType: 'RecurringTaskGeneration',
          entityId: generation.id,
          action: 'recurring_task.generated',
          afterJson: {
            taskId: task.id,
            ruleId: rule.id,
            scheduledAt: normalizedScheduledAt,
            generationId: generation.id,
          },
          correlationId: `recurring-${rule.id}-${Date.now()}`,
          outboxType: 'recurring_task.generated',
          payload: {
            taskId: task.id,
            ruleId: rule.id,
            projectId: rule.projectId,
            scheduledAt: normalizedScheduledAt,
            generationId: generation.id,
          },
        });

        this.logger.log(
          `Generated recurring task ${task.id} for rule ${rule.id} (generation ${generation.id})`,
        );
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        this.logger.log(
          `Skipping duplicate generation for rule ${rule.id} at ${scheduledAt.toISOString()}`,
        );
        return;
      }
      throw error;
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return (
        message.includes('unique constraint') ||
        message.includes('duplicate key') ||
        message.includes('already exists')
      );
    }
    return false;
  }

  private async recordGenerationError(ruleId: string, error: Error, scheduledAt: Date) {
    try {
      await this.prisma.$transaction(async (tx) => {
        const failedGeneration = await tx.recurringTaskGeneration.create({
          data: {
            ruleId,
            scheduledAt,
            status: 'failed',
            error: error.message,
            retryCount: 0,
          },
        });

        await this.domain.appendAuditOutbox({
          tx,
          actor: 'system:recurring-worker',
          entityType: 'RecurringTaskGeneration',
          entityId: failedGeneration.id,
          action: 'recurring_task.failed',
          afterJson: { ruleId, error: error.message, scheduledAt },
          correlationId: `recurring-failed-${ruleId}-${Date.now()}`,
          outboxType: 'recurring_task.failed',
          payload: {
            ruleId,
            error: error.message,
            scheduledAt,
            generationId: failedGeneration.id,
          },
        });
      });
    } catch (auditError) {
      this.logger.error('Failed to record generation error:', auditError);
    }
  }

  async retryFailedGenerations(): Promise<{ retried: number; succeeded: number }> {
    const failedGenerations = await this.prisma.recurringTaskGeneration.findMany({
      where: {
        status: 'failed',
        retryCount: {
          lt: 3,
        },
      },
      orderBy: {
        scheduledAt: 'asc',
      },
      take: 10,
    });

    let retried = 0;
    let succeeded = 0;

    for (const generation of failedGenerations) {
      try {
        retried++;

        const rule = await this.prisma.recurringRule.findFirst({
          where: { id: generation.ruleId },
        });

        if (!rule || !rule.isActive) {
          this.logger.log(
            `Skipping retry for rule ${generation.ruleId}: rule not found or inactive`,
          );
          continue;
        }

        const maxPositionTask = await this.prisma.task.findFirst({
          where: { sectionId: rule.sectionId, deletedAt: null },
          orderBy: { position: 'desc' },
          select: { position: true },
        });
        const nextPosition = (maxPositionTask?.position ?? 0) + 1000;

        await this.prisma.$transaction(async (tx) => {
          const task = await tx.task.create({
            data: {
              projectId: rule.projectId,
              sectionId: rule.sectionId,
              title: rule.title,
              description: rule.description,
              status: TaskStatus.TODO,
              progressPercent: 0,
              priority: rule.priority,
              assigneeUserId: rule.assigneeUserId,
              tags: rule.tags,
              position: nextPosition,
              recurringRuleId: rule.id,
            },
          });

          await tx.recurringTaskGeneration.update({
            where: { id: generation.id },
            data: {
              taskId: task.id,
              status: 'completed',
              retryCount: {
                increment: 1,
              },
            },
          });

          const nextScheduledAt = calculateNextScheduledAtAfter(
            {
              frequency: rule.frequency,
              interval: rule.interval,
              daysOfWeek: rule.daysOfWeek,
              dayOfMonth: rule.dayOfMonth,
              startDate: rule.startDate,
            },
            normalizeRecurringDate(generation.scheduledAt),
          );

          await tx.recurringRule.update({
            where: { id: rule.id },
            data: {
              lastGeneratedAt: new Date(),
              nextScheduledAt,
            },
          });

          await this.domain.appendAuditOutbox({
            tx,
            actor: 'system:recurring-worker',
            entityType: 'RecurringTaskGeneration',
            entityId: generation.id,
            action: 'recurring_task.retry_succeeded',
            beforeJson: { generationId: generation.id, error: generation.error },
            afterJson: { taskId: task.id },
            correlationId: `recurring-retry-${rule.id}-${Date.now()}`,
            outboxType: 'recurring_task.retry_succeeded',
            payload: {
              taskId: task.id,
              ruleId: rule.id,
              generationId: generation.id,
            },
          });

          succeeded++;
          this.logger.log(
            `Retry succeeded for generation ${generation.id}, created task ${task.id}`,
          );
        });
      } catch (retryError) {
        this.logger.error(`Retry failed for generation ${generation.id}:`, retryError);

        await this.prisma.recurringTaskGeneration.update({
          where: { id: generation.id },
          data: {
            retryCount: {
              increment: 1,
            },
          },
        });
      }
    }

    return { retried, succeeded };
  }

}
