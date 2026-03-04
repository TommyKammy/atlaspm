import { DomainValidationError } from '../errors/domain-error.js';

export const TASK_TYPES = ['TASK', 'MILESTONE', 'APPROVAL'] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export function isTaskType(value: string): value is TaskType {
  return (TASK_TYPES as readonly string[]).includes(value);
}

export function assertTaskType(value: string): TaskType {
  if (!isTaskType(value)) {
    throw new DomainValidationError(`Invalid task type: ${value}`);
  }
  return value;
}
