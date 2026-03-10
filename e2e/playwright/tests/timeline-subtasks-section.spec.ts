import { expect, test, type Page } from './helpers/browser-auth';

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

async function login(page: Page, sub: string, email: string) {
  await page.goto('/login');
  await page.fill('input[placeholder="OIDC sub"]', sub);
  await page.fill('input[placeholder="Email"]', email);
  await page.click('button:has-text("Dev Login")');
  await page.waitForURL('**/');
}

function dayIso(deltaDays: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + deltaDays);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}T00:00:00.000Z`;
}

function laneRailTestId(laneTestId: string) {
  return laneTestId.replace('timeline-lane-', 'timeline-lane-rail-');
}

function laneHeaderTestId(laneTestId: string) {
  return laneTestId.replace('timeline-lane-', 'timeline-lane-header-');
}

async function expectHeaderOnlyRail(page: Page, laneTestId: string, hiddenTaskTitles: string[]) {
  const laneHeader = page.locator(`[data-testid="${laneHeaderTestId(laneTestId)}"]`);
  const laneRail = page.locator(`[data-testid="${laneRailTestId(laneTestId)}"]`);
  await expect(laneHeader).toBeVisible();
  await expect(laneRail).toHaveAttribute('data-header-only', 'true');
  for (const taskTitle of hiddenTaskTitles) {
    await expect(laneRail).not.toContainText(taskTitle);
  }

  const [headerBox, railBox, childElementCount] = await Promise.all([
    laneHeader.boundingBox(),
    laneRail.boundingBox(),
    laneRail.evaluate((element) => element.childElementCount),
  ]);
  expect(headerBox).toBeTruthy();
  expect(railBox).toBeTruthy();
  expect(childElementCount).toBe(1);
  expect(Math.abs((railBox?.height ?? 0) - (headerBox?.height ?? 0))).toBeLessThanOrEqual(1);
}

test('timeline section swimlane keeps the left rail header-only even with subtasks', async ({
  page,
}) => {
  const now = Date.now();
  const sub = `e2e-timeline-subtasks-${now}`;
  const email = `${sub}@example.com`;

  await login(page, sub, email);

  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Timeline Subtasks ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Timeline Section',
  });

  const parentTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Parent ${now}`,
    startAt: dayIso(0),
    dueAt: dayIso(4),
  });
  const childTask = await api(`/tasks/${parentTask.id}/subtasks`, token, 'POST', {
    title: `Child ${now}`,
    startAt: dayIso(1),
    dueAt: dayIso(2),
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-swimlane-section"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expectHeaderOnlyRail(page, `timeline-lane-section-${section.id}`, [
    parentTask.title,
    childTask.title,
  ]);
  await expect(page.locator(`[data-testid="timeline-rail-task-${parentTask.id}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-testid="timeline-rail-task-${childTask.id}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-testid="timeline-bar-${parentTask.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-testid="timeline-bar-${childTask.id}"]`)).toBeVisible();
});

test('timeline section swimlane renders subtasks hanging under the parent with collapse toggle', async ({
  page,
}) => {
  const now = Date.now();
  const sub = `e2e-timeline-subtasks-tree-${now}`;
  const email = `${sub}@example.com`;

  await login(page, sub, email);

  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Timeline Subtasks Tree ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Timeline Section',
  });

  const parentTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Parent ${now}`,
    startAt: dayIso(0),
    dueAt: dayIso(5),
  });
  const childTask = await api(`/tasks/${parentTask.id}/subtasks`, token, 'POST', {
    title: `Child ${now}`,
    startAt: dayIso(1),
    dueAt: dayIso(2),
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();

  const parentBar = page.locator(`[data-testid="timeline-bar-${parentTask.id}"]`);
  const childBar = page.locator(`[data-testid="timeline-bar-${childTask.id}"]`);
  const toggle = page.locator(`[data-testid="timeline-subtask-toggle-${parentTask.id}"]`);

  await expect(parentBar).toBeVisible();
  await expect(childBar).toBeVisible();
  await expect(toggle).toBeVisible();

  const [parentBox, childBox] = await Promise.all([parentBar.boundingBox(), childBar.boundingBox()]);
  expect(parentBox).toBeTruthy();
  expect(childBox).toBeTruthy();
  expect((childBox?.y ?? 0) > (parentBox?.y ?? 0)).toBe(true);

  await toggle.click();
  await expect(childBar).toHaveCount(0);

  await toggle.click();
  await expect(childBar).toBeVisible();
});
