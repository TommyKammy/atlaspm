import { expect, test, type Page } from '@playwright/test';

const API = process.env.E2E_CORE_API_URL ?? 'http://localhost:3001';
const DAY_MS = 24 * 60 * 60 * 1000;

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
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}T00:00:00.000Z`;
}

async function login(page: Page, sub: string, email: string) {
  await page.goto('/login');
  await page.fill('input[placeholder="OIDC sub"]', sub);
  await page.fill('input[placeholder="Email"]', email);
  await page.click('button:has-text("Dev Login")');
  await page.waitForURL('**/');
}

async function timelineBarBox(page: Page, taskId: string) {
  const bar = page.locator(`[data-testid="timeline-bar-${taskId}"]`);
  await expect(bar).toBeVisible();
  await expect
    .poll(async () => {
      const box = await bar.boundingBox();
      return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
    })
    .not.toBeNull();
  const box = await bar.boundingBox();
  if (!box) throw new Error(`Unable to resolve bounds for timeline bar ${taskId}`);
  return box;
}

async function timelineBarTop(page: Page, taskId: string) {
  return (await timelineBarBox(page, taskId)).y;
}

async function dragTimelineBarVertically(page: Page, taskId: string, deltaY: number) {
  const box = await timelineBarBox(page, taskId);
  const startX = box.x + Math.min(Math.max(8, box.width / 4), box.width - 4);
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + deltaY, { steps: 20 });
  await page.mouse.up();
}

async function waitForTimelineTask(page: Page, taskId: string) {
  const bar = page.locator(`[data-testid="timeline-bar-${taskId}"]`);
  await bar.first().waitFor({ state: 'visible' });
  await expect
    .poll(async () => {
      const box = await bar.first().boundingBox();
      return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
    })
    .not.toBeNull();
}

async function dragTimelineBarToLane(page: Page, taskId: string, laneTestId: string) {
  const barBox = await timelineBarBox(page, taskId);
  const lane = page.locator(`[data-testid="${laneTestId}"]`);
  await expect(lane).toBeVisible();
  const laneBox = await lane.boundingBox();
  if (!laneBox) throw new Error(`Unable to resolve lane bounds for ${laneTestId}`);

  const startX = barBox.x + Math.min(Math.max(8, barBox.width / 4), barBox.width - 4);
  const startY = barBox.y + barBox.height / 2;
  const targetY = laneBox.y + Math.min(Math.max(18, laneBox.height * 0.85), laneBox.height - 10);

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 6, targetY, { steps: 18 });
  await page.mouse.up();
}

test('timeline manual row placement can move down to footer row and back, and persists after reload', async ({
  page,
}) => {
  const now = Date.now();
  const sub = `e2e-timeline-root-manual-${now}`;
  const email = `${sub}@example.com`;

  await login(page, sub, email);
  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Timeline Root Manual ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Manual Section',
  });

  const taskA = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Manual A ${now}`,
    startAt: dayIso(1),
    dueAt: dayIso(3),
  });
  const taskB = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Manual B ${now}`,
    startAt: dayIso(5),
    dueAt: dayIso(7),
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-swimlane-section"]')).toHaveAttribute(
    'data-active',
    'true',
  );

  const initialATop = await timelineBarTop(page, taskA.id);
  const initialBTop = await timelineBarTop(page, taskB.id);
  expect(Math.abs(initialATop - initialBTop)).toBeLessThanOrEqual(2);

  await dragTimelineBarVertically(page, taskB.id, 110);
  await waitForTimelineTask(page, taskA.id);
  await waitForTimelineTask(page, taskB.id);
  await expect
    .poll(async () => (await timelineBarTop(page, taskB.id)) - (await timelineBarTop(page, taskA.id)))
    .toBeGreaterThan(24);

  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await waitForTimelineTask(page, taskA.id);
  await waitForTimelineTask(page, taskB.id);
  await expect
    .poll(async () => (await timelineBarTop(page, taskB.id)) - (await timelineBarTop(page, taskA.id)))
    .toBeGreaterThan(24);

  await dragTimelineBarVertically(page, taskB.id, -110);
  await waitForTimelineTask(page, taskA.id);
  await waitForTimelineTask(page, taskB.id);
  await expect
    .poll(async () => Math.abs((await timelineBarTop(page, taskB.id)) - (await timelineBarTop(page, taskA.id))))
    .toBeLessThanOrEqual(2);
});

test('timeline manual row placement remains stable with overlapping tasks in the same section', async ({
  page,
}) => {
  const now = Date.now();
  const sub = `e2e-timeline-root-overlap-${now}`;
  const email = `${sub}@example.com`;

  await login(page, sub, email);
  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Timeline Root Overlap ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Overlap Section',
  });

  const longTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Long ${now}`,
    startAt: dayIso(1),
    dueAt: dayIso(7),
  });
  const earlyTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Early ${now}`,
    startAt: dayIso(1),
    dueAt: dayIso(2),
  });
  const lateTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Late ${now}`,
    startAt: dayIso(9),
    dueAt: dayIso(10),
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();

  await expect
    .poll(async () => Math.abs((await timelineBarTop(page, earlyTask.id)) - (await timelineBarTop(page, lateTask.id))))
    .toBeLessThanOrEqual(2);
  await expect
    .poll(async () => Math.abs((await timelineBarTop(page, longTask.id)) - (await timelineBarTop(page, earlyTask.id))))
    .toBeGreaterThan(24);

  await dragTimelineBarVertically(page, lateTask.id, 110);
  await waitForTimelineTask(page, earlyTask.id);
  await waitForTimelineTask(page, lateTask.id);
  await expect
    .poll(async () => (await timelineBarTop(page, lateTask.id)) - (await timelineBarTop(page, earlyTask.id)))
    .toBeGreaterThan(24);

  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await waitForTimelineTask(page, earlyTask.id);
  await waitForTimelineTask(page, lateTask.id);
  await expect
    .poll(async () => (await timelineBarTop(page, lateTask.id)) - (await timelineBarTop(page, earlyTask.id)))
    .toBeGreaterThan(24);

  await dragTimelineBarVertically(page, lateTask.id, -110);
  await waitForTimelineTask(page, earlyTask.id);
  await waitForTimelineTask(page, lateTask.id);
  await expect
    .poll(async () => Math.abs((await timelineBarTop(page, lateTask.id)) - (await timelineBarTop(page, earlyTask.id))))
    .toBeLessThanOrEqual(2);
});

test('timeline blocks subtasks from crossing section lanes in the UI', async ({ page }) => {
  const now = Date.now();
  const sub = `e2e-timeline-root-subtask-${now}`;
  const email = `${sub}@example.com`;

  await login(page, sub, email);
  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Timeline Root Subtask ${now}`,
  });
  const projectId = project.id as string;
  const sectionA = await api(`/projects/${projectId}/sections`, token, 'POST', { name: 'Section A' });
  const sectionB = await api(`/projects/${projectId}/sections`, token, 'POST', { name: 'Section B' });

  const parent = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: sectionA.id,
    title: `Parent ${now}`,
    startAt: dayIso(1),
    dueAt: dayIso(4),
  });
  const child = await api(`/tasks/${parent.id}/subtasks`, token, 'POST', {
    title: `Child ${now}`,
    startAt: dayIso(2),
    dueAt: dayIso(2),
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();

  await dragTimelineBarToLane(page, child.id, `timeline-lane-section-${sectionB.id}`);

  await expect(page.locator('[data-testid="timeline-parent-move-warning-banner"]')).toContainText(
    /同じグループ|same group/i,
  );
  await expect
    .poll(async () => {
      const latest = await api(`/tasks/${child.id}`, token);
      return latest.sectionId as string | null;
    })
    .toBe(sectionA.id);
});

test('task detail date inputs persist immediately without requiring blur', async ({ page }) => {
  const now = Date.now();
  const sub = `e2e-timeline-root-dates-${now}`;
  const email = `${sub}@example.com`;

  await login(page, sub, email);
  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Timeline Root Dates ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', { name: 'Date Section' });
  const task = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Date Task ${now}`,
    startAt: dayIso(1),
    dueAt: dayIso(3),
  });

  const nextStart = new Date(Date.parse(task.startAt as string) + 2 * DAY_MS)
    .toISOString()
    .slice(0, 10);
  const nextDue = new Date(Date.parse(task.dueAt as string) + 3 * DAY_MS)
    .toISOString()
    .slice(0, 10);

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await page.click(`[data-testid="timeline-bar-${task.id}"]`);
  await expect(page.locator('[data-testid="task-detail-title-input"]')).toHaveValue(task.title);

  await page.locator('[data-testid="task-detail-start-date"]').fill(nextStart);
  await expect
    .poll(async () => {
      const latest = await api(`/tasks/${task.id}`, token);
      return String(latest.startAt).slice(0, 10);
    })
    .toBe(nextStart);

  await page.locator('[data-testid="task-detail-due-date"]').fill(nextDue);
  await expect
    .poll(async () => {
      const latest = await api(`/tasks/${task.id}`, token);
      return String(latest.dueAt).slice(0, 10);
    })
    .toBe(nextDue);
});
