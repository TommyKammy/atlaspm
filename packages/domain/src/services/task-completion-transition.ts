import type { TaskStatus } from '../value-objects/task-status.js';
import type { TaskType } from '../value-objects/task-type.js';
import { normalizeTaskProgressForType } from './task-progress-normalization.js';

export type TaskCompletionAction = 'task.completed' | 'task.reopened';

export interface TaskCompletionTransitionInput {
  taskType: TaskType;
  done: boolean;
  completedAt: Date | null;
  now?: Date;
}

export interface TaskCompletionTransitionResult {
  status: TaskStatus;
  progressPercent: number;
  completedAt: Date | null;
  action: TaskCompletionAction;
}

export function deriveTaskCompletionTransition(
  input: TaskCompletionTransitionInput,
): TaskCompletionTransitionResult {
  const status: TaskStatus = input.done ? 'DONE' : 'IN_PROGRESS';
  const now = input.now ?? new Date();
  const progressPercent = normalizeTaskProgressForType({
    taskType: input.taskType,
    progressPercent: input.done ? 100 : 0,
    status,
    hasStatusOverride: true,
  });

  return {
    status,
    progressPercent,
    completedAt: input.done ? (input.completedAt ? new Date(input.completedAt) : now) : null,
    action: input.done ? 'task.completed' : 'task.reopened',
  };
}
