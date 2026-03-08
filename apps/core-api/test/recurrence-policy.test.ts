import { describe, expect, it } from 'vitest';
import { RecurringFrequency } from '@prisma/client';
import {
  calculateInitialNextScheduledAt,
  calculateNextScheduledAtAfter,
  collectDueScheduledAtTimes,
} from '../src/recurring-tasks/recurrence-policy';

describe('recurrence policy', () => {
  it('anchors the first monthly occurrence to the current month when the configured day has not passed', () => {
    const startDate = new Date('2026-03-01T00:00:00.000Z');
    const now = new Date('2026-03-08T12:00:00.000Z');

    const next = calculateInitialNextScheduledAt({
      frequency: RecurringFrequency.MONTHLY,
      interval: 1,
      dayOfMonth: 15,
      startDate,
      now,
    });

    expect(next.toISOString()).toBe('2026-03-15T00:00:00.000Z');
  });

  it('keeps a rule starting today due today instead of skipping the first slot', () => {
    const startDate = new Date('2026-03-08T00:00:00.000Z');
    const now = new Date('2026-03-08T12:00:00.000Z');

    const next = calculateInitialNextScheduledAt({
      frequency: RecurringFrequency.DAILY,
      interval: 1,
      startDate,
      now,
    });

    expect(next.toISOString()).toBe('2026-03-08T00:00:00.000Z');
  });

  it('enumerates every overdue daily slot in one pass so generation is schedule-driven', () => {
    const due = collectDueScheduledAtTimes(
      {
        frequency: RecurringFrequency.DAILY,
        interval: 1,
        startDate: new Date('2026-03-01T00:00:00.000Z'),
        nextScheduledAt: new Date('2026-03-05T00:00:00.000Z'),
      },
      new Date('2026-03-07T12:00:00.000Z'),
    );

    expect(due.map((value) => value.toISOString())).toEqual([
      '2026-03-05T00:00:00.000Z',
      '2026-03-06T00:00:00.000Z',
      '2026-03-07T00:00:00.000Z',
    ]);
  });

  it('keeps weekly interval alignment anchored to the start week for later slots', () => {
    const next = calculateInitialNextScheduledAt({
      frequency: RecurringFrequency.WEEKLY,
      interval: 2,
      daysOfWeek: [1, 4],
      startDate: new Date('2026-03-03T00:00:00.000Z'),
      now: new Date('2026-03-05T10:00:00.000Z'),
    });

    expect(next.toISOString()).toBe('2026-03-05T00:00:00.000Z');

    const after = calculateNextScheduledAtAfter(
      {
        frequency: RecurringFrequency.WEEKLY,
        interval: 2,
        daysOfWeek: [1, 4],
        startDate: new Date('2026-03-03T00:00:00.000Z'),
      },
      next,
    );

    expect(after.toISOString()).toBe('2026-03-16T00:00:00.000Z');
  });

  it('clamps monthly rules to the last day of shorter months', () => {
    const next = calculateInitialNextScheduledAt({
      frequency: RecurringFrequency.MONTHLY,
      interval: 1,
      dayOfMonth: 31,
      startDate: new Date('2026-01-31T00:00:00.000Z'),
      now: new Date('2026-02-01T12:00:00.000Z'),
    });

    expect(next.toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });

  it('treats endDate as inclusive when collecting due schedule slots', () => {
    const due = collectDueScheduledAtTimes(
      {
        frequency: RecurringFrequency.DAILY,
        interval: 1,
        startDate: new Date('2026-03-01T00:00:00.000Z'),
        nextScheduledAt: new Date('2026-03-05T00:00:00.000Z'),
        endDate: new Date('2026-03-07T00:00:00.000Z'),
      },
      new Date('2026-03-09T12:00:00.000Z'),
    );

    expect(due.map((value) => value.toISOString())).toEqual([
      '2026-03-05T00:00:00.000Z',
      '2026-03-06T00:00:00.000Z',
      '2026-03-07T00:00:00.000Z',
    ]);
  });

  it('supports long monthly intervals without relying on a one-year scan cap', () => {
    const next = calculateInitialNextScheduledAt({
      frequency: RecurringFrequency.MONTHLY,
      interval: 24,
      dayOfMonth: 15,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      now: new Date('2026-01-16T12:00:00.000Z'),
    });

    expect(next.toISOString()).toBe('2028-01-15T00:00:00.000Z');
  });
});
