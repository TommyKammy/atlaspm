import type { TaskStatus } from '../value-objects/task-status.js';

export interface TaskProgressChangedEvent {
  type: 'task.progress.changed';
  taskId: string;
  from: number;
  to: number;
  occurredAt: Date;
}

export interface TaskStatusChangedEvent {
  type: 'task.status.changed';
  taskId: string;
  from: TaskStatus;
  to: TaskStatus;
  occurredAt: Date;
}
