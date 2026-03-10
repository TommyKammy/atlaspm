import { expect, test } from './helpers/browser-auth';

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

test('timeline and gantt routes are both supported and keep URL state', async ({ page }) => {
  const now = Date.now();
  await page.goto('/login');
  await page.fill('input[placeholder="OIDC sub"]', `e2e-timeline-${now}`);
  await page.fill('input[placeholder="Email"]', `e2e-timeline-${now}@example.com`);
  await page.click('button:has-text("Dev Login")');
  await page.waitForURL('**/');

  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Timeline Route Gate ${now}`,
  });
  const projectId = project.id as string;

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}.*view=timeline`));
  await expect(page.locator('[data-testid="project-view-timeline"]')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();

  await page.click('[data-testid="project-view-gantt"]');
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}.*view=gantt`));
  await expect(page.locator('[data-testid="project-view-gantt"]')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();

  await page.click('[data-testid="project-view-timeline"]');
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}.*view=timeline`));
});
