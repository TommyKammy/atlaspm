import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { RecurringTasksController } from '../src/recurring-tasks/recurring-tasks.controller';

describe('RecurringTasksController', () => {
  it('rejects null startDate updates before recalculating the schedule', async () => {
    const prisma = {
      recurringRule: {
        findFirst: vi.fn(),
      },
    };
    const domain = {
      requireProjectRole: vi.fn(),
    };

    const controller = new RecurringTasksController(prisma as any, domain as any);

    await expect(
      controller.update(
        'rule-1',
        { startDate: null } as any,
        { user: { sub: 'user-1' }, correlationId: 'corr-1' } as any,
      ),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.recurringRule.findFirst).not.toHaveBeenCalled();
  });

  it('translates source task uniqueness races into a conflict error', async () => {
    const uniqueError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.22.0',
      meta: { target: ['sourceTaskId'] },
    });
    const prisma = {
      section: {
        findFirst: vi.fn().mockResolvedValue({ id: 'section-1' }),
      },
      task: {
        findFirst: vi.fn().mockResolvedValue({ id: '00000000-0000-0000-0000-000000000001' }),
      },
      $transaction: vi.fn().mockRejectedValue(uniqueError),
    };
    const domain = {
      requireProjectRole: vi.fn().mockResolvedValue(undefined),
    };

    const controller = new RecurringTasksController(prisma as any, domain as any);

    await expect(
      controller.create(
        'project-1',
        {
          title: 'Recurring source',
          frequency: 'DAILY',
          sectionId: 'section-1',
          sourceTaskId: '00000000-0000-0000-0000-000000000001',
          startDate: new Date('2026-03-10T00:00:00.000Z'),
        } as any,
        { user: { sub: 'user-1' }, correlationId: 'corr-1' } as any,
      ),
    ).rejects.toThrow(ConflictException);

    expect(prisma.task.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
