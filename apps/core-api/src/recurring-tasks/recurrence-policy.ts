import { normalizeDateOnlyUtcIso } from '@atlaspm/domain';
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

const ONE_DAY_MS = 86_400_000;

function toDateOnlyDate(value: Date): Date {
  const normalized = normalizeDateOnlyUtcIso(value);
  if (!normalized) {
    throw new Error('Expected a valid recurrence date');
  }
  return new Date(normalized);
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addUtcWeeks(date: Date, weeks: number): Date {
  return addUtcDays(date, weeks * 7);
}

function maxDate(left: Date, right: Date): Date {
  return left >= right ? left : right;
}

function diffUtcDays(left: Date, right: Date): number {
  return Math.round((left.getTime() - right.getTime()) / ONE_DAY_MS);
}

function diffUtcMonths(left: Date, right: Date): number {
  return (
    (left.getUTCFullYear() - right.getUTCFullYear()) * 12 +
    (left.getUTCMonth() - right.getUTCMonth())
  );
}

function lastDayOfUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function startOfUtcWeek(date: Date): Date {
  return addUtcDays(date, -date.getUTCDay());
}

function getEffectiveInterval(interval?: number | null): number {
  return Math.max(1, interval ?? 1);
}

function getSortedDaysOfWeek(daysOfWeek?: number[] | null): number[] {
  return Array.from(new Set(daysOfWeek ?? [])).sort((left, right) => left - right);
}

function buildMonthlyCandidate(startDate: Date, monthOffset: number, dayOfMonth: number): Date {
  const year = startDate.getUTCFullYear();
  const monthIndex = startDate.getUTCMonth() + monthOffset;
  const candidateYear = year + Math.floor(monthIndex / 12);
  const candidateMonthIndex = ((monthIndex % 12) + 12) % 12;
  const effectiveDay = Math.min(dayOfMonth, lastDayOfUtcMonth(candidateYear, candidateMonthIndex));
  return new Date(Date.UTC(candidateYear, candidateMonthIndex, effectiveDay));
}

function nextDailyScheduledAt(config: RecurrenceConfig, fromDate: Date): Date {
  const startDate = normalizeRecurringDate(config.startDate);
  const from = maxDate(normalizeRecurringDate(fromDate), startDate);
  const interval = getEffectiveInterval(config.interval);
  const daysSinceStart = diffUtcDays(from, startDate);
  const steps = Math.max(0, Math.ceil(daysSinceStart / interval));
  return addUtcDays(startDate, steps * interval);
}

function nextWeeklyScheduledAt(config: RecurrenceConfig, fromDate: Date): Date {
  const startDate = normalizeRecurringDate(config.startDate);
  const from = maxDate(normalizeRecurringDate(fromDate), startDate);
  const interval = getEffectiveInterval(config.interval);
  const daysOfWeek = getSortedDaysOfWeek(config.daysOfWeek);

  if (!daysOfWeek.length) {
    const daysSinceStart = diffUtcDays(from, startDate);
    const steps = Math.max(0, Math.ceil(daysSinceStart / (interval * 7)));
    return addUtcDays(startDate, steps * interval * 7);
  }

  const startWeek = startOfUtcWeek(startDate);
  const fromWeek = startOfUtcWeek(from);
  const baseWeekDiff = Math.max(0, diffUtcDays(fromWeek, startWeek) / 7);
  const remainder = baseWeekDiff % interval;
  let cycleWeekDiff = remainder === 0 ? baseWeekDiff : baseWeekDiff + (interval - remainder);

  while (true) {
    const cycleWeekStart = addUtcWeeks(startWeek, cycleWeekDiff);
    for (const dayOfWeek of daysOfWeek) {
      const candidate = addUtcDays(cycleWeekStart, dayOfWeek);
      if (candidate < startDate || candidate < from) {
        continue;
      }
      return candidate;
    }
    cycleWeekDiff += interval;
  }
}

function nextMonthlyScheduledAt(config: RecurrenceConfig, fromDate: Date): Date {
  const startDate = normalizeRecurringDate(config.startDate);
  const from = maxDate(normalizeRecurringDate(fromDate), startDate);
  const interval = getEffectiveInterval(config.interval);
  const dayOfMonth = config.dayOfMonth ?? startDate.getUTCDate();
  let monthOffset = Math.max(0, diffUtcMonths(from, startDate));
  const remainder = monthOffset % interval;
  if (remainder !== 0) {
    monthOffset += interval - remainder;
  }

  let candidate = buildMonthlyCandidate(startDate, monthOffset, dayOfMonth);
  while (candidate < from) {
    monthOffset += interval;
    candidate = buildMonthlyCandidate(startDate, monthOffset, dayOfMonth);
  }

  return candidate;
}

function nextScheduledAtOrAfter(config: RecurrenceConfig, fromDate: Date): Date {
  switch (config.frequency) {
    case RecurringFrequency.DAILY:
      return nextDailyScheduledAt(config, fromDate);
    case RecurringFrequency.WEEKLY:
      return nextWeeklyScheduledAt(config, fromDate);
    case RecurringFrequency.MONTHLY:
      return nextMonthlyScheduledAt(config, fromDate);
  }
}

export function calculateInitialNextScheduledAt(
  config: RecurrenceConfig & { now?: Date | null },
): Date {
  return nextScheduledAtOrAfter(config, normalizeRecurringDate(config.now ?? new Date()));
}

export function calculateNextScheduledAtAfter(
  config: RecurrenceConfig,
  previousScheduledAt: Date,
): Date {
  return nextScheduledAtOrAfter(config, addUtcDays(normalizeRecurringDate(previousScheduledAt), 1));
}

export function collectDueScheduledAtTimes(
  config: DueRecurrenceConfig,
  now: Date,
): Date[] {
  const today = normalizeRecurringDate(now);
  const endDate = config.endDate ? normalizeRecurringDate(config.endDate) : null;
  const dueUntil = endDate && endDate < today ? endDate : today;
  const firstScheduledAt =
    config.nextScheduledAt ??
    calculateInitialNextScheduledAt({
      ...config,
      now: dueUntil,
    });
  let cursor = normalizeRecurringDate(firstScheduledAt);

  if (cursor > dueUntil) {
    return [];
  }

  const due: Date[] = [];
  const maxIterations = Math.max(1, diffUtcDays(dueUntil, cursor) + 1);

  for (let count = 0; count < maxIterations && cursor <= dueUntil; count += 1) {
    due.push(cursor);
    cursor = calculateNextScheduledAtAfter(config, cursor);
  }

  return due;
}

export function normalizeRecurringDate(date: Date): Date {
  return toDateOnlyDate(date);
}
