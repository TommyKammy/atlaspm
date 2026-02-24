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

async function createTaskViaAPI(token: string, projectId: string, title: string): Promise<string> {
  const sections = await api(`/projects/${projectId}/sections`, token);
  const defaultSection = sections[0];
  const task = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    title,
    sectionId: defaultSection.id,
  });
  return task.id;
}

async function openTaskDetail(page: Page, taskTitle: string) {
  await page.click(`text=${taskTitle}`);
  await expect(page.getByRole('dialog')).toBeVisible();
}

function subtasksSection(page: Page) {
  const heading = page.getByRole('dialog').getByRole('heading', { name: 'Subtasks' });
  return heading.locator('xpath=ancestor::div[contains(@class,"space-y-3")][1]');
}

async function openSubtaskDialog(page: Page) {
  const section = subtasksSection(page);
  await section.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('dialog', { name: 'Create Subtask' })).toBeVisible();
}

async function expandSubtaskNode(page: Page, title: string) {
  const section = subtasksSection(page);
  const toggleButton = section.locator('div.group').filter({ hasText: title }).first().locator('button').first();
  await expect(toggleButton).toBeVisible();
  await toggleButton.click();
}

test.describe('Subtasks Feature', () => {
  test('should create and display subtasks', async ({ page }) => {
    const { projectId, token } = await loginAndCreateProject(page);
    
    const parentTaskTitle = 'Parent Task';
    await createTaskViaAPI(token, projectId, parentTaskTitle);
    await page.goto(`/projects/${projectId}`);
    await openTaskDetail(page, parentTaskTitle);

    const section = subtasksSection(page);
    await expect(section.getByRole('heading', { name: 'Subtasks' })).toBeVisible();
    await expect(section.getByText('No subtasks yet. Create one to break down this task.')).toBeVisible();

    await openSubtaskDialog(page);
    
    const subtaskTitle = 'Subtask 1';
    await page.fill('input[placeholder="Enter subtask title"]', subtaskTitle);
    await page.click('button:has-text("Create Subtask")');

    const subtaskRow = section.locator('div.group').filter({ hasText: subtaskTitle }).first();
    await expect(subtaskRow).toBeVisible();
    await expect(subtaskRow.getByText('TODO')).toBeVisible();
  });

  test('should expand and collapse subtask tree', async ({ page }) => {
    const { projectId, token } = await loginAndCreateProject(page);
    
    const parentTaskTitle = 'Parent Task with Tree';
    const parentTaskId = await createTaskViaAPI(token, projectId, parentTaskTitle);
    await page.goto(`/projects/${projectId}`);
    await openTaskDetail(page, parentTaskTitle);

    const childTaskTitle = 'Child Task';
    await openSubtaskDialog(page);
    await page.fill('input[placeholder="Enter subtask title"]', childTaskTitle);
    await page.click('button:has-text("Create Subtask")');
    await expect(subtasksSection(page).locator('div.group').filter({ hasText: childTaskTitle }).first()).toBeVisible();
    const childTask = (await api(`/tasks/${parentTaskId}/subtasks`, token)).find((task: any) => task.title === childTaskTitle);
    expect(childTask?.id).toBeTruthy();
    await api(`/tasks/${childTask.id}/subtasks`, token, 'POST', {
      title: 'Nested Subtask',
    });

    await page.reload();
    await openTaskDetail(page, parentTaskTitle);
    await expect(subtasksSection(page).locator('div.group').filter({ hasText: childTaskTitle }).first()).toBeVisible();
    await expect(subtasksSection(page).locator('div.group').filter({ hasText: 'Nested Subtask' }).first()).not.toBeVisible();
    await expandSubtaskNode(page, childTaskTitle);
    await expect(subtasksSection(page).locator('div.group').filter({ hasText: 'Nested Subtask' }).first()).toBeVisible();
  });

  test('should delete subtask', async ({ page }) => {
    const { projectId, token } = await loginAndCreateProject(page);
    
    const parentTaskTitle = 'Parent with Deletable Subtask';
    await createTaskViaAPI(token, projectId, parentTaskTitle);
    await page.goto(`/projects/${projectId}`);
    await openTaskDetail(page, parentTaskTitle);

    await openSubtaskDialog(page);
    const subtaskTitle = 'To Be Deleted';
    await page.fill('input[placeholder="Enter subtask title"]', subtaskTitle);
    await page.click('button:has-text("Create Subtask")');
    const section = subtasksSection(page);
    await expect(section.locator('div.group').filter({ hasText: subtaskTitle }).first()).toBeVisible();

    const subtaskRow = section.locator('div.group').filter({ hasText: subtaskTitle }).first();
    await subtaskRow.hover();
    await subtaskRow.locator('button').last().click({ force: true });
    await expect(subtaskRow).not.toBeVisible();
    await expect(section.getByText('No subtasks yet. Create one to break down this task.')).toBeVisible();
  });

  test('should navigate to subtask via breadcrumb', async ({ page }) => {
    const { projectId, token } = await loginAndCreateProject(page);
    
    const parentTaskTitle = 'Root Task';
    const parentTaskId = await createTaskViaAPI(token, projectId, parentTaskTitle);
    await page.goto(`/projects/${projectId}`);
    await openTaskDetail(page, parentTaskTitle);

    await openSubtaskDialog(page);
    await page.fill('input[placeholder="Enter subtask title"]', 'Nested Task');
    await page.click('button:has-text("Create Subtask")');
    const nestedTaskRow = subtasksSection(page).locator('div.group').filter({ hasText: 'Nested Task' }).first();
    await expect(nestedTaskRow).toBeVisible();
    const nestedTask = (await api(`/tasks/${parentTaskId}/subtasks`, token))
      .find((task: any) => task.title === 'Nested Task');
    expect(nestedTask?.id).toBeTruthy();

    await nestedTaskRow.click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}\\?task=${nestedTask.id}`));
  });
});
