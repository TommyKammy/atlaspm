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
  const sub = `e2e-deps-${Date.now()}`;
  const email = `e2e-deps-${Date.now()}@example.com`;

  await page.goto('/login');
  await page.fill('input[placeholder="OIDC sub"]', sub);
  await page.fill('input[placeholder="Email"]', email);
  await page.click('button:has-text("Dev Login")');
  await page.waitForURL('**/');

  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const projectName = `Dependencies Test ${Date.now()}`;
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

async function openDependencyDialog(page: Page) {
  await expect(page.getByTestId('dependencies-heading')).toBeVisible();
  await page.getByTestId('dependencies-add-btn').click();
}

test.describe('Task Dependencies Feature', () => {
  test('should display empty dependency state', async ({ page }) => {
    const { projectId, token } = await loginAndCreateProject(page);
    
    const taskId = await createTaskViaAPI(token, projectId, 'Task Without Dependencies');
    await page.goto(`/projects/${projectId}`);
    await openTaskDetail(page, 'Task Without Dependencies');

    await expect(page.getByTestId('dependencies-heading')).toBeVisible();
    await expect(page.getByTestId('dependencies-empty')).toBeVisible();
  });

  test('should add BLOCKS dependency', async ({ page }) => {
    const { projectId, token } = await loginAndCreateProject(page);
    
    const blockerId = await createTaskViaAPI(token, projectId, 'Blocker Task');
    const blockedId = await createTaskViaAPI(token, projectId, 'Blocked Task');

    await api(`/tasks/${blockedId}/dependencies`, token, 'POST', {
      dependsOnId: blockerId,
      type: 'BLOCKS',
    });

    await page.goto(`/projects/${projectId}`);
    await openTaskDetail(page, 'Blocked Task');
    await expect(page.getByText(/Blocks|Blocked by/).first()).toBeVisible();
  });

  test('should display blocked task warning', async ({ page }) => {
    const { projectId, token } = await loginAndCreateProject(page);
    
    const blockerId = await createTaskViaAPI(token, projectId, 'Incomplete Blocker');
    const blockedId = await createTaskViaAPI(token, projectId, 'Task That Is Blocked');
    
    await api(`/tasks/${blockedId}/dependencies`, token, 'POST', {
      dependsOnId: blockerId,
      type: 'BLOCKED_BY',
    });

    await page.goto(`/projects/${projectId}`);
    await openTaskDetail(page, 'Task That Is Blocked');

    await expect(page.getByText('This task is blocked')).toBeVisible();
    await expect(page.getByText('1 blocking task must be completed first.')).toBeVisible();
  });

  test('should remove dependency', async ({ page }) => {
    const { projectId, token } = await loginAndCreateProject(page);
    
    const task1Id = await createTaskViaAPI(token, projectId, 'Task A');
    const task2Id = await createTaskViaAPI(token, projectId, 'Task B');
    
    await api(`/tasks/${task2Id}/dependencies`, token, 'POST', {
      dependsOnId: task1Id,
      type: 'RELATES_TO',
    });

    await page.goto(`/projects/${projectId}`);
    await openTaskDetail(page, 'Task B');

    await expect(page.getByText('Relates to')).toBeVisible();

    const deleteButton = page.locator('[data-testid^="dependency-delete-"]').first();
    await deleteButton.dispatchEvent('click');

    await expect(page.getByTestId('dependencies-empty')).toBeVisible();
  });

  test('should prevent circular dependency via API', async ({ page }) => {
    const { projectId, token } = await loginAndCreateProject(page);
    
    const taskAId = await createTaskViaAPI(token, projectId, 'Task A - Cycle Test');
    const taskBId = await createTaskViaAPI(token, projectId, 'Task B - Cycle Test');
    const taskCId = await createTaskViaAPI(token, projectId, 'Task C - Cycle Test');
    
    await api(`/tasks/${taskBId}/dependencies`, token, 'POST', {
      dependsOnId: taskAId,
      type: 'BLOCKED_BY',
    });
    
    await api(`/tasks/${taskCId}/dependencies`, token, 'POST', {
      dependsOnId: taskBId,
      type: 'BLOCKED_BY',
    });

    try {
      await api(`/tasks/${taskAId}/dependencies`, token, 'POST', {
        dependsOnId: taskCId,
        type: 'BLOCKED_BY',
      });
      expect(false).toBe(true);
    } catch (error: any) {
      expect(error.message).toContain('409');
    }
  });

  test('should display dependency count badge', async ({ page }) => {
    const { projectId, token } = await loginAndCreateProject(page);
    
    const taskId = await createTaskViaAPI(token, projectId, 'Task With Multiple Dependencies');
    const dep1Id = await createTaskViaAPI(token, projectId, 'Dependency 1');
    const dep2Id = await createTaskViaAPI(token, projectId, 'Dependency 2');
    
    await api(`/tasks/${taskId}/dependencies`, token, 'POST', {
      dependsOnId: dep1Id,
      type: 'RELATES_TO',
    });
    await api(`/tasks/${taskId}/dependencies`, token, 'POST', {
      dependsOnId: dep2Id,
      type: 'BLOCKS',
    });

    await page.goto(`/projects/${projectId}`);
    await openTaskDetail(page, 'Task With Multiple Dependencies');

    await expect(page.getByTestId('dependencies-count')).toHaveText('2');
  });
});
