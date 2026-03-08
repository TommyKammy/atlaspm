import { RecurringFrequency } from '@prisma/client';

type RecurrenceConfig = {
  frequency: RecurringFrequency;
  interval?: number | null;
  daysOfWeek?: number[] | null;
  dayOfMonth?: number | null;
  startDate: Date;
};

type DueRecurrenceConfig = RecurrenceConfig & {
  nextScheduledAt?: Date | null;
  endDate?: Date | null;
};

const MAX_DUE_SLOTS_PER_SCAN = 366;

function toUtcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfUtcWeek(date: Date): Date {
  return addUtcDays(date, -date.getUTCDay());
}

function diffUtcDays(left: Date, right: Date): number {
  return Math.round((toUtcDateOnly(left).getTime() - toUtcDateOnly(right).getTime()) / 86_400_000);
}

function diffUtcMonths(left: Date, right: Date): number {
  return (
    (left.getUTCFullYear() - right.getUTCFullYear()) * 12 +
    (left.getUTCMonth() - right.getUTCMonth())
  );
}

function lastDayOfUtcMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function getEffectiveInterval(interval?: number | null): number {
  return Math.max(1, interval ?? 1);
}

function isScheduledOnDate(config: RecurrenceConfig, date: Date): boolean {
  const candidate = toUtcDateOnly(date);
  const startDate = toUtcDateOnly(config.startDate);

  if (candidate < startDate) {
    return false;
  }

  const interval = getEffectiveInterval(config.interval);

  switch (config.frequency) {
    case RecurringFrequency.DAILY: {
      return diffUtcDays(candidate, startDate) % interval === 0;
    }
    case RecurringFrequency.WEEKLY: {
      const daysOfWeek = [...(config.daysOfWeek ?? [])].sort((left, right) => left - right);
      if (!daysOfWeek.length || !daysOfWeek.includes(candidate.getUTCDay())) {
        return false;
      }

      const weekDiff =
        diffUtcDays(startOfUtcWeek(candidate), startOfUtcWeek(startDate)) / 7;
      return Number.isInteger(weekDiff) && weekDiff % interval === 0;
    }
    case RecurringFrequency.MONTHLY: {
      const monthsDiff = diffUtcMonths(candidate, startDate);
      if (monthsDiff < 0 || monthsDiff % interval !== 0) {
        return false;
      }

      const configuredDay = config.dayOfMonth ?? startDate.getUTCDate();
      const effectiveDay = Math.min(
        configuredDay,
        lastDayOfUtcMonth(candidate.getUTCFullYear(), candidate.getUTCMonth()),
      );
      return candidate.getUTCDate() === effectiveDay;
    }
  }
}

function findScheduledAtOrAfter(config: RecurrenceConfig, fromDate: Date): Date {
  const startDate = toUtcDateOnly(config.startDate);
  let cursor = toUtcDateOnly(fromDate);
  if (cursor < startDate) {
    cursor = startDate;
  }

  for (let offset = 0; offset <= MAX_DUE_SLOTS_PER_SCAN; offset += 1) {
    const candidate = addUtcDays(cursor, offset);
    if (isScheduledOnDate(config, candidate)) {
      return candidate;
    }
  }

  throw new Error('Failed to find a scheduled recurrence slot within scan window');
}

export function calculateInitialNextScheduledAt(
  config: RecurrenceConfig & { now?: Date | null },
): Date {
  const now = toUtcDateOnly(config.now ?? new Date());
  return findScheduledAtOrAfter(config, now);
}

export function calculateNextScheduledAtAfter(
  config: RecurrenceConfig,
  previousScheduledAt: Date,
): Date {
  return findScheduledAtOrAfter(config, addUtcDays(previousScheduledAt, 1));
}

export function collectDueScheduledAtTimes(
  config: DueRecurrenceConfig,
  now: Date,
): Date[] {
  const today = toUtcDateOnly(now);
  const endDate = config.endDate ? toUtcDateOnly(config.endDate) : null;
  let cursor = toUtcDateOnly(
    config.nextScheduledAt ??
      calculateInitialNextScheduledAt({
        ...config,
        now: today,
      }),
  );

  const due: Date[] = [];
  for (let count = 0; count < MAX_DUE_SLOTS_PER_SCAN; count += 1) {
    if (cursor > today) {
      break;
    }
    if (endDate && cursor > endDate) {
      break;
    }

    due.push(cursor);
    cursor = calculateNextScheduledAtAfter(config, cursor);
  }

  return due;
}

export function normalizeRecurringDate(date: Date): Date {
  return toUtcDateOnly(date);
}
