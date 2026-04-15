import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const repoRoot = path.resolve(__dirname, '..');
const tasksControllerPath = path.join(repoRoot, 'src', 'tasks', 'tasks.controller.ts');
const taskDependenciesControllerPath = path.join(repoRoot, 'src', 'tasks', 'task-dependencies.controller.ts');
const appModulePath = path.join(repoRoot, 'src', 'app.module.ts');

function routeDecoratorPattern(method: string, routePath: string) {
  const escapedRoutePath = routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`@${method}\\s*\\(\\s*['"\`]${escapedRoutePath}['"\`]\\s*\\)`);
}

describe('task dependencies slice extraction', () => {
  test('moves dependency and subtask routes out of TasksController into dedicated controller wiring', () => {
    const tasksControllerSource = readFileSync(tasksControllerPath, 'utf8');
    const appModuleSource = readFileSync(appModulePath, 'utf8');

    expect(tasksControllerSource).not.toMatch(routeDecoratorPattern('Post', 'tasks/:id/subtasks'));
    expect(tasksControllerSource).not.toMatch(routeDecoratorPattern('Get', 'tasks/:id/subtasks'));
    expect(tasksControllerSource).not.toMatch(routeDecoratorPattern('Get', 'tasks/:id/subtasks/tree'));
    expect(tasksControllerSource).not.toMatch(routeDecoratorPattern('Get', 'tasks/:id/breadcrumbs'));
    expect(tasksControllerSource).not.toMatch(routeDecoratorPattern('Post', 'tasks/:id/dependencies'));
    expect(tasksControllerSource).not.toMatch(routeDecoratorPattern('Delete', 'tasks/:id/dependencies/:dependsOnId'));
    expect(tasksControllerSource).not.toMatch(routeDecoratorPattern('Get', 'tasks/:id/dependencies'));
    expect(tasksControllerSource).not.toMatch(routeDecoratorPattern('Get', 'tasks/:id/dependents'));
    expect(tasksControllerSource).not.toMatch(routeDecoratorPattern('Get', 'tasks/:id/blocked'));
    expect(tasksControllerSource).not.toMatch(routeDecoratorPattern('Get', 'projects/:id/dependency-graph'));

    expect(existsSync(taskDependenciesControllerPath)).toBe(true);

    const taskDependenciesControllerSource = readFileSync(taskDependenciesControllerPath, 'utf8');

    expect(taskDependenciesControllerSource).toContain('export class TaskDependenciesController');
    expect(taskDependenciesControllerSource).toMatch(routeDecoratorPattern('Post', 'tasks/:id/subtasks'));
    expect(taskDependenciesControllerSource).toMatch(routeDecoratorPattern('Get', 'tasks/:id/subtasks'));
    expect(taskDependenciesControllerSource).toMatch(routeDecoratorPattern('Get', 'tasks/:id/subtasks/tree'));
    expect(taskDependenciesControllerSource).toMatch(routeDecoratorPattern('Get', 'tasks/:id/breadcrumbs'));
    expect(taskDependenciesControllerSource).toMatch(routeDecoratorPattern('Post', 'tasks/:id/dependencies'));
    expect(taskDependenciesControllerSource).toMatch(routeDecoratorPattern('Delete', 'tasks/:id/dependencies/:dependsOnId'));
    expect(taskDependenciesControllerSource).toMatch(routeDecoratorPattern('Get', 'tasks/:id/dependencies'));
    expect(taskDependenciesControllerSource).toMatch(routeDecoratorPattern('Get', 'tasks/:id/dependents'));
    expect(taskDependenciesControllerSource).toMatch(routeDecoratorPattern('Get', 'tasks/:id/blocked'));
    expect(taskDependenciesControllerSource).toMatch(routeDecoratorPattern('Get', 'projects/:id/dependency-graph'));

    expect(appModuleSource).toContain('TaskDependenciesController');
  });
});
