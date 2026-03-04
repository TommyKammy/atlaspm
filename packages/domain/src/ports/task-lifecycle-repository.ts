import type { TaskStatus } from '../value-objects/task-status.js';
import type { TaskType } from '../value-objects/task-type.js';

export interface TaskLifecycleState {
  id: string;
  projectId: string;
  type: TaskType;
  status: TaskStatus;
  progressPercent: number;
  completedAt: Date | null;
  version: number;
}

export interface SaveTaskLifecycleStateInput {
  taskId: string;
  expectedVersion: number;
  status: TaskStatus;
  progressPercent: number;
  completedAt: Date | null;
}

export interface TaskLifecycleRepository {
  findActiveById(taskId: string): Promise<TaskLifecycleState | null>;
  countIncompleteDescendants(taskId: string): Promise<number>;
  saveLifecycleState(input: SaveTaskLifecycleStateInput): Promise<TaskLifecycleState>;
}
