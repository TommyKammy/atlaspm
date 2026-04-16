'use client';

import { useState } from 'react';
import type { SectionTaskGroup, Task } from '@/lib/types';

export function moveTaskPreview(
  groups: SectionTaskGroup[],
  taskId: string,
  toSectionId: string,
  targetTaskId: string | null,
) {
  const cloned = groups.map((group) => ({ ...group, tasks: [...group.tasks] }));
  let movingTask: Task | null = null;

  for (const group of cloned) {
    const index = group.tasks.findIndex((task) => task.id === taskId);
    if (index >= 0) {
      movingTask = group.tasks[index] ?? null;
      group.tasks.splice(index, 1);
      break;
    }
  }

  if (!movingTask) return groups;

  const destination = cloned.find((group) => group.section.id === toSectionId);
  if (!destination) return groups;

  const targetIndex = targetTaskId
    ? destination.tasks.findIndex((task) => task.id === targetTaskId)
    : -1;
  const insertAt = targetIndex >= 0 ? targetIndex : destination.tasks.length;

  destination.tasks.splice(insertAt, 0, { ...movingTask, sectionId: toSectionId });
  return cloned;
}

export function useProjectBoardState() {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  return {
    selectedTaskId,
    setSelectedTaskId,
    moveTaskPreview,
  };
}
