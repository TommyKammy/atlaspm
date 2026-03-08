import { BadRequestException } from '@nestjs/common';
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
});
