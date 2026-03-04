import assert from 'node:assert/strict';
import test from 'node:test';
import { Task } from '../entities/task.js';
import { DomainValidationError } from '../errors/domain-error.js';
import { deriveTaskCompletionTransition } from '../services/task-completion-transition.js';
import { applyTaskProgressAutomation } from '../services/task-progress-automation.js';
import { normalizeTaskProgressForType } from '../services/task-progress-normalization.js';

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

test('normalizeTaskProgressForType clamps milestone by status override', () => {
  const doneProgress = normalizeTaskProgressForType({
    taskType: 'MILESTONE',
    progressPercent: 10,
    status: 'DONE',
    hasStatusOverride: true,
  });
  const notDoneProgress = normalizeTaskProgressForType({
    taskType: 'MILESTONE',
    progressPercent: 100,
    status: 'IN_PROGRESS',
    hasStatusOverride: true,
  });

  assert.equal(doneProgress, 100);
  assert.equal(notDoneProgress, 0);
});

test('normalizeTaskProgressForType keeps non-milestone progress', () => {
  const progress = normalizeTaskProgressForType({
    taskType: 'TASK',
    progressPercent: 42,
    status: 'IN_PROGRESS',
    hasStatusOverride: false,
  });

  assert.equal(progress, 42);
});

test('deriveTaskCompletionTransition marks done task with progress and completedAt', () => {
  const now = new Date('2026-03-04T12:00:00.000Z');
  const next = deriveTaskCompletionTransition({
    taskType: 'TASK',
    done: true,
    completedAt: null,
    now,
  });

  assert.equal(next.status, 'DONE');
  assert.equal(next.progressPercent, 100);
  assert.equal(next.completedAt?.toISOString(), now.toISOString());
  assert.equal(next.action, 'task.completed');
});

test('deriveTaskCompletionTransition reopens task and clears completedAt', () => {
  const next = deriveTaskCompletionTransition({
    taskType: 'MILESTONE',
    done: false,
    completedAt: new Date('2026-03-04T12:00:00.000Z'),
  });

  assert.equal(next.status, 'IN_PROGRESS');
  assert.equal(next.progressPercent, 0);
  assert.equal(next.completedAt, null);
  assert.equal(next.action, 'task.reopened');
});
