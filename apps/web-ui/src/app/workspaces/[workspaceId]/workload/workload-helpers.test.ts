import { describe, expect, test } from 'vitest';
import type { UserWorkload, WeeklyLoad } from '@/lib/api/workload';
import { filterWorkloads, getWeeklyCapacityState, getWorkloadStatus } from './workload-helpers';

function createWeek(overrides: Partial<WeeklyLoad> = {}): WeeklyLoad {
  return {
    week: 'Mar 8',
    startDate: '2026-03-08T00:00:00.000Z',
    endDate: '2026-03-14T23:59:59.999Z',
    capacityMinutes: 2400,
    capacityTasks: 10,
    taskCount: 0,
    estimateMinutes: 0,
    spentMinutes: 0,
    tasks: [],
    ...overrides,
  };
}

function createWorkload(overrides: Partial<UserWorkload> = {}): UserWorkload {
  return {
    userId: 'user-1',
    userName: 'User 1',
    email: 'user1@example.com',
    totalTasks: 0,
    totalEstimateMinutes: 0,
    totalSpentMinutes: 0,
    weeklyBreakdown: [createWeek()],
    overloadAlerts: [],
    ...overrides,
  };
}

describe('workload helpers', () => {
  test('uses API-provided capacity for over-capacity effort weeks', () => {
    const week = createWeek({
      estimateMinutes: 1200,
      taskCount: 1,
    });
    const workload = createWorkload({
      weeklyBreakdown: [week],
      overloadAlerts: [
        {
          week: 'Mar 8',
          estimateMinutes: 1200,
          capacity: 420,
          excess: 780,
        },
      ],
    });

    const state = getWeeklyCapacityState(workload.weeklyBreakdown[0]!, 'effort', workload.overloadAlerts[0]);

    expect(state.capacity).toBe(420);
    expect(state.isReducedCapacity).toBe(true);
    expect(state.excess).toBe(780);
    expect(getWorkloadStatus(workload, 'effort')).toBe('over-capacity');
  });

  test('distinguishes reduced-capacity task weeks from fully available ones', () => {
    const reduced = createWorkload({
      userId: 'user-2',
      weeklyBreakdown: [createWeek({ week: 'Mar 15', taskCount: 6, capacityTasks: 8, capacityMinutes: 1920 })],
    });
    const available = createWorkload({
      userId: 'user-3',
      weeklyBreakdown: [createWeek({ week: 'Mar 22', taskCount: 6 })],
    });

    expect(getWorkloadStatus(reduced, 'tasks')).toBe('reduced-capacity');
    expect(getWorkloadStatus(available, 'tasks')).toBe('available');
    expect(filterWorkloads([reduced, available], 'reduced-capacity', 'tasks')).toEqual([reduced]);
    expect(filterWorkloads([reduced, available], 'available', 'tasks')).toEqual([available]);
  });
});
