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
  await api(`/tasks/${taskB.id}/dependencies`, token, 'POST', {
    dependsOnId: taskA.id,
    type: 'BLOCKS',
  });

  await page.goto(`/projects/${projectId}`);
  await page.reload();
  await expect(page.locator('[data-testid="project-view-gantt"]')).toBeVisible();

  await page.click('[data-testid="project-view-gantt"]');
  await expect(page).toHaveURL(/\/projects\/.*\?view=gantt/);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();

  await expect(page.locator(`[data-testid="timeline-bar-${taskA.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-testid="timeline-bar-${taskB.id}"]`)).toBeVisible();
  await expect(page.locator('[data-testid="timeline-dependency-layer"]')).toBeVisible();
  await expect(page.locator(`[data-testid="timeline-connector-${taskA.id}-${taskB.id}"]`)).toBeVisible();

  await page.click(`[data-testid="timeline-task-${taskB.id}"]`);
  await expect(page.locator('[data-testid="task-detail-title-input"]')).toHaveValue(`Timeline Task B ${now}`);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="task-detail-title-input"]')).toHaveCount(0);

  await page.click(`[data-testid="timeline-bar-${taskA.id}"]`);
  await expect(page.locator('[data-testid="task-detail-title-input"]')).toHaveValue(`Timeline Task A ${now}`);
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

test('timeline can create dependency from connector handle drag', async ({ page }) => {
  const now = Date.now();
  const sub = `e2e-timeline-connect-${now}`;
  const email = `e2e-timeline-connect-${now}@example.com`;

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
    name: `Timeline Connect ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', { name: 'Timeline Section' });

  const start = new Date();
  start.setDate(start.getDate());
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 3);

  const taskA = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Timeline Source ${now}`,
    startAt: start.toISOString(),
    dueAt: end.toISOString(),
  });
  const taskB = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Timeline Target ${now}`,
    startAt: new Date(end.getTime() + (1 * 24 * 60 * 60 * 1000)).toISOString(),
    dueAt: new Date(end.getTime() + (3 * 24 * 60 * 60 * 1000)).toISOString(),
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();

  const sourceBar = page.locator(`[data-testid="timeline-bar-${taskA.id}"]`);
  const targetBar = page.locator(`[data-testid="timeline-bar-${taskB.id}"]`);
  await sourceBar.hover();
  const handle = page.locator(`[data-testid="timeline-dependency-handle-${taskA.id}"]`);
  await expect(handle).toBeVisible();

  const handleBox = await handle.boundingBox();
  const targetBox = await targetBar.boundingBox();
  if (!handleBox || !targetBox) {
    throw new Error('Expected dependency handle and target bar bounds');
  }

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 16 });
  await expect(page.locator('[data-testid="timeline-dependency-preview"]')).toBeVisible();
  await expect(targetBar).toHaveAttribute('data-connection-target', 'true');
  await page.mouse.up();

  await expect(page.locator('[data-testid="timeline-dependency-preview"]')).toHaveCount(0);

  await expect
    .poll(async () => {
      const dependencies = (await api(`/tasks/${taskB.id}/dependencies`, token)) as Array<{ dependsOnId: string }>;
      return dependencies.some((dependency) => dependency.dependsOnId === taskA.id);
    })
    .toBe(true);
});

test('timeline highlights dependency risks without opening task details', async ({ page }) => {
  const now = Date.now();
  const sub = `e2e-timeline-risk-${now}`;
  const email = `e2e-timeline-risk-${now}@example.com`;

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
    name: `Timeline Risk ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', { name: 'Timeline Section' });

  const blockerStart = new Date();
  blockerStart.setHours(0, 0, 0, 0);
  const blockerEnd = new Date(blockerStart);
  blockerEnd.setDate(blockerEnd.getDate() + 5);

  const blockedStart = new Date(blockerStart);
  blockedStart.setDate(blockedStart.getDate() + 1);
  const blockedEnd = new Date(blockerStart);
  blockedEnd.setDate(blockedEnd.getDate() + 2);

  const blocker = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Timeline Blocker ${now}`,
    status: 'IN_PROGRESS',
    startAt: blockerStart.toISOString(),
    dueAt: blockerEnd.toISOString(),
  });
  const blocked = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Timeline Blocked ${now}`,
    status: 'TODO',
    startAt: blockedStart.toISOString(),
    dueAt: blockedEnd.toISOString(),
  });
  await api(`/tasks/${blocked.id}/dependencies`, token, 'POST', {
    dependsOnId: blocker.id,
    type: 'BLOCKS',
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await expect(page.locator(`[data-testid="timeline-risk-badge-${blocked.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-testid="timeline-bar-${blocked.id}"]`)).toHaveAttribute('data-at-risk', 'true');
  await expect(page.locator(`[data-testid="timeline-bar-${blocked.id}"]`)).toHaveAttribute('data-risk-kind', /open blockers|late blockers|未解決ブロッカー|期限遅延依存/);
});
