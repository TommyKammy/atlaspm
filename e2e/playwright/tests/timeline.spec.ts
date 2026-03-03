import { expect, test } from '@playwright/test';

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

test('timeline tab flow: bars render, detail opens, zoom/window persists', async ({ page }) => {
  const now = Date.now();
  const sub = `e2e-timeline-user-${now}`;
  const email = `e2e-timeline-user-${now}@example.com`;

  await page.goto('/login');
  await page.evaluate(() => localStorage.setItem('atlaspm:feature:timeline', 'enabled'));
  await page.fill('input[placeholder="OIDC sub"]', sub);
  await page.fill('input[placeholder="Email"]', email);
  await page.click('button:has-text("Dev Login")');
  await page.waitForURL('**/');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('atlaspm:feature:timeline'))).toBe('enabled');
  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Timeline E2E ${now}`,
  });
  const projectId = project.id as string;

  const section = await api(`/projects/${projectId}/sections`, token, 'POST', { name: 'Timeline Section' });

  const start = new Date();
  start.setDate(start.getDate() - 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 3);

  const taskA = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Timeline Task A ${now}`,
    startAt: start.toISOString(),
    dueAt: end.toISOString(),
  });
  const taskB = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Timeline Task B ${now}`,
    startAt: end.toISOString(),
    dueAt: new Date(end.getTime() + (2 * 24 * 60 * 60 * 1000)).toISOString(),
  });

  await page.goto(`/projects/${projectId}`);
  await page.reload();
  await expect(page.locator('[data-testid="project-view-timeline"]')).toBeVisible();

  await page.click('[data-testid="project-view-timeline"]');
  await expect(page).toHaveURL(/\/projects\/.*\?view=timeline/);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();

  await expect(page.locator(`[data-testid="timeline-bar-${taskA.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-testid="timeline-bar-${taskB.id}"]`)).toBeVisible();

  await page.click(`[data-testid="timeline-bar-${taskA.id}"]`);
  await expect(page.locator('[data-testid="task-detail-title-input"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="task-detail-title-input"]')).toHaveCount(0);

  await page.click('[data-testid="timeline-zoom-month"]');
  await expect(page.locator('[data-testid="timeline-zoom-month"]')).toHaveAttribute('data-active', 'true');
  await page.click('[data-testid="timeline-next-window"]');
  const windowLabel = await page.locator('[data-testid="timeline-window-label"]').textContent();

  await page.reload();
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-zoom-month"]')).toHaveAttribute('data-active', 'true');
  await expect(page.locator('[data-testid="timeline-window-label"]')).toHaveText(windowLabel ?? '');
});
