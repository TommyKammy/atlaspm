import type { TaskStatus } from '../value-objects/task-status.js';
import { ProgressPercent } from '../value-objects/progress-percent.js';

export interface TaskProgressAutomationInput {
  status: TaskStatus;
  progressPercent: number;
  completedAt: Date | null;
  now?: Date;
}

export interface TaskProgressAutomationResult {
  status: TaskStatus;
  completedAt: Date | null;
}

export function applyTaskProgressAutomation(input: TaskProgressAutomationInput): TaskProgressAutomationResult {
  const progress = ProgressPercent.from(input.progressPercent).value;
  const now = input.now ?? new Date();

  if (progress === 100) {
    return {
      status: 'DONE',
      completedAt: input.completedAt ?? now,
    };
  }

  if (input.status === 'DONE') {
    return {
      status: 'IN_PROGRESS',
      completedAt: null,
    };
  }

  return {
    status: input.status,
    completedAt: input.completedAt,
  };
}
