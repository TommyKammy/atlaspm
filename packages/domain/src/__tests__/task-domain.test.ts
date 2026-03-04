import assert from 'node:assert/strict';
import test from 'node:test';
import { Task } from '../entities/task.js';
import { DomainValidationError } from '../errors/domain-error.js';
import { applyTaskProgressAutomation } from '../services/task-progress-automation.js';

test('Task.create rejects invalid progress values', () => {
  assert.throws(
    () =>
      Task.create({
        id: 'task-1',
        title: 'invalid progress',
        progressPercent: 101,
      }),
    DomainValidationError,
  );
});

test('Task.create requires completedAt for DONE status', () => {
  assert.throws(
    () =>
      Task.create({
        id: 'task-2',
        title: 'done without completion date',
        status: 'DONE',
        progressPercent: 100,
      }),
    DomainValidationError,
  );
});

test('transitionStatus to DONE sets completedAt and bumps version', () => {
  const task = Task.create({
    id: 'task-3',
    title: 'status transition',
    status: 'TODO',
    progressPercent: 20,
  });
  const now = new Date('2026-03-04T00:00:00.000Z');

  const event = task.transitionStatus('DONE', now);
  const snapshot = task.snapshot;

  assert.equal(event.type, 'task.status.changed');
  assert.equal(event.from, 'TODO');
  assert.equal(event.to, 'DONE');
  assert.equal(snapshot.status, 'DONE');
  assert.equal(snapshot.completedAt?.toISOString(), now.toISOString());
  assert.equal(snapshot.version, 1);
});

test('transitionStatus from DONE clears completedAt', () => {
  const task = Task.create({
    id: 'task-4',
    title: 'reopen task',
    status: 'DONE',
    progressPercent: 100,
    completedAt: new Date('2026-03-04T00:00:00.000Z'),
  });

  task.transitionStatus('IN_PROGRESS', new Date('2026-03-05T00:00:00.000Z'));
  const snapshot = task.snapshot;

  assert.equal(snapshot.status, 'IN_PROGRESS');
  assert.equal(snapshot.completedAt, null);
  assert.equal(snapshot.version, 1);
});

test('updateProgress emits a progress changed event', () => {
  const task = Task.create({
    id: 'task-5',
    title: 'progress update',
    status: 'TODO',
    progressPercent: 10,
  });
  const now = new Date('2026-03-04T10:00:00.000Z');

  const event = task.updateProgress(55, now);

  assert.deepEqual(
    {
      type: event.type,
      taskId: event.taskId,
      from: event.from,
      to: event.to,
      occurredAt: event.occurredAt.toISOString(),
    },
    {
      type: 'task.progress.changed',
      taskId: 'task-5',
      from: 10,
      to: 55,
      occurredAt: '2026-03-04T10:00:00.000Z',
    },
  );
  assert.equal(task.snapshot.version, 1);
});

test('applyTaskProgressAutomation marks task done at 100%', () => {
  const now = new Date('2026-03-04T11:00:00.000Z');
  const next = applyTaskProgressAutomation({
    status: 'IN_PROGRESS',
    progressPercent: 100,
    completedAt: null,
    now,
  });

  assert.equal(next.status, 'DONE');
  assert.equal(next.completedAt?.toISOString(), now.toISOString());
});

test('applyTaskProgressAutomation reopens DONE task when progress decreases', () => {
  const next = applyTaskProgressAutomation({
    status: 'DONE',
    progressPercent: 70,
    completedAt: new Date('2026-03-04T11:00:00.000Z'),
  });

  assert.equal(next.status, 'IN_PROGRESS');
  assert.equal(next.completedAt, null);
});

test('applyTaskProgressAutomation derives IN_PROGRESS for non-100 progress', () => {
  const next = applyTaskProgressAutomation({
    status: 'TODO',
    progressPercent: 70,
    completedAt: null,
  });

  assert.equal(next.status, 'IN_PROGRESS');
  assert.equal(next.completedAt, null);
});
