import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { TaskStatus, TaskType } from '@prisma/client';
import {
  applyTaskProgressAutomation,
  assertTimelineScheduleRange as assertTimelineScheduleRangeInDomain,
  deriveTaskCompletionTransition as deriveTaskCompletionTransitionInDomain,
  deriveTimelineDropSchedule as deriveTimelineDropScheduleInDomain,
  DomainValidationError,
  normalizeTimelineLaneOrder as normalizeTimelineLaneOrderInDomain,
  normalizeTaskProgressForType,
  type TaskStatus as DomainTaskStatus,
  type TaskType as DomainTaskType,
} from '@atlaspm/domain';

@Injectable()
export class DomainService {
  private static readonly defaultRuleTemplateKeys = ['progress_to_done', 'progress_to_in_progress'] as const;

  isDefaultRuleTemplateKey(templateKey: string): boolean {
    return DomainService.defaultRuleTemplateKeys.includes(templateKey as typeof DomainService.defaultRuleTemplateKeys[number]);
  }

  ensureProgressRange(progressPercent?: number) {
    if (progressPercent === undefined) return;
    if (!Number.isInteger(progressPercent) || progressPercent < 0 || progressPercent > 100) {
      throw new ConflictException('progressPercent must be int 0..100');
    }
  }

  deriveTaskProgressAutomation(progress: number, currentStatus: TaskStatus, completedAt: Date | null, now: Date = new Date()) {
    const result = applyTaskProgressAutomation({
      status: this.toDomainTaskStatus(currentStatus),
      progressPercent: progress,
      completedAt,
      now,
    });
    return {
      status: this.fromDomainTaskStatus(result.status),
      completedAt: result.completedAt,
    };
  }

  deriveNormalizedTaskProgress(input: {
    taskType: TaskType;
    progress: number;
    status: TaskStatus;
    hasStatusOverride: boolean;
  }) {
    return normalizeTaskProgressForType({
      taskType: this.toDomainTaskType(input.taskType),
      progressPercent: input.progress,
      status: this.toDomainTaskStatus(input.status),
      hasStatusOverride: input.hasStatusOverride,
    });
  }

  deriveTaskCompletionTransition(input: {
    taskType: TaskType;
    done: boolean;
    completedAt: Date | null;
    now?: Date;
  }) {
    const result = deriveTaskCompletionTransitionInDomain({
      taskType: this.toDomainTaskType(input.taskType),
      done: input.done,
      completedAt: input.completedAt,
      now: input.now,
    });
    return {
      status: this.fromDomainTaskStatus(result.status),
      progressPercent: result.progressPercent,
      completedAt: result.completedAt,
      action: result.action,
    };
  }

  normalizeTimelineLaneOrder(laneIds: string[], maxLanes?: number): string[] {
    try {
      return normalizeTimelineLaneOrderInDomain(laneIds, maxLanes);
    } catch (error) {
      if (error instanceof DomainValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  deriveTimelineDropSchedule(input: {
    dropAt: Date;
    currentStartAt: Date | null;
    currentDueAt: Date | null;
    durationDays?: number | null;
  }) {
    try {
      return deriveTimelineDropScheduleInDomain(input);
    } catch (error) {
      if (error instanceof DomainValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  assertTimelineScheduleRange(startAt: Date | null, dueAt: Date | null): void {
    try {
      assertTimelineScheduleRangeInDomain(startAt, dueAt);
    } catch (error) {
      if (error instanceof DomainValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private toDomainTaskStatus(status: TaskStatus): DomainTaskStatus {
    switch (status) {
      case TaskStatus.TODO:
        return 'TODO';
      case TaskStatus.IN_PROGRESS:
        return 'IN_PROGRESS';
      case TaskStatus.DONE:
        return 'DONE';
      case TaskStatus.BLOCKED:
        return 'BLOCKED';
      default:
        return this.unhandledEnumMapping(status as never, 'task-status prisma->domain');
    }
  }

  private fromDomainTaskStatus(status: DomainTaskStatus): TaskStatus {
    switch (status) {
      case 'TODO':
        return TaskStatus.TODO;
      case 'IN_PROGRESS':
        return TaskStatus.IN_PROGRESS;
      case 'DONE':
        return TaskStatus.DONE;
      case 'BLOCKED':
        return TaskStatus.BLOCKED;
      default:
        return this.unhandledEnumMapping(status as never, 'task-status domain->prisma');
    }
  }

  private toDomainTaskType(taskType: TaskType): DomainTaskType {
    switch (taskType) {
      case TaskType.TASK:
        return 'TASK';
      case TaskType.MILESTONE:
        return 'MILESTONE';
      case TaskType.APPROVAL:
        return 'APPROVAL';
      default:
        return this.unhandledEnumMapping(taskType as never, 'task-type prisma->domain');
    }
  }

  private unhandledEnumMapping(value: never, mapping: string): never {
    throw new Error(`Unhandled enum mapping (${mapping}): ${String(value)}`);
  }
}
