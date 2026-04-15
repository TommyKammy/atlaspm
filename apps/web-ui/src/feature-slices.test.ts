import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

function readSource(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('feature surface decomposition', () => {
  test('task detail delegates comments, attachments, reminders, and recurrence to dedicated slices', () => {
    const taskDetailSource = readSource('./components/task-detail-drawer.tsx');

    expect(taskDetailSource).toContain("from '@/components/task-detail/task-detail-comments-tab'");
    expect(taskDetailSource).toContain("from '@/components/task-detail/task-detail-details-tab'");
    expect(taskDetailSource).not.toContain('api(`/tasks/${taskId}/comments`');

    const commentsTabSource = readSource('./components/task-detail/task-detail-comments-tab.tsx');
    expect(commentsTabSource).toContain('api(`/tasks/${taskId}/comments`');

    const detailsTabSource = readSource('./components/task-detail/task-detail-details-tab.tsx');
    expect(detailsTabSource).toContain("from '@/components/task-detail/task-detail-overview-section'");
    expect(detailsTabSource).toContain("from '@/components/task-detail/task-detail-reminder-section'");
    expect(detailsTabSource).toContain("from '@/components/task-detail/task-detail-recurrence-section'");
    expect(detailsTabSource).toContain("from '@/components/task-detail/task-detail-attachments-section'");
    expect(detailsTabSource).not.toContain('api(`/tasks/${taskId}/attachments`');
    expect(detailsTabSource).not.toContain('api(`/tasks/${taskId}/reminder`');
    expect(detailsTabSource).not.toContain('api(`/projects/${projectId}/recurring-rules?includeInactive=true`)');

    const reminderSectionSource = readSource('./components/task-detail/task-detail-reminder-section.tsx');
    expect(reminderSectionSource).toContain('api(`/tasks/${taskId}/reminder`');

    const recurrenceSectionSource = readSource('./components/task-detail/task-detail-recurrence-section.tsx');
    expect(recurrenceSectionSource).toContain('api(`/projects/${projectId}/recurring-rules?includeInactive=true`)');

    const attachmentsSectionSource = readSource('./components/task-detail/task-detail-attachments-section.tsx');
    expect(attachmentsSectionSource).toContain('api(`/tasks/${taskId}/attachments`');
  });

  test('project board delegates board interaction state and shared task presentation helpers', () => {
    const projectBoardSource = readSource('./components/project-board.tsx');

    expect(projectBoardSource).toContain("from '@/components/project-board/project-board-state'");
    expect(projectBoardSource).toContain("from '@/components/project-board/project-board-utils'");
    expect(projectBoardSource).toContain("from '@/components/task-presentation-utils'");
    expect(projectBoardSource).not.toContain('function moveTaskPreview(');
    expect(projectBoardSource).not.toContain('const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);');

    const boardStateSource = readSource('./components/project-board/project-board-state.ts');
    expect(boardStateSource).toContain('function moveTaskPreview(');
    expect(boardStateSource).toContain('const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);');

    const boardUtilsSource = readSource('./components/project-board/project-board-utils.tsx');
    expect(boardUtilsSource).toContain('export function taskMatchesCustomFieldFilter');
    expect(boardUtilsSource).not.toContain('export function renderTaskTypeCompletionIcon');
    expect(boardUtilsSource).not.toContain('export function initials');

    const taskPresentationSource = readSource('./components/task-presentation-utils.tsx');
    expect(taskPresentationSource).toContain('export function renderTaskTypeCompletionIcon');
    expect(taskPresentationSource).toContain('export function initials');
  });
});
