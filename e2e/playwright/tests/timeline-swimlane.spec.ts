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

test('timeline supports swimlane toggle and due-date sort without affecting gantt route', async ({ page }) => {
  const now = Date.now();
  const sub = `e2e-timeline-swimlane-${now}`;
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
    name: `Timeline Swimlane ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', { name: 'Timeline Section' });

  const taskLate = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Task Late ${now}`,
    assigneeUserId: sub,
    startAt: dayIso(1),
    dueAt: dayIso(8),
  });
  const taskEarly = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Task Early ${now}`,
    assigneeUserId: sub,
    startAt: dayIso(1),
    dueAt: dayIso(2),
  });
  const taskNoDate = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Task No Date ${now}`,
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-swimlane-toggle"]')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-sort-toggle"]')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-schedule-filter-toggle"]')).toBeVisible();

  await expect(page.locator('[data-testid^="timeline-lane-section-"]')).toHaveCount(1);

  await page.click('[data-testid="timeline-sort-due"]');
  await expect(page.locator('[data-testid="timeline-sort-due"]')).toHaveAttribute('data-active', 'true');
  const orderedTaskIds = await page
    .locator('[data-testid^="timeline-task-"]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')));
  expect(orderedTaskIds.indexOf(`timeline-task-${taskEarly.id}`)).toBeLessThan(
    orderedTaskIds.indexOf(`timeline-task-${taskLate.id}`),
  );

  await page.click('[data-testid="timeline-swimlane-assignee"]');
  await expect(page.locator('[data-testid="timeline-swimlane-assignee"]')).toHaveAttribute('data-active', 'true');
  await expect(page.locator('[data-testid^="timeline-lane-assignee-"]')).toHaveCount(2);

  await page.click('[data-testid="timeline-filter-unscheduled"]');
  await expect(page.locator('[data-testid="timeline-filter-unscheduled"]')).toHaveAttribute('data-active', 'true');
  await expect(page.locator(`[data-testid="timeline-unscheduled-${taskNoDate.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-testid="timeline-bar-${taskEarly.id}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-testid="timeline-bar-${taskLate.id}"]`)).toHaveCount(0);

  await page.goto(`/projects/${projectId}?view=gantt`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-swimlane-toggle"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="timeline-sort-toggle"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="timeline-schedule-filter-toggle"]')).toHaveCount(0);
});
