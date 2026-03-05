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
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + deltaDays);
  return date.toISOString();
}

test('gantt highlights dependency risk and supports strict/risk-only controls', async ({ page }) => {
  const now = Date.now();
  const sub = `e2e-gantt-risk-${now}`;
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
    name: `Gantt Risk ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', { name: 'Gantt Section' });

  const blockerTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Blocker ${now}`,
    startAt: dayIso(1),
    dueAt: dayIso(8),
  });
  const blockedTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Blocked ${now}`,
    startAt: dayIso(1),
    dueAt: dayIso(3),
  });
  await api(`/tasks/${blockedTask.id}/dependencies`, token, 'POST', {
    dependsOnId: blockerTask.id,
    type: 'BLOCKS',
  });

  await page.goto(`/projects/${projectId}?view=gantt`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();

  await expect(page.locator('[data-testid="gantt-risk-filter-toggle"]')).toBeVisible();
  await expect(page.locator('[data-testid="gantt-strict-mode"]')).toBeVisible();
  await expect(page.locator(`[data-testid="gantt-risk-badge-${blockedTask.id}"]`)).toBeVisible();
  await expect(page.locator('[data-testid="gantt-risk-panel"]')).toBeVisible();

  await page.click('[data-testid="gantt-strict-mode"]');
  await expect(page.locator('[data-testid="gantt-strict-mode"]')).toHaveAttribute('data-active', 'true');
  await expect(page.locator('[data-testid="gantt-strict-warning-banner"]')).toBeVisible();

  await page.click('[data-testid="gantt-filter-risk"]');
  await expect(page.locator('[data-testid="gantt-filter-risk"]')).toHaveAttribute('data-active', 'true');
  await expect(page.locator(`[data-testid="timeline-task-${blockedTask.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-testid="timeline-task-${blockerTask.id}"]`)).toHaveCount(0);
});
