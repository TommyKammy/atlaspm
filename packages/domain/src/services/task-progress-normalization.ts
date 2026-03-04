import { ProgressPercent } from '../value-objects/progress-percent.js';
import type { TaskStatus } from '../value-objects/task-status.js';
import type { TaskType } from '../value-objects/task-type.js';

export interface TaskProgressNormalizationInput {
  taskType: TaskType;
  progressPercent: number;
  status: TaskStatus;
  hasStatusOverride: boolean;
  hasProgressOverride: boolean;
}

export function normalizeTaskProgressForType(input: TaskProgressNormalizationInput): number {
  const progress = ProgressPercent.from(input.progressPercent).value;

  if (input.taskType !== 'MILESTONE') {
    return progress;
  }

  if (input.hasStatusOverride) {
    return input.status === 'DONE' ? 100 : 0;
  }

  if (input.hasProgressOverride) {
    return progress >= 100 ? 100 : 0;
  }

  return progress >= 100 ? 100 : 0;
}
