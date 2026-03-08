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
});
