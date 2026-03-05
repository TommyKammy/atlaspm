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

function dayIso(deltaDays: number) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString();
}

test('gantt shows baseline bars and delay deltas', async ({ page }) => {
  const now = Date.now();
  const sub = `e2e-gantt-baseline-${now}`;
  const email = `${sub}@example.com`;

  await page.goto('/login');
  await page.fill('input[placeholder="OIDC sub"]', sub);
  await page.fill('input[placeholder="Email"]', email);
  await page.click('button:has-text("Dev Login")');
  await page.waitForURL('**/');

  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Gantt Baseline ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', { name: 'Baseline Section' });

  const delayedTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Delayed Task ${now}`,
    startAt: dayIso(1),
    dueAt: dayIso(6),
    baselineStartAt: dayIso(1),
    baselineDueAt: dayIso(4),
  });

  await page.goto(`/projects/${projectId}?view=gantt`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();

  await expect(page.locator(`[data-testid="gantt-baseline-${delayedTask.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-testid="gantt-variance-${delayedTask.id}"]`)).toHaveText('+2d');
  await expect(page.locator('[data-testid="gantt-delayed-count"]')).toHaveText('1');
});
