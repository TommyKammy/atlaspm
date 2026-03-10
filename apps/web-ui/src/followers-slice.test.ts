import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

function readSource(relativePath: string) {
  return readFileSync(resolve(__dirname, relativePath), 'utf8');
}

describe('follower UI slice', () => {
  test('wires follow controls into task detail and project surfaces', () => {
    const taskDetailSource = readSource('./components/task-detail-drawer.tsx');
    const projectPageSource = readSource('./app/projects/[id]/page.tsx');

    expect(taskDetailSource).toContain('buttonTestId="task-follow-toggle"');
    expect(taskDetailSource).toContain('countTestId="task-follower-count"');
    expect(taskDetailSource).toContain('api(`/tasks/${taskId}/followers`');
    expect(taskDetailSource).toContain("api(`/tasks/${taskId}/followers/me`, { method: 'DELETE' })");

    expect(projectPageSource).toContain('buttonTestId="project-follow-toggle"');
    expect(projectPageSource).toContain('countTestId="project-follower-count"');
    expect(projectPageSource).toContain('api(`/projects/${projectId}/followers`');
    expect(projectPageSource).toContain("api(`/projects/${projectId}/followers/me`, { method: 'DELETE' })");
  });
});
