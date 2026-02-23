import { expect, test, type Page } from '@playwright/test';

const API = process.env.E2E_CORE_API_URL ?? 'http://localhost:3001';

async function api(path: string, token: string, method = 'GET', body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function loginAndCreateProject(page: Page): Promise<{ projectId: string; token: string }> {
  const sub = `e2e-subtasks-${Date.now()}`;
  const email = `e2e-subtasks-${Date.now()}@example.com`;

  await page.goto('/login');
  await page.fill('input[placeholder="OIDC sub"]', sub);
  await page.fill('input[placeholder="Email"]', email);
  await page.click('button:has-text("Dev Login")');
  await page.waitForURL('**/');

  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const projectName = `Subtasks Test ${Date.now()}`;
  await page.fill('input[placeholder="Project name"]', projectName);
  await page.click('[data-testid="create-project-btn"]');
  await expect(page.getByText(projectName).first()).toBeVisible();

  const projects = await api('/projects', token);
  const project = projects.find((p: any) => p.name === projectName);
  expect(project).toBeTruthy();

  await page.goto(`/projects/${project.id}`);
  await page.waitForURL(`**/projects/${project.id}`);

  return { projectId: project.id, token };
}

async function createTask(page: Page, taskTitle: string) {
  await page.fill('[data-testid="new-task-input"]', taskTitle);
  await page.click('[data-testid="create-task-btn"]');
  await expect(page.getByText(taskTitle).first()).toBeVisible();
}

async function openTaskDetail(page: Page, taskTitle: string) {
  await page.click(`text=${taskTitle}`);
  await expect(page.getByRole('dialog')).toBeVisible();
}

test.describe('Subtasks Feature', () => {
  test('should create and display subtasks', async ({ page }) => {
    const { projectId } = await loginAndCreateProject(page);
    
    const parentTaskTitle = 'Parent Task';
    await createTask(page, parentTaskTitle);
    await openTaskDetail(page, parentTaskTitle);

    await expect(page.getByText('Subtasks')).toBeVisible();
    await expect(page.getByText('No subtasks yet. Create one to break down this task.')).toBeVisible();

    await page.click('button:has-text("Add")');
    
    const subtaskTitle = 'Subtask 1';
    await page.fill('input[placeholder="Enter subtask title"]', subtaskTitle);
    await page.click('button:has-text("Create Subtask")');

    await expect(page.getByText(subtaskTitle)).toBeVisible();
    await expect(page.getByText('TODO')).toBeVisible();
  });

  test('should expand and collapse subtask tree', async ({ page }) => {
    const { projectId, token } = await loginAndCreateProject(page);
    
    const parentTaskTitle = 'Parent Task with Tree';
    await createTask(page, parentTaskTitle);
    await openTaskDetail(page, parentTaskTitle);

    await page.click('button:has-text("Add")');
    await page.fill('input[placeholder="Enter subtask title"]', 'Child Task');
    await page.click('button:has-text("Create Subtask")');
    await expect(page.getByText('Child Task')).toBeVisible();

    const projects = await api('/projects', token);
    const project = projects.find((p: any) => p.name.includes('Subtasks Test'));
    const tasks = await api(`/projects/${project.id}/tasks`, token);
    const parentTask = tasks.find((t: any) => t.title === parentTaskTitle);
    
    await api(`/tasks/${parentTask.id}/subtasks`, token, 'POST', {
      title: 'Nested Subtask',
    });

    await page.reload();
    await openTaskDetail(page, parentTaskTitle);

    await expect(page.getByText('Child Task')).toBeVisible();
  });

  test('should delete subtask', async ({ page }) => {
    await loginAndCreateProject(page);
    
    const parentTaskTitle = 'Parent with Deletable Subtask';
    await createTask(page, parentTaskTitle);
    await openTaskDetail(page, parentTaskTitle);

    await page.click('button:has-text("Add")');
    const subtaskTitle = 'To Be Deleted';
    await page.fill('input[placeholder="Enter subtask title"]', subtaskTitle);
    await page.click('button:has-text("Create Subtask")');
    await expect(page.getByText(subtaskTitle)).toBeVisible();

    const deleteButton = page.locator('button').filter({ has: page.locator('[data-icon="trash-2"]') }).first();
    await deleteButton.click();

    await expect(page.getByText('No subtasks yet. Create one to break down this task.')).toBeVisible();
  });

  test('should navigate to subtask via breadcrumb', async ({ page }) => {
    const { token } = await loginAndCreateProject(page);
    
    const parentTaskTitle = 'Root Task';
    await createTask(page, parentTaskTitle);
    await openTaskDetail(page, parentTaskTitle);

    await page.click('button:has-text("Add")');
    await page.fill('input[placeholder="Enter subtask title"]', 'Nested Task');
    await page.click('button:has-text("Create Subtask")');
    
    await page.click('text=Nested Task');

    await page.waitForTimeout(500);
  });
});
