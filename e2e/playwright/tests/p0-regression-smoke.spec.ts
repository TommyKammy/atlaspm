import { expect, test, type Page } from '@playwright/test';

const API = process.env.E2E_CORE_API_URL ?? 'http://localhost:3001';

async function api(path: string, token: string, method = 'GET', body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const raw = await res.text();
  return raw ? JSON.parse(raw) : null;
}

async function login(page: Page) {
  const suffix = Date.now();
  await page.goto('/login');
  await page.fill('input[placeholder="OIDC sub"]', `e2e-p0-${suffix}`);
  await page.fill('input[placeholder="Email"]', `e2e-p0-${suffix}@example.com`);
  await page.click('button:has-text("Dev Login")');
  await page.waitForURL('**/');
  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();
  return token;
}

test('P0 smoke: list/detail remains stable after date/dependency hardening', async ({ page }) => {
  const token = await login(page);
  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;

  const projectName = `P0 Smoke ${Date.now()}`;
  const project = await api('/projects', token, 'POST', { workspaceId, name: projectName });
  const projectId = project.id as string;

  const sections = await api(`/projects/${projectId}/sections`, token);
  const defaultSection = sections.find((section: any) => section.isDefault) ?? sections[0];
  const task = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    title: 'Regression Task',
    sectionId: defaultSection.id,
  });

  const blockingTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    title: 'Blocking Task',
    sectionId: defaultSection.id,
  });
  await api(`/tasks/${task.id}/dependencies`, token, 'POST', {
    dependsOnId: blockingTask.id,
    type: 'BLOCKED_BY',
  });

  await page.goto(`/projects/${projectId}`);
  await expect(page.locator('[data-task-title="Regression Task"]')).toBeVisible();

  await page.locator(`[data-testid="open-task-${task.id}"]`).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByTestId('task-detail-title-input')).toHaveValue('Regression Task');
  await expect(page.getByTestId('task-detail-tab-details')).toBeVisible();
  await expect(page.getByTestId('task-detail-tab-comments')).toBeVisible();
  await expect(page.getByTestId('task-detail-tab-activity')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-task-title="Regression Task"]')).toBeVisible();
});
