import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

function readSource(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('frontend contract boundaries', () => {
  test('project and task project link queries live in feature api modules instead of the api helper', () => {
    const apiSource = readSource('./api.ts');
    const projectsSource = readSource('./api/projects.ts');
    const taskProjectLinksSource = readSource('./api/task-project-links.ts');
    const typesSource = readSource('./types.ts');

    expect(apiSource).not.toContain('export function useProjects(');
    expect(apiSource).not.toContain('export function useTaskProjectLinks(');
    expect(apiSource).not.toContain('addTaskToProject(');

    expect(projectsSource).toContain("from '@atlaspm/shared-types'");
    expect(taskProjectLinksSource).toContain("from '@atlaspm/shared-types'");
    expect(taskProjectLinksSource).not.toContain('type TaskProjectLinkResponse = {');

    expect(typesSource).toContain("from '@atlaspm/shared-types'");
    expect(typesSource).not.toContain('export type TaskProjectLink = {');
  });

  test('workload api uses shared response contracts instead of redefining them locally', () => {
    const workloadSource = readSource('./api/workload.ts');

    expect(workloadSource).toContain("from '@atlaspm/shared-types'");
    expect(workloadSource).not.toContain('export interface WeeklyLoad {');
    expect(workloadSource).not.toContain('export interface OverloadAlert {');
    expect(workloadSource).not.toContain('export interface UserWorkload {');
  });
});
