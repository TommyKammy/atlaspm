import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const repoRoot = path.resolve(__dirname, '..');
const tasksControllerPath = path.join(repoRoot, 'src', 'tasks', 'tasks.controller.ts');
const taskCommentsControllerPath = path.join(repoRoot, 'src', 'tasks', 'task-comments.controller.ts');
const taskCommentsServicePath = path.join(repoRoot, 'src', 'tasks', 'task-comments.service.ts');
const appModulePath = path.join(repoRoot, 'src', 'app.module.ts');

function routeDecoratorPattern(method: string, routePath: string) {
  const escapedRoutePath = routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`@${method}\\s*\\(\\s*['"\`]${escapedRoutePath}['"\`]\\s*\\)`);
}

describe('task comments slice extraction', () => {
  test('moves comment and mention routes out of TasksController into dedicated controller/service wiring', () => {
    const tasksControllerSource = readFileSync(tasksControllerPath, 'utf8');
    const appModuleSource = readFileSync(appModulePath, 'utf8');

    expect(tasksControllerSource).not.toMatch(routeDecoratorPattern('Get', 'tasks/:id/comments'));
    expect(tasksControllerSource).not.toMatch(routeDecoratorPattern('Post', 'tasks/:id/comments'));
    expect(tasksControllerSource).not.toMatch(routeDecoratorPattern('Patch', 'comments/:id'));
    expect(tasksControllerSource).not.toMatch(routeDecoratorPattern('Delete', 'comments/:id'));
    expect(tasksControllerSource).not.toMatch(routeDecoratorPattern('Get', 'tasks/:id/mentions'));

    expect(existsSync(taskCommentsControllerPath)).toBe(true);
    expect(existsSync(taskCommentsServicePath)).toBe(true);

    const taskCommentsControllerSource = readFileSync(taskCommentsControllerPath, 'utf8');
    const taskCommentsServiceSource = readFileSync(taskCommentsServicePath, 'utf8');

    expect(taskCommentsControllerSource).toContain('export class TaskCommentsController');
    expect(taskCommentsControllerSource).toMatch(routeDecoratorPattern('Get', 'tasks/:id/comments'));
    expect(taskCommentsControllerSource).toMatch(routeDecoratorPattern('Post', 'tasks/:id/comments'));
    expect(taskCommentsControllerSource).toMatch(routeDecoratorPattern('Patch', 'comments/:id'));
    expect(taskCommentsControllerSource).toMatch(routeDecoratorPattern('Delete', 'comments/:id'));
    expect(taskCommentsControllerSource).toMatch(routeDecoratorPattern('Get', 'tasks/:id/mentions'));

    expect(taskCommentsServiceSource).toContain('export class TaskCommentsService');

    expect(appModuleSource).toContain('TaskCommentsController');
    expect(appModuleSource).toContain('TaskCommentsService');
  });
});
