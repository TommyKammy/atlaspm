import assert from 'node:assert/strict';
import test from 'node:test';
import { DomainConflictError, DomainNotFoundError } from '../errors/domain-error.js';
import type {
  SaveTaskLifecycleStateInput,
  TaskLifecycleRepository,
  TaskLifecycleState,
} from '../ports/task-lifecycle-repository.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import { completeTaskLifecycle } from '../services/complete-task-lifecycle.js';

class InMemoryTaskLifecycleRepository implements TaskLifecycleRepository {
  constructor(
    private readonly task: TaskLifecycleState | null,
    private readonly openDescendantCount: number = 0,
  ) {}

  async findActiveById(taskId: string): Promise<TaskLifecycleState | null> {
    void taskId;
    return this.task ? { ...this.task, completedAt: this.task.completedAt ? new Date(this.task.completedAt) : null } : null;
  }

  async countIncompleteDescendants(taskId: string): Promise<number> {
    void taskId;
    return this.openDescendantCount;
  }

  async saveLifecycleState(input: SaveTaskLifecycleStateInput): Promise<TaskLifecycleState> {
    if (!this.task) {
      throw new DomainNotFoundError('Task not found');
    }
    if (input.expectedVersion !== this.task.version) {
      throw new DomainConflictError('Version conflict', 'VERSION_CONFLICT');
    }
    return {
      ...this.task,
      status: input.status,
      progressPercent: input.progressPercent,
      completedAt: input.completedAt ? new Date(input.completedAt) : null,
      version: this.task.version + 1,
    };
  }
}

function makeUnitOfWork(repository: TaskLifecycleRepository): UnitOfWork<{ taskLifecycleRepository: TaskLifecycleRepository }> {
  return {
    run<T>(work: (context: { taskLifecycleRepository: TaskLifecycleRepository }) => Promise<T>): Promise<T> {
      return work({ taskLifecycleRepository: repository });
    },
  };
}

test('completeTaskLifecycle sets DONE and increments version', async () => {
  const now = new Date('2026-03-04T12:30:00.000Z');
  const repository = new InMemoryTaskLifecycleRepository({
    id: 'task-1',
    projectId: 'project-1',
    type: 'TASK',
    status: 'IN_PROGRESS',
    progressPercent: 80,
    completedAt: null,
    version: 3,
  });

  const result = await completeTaskLifecycle(
    {
      taskId: 'task-1',
      done: true,
      expectedVersion: 3,
      now,
    },
    makeUnitOfWork(repository),
  );

  assert.equal(result.action, 'task.completed');
  assert.equal(result.updated.status, 'DONE');
  assert.equal(result.updated.progressPercent, 100);
  assert.equal(result.updated.completedAt?.toISOString(), now.toISOString());
  assert.equal(result.updated.version, 4);
});

test('completeTaskLifecycle throws conflict when descendant tasks are open', async () => {
  const repository = new InMemoryTaskLifecycleRepository(
    {
      id: 'task-2',
      projectId: 'project-1',
      type: 'TASK',
      status: 'IN_PROGRESS',
      progressPercent: 50,
      completedAt: null,
      version: 5,
    },
    2,
  );

  await assert.rejects(
    completeTaskLifecycle(
      {
        taskId: 'task-2',
        done: true,
        expectedVersion: 5,
      },
      makeUnitOfWork(repository),
    ),
    (error: unknown) => {
      assert.ok(error instanceof DomainConflictError);
      assert.equal(error.code, 'INCOMPLETE_SUBTASKS');
      assert.equal(error.details?.openSubtaskCount, 2);
      return true;
    },
  );
});

test('completeTaskLifecycle throws not found for missing task', async () => {
  const repository = new InMemoryTaskLifecycleRepository(null);

  await assert.rejects(
    completeTaskLifecycle(
      {
        taskId: 'missing',
        done: true,
        expectedVersion: 0,
      },
      makeUnitOfWork(repository),
    ),
    DomainNotFoundError,
  );
});

test('completeTaskLifecycle throws version conflict when expectedVersion mismatches', async () => {
  const repository = new InMemoryTaskLifecycleRepository({
    id: 'task-3',
    projectId: 'project-1',
    type: 'TASK',
    status: 'IN_PROGRESS',
    progressPercent: 60,
    completedAt: null,
    version: 2,
  });

  await assert.rejects(
    completeTaskLifecycle(
      {
        taskId: 'task-3',
        done: true,
        expectedVersion: 1,
      },
      makeUnitOfWork(repository),
    ),
    (error: unknown) => {
      assert.ok(error instanceof DomainConflictError);
      assert.equal(error.code, 'VERSION_CONFLICT');
      return true;
    },
  );
});

test('completeTaskLifecycle reopens task when done is false', async () => {
  const now = new Date('2026-03-04T12:30:00.000Z');
  const repository = new InMemoryTaskLifecycleRepository({
    id: 'task-4',
    projectId: 'project-1',
    type: 'TASK',
    status: 'DONE',
    progressPercent: 100,
    completedAt: now,
    version: 1,
  });

  const result = await completeTaskLifecycle(
    {
      taskId: 'task-4',
      done: false,
      expectedVersion: 1,
      now,
    },
    makeUnitOfWork(repository),
  );

  assert.equal(result.action, 'task.reopened');
  assert.equal(result.updated.status, 'IN_PROGRESS');
  assert.equal(result.updated.progressPercent, 0);
  assert.equal(result.updated.completedAt, null);
  assert.equal(result.updated.version, 2);
});
