import { expect, test, type Page } from './helpers/browser-auth';

const API = process.env.E2E_CORE_API_URL ?? 'http://localhost:3001';

test.use({ timezoneId: 'Asia/Tokyo', locale: 'en-US' });

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

async function login(page: Page, sub: string, email: string) {
  await page.goto('/login');
  await page.fill('input[placeholder="OIDC sub"]', sub);
  await page.fill('input[placeholder="Email"]', email);
  await page.click('button:has-text("Dev Login")');
  await page.waitForURL('**/');
}

function lateUtcIso(deltaDays: number) {
  const date = new Date();
  date.setUTCHours(23, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString();
}

function dayIso(deltaDays: number) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString();
}

function dateOnlyLabel(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US');
}

async function resizeTimelineBar(page: Page, taskId: string, edge: 'start' | 'end', deltaDays: number) {
  const bar = page.locator(`[data-testid="timeline-bar-${taskId}"]`);
  await expect(bar).toBeVisible();
  await bar.hover();

  const handle = page.locator(`[data-testid="timeline-resize-${edge}-${taskId}"]`);
  await expect(handle).toBeVisible();
  const handleBox = await handle.boundingBox();
  if (!handleBox) {
    throw new Error(`Unable to resolve resize handle bounds for ${taskId}`);
  }

  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(50);
  await page.mouse.move(startX + deltaDays * 64, startY, { steps: 18 });
  await page.mouse.up();
}

test('timeline and gantt should match drawer date-only values for mixed stored timestamps after reload', async ({
  page,
}) => {
  const now = Date.now();
  const sub = `e2e-date-only-${now}`;
  const email = `${sub}@example.com`;

  await login(page, sub, email);
  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Date Only Drift ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Date Only Section',
  });

  const startAt = lateUtcIso(2);
  const dueAt = lateUtcIso(4);
  const expectedStartDate = startAt.slice(0, 10);
  const expectedDueDate = dueAt.slice(0, 10);
  const expectedTitle = `${dateOnlyLabel(startAt)} - ${dateOnlyLabel(dueAt)}`;

  const task = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Date Only Task ${now}`,
    startAt,
    dueAt,
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();

  await page.click(`[data-testid="timeline-bar-${task.id}"]`);
  await expect(page.locator('[data-testid="task-detail-start-date"]')).toHaveValue(expectedStartDate);
  await expect(page.locator('[data-testid="task-detail-due-date"]')).toHaveValue(expectedDueDate);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="task-detail-title-input"]')).toHaveCount(0);

  await page.reload();
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await expect(page.locator(`[data-testid="timeline-bar-${task.id}"]`)).toHaveAttribute('title', expectedTitle);

  await page.click('[data-testid="project-view-gantt"]');
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}.*view=gantt`));
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await expect(page.locator(`[data-testid="timeline-bar-${task.id}"]`)).toHaveAttribute('title', expectedTitle);
});

test('timeline resize keeps drawer and reload aligned on date-only values', async ({ page }) => {
  const now = Date.now();
  const sub = `e2e-date-only-resize-${now}`;
  const email = `${sub}@example.com`;

  await login(page, sub, email);
  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Date Only Resize ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Date Only Resize Section',
  });

  const startAt = dayIso(2);
  const dueAt = dayIso(3);
  const resizedDueAt = dayIso(5);
  const expectedStartDate = startAt.slice(0, 10);
  const expectedResizedDueDate = resizedDueAt.slice(0, 10);
  const expectedTitle = `${dateOnlyLabel(startAt)} - ${dateOnlyLabel(resizedDueAt)}`;

  const task = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Resize Date Only Task ${now}`,
    startAt,
    dueAt,
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await page.click('[data-testid="timeline-zoom-day"]');
  await expect(page.locator('[data-testid="timeline-zoom-day"]')).toHaveAttribute('data-active', 'true');

  await resizeTimelineBar(page, task.id, 'end', 2);

  await expect
    .poll(async () => {
      const latest = await api(`/tasks/${task.id}`, token);
      return String(latest.dueAt).slice(0, 10);
    })
    .toBe(expectedResizedDueDate);

  await page.click(`[data-testid="timeline-bar-${task.id}"]`);
  await expect(page.locator('[data-testid="task-detail-start-date"]')).toHaveValue(expectedStartDate);
  await expect(page.locator('[data-testid="task-detail-due-date"]')).toHaveValue(expectedResizedDueDate);
  await page.keyboard.press('Escape');

  await page.reload();
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await expect(page.locator(`[data-testid="timeline-bar-${task.id}"]`)).toHaveAttribute('title', expectedTitle);
});
