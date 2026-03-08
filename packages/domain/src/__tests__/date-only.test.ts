import assert from 'node:assert/strict';
import test from 'node:test';
import {
  dateOnlyInputToLocalDate,
  dateOnlyInputValue,
  localDateToDateOnlyUtcIso,
  normalizeDateOnlyUtcIso,
} from '../services/date-only.js';

test('normalizeDateOnlyUtcIso drops time-of-day while preserving the UTC calendar date', () => {
  assert.equal(
    normalizeDateOnlyUtcIso('2026-03-10T23:00:00.000Z'),
    '2026-03-10T00:00:00.000Z',
  );
  assert.equal(
    normalizeDateOnlyUtcIso('2026-03-12T01:30:00.000Z'),
    '2026-03-12T00:00:00.000Z',
  );
});

test('dateOnlyInputToLocalDate renders mixed stored timestamps on the same date-only day', () => {
  const localDate = dateOnlyInputToLocalDate('2026-03-10T23:00:00.000Z');
  assert.ok(localDate);
  assert.equal(localDate.getFullYear(), 2026);
  assert.equal(localDate.getMonth(), 2);
  assert.equal(localDate.getDate(), 10);
});

test('dateOnlyInputValue returns the canonical date input string', () => {
  assert.equal(dateOnlyInputValue('2026-03-10T23:00:00.000Z'), '2026-03-10');
  assert.equal(dateOnlyInputValue(null), '');
});

test('localDateToDateOnlyUtcIso serializes local calendar dates to UTC midnight', () => {
  const value = new Date(2026, 2, 10, 14, 45, 0, 0);
  assert.equal(localDateToDateOnlyUtcIso(value), '2026-03-10T00:00:00.000Z');
});
