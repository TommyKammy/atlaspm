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

test('workload page renders and supports view switching', async ({ page }) => {
  const stamp = Date.now();
  const sub = `e2e-workload-${stamp}`;
  await devLogin(page, sub, `e2e-workload-${stamp}@example.com`);
  const token = await getToken(page);

  const workspaces = (await api('/workspaces', token)) as Array<{ id: string }>;
  const workspaceId = workspaces[0]?.id;
  if (!workspaceId) throw new Error('Workspace not found');

  const project = (await api('/projects', token, 'POST', {
    workspaceId,
    name: `Workload Project ${stamp}`,
  })) as { id: string };

  await api(`/projects/${project.id}/tasks`, token, 'POST', {
    title: `Workload Task ${stamp}`,
    assigneeUserId: sub,
    dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  });

  await page.goto(`/workspaces/${workspaceId}/workload`);
  await expect(page.locator('h1:has-text("Workload Management")')).toBeVisible();
  await expect(page.locator('text=Team View')).toBeVisible();
  await expect(page.locator(`text=e2e-workload-${stamp}@example.com`)).toBeVisible();

  await page.click('text=Project View');
  const projectPicker = page.getByRole('button', { name: 'Select a project' });
  await expect(projectPicker).toBeVisible();
  await projectPicker.click();
  await page.getByRole('button', { name: `Workload Project ${stamp}` }).click();

  await expect(page.locator(`text=Workload Task ${stamp}`)).toBeVisible();
  await expect(page.locator('text=total tasks')).toBeVisible();
});
