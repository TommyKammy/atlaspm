import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

function readSource(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('follower UI slice', () => {
  test('wires follow controls into task detail and project surfaces', () => {
    const taskDetailSource = readSource('./components/task-detail-drawer.tsx');
    const taskDetailDetailsTabSource = readSource('./components/task-detail/task-detail-details-tab.tsx');
    const taskDetailOverviewSource = readSource('./components/task-detail/task-detail-overview-section.tsx');
    const projectPageSource = readSource('./app/projects/[id]/page.tsx');

    expect(taskDetailSource).toContain("from '@/components/task-detail/task-detail-details-tab'");
    expect(taskDetailDetailsTabSource).toContain("from '@/components/task-detail/task-detail-overview-section'");
    expect(taskDetailOverviewSource).toContain('buttonTestId="task-follow-toggle"');
    expect(taskDetailOverviewSource).toContain('countTestId="task-follower-count"');
    expect(taskDetailOverviewSource).toContain('api(`/tasks/${taskId}/followers`');
    expect(taskDetailOverviewSource).toContain("api(`/tasks/${taskId}/followers/me`, { method: 'DELETE' })");

    expect(projectPageSource).toContain('buttonTestId="project-follow-toggle"');
    expect(projectPageSource).toContain('countTestId="project-follower-count"');
    expect(projectPageSource).toContain('api(`/projects/${projectId}/followers`');
    expect(projectPageSource).toContain("api(`/projects/${projectId}/followers/me`, { method: 'DELETE' })");
  });
});
