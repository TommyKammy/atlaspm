import { describe, expect, test } from 'vitest';
import { moveTaskPreview } from '@/components/project-board/project-board-state';
import type { SectionTaskGroup, Task } from '@/lib/types';

function makeTask(id: string, sectionId: string, position: number): Task {
  return {
    id,
    projectId: 'project-1',
    sectionId,
    title: `Task ${id}`,
    status: 'TODO',
    type: 'TASK',
    progressPercent: 0,
    version: 1,
    position,
  };
}

function makeGroup(sectionId: string, taskIds: string[]): SectionTaskGroup {
  return {
    section: {
      id: sectionId,
      projectId: 'project-1',
      name: sectionId,
      position: 1,
      isDefault: sectionId === 'todo',
    },
    tasks: taskIds.map((taskId, index) => makeTask(taskId, sectionId, index)),
  };
}

describe('moveTaskPreview', () => {
  test('appends to the destination when the target task is stale', () => {
    const groups = [
      makeGroup('todo', ['task-1', 'task-2']),
      makeGroup('doing', ['task-3', 'task-4']),
    ];

    const preview = moveTaskPreview(groups, 'task-1', 'doing', 'missing-task');
    const destination = preview.find((group) => group.section.id === 'doing');

    expect(destination?.tasks.map((task) => task.id)).toEqual(['task-3', 'task-4', 'task-1']);
  });
});
