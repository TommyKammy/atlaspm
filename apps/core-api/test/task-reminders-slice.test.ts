import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const repoRoot = path.resolve(__dirname, '..');
const tasksControllerPath = path.join(repoRoot, 'src', 'tasks', 'tasks.controller.ts');
const taskRemindersControllerPath = path.join(repoRoot, 'src', 'tasks', 'task-reminders.controller.ts');
const taskRemindersServicePath = path.join(repoRoot, 'src', 'tasks', 'task-reminders.service.ts');
const appModulePath = path.join(repoRoot, 'src', 'app.module.ts');

function routeDecoratorPattern(method: string, routePath: string) {
  const escapedRoutePath = routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`@${method}\\s*\\(\\s*['"\`]${escapedRoutePath}['"\`]\\s*\\)`);
}

describe('task reminders slice extraction', () => {
  test('moves reminder routes out of TasksController into dedicated controller/service wiring', () => {
    const tasksControllerSource = readFileSync(tasksControllerPath, 'utf8');
    const appModuleSource = readFileSync(appModulePath, 'utf8');

    expect(tasksControllerSource).not.toMatch(routeDecoratorPattern('Get', 'tasks/:id/reminder'));
    expect(tasksControllerSource).not.toMatch(routeDecoratorPattern('Put', 'tasks/:id/reminder'));
    expect(tasksControllerSource).not.toMatch(routeDecoratorPattern('Delete', 'tasks/:id/reminder'));

    expect(existsSync(taskRemindersControllerPath)).toBe(true);
    expect(existsSync(taskRemindersServicePath)).toBe(true);

    const taskRemindersControllerSource = readFileSync(taskRemindersControllerPath, 'utf8');
    const taskRemindersServiceSource = readFileSync(taskRemindersServicePath, 'utf8');

    expect(taskRemindersControllerSource).toContain('export class TaskRemindersController');
    expect(taskRemindersControllerSource).toMatch(routeDecoratorPattern('Get', 'tasks/:id/reminder'));
    expect(taskRemindersControllerSource).toMatch(routeDecoratorPattern('Put', 'tasks/:id/reminder'));
    expect(taskRemindersControllerSource).toMatch(routeDecoratorPattern('Delete', 'tasks/:id/reminder'));

    expect(taskRemindersServiceSource).toContain('export class TaskRemindersService');

    expect(appModuleSource).toContain('TaskRemindersController');
    expect(appModuleSource).toContain('TaskRemindersService');
  });
});
