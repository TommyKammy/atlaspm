import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

function readSource(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('feature surface decomposition', () => {
  test('task detail delegates comments, attachments, and reminders to dedicated slices', () => {
    const taskDetailSource = readSource('./components/task-detail-drawer.tsx');

    expect(taskDetailSource).toContain("from '@/components/task-detail/task-detail-comments-tab'");
    expect(taskDetailSource).toContain("from '@/components/task-detail/task-detail-details-tab'");
    expect(taskDetailSource).not.toContain('api(`/tasks/${taskId}/comments`');
    expect(taskDetailSource).not.toContain('api(`/tasks/${taskId}/attachments`');
    expect(taskDetailSource).not.toContain('api(`/tasks/${taskId}/reminder`');

    const commentsTabSource = readSource('./components/task-detail/task-detail-comments-tab.tsx');
    expect(commentsTabSource).toContain('api(`/tasks/${taskId}/comments`');

    const detailsTabSource = readSource('./components/task-detail/task-detail-details-tab.tsx');
    expect(detailsTabSource).toContain('api(`/tasks/${taskId}/attachments`');
    expect(detailsTabSource).toContain('api(`/tasks/${taskId}/reminder`');
  });

  test('project board delegates board interaction state to dedicated slices', () => {
    const projectBoardSource = readSource('./components/project-board.tsx');

    expect(projectBoardSource).toContain("from '@/components/project-board/project-board-state'");
    expect(projectBoardSource).toContain("from '@/components/project-board/project-board-utils'");
    expect(projectBoardSource).not.toContain('function moveTaskPreview(');
    expect(projectBoardSource).not.toContain('const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);');

    const boardStateSource = readSource('./components/project-board/project-board-state.ts');
    expect(boardStateSource).toContain('function moveTaskPreview(');
    expect(boardStateSource).toContain('const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);');

    const boardUtilsSource = readSource('./components/project-board/project-board-utils.tsx');
    expect(boardUtilsSource).toContain('export function renderTaskTypeCompletionIcon');
    expect(boardUtilsSource).toContain('export function taskMatchesCustomFieldFilter');
  });
});
