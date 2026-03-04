import { DomainConflictError, DomainNotFoundError } from '../errors/domain-error.js';
import type { TaskLifecycleRepository, TaskLifecycleState } from '../ports/task-lifecycle-repository.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import { deriveTaskCompletionTransition, type TaskCompletionAction } from './task-completion-transition.js';

export interface CompleteTaskLifecycleInput {
  taskId: string;
  done: boolean;
  expectedVersion: number;
  force?: boolean;
  now?: Date;
}

export interface CompleteTaskLifecycleContext {
  taskLifecycleRepository: TaskLifecycleRepository;
}

export interface CompleteTaskLifecycleResult {
  previous: TaskLifecycleState;
  updated: TaskLifecycleState;
  action: TaskCompletionAction;
}

export async function completeTaskLifecycle(
  input: CompleteTaskLifecycleInput,
  unitOfWork: UnitOfWork<CompleteTaskLifecycleContext>,
): Promise<CompleteTaskLifecycleResult> {
  return unitOfWork.run(async ({ taskLifecycleRepository }) => {
    const task = await taskLifecycleRepository.findActiveById(input.taskId);
    if (!task) {
      throw new DomainNotFoundError('Task not found');
    }
    if (task.version !== input.expectedVersion) {
      throw new DomainConflictError('Version conflict', 'VERSION_CONFLICT');
    }

    if (input.done && !input.force) {
      const openSubtaskCount = await taskLifecycleRepository.countIncompleteDescendants(task.id);
      if (openSubtaskCount > 0) {
        throw new DomainConflictError(
          'Cannot complete parent task with incomplete subtasks',
          'INCOMPLETE_SUBTASKS',
          { openSubtaskCount },
        );
      }
    }

    const transition = deriveTaskCompletionTransition({
      taskType: task.type,
      done: input.done,
      completedAt: task.completedAt,
      ...(input.now ? { now: input.now } : {}),
    });

    const updated = await taskLifecycleRepository.saveLifecycleState({
      taskId: task.id,
      expectedVersion: task.version,
      status: transition.status,
      progressPercent: transition.progressPercent,
      completedAt: transition.completedAt,
    });

    return {
      previous: task,
      updated,
      action: transition.action,
    };
  });
}
