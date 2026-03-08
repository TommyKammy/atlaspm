import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createProjectViewFallbackState,
  normalizeProjectViewState,
  resolveProjectViewState,
} from '../services/project-view-state.js';

test('normalizeProjectViewState keeps grouping, sorting, filters, and visible fields for list views', () => {
  const state = normalizeProjectViewState('list', {
    grouping: { field: 'section' },
    sorting: { field: 'dueAt', direction: 'desc' },
    filters: {
      statusIds: ['TODO', 'DONE', 'TODO', ''],
      assigneeIds: ['user-1', 'user-1', 'user-2'],
      schedule: 'scheduled',
      customFieldFilters: [
        {
          fieldId: 'cf-number',
          type: 'NUMBER',
          numberMin: 9,
          numberMax: 3,
        },
      ],
    },
    visibleFieldIds: ['name', 'status', 'name', ''],
    zoom: { unit: 'week', anchorDate: '2026-03-15T00:00:00.000Z' },
  });

  assert.deepEqual(state, {
    grouping: { field: 'section' },
    sorting: { field: 'dueAt', direction: 'desc' },
    filters: {
      statusIds: ['TODO', 'DONE'],
      assigneeIds: ['user-1', 'user-2'],
      schedule: 'scheduled',
      customFieldFilters: [
        {
          fieldId: 'cf-number',
          type: 'NUMBER',
          numberMin: 3,
          numberMax: 9,
        },
      ],
    },
    visibleFieldIds: ['name', 'status'],
  });
});

test('normalizeProjectViewState keeps timeline zoom but drops list-only visible fields', () => {
  const state = normalizeProjectViewState('timeline', {
    grouping: { field: 'status' },
    sorting: { field: 'dueAt', direction: 'asc' },
    filters: {
      schedule: 'scheduled',
    },
    visibleFieldIds: ['name', 'status'],
    zoom: {
      unit: 'month',
      anchorDate: '2026-03-18T12:45:00.000Z',
      workingDaysOnly: true,
    },
  });

  assert.deepEqual(state, {
    grouping: { field: 'status' },
    sorting: { field: 'dueAt', direction: 'asc' },
    filters: {
      schedule: 'scheduled',
    },
    zoom: {
      unit: 'month',
      anchorDate: '2026-03-18T12:45:00.000Z',
      workingDaysOnly: true,
    },
  });
});

test('resolveProjectViewState applies working state over named view, saved default, then fallback', () => {
  const resolved = resolveProjectViewState({
    mode: 'timeline',
    fallbackState: createProjectViewFallbackState('timeline', '2026-03-09T00:00:00.000Z'),
    savedDefaultState: normalizeProjectViewState('timeline', {
      grouping: { field: 'assignee' },
      sorting: { field: 'startAt', direction: 'asc' },
      zoom: { unit: 'week', anchorDate: '2026-03-10T00:00:00.000Z' },
    }),
    selectedNamedView: {
      id: 'named-1',
      name: 'Late work',
      mode: 'timeline',
      state: normalizeProjectViewState('timeline', {
        grouping: { field: 'status' },
        sorting: { field: 'dueAt', direction: 'desc' },
        filters: { schedule: 'scheduled' },
        zoom: { unit: 'month', anchorDate: '2026-03-20T00:00:00.000Z' },
      }),
    },
    workingState: normalizeProjectViewState('timeline', {
      grouping: { field: 'status' },
      sorting: { field: 'dueAt', direction: 'desc' },
      filters: { schedule: 'unscheduled' },
      zoom: { unit: 'day', anchorDate: '2026-03-22T00:00:00.000Z' },
    }),
  });

  assert.equal(resolved.source.layer, 'working');
  assert.equal(resolved.source.namedViewId, 'named-1');
  assert.deepEqual(resolved.state, {
    grouping: { field: 'status' },
    sorting: { field: 'dueAt', direction: 'desc' },
    filters: { schedule: 'unscheduled' },
    zoom: {
      unit: 'day',
      anchorDate: '2026-03-22T00:00:00.000Z',
      workingDaysOnly: false,
    },
  });
});
