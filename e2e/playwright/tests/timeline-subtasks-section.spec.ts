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
  return date.toISOString();
}

test('timeline section swimlane renders same-section subtasks as indented branch items', async ({
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

  const parentRailItem = page.locator(`[data-testid="timeline-rail-task-${parentTask.id}"]`);
  const childRailItem = page.locator(`[data-testid="timeline-rail-task-${childTask.id}"]`);

  await expect(parentRailItem).toBeVisible();
  await expect(childRailItem).toBeVisible();
  await expect(childRailItem).toHaveAttribute('data-depth', '1');
  await expect(
    page.locator(`[data-testid="timeline-rail-branch-${childTask.id}"]`),
  ).toBeVisible();

  const [parentBox, childBox] = await Promise.all([
    parentRailItem.boundingBox(),
    childRailItem.boundingBox(),
  ]);
  if (!parentBox || !childBox) {
    throw new Error('Expected parent and child section rail items to have bounds');
  }

  expect(childBox.x).toBeGreaterThan(parentBox.x + 8);
  expect(childBox.y).toBeGreaterThan(parentBox.y);
});
