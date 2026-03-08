import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecurringTaskWorker } from '../src/recurring-tasks/recurring-task.worker';

const baseRule = {
  id: 'rule-1',
  projectId: 'project-1',
  sectionId: 'section-1',
  title: 'Recurring task',
  description: null,
  assigneeUserId: null,
  priority: null,
  tags: [],
  frequency: 'DAILY',
  interval: 1,
  daysOfWeek: [],
  dayOfMonth: null,
  startDate: new Date('2026-03-01T00:00:00.000Z'),
  nextScheduledAt: new Date('2026-03-05T00:00:00.000Z'),
  isActive: true,
  endDate: null,
};

function createWorkerHarness(existingByScheduledAt: Record<string, { id: string; status: string } | null>) {
  const tx = {
    recurringTaskGeneration: {
      create: vi.fn(async ({ data }) => ({ id: `gen-${data.scheduledAt.toISOString()}` })),
      update: vi.fn(async () => undefined),
    },
    task: {
      create: vi.fn(async () => ({ id: `task-${Math.random()}` })),
    },
    recurringRule: {
      update: vi.fn(async () => undefined),
    },
  };

  const prisma = {
    recurringRule: {
      findMany: vi.fn(async () => [baseRule]),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findFirst: vi.fn(),
    },
    recurringTaskGeneration: {
      findUnique: vi.fn(async ({ where }) => {
        const scheduledAt = where.ruleId_scheduledAt.scheduledAt.toISOString();
        const existing = existingByScheduledAt[scheduledAt];
        return existing
          ? { ...existing, scheduledAt: where.ruleId_scheduledAt.scheduledAt }
          : null;
      }),
      findMany: vi.fn(),
    },
    task: {
      findFirst: vi.fn(async () => null),
    },
    $transaction: vi.fn(async (callback) => callback(tx)),
  };

  const domain = {
    appendAuditOutbox: vi.fn(async () => undefined),
  };

  const worker = new RecurringTaskWorker(prisma as any, domain as any);
  return { worker, prisma, tx, domain };
}

describe('RecurringTaskWorker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-07T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('advances stale nextScheduledAt when an already-completed generation exists', async () => {
    const { worker, prisma, tx } = createWorkerHarness({
      '2026-03-05T00:00:00.000Z': { id: 'gen-completed', status: 'completed' },
    });

    const result = await worker.processDueRecurringTasks();

    expect(result).toEqual({ processed: 2, errors: 0 });
    expect(prisma.recurringRule.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.task.create).toHaveBeenCalledTimes(2);
  });

  it('blocks later slots when the current scheduled generation is failed or pending', async () => {
    const { worker, prisma, tx } = createWorkerHarness({
      '2026-03-05T00:00:00.000Z': { id: 'gen-failed', status: 'failed' },
    });

    const result = await worker.processDueRecurringTasks();

    expect(result).toEqual({ processed: 0, errors: 0 });
    expect(prisma.recurringRule.updateMany).not.toHaveBeenCalled();
    expect(tx.task.create).not.toHaveBeenCalled();
    expect(prisma.recurringTaskGeneration.findUnique).toHaveBeenCalledTimes(1);
  });

  it('does not start a second processing tick while a prior processing run is still in flight', async () => {
    const previousEnabled = process.env.RECURRING_WORKER_ENABLED;
    const previousInterval = process.env.RECURRING_WORKER_INTERVAL_MS;
    const previousRetryInterval = process.env.RECURRING_WORKER_RETRY_INTERVAL_MS;
    process.env.RECURRING_WORKER_ENABLED = 'true';
    process.env.RECURRING_WORKER_INTERVAL_MS = '1000';
    process.env.RECURRING_WORKER_RETRY_INTERVAL_MS = '60000';

    const { worker } = createWorkerHarness({});
    const pendingProcess = new Promise<{ processed: number; errors: number }>(() => undefined);
    const processSpy = vi
      .spyOn(worker, 'processDueRecurringTasks')
      .mockReturnValue(pendingProcess);
    vi.spyOn(worker, 'retryFailedGenerations').mockResolvedValue({ retried: 0, succeeded: 0 });

    worker.onModuleInit();
    expect(processSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(processSpy).toHaveBeenCalledTimes(1);

    worker.onModuleDestroy();
    if (previousEnabled === undefined) {
      delete process.env.RECURRING_WORKER_ENABLED;
    } else {
      process.env.RECURRING_WORKER_ENABLED = previousEnabled;
    }
    if (previousInterval === undefined) {
      delete process.env.RECURRING_WORKER_INTERVAL_MS;
    } else {
      process.env.RECURRING_WORKER_INTERVAL_MS = previousInterval;
    }
    if (previousRetryInterval === undefined) {
      delete process.env.RECURRING_WORKER_RETRY_INTERVAL_MS;
    } else {
      process.env.RECURRING_WORKER_RETRY_INTERVAL_MS = previousRetryInterval;
    }
  });

  it('does not create duplicate tasks when the same failed generation is retried concurrently', async () => {
    const generation = {
      id: 'gen-failed',
      ruleId: baseRule.id,
      scheduledAt: new Date('2026-03-05T00:00:00.000Z'),
      status: 'failed',
      retryCount: 0,
      error: 'transient failure',
    };
    let claimed = false;

    const tx = {
      task: {
        create: vi.fn(async () => ({ id: 'task-1' })),
      },
      recurringTaskGeneration: {
        updateMany: vi.fn(async () => {
          if (claimed) {
            return { count: 0 };
          }
          claimed = true;
          return { count: 1 };
        }),
        update: vi.fn(async () => undefined),
      },
      recurringRule: {
        update: vi.fn(async () => undefined),
      },
    };

    const prisma = {
      recurringTaskGeneration: {
        findMany: vi.fn(async () => [generation]),
        update: vi.fn(async () => undefined),
      },
      recurringRule: {
        findFirst: vi.fn(async () => ({
          ...baseRule,
          isActive: true,
        })),
      },
      task: {
        findFirst: vi.fn(async () => null),
      },
      $transaction: vi.fn(async (callback) => callback(tx)),
    };

    const domain = {
      appendAuditOutbox: vi.fn(async () => undefined),
    };

    const worker = new RecurringTaskWorker(prisma as any, domain as any);

    const [first, second] = await Promise.all([
      worker.retryFailedGenerations(),
      worker.retryFailedGenerations(),
    ]);

    expect(first).toEqual({ retried: 1, succeeded: 1 });
    expect(second).toEqual({ retried: 1, succeeded: 0 });
    expect(tx.task.create).toHaveBeenCalledTimes(1);
    expect(tx.recurringTaskGeneration.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.recurringTaskGeneration.updateMany).toHaveBeenCalledWith({
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
    expect(tx.recurringTaskGeneration.update).toHaveBeenCalledTimes(1);
    expect(prisma.recurringTaskGeneration.update).not.toHaveBeenCalled();
  });

  it('does not mark a completed generation back to failed after a retry error race', async () => {
    const generation = {
      id: 'gen-failed',
      ruleId: baseRule.id,
      scheduledAt: new Date('2026-03-05T00:00:00.000Z'),
      status: 'failed',
      retryCount: 0,
      error: 'transient failure',
    };

    const tx = {
      task: {
        create: vi.fn(async () => {
          throw new Error('task create failed');
        }),
      },
      recurringTaskGeneration: {
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn(async () => undefined),
      },
      recurringRule: {
        update: vi.fn(async () => undefined),
      },
    };

    const prisma = {
      recurringTaskGeneration: {
        findMany: vi.fn(async () => [generation]),
        updateMany: vi.fn(async () => ({ count: 0 })),
        update: vi.fn(async () => undefined),
      },
      recurringRule: {
        findFirst: vi.fn(async () => ({
          ...baseRule,
          isActive: true,
        })),
      },
      task: {
        findFirst: vi.fn(async () => null),
      },
      $transaction: vi.fn(async (callback) => callback(tx)),
    };

    const domain = {
      appendAuditOutbox: vi.fn(async () => undefined),
    };

    const worker = new RecurringTaskWorker(prisma as any, domain as any);

    const result = await worker.retryFailedGenerations();

    expect(result).toEqual({ retried: 1, succeeded: 0 });
    expect(prisma.recurringTaskGeneration.updateMany).toHaveBeenCalledWith({
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
    expect(prisma.recurringTaskGeneration.update).not.toHaveBeenCalled();
  });
});
