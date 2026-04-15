import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { RecurringFrequency, TaskStatus } from '@prisma/client';
import {
  calculateNextScheduledAtAfter,
  collectDueScheduledAtTimes,
  normalizeRecurringDate,
} from './recurrence-policy';

type SlotProcessingResult = 'generated' | 'already-completed' | 'blocked-existing';

@Injectable()
export class RecurringTaskWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecurringTaskWorker.name);
  private processingInterval?: NodeJS.Timeout;
  private retryInterval?: NodeJS.Timeout;
  private processingInFlight = false;
  private retryInFlight = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditOutboxService) private readonly auditOutbox: AuditOutboxService,
  ) {}

  onModuleInit() {
    const workerEnabled = process.env.RECURRING_WORKER_ENABLED !== 'false';
    if (!workerEnabled) {
      this.logger.log('Recurring task worker is disabled');
      return;
    }

    const processIntervalMs = this.getIntervalMs(
      process.env.RECURRING_WORKER_INTERVAL_MS,
      60_000,
    );
    const retryIntervalMs = this.getIntervalMs(
      process.env.RECURRING_WORKER_RETRY_INTERVAL_MS,
      300_000,
    );

    this.processingInterval = setInterval(() => {
      void this.runProcessingTick('interval');
    }, processIntervalMs);
    this.processingInterval.unref?.();

    this.retryInterval = setInterval(() => {
      void this.runRetryTick('interval');
    }, retryIntervalMs);
    this.retryInterval.unref?.();

    this.logger.log(
      `Recurring task worker started (process: ${processIntervalMs}ms, retry: ${retryIntervalMs}ms)`,
    );

    void this.runProcessingTick('startup');
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
          const result = await this.processScheduledAt(rule, scheduledAt);
          if (result === 'generated') {
            processed++;
          }
          if (result === 'blocked-existing') {
            break;
          }
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

  private async processScheduledAt(
    rule: Parameters<RecurringTaskWorker['generateTaskForRule']>[0],
    scheduledAt: Date,
  ): Promise<SlotProcessingResult> {
    const normalizedScheduledAt = normalizeRecurringDate(scheduledAt);
    const existingGeneration = await this.prisma.recurringTaskGeneration.findUnique({
      where: {
        ruleId_scheduledAt: {
          ruleId: rule.id,
          scheduledAt: normalizedScheduledAt,
        },
      },
    });

    if (existingGeneration) {
      return this.handleExistingGeneration(rule, existingGeneration);
    }

    return this.generateTaskForRule(rule, normalizedScheduledAt);
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
  }, scheduledAt: Date): Promise<SlotProcessingResult> {
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

        await this.auditOutbox.appendAuditOutbox({
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
      return 'generated';
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        const existingGeneration = await this.prisma.recurringTaskGeneration.findUnique({
          where: {
            ruleId_scheduledAt: {
              ruleId: rule.id,
              scheduledAt: normalizedScheduledAt,
            },
          },
        });
        if (existingGeneration) {
          return this.handleExistingGeneration(rule, existingGeneration);
        }
      }
      throw error;
    }
  }

  private async handleExistingGeneration(
    rule: {
      id: string;
      frequency: RecurringFrequency;
      interval: number;
      daysOfWeek: number[];
      dayOfMonth: number | null;
      startDate: Date;
      nextScheduledAt: Date | null;
    },
    generation: {
      id: string;
      scheduledAt: Date;
      status: string;
    },
  ): Promise<SlotProcessingResult> {
    const scheduledAt = normalizeRecurringDate(generation.scheduledAt);

    if (generation.status === 'completed') {
      await this.advanceRuleNextScheduledAt(rule, scheduledAt);
      this.logger.log(
        `Advanced stale recurring rule ${rule.id} past completed generation ${generation.id}`,
      );
      return 'already-completed';
    }

    this.logger.log(
      `Blocking recurring rule ${rule.id} at ${scheduledAt.toISOString()} because generation ${generation.id} is ${generation.status}`,
    );
    return 'blocked-existing';
  }

  private async advanceRuleNextScheduledAt(
    rule: {
      id: string;
      frequency: RecurringFrequency;
      interval: number;
      daysOfWeek: number[];
      dayOfMonth: number | null;
      startDate: Date;
      nextScheduledAt: Date | null;
    },
    scheduledAt: Date,
  ) {
    const nextScheduledAt = calculateNextScheduledAtAfter(
      {
        frequency: rule.frequency,
        interval: rule.interval,
        daysOfWeek: rule.daysOfWeek,
        dayOfMonth: rule.dayOfMonth,
        startDate: rule.startDate,
      },
      scheduledAt,
    );

    await this.prisma.recurringRule.updateMany({
      where: {
        id: rule.id,
        nextScheduledAt: {
          lte: scheduledAt,
        },
      },
      data: {
        nextScheduledAt,
      },
    });
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

        await this.auditOutbox.appendAuditOutbox({
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

        const claimed = await this.prisma.$transaction(async (tx) => {
          const claim = await tx.recurringTaskGeneration.updateMany({
            where: {
              id: generation.id,
              status: 'failed',
              taskId: null,
              retryCount: {
                lt: 3,
              },
            },
            data: {
              status: 'pending',
            },
          });

          if (claim.count === 0) {
            return false;
          }

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
              error: null,
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

          await this.auditOutbox.appendAuditOutbox({
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

          return true;
        });

        if (!claimed) {
          continue;
        }
      } catch (retryError) {
        this.logger.error(`Retry failed for generation ${generation.id}:`, retryError);

        await this.prisma.recurringTaskGeneration.updateMany({
          where: {
            id: generation.id,
            status: 'failed',
            taskId: null,
          },
          data: {
            status: 'failed',
            retryCount: {
              increment: 1,
            },
          },
        });
      }
    }

    return { retried, succeeded };
  }

  private async runProcessingTick(trigger: 'startup' | 'interval') {
    if (this.processingInFlight) {
      return;
    }

    this.processingInFlight = true;
    const startedAt = Date.now();
    try {
      const result = await this.processDueRecurringTasks();
      if (trigger === 'startup' || result.processed > 0 || result.errors > 0) {
        this.logStructuredEvent('recurring.worker.process.completed', {
          trigger,
          processed: result.processed,
          errors: result.errors,
          durationMs: Date.now() - startedAt,
        });
      }
    } catch (error) {
      this.logger.error('Error in processDueRecurringTasks:', error);
      this.logStructuredEvent(
        'recurring.worker.process.failed',
        {
          trigger,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        },
        'error',
      );
    } finally {
      this.processingInFlight = false;
    }
  }

  private async runRetryTick(trigger: 'interval') {
    if (this.retryInFlight) {
      return;
    }

    this.retryInFlight = true;
    const startedAt = Date.now();
    try {
      const result = await this.retryFailedGenerations();
      if (result.retried > 0 || result.succeeded > 0) {
        this.logStructuredEvent('recurring.worker.retry.completed', {
          trigger,
          retried: result.retried,
          succeeded: result.succeeded,
          durationMs: Date.now() - startedAt,
        });
      }
    } catch (error) {
      this.logger.error('Error in retryFailedGenerations:', error);
      this.logStructuredEvent(
        'recurring.worker.retry.failed',
        {
          trigger,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        },
        'error',
      );
    } finally {
      this.retryInFlight = false;
    }
  }

  private getIntervalMs(rawValue: string | undefined, defaultValue: number) {
    const parsed = Number.parseInt(rawValue ?? '', 10);
    if (Number.isFinite(parsed) && parsed >= 1_000) {
      return parsed;
    }
    return defaultValue;
  }

  private logStructuredEvent(
    event: string,
    details: Record<string, unknown>,
    level: 'log' | 'warn' | 'error' = 'log',
  ) {
    this.logger[level](JSON.stringify({ event, ...details }));
  }

}
