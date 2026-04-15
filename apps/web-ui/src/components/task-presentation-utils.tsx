'use client';

import { CheckCircle2, Circle, Diamond, Stamp } from 'lucide-react';
import type { Task } from '@/lib/types';
import { cn } from '@/lib/utils';

type RenderTaskTypeCompletionIconOptions = {
  className?: string;
  taskDoneClassName?: string;
  taskPendingClassName?: string;
  milestoneDoneClassName?: string;
  milestonePendingClassName?: string;
  approvalDoneClassName?: string;
  approvalPendingClassName?: string;
};

export function renderTaskTypeCompletionIcon(
  task: Pick<Task, 'type'> | null | undefined,
  isDone: boolean,
  options: RenderTaskTypeCompletionIconOptions = {},
) {
  const {
    className,
    taskDoneClassName,
    taskPendingClassName,
    milestoneDoneClassName = taskDoneClassName,
    milestonePendingClassName = taskPendingClassName,
    approvalDoneClassName = taskDoneClassName,
    approvalPendingClassName = taskPendingClassName,
  } = options;

  if (task?.type === 'MILESTONE') {
    return (
      <Diamond
        className={cn(
          className,
          isDone ? 'fill-current' : undefined,
          isDone ? milestoneDoneClassName : milestonePendingClassName,
        )}
      />
    );
  }
  if (task?.type === 'APPROVAL') {
    return (
      <Stamp
        className={cn(
          className,
          isDone ? approvalDoneClassName : approvalPendingClassName,
        )}
      />
    );
  }
  return isDone
    ? <CheckCircle2 className={cn(className, taskDoneClassName)} />
    : <Circle className={cn(className, taskPendingClassName)} />;
}

export function initials(value: string) {
  const pieces = value.trim().split(/\s+/).slice(0, 2);
  return pieces.map((piece) => piece.charAt(0).toUpperCase()).join('') || 'U';
}
