import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

function readSource(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('follower UI slice', () => {
  test('wires follow controls into task detail and project surfaces', () => {
    const taskDetailSource = readSource('./components/task-detail-drawer.tsx');
    const taskDetailDetailsTabSource = readSource('./components/task-detail/task-detail-details-tab.tsx');
    const projectPageSource = readSource('./app/projects/[id]/page.tsx');

    expect(taskDetailSource).toContain("from '@/components/task-detail/task-detail-details-tab'");
    expect(taskDetailDetailsTabSource).toContain('buttonTestId="task-follow-toggle"');
    expect(taskDetailDetailsTabSource).toContain('countTestId="task-follower-count"');
    expect(taskDetailDetailsTabSource).toContain('api(`/tasks/${taskId}/followers`');
    expect(taskDetailDetailsTabSource).toContain("api(`/tasks/${taskId}/followers/me`, { method: 'DELETE' })");

    expect(projectPageSource).toContain('buttonTestId="project-follow-toggle"');
    expect(projectPageSource).toContain('countTestId="project-follower-count"');
    expect(projectPageSource).toContain('api(`/projects/${projectId}/followers`');
    expect(projectPageSource).toContain("api(`/projects/${projectId}/followers/me`, { method: 'DELETE' })");
  });
});
