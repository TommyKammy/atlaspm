import { DomainValidationError } from '../errors/domain-error.js';

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

export function assertTaskStatus(value: string): TaskStatus {
  if (!isTaskStatus(value)) {
    throw new DomainValidationError(`Invalid task status: ${value}`);
  }
  return value;
}
