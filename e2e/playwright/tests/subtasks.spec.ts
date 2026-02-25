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
  await page.locator(`[data-task-title="${taskTitle}"] [data-testid^="open-task-"]`).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

function subtasksSection(page: Page) {
  return page.getByTestId('subtasks-section');
}

async function openSubtaskDialog(page: Page) {
  const section = subtasksSection(page);
  const addButton = section.getByTestId('subtasks-add-btn');
  await addButton.scrollIntoViewIfNeeded();
  await addButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
  await expect(page.getByRole('dialog', { name: 'Create Subtask' })).toBeVisible();
}

async function expandSubtaskNode(page: Page, title: string) {
  const section = subtasksSection(page);
  const row = section.locator('[data-testid^="subtask-row-"]').filter({ hasText: title }).first();
  const toggleButton = row.locator('[data-testid^="subtask-toggle-"]').first();
  await expect(toggleButton).toBeVisible();
  await toggleButton.scrollIntoViewIfNeeded();
  await toggleButton.evaluate((element) => {
    (element as HTMLButtonElement).click();
  });
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
    await page.getByTestId('create-subtask-title').fill(subtaskTitle);
    await page.getByTestId('create-subtask-submit').click();

    const subtaskRow = section.locator('[data-testid^="subtask-row-"]').filter({ hasText: subtaskTitle }).first();
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
    await page.getByTestId('create-subtask-title').fill(childTaskTitle);
    await page.getByTestId('create-subtask-submit').click();
    await expect(subtasksSection(page).locator('[data-testid^="subtask-row-"]').filter({ hasText: childTaskTitle }).first()).toBeVisible();
    const childTask = (await api(`/tasks/${parentTaskId}/subtasks`, token)).find((task: any) => task.title === childTaskTitle);
    expect(childTask?.id).toBeTruthy();
    await api(`/tasks/${childTask.id}/subtasks`, token, 'POST', {
      title: 'Nested Subtask',
    });

    await page.reload();
    await openTaskDetail(page, parentTaskTitle);
    await expect(subtasksSection(page).locator('[data-testid^="subtask-row-"]').filter({ hasText: childTaskTitle }).first()).toBeVisible();
    await expect(subtasksSection(page).locator('[data-testid^="subtask-row-"]').filter({ hasText: 'Nested Subtask' }).first()).not.toBeVisible();
    await expandSubtaskNode(page, childTaskTitle);
    await expect(subtasksSection(page).locator('[data-testid^="subtask-row-"]').filter({ hasText: 'Nested Subtask' }).first()).toBeVisible();
  });

  test('should delete subtask', async ({ page }) => {
    const { projectId, token } = await loginAndCreateProject(page);
    
    const parentTaskTitle = 'Parent with Deletable Subtask';
    await createTaskViaAPI(token, projectId, parentTaskTitle);
    await page.goto(`/projects/${projectId}`);
    await openTaskDetail(page, parentTaskTitle);

    await openSubtaskDialog(page);
    const subtaskTitle = 'To Be Deleted';
    await page.getByTestId('create-subtask-title').fill(subtaskTitle);
    await page.getByTestId('create-subtask-submit').click();
    const section = subtasksSection(page);
    await expect(section.locator('[data-testid^="subtask-row-"]').filter({ hasText: subtaskTitle }).first()).toBeVisible();

    const subtaskRow = section.locator('[data-testid^="subtask-row-"]').filter({ hasText: subtaskTitle }).first();
    const deleteButton = subtaskRow.locator('[data-testid^="subtask-delete-"]').first();
    await deleteButton.scrollIntoViewIfNeeded();
    await deleteButton.evaluate((element) => {
      (element as HTMLButtonElement).click();
    });
    await expect(subtaskRow).not.toBeVisible();
    await expect(section.getByTestId('subtasks-empty')).toBeVisible();
  });

  test('should navigate to subtask via breadcrumb', async ({ page }) => {
    const { projectId, token } = await loginAndCreateProject(page);
    
    const parentTaskTitle = 'Root Task';
    const parentTaskId = await createTaskViaAPI(token, projectId, parentTaskTitle);
    await page.goto(`/projects/${projectId}`);
    await openTaskDetail(page, parentTaskTitle);

    await openSubtaskDialog(page);
    await page.getByTestId('create-subtask-title').fill('Nested Task');
    await page.getByTestId('create-subtask-submit').click();
    const nestedTaskRow = subtasksSection(page).locator('[data-testid^="subtask-row-"]').filter({ hasText: 'Nested Task' }).first();
    await expect(nestedTaskRow).toBeVisible();
    const nestedTask = (await api(`/tasks/${parentTaskId}/subtasks`, token))
      .find((task: any) => task.title === 'Nested Task');
    expect(nestedTask?.id).toBeTruthy();

    await nestedTaskRow.scrollIntoViewIfNeeded();
    await nestedTaskRow.evaluate((element) => {
      (element as HTMLElement).click();
    });
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}\\?task=${nestedTask.id}`));
  });
});
