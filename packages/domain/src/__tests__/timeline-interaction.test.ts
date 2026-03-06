import assert from 'node:assert/strict';
import test from 'node:test';
import { DomainValidationError } from '../errors/domain-error.js';
import {
  assertTimelineScheduleRange,
  deriveTimelineDropSchedule,
  normalizeTimelineLaneOrder,
} from '../services/timeline-interaction.js';

test('normalizeTimelineLaneOrder trims, deduplicates, and keeps order', () => {
  const laneOrder = normalizeTimelineLaneOrder([' section-a ', 'section-b', 'section-a', '', 'section-c']);
  assert.deepEqual(laneOrder, ['section-a', 'section-b', 'section-c']);
});

test('normalizeTimelineLaneOrder rejects non-string values', () => {
  assert.throws(
    () => normalizeTimelineLaneOrder(['section-a', 123 as unknown as string]),
    DomainValidationError,
  );
});

test('normalizeTimelineLaneOrder honors a custom lane limit', () => {
  const laneOrder = normalizeTimelineLaneOrder(
    ['section-a', 'section-b', 'section-c'],
    3,
  );
  assert.deepEqual(laneOrder, ['section-a', 'section-b', 'section-c']);
  assert.throws(
    () => normalizeTimelineLaneOrder(['section-a', 'section-b', 'section-c', 'section-d'], 3),
    DomainValidationError,
  );
});

test('deriveTimelineDropSchedule keeps current duration when available', () => {
  const result = deriveTimelineDropSchedule({
    dropAt: new Date('2026-03-10T00:00:00.000Z'),
    currentStartAt: new Date('2026-03-01T00:00:00.000Z'),
    currentDueAt: new Date('2026-03-03T00:00:00.000Z'),
  });

  assert.equal(result.durationDays, 3);
  assert.equal(result.startAt.toISOString(), '2026-03-10T00:00:00.000Z');
  assert.equal(result.dueAt.toISOString(), '2026-03-12T00:00:00.000Z');
});

test('deriveTimelineDropSchedule uses explicit duration override', () => {
  const result = deriveTimelineDropSchedule({
    dropAt: new Date('2026-03-10T00:00:00.000Z'),
    currentStartAt: null,
    currentDueAt: null,
    durationDays: 5,
  });

  assert.equal(result.durationDays, 5);
  assert.equal(result.dueAt.toISOString(), '2026-03-14T00:00:00.000Z');
});

test('assertTimelineScheduleRange rejects inverted ranges', () => {
  assert.throws(
    () =>
      assertTimelineScheduleRange(
        new Date('2026-03-12T00:00:00.000Z'),
        new Date('2026-03-10T00:00:00.000Z'),
      ),
    DomainValidationError,
  );
});
