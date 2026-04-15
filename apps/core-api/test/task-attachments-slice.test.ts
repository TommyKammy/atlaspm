import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const repoRoot = path.resolve(__dirname, '..');
const tasksControllerPath = path.join(repoRoot, 'src', 'tasks', 'tasks.controller.ts');
const taskAttachmentsControllerPath = path.join(repoRoot, 'src', 'tasks', 'task-attachments.controller.ts');
const taskAttachmentsServicePath = path.join(repoRoot, 'src', 'tasks', 'task-attachments.service.ts');
const appModulePath = path.join(repoRoot, 'src', 'app.module.ts');

function routeDecoratorPattern(method: string, routePath: string) {
  const escapedRoutePath = routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`@${method}\\s*\\(\\s*['"\`]${escapedRoutePath}['"\`]\\s*\\)`);
}

describe('task attachments slice extraction', () => {
  test('moves attachment routes out of TasksController into dedicated controller/service wiring', () => {
    const tasksControllerSource = readFileSync(tasksControllerPath, 'utf8');
    const appModuleSource = readFileSync(appModulePath, 'utf8');

    expect(tasksControllerSource).not.toMatch(routeDecoratorPattern('Get', 'tasks/:id/attachments'));
    expect(tasksControllerSource).not.toMatch(routeDecoratorPattern('Post', 'tasks/:id/attachments/initiate'));
    expect(tasksControllerSource).not.toMatch(routeDecoratorPattern('Post', 'attachments/:id/upload'));
    expect(tasksControllerSource).not.toMatch(routeDecoratorPattern('Post', 'tasks/:id/attachments/complete'));
    expect(tasksControllerSource).not.toMatch(routeDecoratorPattern('Delete', 'attachments/:id'));
    expect(tasksControllerSource).not.toMatch(routeDecoratorPattern('Post', 'attachments/:id/restore'));

    expect(existsSync(taskAttachmentsControllerPath)).toBe(true);
    expect(existsSync(taskAttachmentsServicePath)).toBe(true);

    const taskAttachmentsControllerSource = readFileSync(taskAttachmentsControllerPath, 'utf8');
    const taskAttachmentsServiceSource = readFileSync(taskAttachmentsServicePath, 'utf8');

    expect(taskAttachmentsControllerSource).toContain('export class TaskAttachmentsController');
    expect(taskAttachmentsControllerSource).toMatch(routeDecoratorPattern('Get', 'tasks/:id/attachments'));
    expect(taskAttachmentsControllerSource).toMatch(routeDecoratorPattern('Post', 'tasks/:id/attachments/initiate'));
    expect(taskAttachmentsControllerSource).toMatch(routeDecoratorPattern('Post', 'attachments/:id/upload'));
    expect(taskAttachmentsControllerSource).toMatch(routeDecoratorPattern('Post', 'tasks/:id/attachments/complete'));
    expect(taskAttachmentsControllerSource).toMatch(routeDecoratorPattern('Delete', 'attachments/:id'));
    expect(taskAttachmentsControllerSource).toMatch(routeDecoratorPattern('Post', 'attachments/:id/restore'));

    expect(taskAttachmentsServiceSource).toContain('export class TaskAttachmentsService');

    expect(appModuleSource).toContain('TaskAttachmentsController');
    expect(appModuleSource).toContain('TaskAttachmentsService');
  });
});
