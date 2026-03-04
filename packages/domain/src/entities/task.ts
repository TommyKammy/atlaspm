import { DomainValidationError } from '../errors/domain-error.js';
import type { TaskProgressChangedEvent, TaskStatusChangedEvent } from '../events/task-events.js';
import { ProgressPercent } from '../value-objects/progress-percent.js';
import { assertTaskStatus } from '../value-objects/task-status.js';
import type { TaskStatus } from '../value-objects/task-status.js';

export interface TaskSnapshot {
  id: string;
  title: string;
  status: TaskStatus;
  progressPercent: number;
  completedAt: Date | null;
  version: number;
}

export interface CreateTaskParams {
  id: string;
  title: string;
  status?: TaskStatus;
  progressPercent?: number;
  completedAt?: Date | null;
  version?: number;
}

export class Task {
  private constructor(private state: TaskSnapshot) {}

  static create(params: CreateTaskParams): Task {
    return Task.rehydrate({
      id: params.id,
      title: params.title,
      status: params.status ?? 'TODO',
      progressPercent: params.progressPercent ?? 0,
      completedAt: params.completedAt ?? null,
      version: params.version ?? 0,
    });
  }

  static rehydrate(snapshot: TaskSnapshot): Task {
    Task.validate(snapshot);
    return new Task({ ...snapshot, completedAt: snapshot.completedAt ? new Date(snapshot.completedAt) : null });
  }

  get snapshot(): TaskSnapshot {
    return { ...this.state, completedAt: this.state.completedAt ? new Date(this.state.completedAt) : null };
  }

  updateProgress(nextProgressPercent: number, occurredAt: Date = new Date()): TaskProgressChangedEvent {
    const next = ProgressPercent.from(nextProgressPercent).value;
    const previous = this.state.progressPercent;
    this.state.progressPercent = next;
    this.state.version += 1;
    return {
      type: 'task.progress.changed',
      taskId: this.state.id,
      from: previous,
      to: next,
      occurredAt,
    };
  }

  transitionStatus(nextStatus: TaskStatus, occurredAt: Date = new Date()): TaskStatusChangedEvent {
    const previous = this.state.status;
    this.state.status = nextStatus;
    this.state.completedAt = nextStatus === 'DONE' ? (this.state.completedAt ?? occurredAt) : null;
    this.state.version += 1;
    Task.validate(this.state);
    return {
      type: 'task.status.changed',
      taskId: this.state.id,
      from: previous,
      to: nextStatus,
      occurredAt,
    };
  }

  private static validate(snapshot: TaskSnapshot) {
    if (!snapshot.id.trim()) throw new DomainValidationError('Task id is required');
    if (!snapshot.title.trim()) throw new DomainValidationError('Task title is required');
    assertTaskStatus(snapshot.status);
    ProgressPercent.from(snapshot.progressPercent);
    if (!Number.isInteger(snapshot.version) || snapshot.version < 0) {
      throw new DomainValidationError(`Task version must be a non-negative integer. Received: ${snapshot.version}`);
    }
    if (snapshot.status === 'DONE' && !snapshot.completedAt) {
      throw new DomainValidationError('DONE task must have completedAt');
    }
    if (snapshot.status !== 'DONE' && snapshot.completedAt) {
      throw new DomainValidationError('Non-DONE task must not have completedAt');
    }
  }
}
