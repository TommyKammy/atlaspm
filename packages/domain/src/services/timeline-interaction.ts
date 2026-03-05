import { DomainValidationError } from '../errors/domain-error.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DURATION_DAYS = 1;
const MAX_TIMELINE_DURATION_DAYS = 365;
const DEFAULT_MAX_LANES = 500;

export type TimelineDropScheduleInput = {
  dropAt: Date;
  currentStartAt: Date | null;
  currentDueAt: Date | null;
  durationDays?: number | null;
};

export type TimelineDropScheduleResult = {
  startAt: Date;
  dueAt: Date;
  durationDays: number;
};

export function normalizeTimelineLaneOrder(laneIds: string[], maxLanes: number = DEFAULT_MAX_LANES): string[] {
  if (!Array.isArray(laneIds)) {
    throw new DomainValidationError('laneIds must be an array');
  }
  if (!Number.isInteger(maxLanes) || maxLanes <= 0) {
    throw new DomainValidationError('maxLanes must be a positive integer');
  }

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const laneId of laneIds) {
    if (typeof laneId !== 'string') {
      throw new DomainValidationError('laneIds must contain only strings');
    }
    const trimmed = laneId.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
    if (normalized.length > maxLanes) {
      throw new DomainValidationError(`laneIds exceeds maximum of ${maxLanes}`);
    }
  }
  return normalized;
}

export function deriveTimelineDropSchedule(input: TimelineDropScheduleInput): TimelineDropScheduleResult {
  const dropAtTime = input.dropAt.getTime();
  if (Number.isNaN(dropAtTime)) {
    throw new DomainValidationError('dropAt must be a valid date');
  }

  const durationDays = resolveDurationDays(input.durationDays, input.currentStartAt, input.currentDueAt);
  const startAt = new Date(dropAtTime);
  const dueAt = new Date(dropAtTime + (durationDays - 1) * DAY_MS);

  return { startAt, dueAt, durationDays };
}

export function assertTimelineScheduleRange(startAt: Date | null, dueAt: Date | null): void {
  if (!startAt || !dueAt) return;
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(dueAt.getTime())) {
    throw new DomainValidationError('startAt and dueAt must be valid dates');
  }
  if (startAt.getTime() > dueAt.getTime()) {
    throw new DomainValidationError('startAt cannot be later than dueAt');
  }
}

function resolveDurationDays(
  requestedDurationDays: number | null | undefined,
  currentStartAt: Date | null,
  currentDueAt: Date | null,
): number {
  if (requestedDurationDays !== null && requestedDurationDays !== undefined) {
    if (!Number.isInteger(requestedDurationDays) || requestedDurationDays <= 0) {
      throw new DomainValidationError('durationDays must be a positive integer');
    }
    if (requestedDurationDays > MAX_TIMELINE_DURATION_DAYS) {
      throw new DomainValidationError(`durationDays cannot exceed ${MAX_TIMELINE_DURATION_DAYS}`);
    }
    return requestedDurationDays;
  }

  if (currentStartAt && currentDueAt) {
    const start = currentStartAt.getTime();
    const due = currentDueAt.getTime();
    if (!Number.isNaN(start) && !Number.isNaN(due) && due >= start) {
      return Math.max(1, Math.floor((due - start) / DAY_MS) + 1);
    }
  }

  return DEFAULT_DURATION_DAYS;
}
