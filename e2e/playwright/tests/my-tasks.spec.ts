import { expect, test, type Page } from '@playwright/test';

const API = process.env.E2E_CORE_API_URL ?? 'http://localhost:3001';

async function devLogin(page: Page, sub: string, email: string) {
  await page.goto('/login');
  await page.fill('input[placeholder="OIDC sub"]', sub);
  await page.fill('input[placeholder="Email"]', email);
  await page.click('button:has-text("Dev Login")');
  await page.waitForURL('**/');
}

async function getToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token'));
  if (!token) throw new Error('Missing atlaspm token');
  return token;
}

async function api(path: string, token: string, method = 'GET', body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

test('my tasks view shows assigned tasks and supports completion + detail open', async ({ page }) => {
  const stamp = Date.now();
  const sub = `e2e-my-tasks-${stamp}`;
  await devLogin(page, sub, `e2e-my-tasks-${stamp}@example.com`);
  const token = await getToken(page);

  const workspaces = (await api('/workspaces', token)) as Array<{ id: string }>;
  const workspaceId = workspaces[0]?.id;
  if (!workspaceId) throw new Error('Workspace not found');

  const project = (await api('/projects', token, 'POST', {
    workspaceId,
    name: `My Tasks Project ${stamp}`,
  })) as { id: string };

  const assignedTask = (await api(`/projects/${project.id}/tasks`, token, 'POST', {
    title: `Assigned Task ${stamp}`,
    assigneeUserId: sub,
  })) as { id: string; version: number };

  await api(`/projects/${project.id}/tasks`, token, 'POST', {
    title: `Other Task ${stamp}`,
  });

  await page.goto('/my-tasks');
  await expect(page.locator('[data-testid="my-tasks-page"]')).toBeVisible();
  await expect(page.locator(`[data-testid="my-task-row-${assignedTask.id}"]`)).toBeVisible();
  await expect(page.getByText(`Other Task ${stamp}`)).toHaveCount(0);

  await page.click(`[data-testid="my-task-complete-${assignedTask.id}"]`);
  await expect
    .poll(async () => {
      const tasks = (await api(`/projects/${project.id}/tasks?assignee=${encodeURIComponent(sub)}`, token)) as Array<{
        id: string;
        status: string;
      }>;
      return tasks.find((task) => task.id === assignedTask.id)?.status;
    })
    .toBe('DONE');

  await page.click(`[data-testid="my-task-open-${assignedTask.id}"]`);
  await expect(page.locator('[data-testid="task-detail-title-input"]')).toBeVisible();
  await page.click('button[aria-label="Close task detail"]');
  await expect(page.locator('[data-testid="task-detail-title-input"]')).toHaveCount(0);

  await page.reload();
  await expect(page.locator(`[data-testid="my-task-row-${assignedTask.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-testid="my-task-row-${assignedTask.id}"]`)).toContainText('Done');
});

