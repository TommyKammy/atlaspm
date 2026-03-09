import { expect, test, type Page } from '@playwright/test';

const API = process.env.E2E_CORE_API_URL ?? 'http://localhost:3001';
const DAY_COLUMN_WIDTH = 64;

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

async function laneOrder(page: Page) {
  return page
    .locator('[data-testid^="timeline-lane-assignee-"]')
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-testid') ?? ''),
    );
}

function laneHeaderTestId(laneTestId: string) {
  return laneTestId.replace('timeline-lane-', 'timeline-lane-header-');
}

function laneRailTestId(laneTestId: string) {
  return laneTestId.replace('timeline-lane-', 'timeline-lane-rail-');
}

async function expectHeaderOnlyRail(page: Page, laneTestId: string, forbiddenTaskTitles: string[]) {
  const laneHeader = page.locator(`[data-testid="${laneHeaderTestId(laneTestId)}"]`);
  const laneRail = page.locator(`[data-testid="${laneRailTestId(laneTestId)}"]`);
  await expect(laneHeader).toBeVisible();
  await expect(laneRail).toHaveAttribute('data-header-only', 'true');
  for (const taskTitle of forbiddenTaskTitles) {
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

async function dragTimelineLaneHeaderToLane(
  page: Page,
  draggingLaneTestId: string,
  overLaneTestId: string,
) {
  const draggingHeaderTestId = laneHeaderTestId(draggingLaneTestId);
  const overHeaderTestId = laneHeaderTestId(overLaneTestId);
  await expect(page.locator(`[data-testid="${draggingHeaderTestId}"]`)).toBeVisible();
  await expect(page.locator(`[data-testid="${overHeaderTestId}"]`)).toBeVisible();
  await page.evaluate(
    ({ draggingHeaderTestId, overHeaderTestId }) => {
      const draggingHeader = document.querySelector<HTMLElement>(
        `[data-testid="${draggingHeaderTestId}"]`,
      );
      const overHeader = document.querySelector<HTMLElement>(`[data-testid="${overHeaderTestId}"]`);
      if (!draggingHeader || !overHeader) {
        throw new Error('Unable to resolve lane headers for drag and drop');
      }
      const dataTransfer = new DataTransfer();
      draggingHeader.dispatchEvent(
        new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer }),
      );
      overHeader.dispatchEvent(
        new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer }),
      );
      overHeader.dispatchEvent(
        new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer }),
      );
      overHeader.dispatchEvent(
        new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }),
      );
      draggingHeader.dispatchEvent(
        new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer }),
      );
    },
    { draggingHeaderTestId, overHeaderTestId },
  );
}

async function dragTimelineBarToLane(page: Page, taskId: string, laneTestId: string) {
  const bar = page.locator(`[data-testid="timeline-bar-${taskId}"]`);
  const lane = page.locator(`[data-testid="${laneTestId}"]`);
  await expect(bar).toBeVisible();
  await expect(lane).toBeVisible();
  await page.waitForTimeout(100);
  const barBox = await bar.boundingBox();
  const laneBox = await lane.boundingBox();
  if (!barBox || !laneBox) throw new Error('Unable to resolve bar/lane bounds');

  const startX = barBox.x + Math.min(Math.max(8, barBox.width / 4), barBox.width - 4);
  const startY = barBox.y + barBox.height / 2;
  const targetY = laneBox.y + Math.min(Math.max(16, laneBox.height * 0.75), laneBox.height - 12);

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(50);
  await page.mouse.move(startX + Math.max(16, DAY_COLUMN_WIDTH * 0.35), targetY, { steps: 16 });
  await page.mouse.up();
}

async function timelineBarTop(page: Page, taskId: string) {
  await expect
    .poll(async () => {
      const bar = page.locator(`[data-testid="timeline-bar-${taskId}"]`).first();
      if ((await bar.count()) === 0) return null;
      const box = await bar.boundingBox();
      return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
    })
    .not.toBeNull();
  const bar = page.locator(`[data-testid="timeline-bar-${taskId}"]`).first();
  const box = await bar.boundingBox();
  if (!box) throw new Error(`Unable to resolve timeline bar bounds for ${taskId}`);
  return box.y;
}

async function orderedTaskIdsByTop(page: Page, taskIds: string[]) {
  const positions = await Promise.all(
    taskIds.map(async (taskId) => ({ taskId, top: await timelineBarTop(page, taskId) })),
  );
  return positions.sort((left, right) => left.top - right.top).map((entry) => entry.taskId);
}

async function dragTimelineBarVertically(page: Page, taskId: string, deltaY: number) {
  const bar = page.locator(`[data-testid="timeline-bar-${taskId}"]`);
  await expect(bar).toBeVisible();
  const box = await bar.boundingBox();
  if (!box) throw new Error(`Unable to resolve bounds for timeline bar ${taskId}`);

  const startX = box.x + Math.min(Math.max(8, box.width / 4), box.width - 4);
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(50);
  await page.mouse.move(startX, startY + deltaY, { steps: 18 });
  await page.mouse.up();
}

async function dragTimelineBarHorizontally(page: Page, taskId: string, deltaDays: number) {
  const bar = page.locator(`[data-testid="timeline-bar-${taskId}"]`);
  await expect(bar).toBeVisible();
  const box = await bar.boundingBox();
  if (!box) throw new Error(`Unable to resolve bounds for timeline bar ${taskId}`);

  const startX = box.x + Math.min(Math.max(8, box.width / 4), box.width - 4);
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(50);
  await page.mouse.move(startX + deltaDays * DAY_COLUMN_WIDTH, startY, { steps: 18 });
  await page.mouse.up();
}

async function timelineBarBox(page: Page, taskId: string) {
  const bar = page.locator(`[data-testid="timeline-bar-${taskId}"]`);
  await expect(bar).toBeVisible();
  const box = await bar.boundingBox();
  if (!box) throw new Error(`Unable to resolve bounds for timeline bar ${taskId}`);
  return box;
}

function parseTimelineConnectorPath(pathData: string | null) {
  if (!pathData) {
    throw new Error('Expected timeline connector path data');
  }
  const match = pathData.match(
    /^M\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+C\s+-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?,\s+-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?,\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/,
  );
  if (!match) {
    throw new Error(`Unexpected timeline connector path: ${pathData}`);
  }
  return {
    x1: Number(match[1]),
    y1: Number(match[2]),
    x2: Number(match[3]),
    y2: Number(match[4]),
  };
}

async function expectTimelineConnectorAnchored(page: Page, sourceTaskId: string, targetTaskId: string) {
  const connector = page.locator(
    `[data-testid="timeline-connector-${sourceTaskId}-${targetTaskId}"]`,
  );
  const layer = page.locator('[data-testid="timeline-dependency-layer"]');
  const sourceBar = page.locator(`[data-testid="timeline-bar-${sourceTaskId}"]`);
  const targetBar = page.locator(`[data-testid="timeline-bar-${targetTaskId}"]`);

  await expect(layer).toBeVisible();
  await expect(connector).toBeVisible();
  await expect(sourceBar).toBeVisible();
  await expect(targetBar).toBeVisible();

  const [pathData, layerBox, sourceBox, targetBox] = await Promise.all([
    connector.getAttribute('d'),
    layer.boundingBox(),
    sourceBar.boundingBox(),
    targetBar.boundingBox(),
  ]);
  if (!layerBox || !sourceBox || !targetBox) {
    throw new Error('Expected timeline connector layer and bar bounds');
  }

  const path = parseTimelineConnectorPath(pathData);
  const expectedStartX = sourceBox.x + sourceBox.width - layerBox.x;
  const expectedStartY = sourceBox.y + sourceBox.height / 2 - layerBox.y;
  const expectedEndX = targetBox.x - layerBox.x;
  const expectedEndY = targetBox.y + targetBox.height / 2 - layerBox.y;

  expect(Math.abs(path.x1 - expectedStartX)).toBeLessThanOrEqual(2);
  expect(Math.abs(path.y1 - expectedStartY)).toBeLessThanOrEqual(2);
  expect(Math.abs(path.x2 - expectedEndX)).toBeLessThanOrEqual(2);
  expect(Math.abs(path.y2 - expectedEndY)).toBeLessThanOrEqual(2);

  return path;
}

async function dragUnscheduledTaskToLane(page: Page, taskId: string, laneTestId: string) {
  const task = page.locator(`[data-testid="timeline-unscheduled-${taskId}"]`);
  const lane = page.locator(`[data-testid="${laneTestId}"]`);
  await expect(task).toBeVisible();
  await expect(lane).toBeVisible();
  await task.dragTo(lane, { targetPosition: { x: 320, y: 16 } });
}

test('timeline supports swimlane toggle and due-date sort without affecting gantt route', async ({
  page,
}) => {
  const now = Date.now();
  const sub = `e2e-timeline-swimlane-${now}`;
  const email = `${sub}@example.com`;

  await login(page, sub, email);

  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Timeline Swimlane ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Timeline Section',
  });

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

  await api(`/tasks/${taskLate.id}`, token, 'PATCH', {
    status: 'IN_PROGRESS',
    version: taskLate.version,
  });
  await api(`/tasks/${taskEarly.id}`, token, 'PATCH', {
    status: 'BLOCKED',
    version: taskEarly.version,
  });
  await api(`/tasks/${taskNoDate.id}`, token, 'PATCH', {
    status: 'DONE',
    progressPercent: 100,
    version: taskNoDate.version,
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-swimlane-toggle"]')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-sort-toggle"]')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-schedule-filter-toggle"]')).toBeVisible();
  await expect(page.locator('[data-testid^="timeline-task-"]')).toHaveCount(0);

  await expect(page.locator('[data-testid^="timeline-lane-section-"]')).toHaveCount(2);

  await page.click('[data-testid="timeline-sort-due"]');
  await expect(page.locator('[data-testid="timeline-sort-due"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expect
    .poll(async () => {
      const [earlyTop, lateTop] = await Promise.all([
        timelineBarTop(page, taskEarly.id),
        timelineBarTop(page, taskLate.id),
      ]);
      return earlyTop < lateTop;
    })
    .toBe(true);

  const sectionToggle = page
    .locator(`[data-testid="timeline-lane-section-${section.id}"]`)
    .locator('[data-testid^="timeline-lane-toggle-"]');
  await expect(sectionToggle).toBeVisible();
  await sectionToggle.click();
  await expect(page.locator(`[data-testid="timeline-bar-${taskEarly.id}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-testid="timeline-bar-${taskLate.id}"]`)).toHaveCount(0);
  await sectionToggle.click();
  await expect(page.locator(`[data-testid="timeline-bar-${taskEarly.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-testid="timeline-bar-${taskLate.id}"]`)).toBeVisible();

  await page.click('[data-testid="timeline-swimlane-assignee"]');
  await expect(page.locator('[data-testid="timeline-swimlane-assignee"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  const assigneeLaneTestId = `timeline-lane-assignee-${sub}`;
  await expect(page.locator('[data-testid^="timeline-lane-assignee-"]')).toHaveCount(2);
  await expectHeaderOnlyRail(page, assigneeLaneTestId, [taskLate.title, taskEarly.title]);
  await expectHeaderOnlyRail(page, 'timeline-lane-assignee-__unassigned__', [
    taskLate.title,
    taskEarly.title,
  ]);

  await page.click('[data-testid="timeline-swimlane-status"]');
  await expect(page.locator('[data-testid="timeline-swimlane-status"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expect(page.locator('[data-testid^="timeline-lane-status-"]')).toHaveCount(4);
  for (const laneTestId of [
    'timeline-lane-status-TODO',
    'timeline-lane-status-IN_PROGRESS',
    'timeline-lane-status-DONE',
    'timeline-lane-status-BLOCKED',
  ]) {
    await expectHeaderOnlyRail(page, laneTestId, [taskLate.title, taskEarly.title]);
  }

  await page.click('[data-testid="timeline-filter-unscheduled"]');
  await expect(page.locator('[data-testid="timeline-filter-unscheduled"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expect(page.locator(`[data-testid="timeline-unscheduled-${taskNoDate.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-testid="timeline-bar-${taskEarly.id}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-testid="timeline-bar-${taskLate.id}"]`)).toHaveCount(0);

  await page.goto(`/projects/${projectId}?view=gantt`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-swimlane-toggle"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="timeline-sort-toggle"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="timeline-schedule-filter-toggle"]')).toHaveCount(0);
});

test('timeline uses local transient state before saved default and falls back to section', async ({
  page,
  browser,
}) => {
  const now = Date.now();
  const sub = `e2e-timeline-default-${now}`;
  const email = `${sub}@example.com`;

  await login(page, sub, email);

  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Timeline Default ${now}`,
  });
  const projectId = project.id as string;
  const sections = await api(`/projects/${projectId}/sections`, token);
  const defaultSection = sections.find((section: { isDefault?: boolean }) => section.isDefault) ?? sections[0];

  await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: defaultSection.id,
    title: `Timeline Default Task ${now}`,
    startAt: dayIso(1),
    dueAt: dayIso(2),
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-swimlane-section"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expect(page.locator('[data-testid="timeline-save-default"]')).toBeDisabled();

  await page.click('[data-testid="timeline-swimlane-status"]');
  await expect(page.locator('[data-testid="timeline-swimlane-status"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expect(page.locator('[data-testid="timeline-save-default"]')).toBeEnabled();

  await page.reload();
  await expect(page.locator('[data-testid="timeline-swimlane-status"]')).toHaveAttribute(
    'data-active',
    'true',
  );

  const freshContext = await browser.newContext();
  const freshPage = await freshContext.newPage();
  await login(freshPage, sub, email);
  await freshPage.goto(`/projects/${projectId}?view=timeline`);
  await expect(freshPage.locator('[data-testid="timeline-swimlane-section"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expect(freshPage.locator('[data-testid="timeline-save-default"]')).toBeDisabled();

  await freshPage.click('[data-testid="timeline-swimlane-status"]');
  const saveResponse = freshPage.waitForResponse((response) =>
    response.url().includes(`/projects/${projectId}/saved-views/defaults/timeline`) &&
    response.request().method() === 'PUT' &&
    response.ok(),
  );
  await freshPage.click('[data-testid="timeline-save-default"]');
  await saveResponse;
  await expect(freshPage.locator('[data-testid="timeline-save-default"]')).toBeDisabled();
  await freshContext.close();

  const savedDefaultContext = await browser.newContext();
  const savedDefaultPage = await savedDefaultContext.newPage();
  await login(savedDefaultPage, sub, email);
  await savedDefaultPage.goto(`/projects/${projectId}?view=timeline`);
  await expect(savedDefaultPage.locator('[data-testid="timeline-swimlane-status"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await savedDefaultContext.close();
});

test('timeline assignee swimlane reorder persists after reload', async ({ page }) => {
  const now = Date.now();
  const sub = `e2e-timeline-reorder-${now}`;
  const email = `${sub}@example.com`;

  await login(page, sub, email);
  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Timeline Lane Reorder ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Timeline Section',
  });

  await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Assigned ${now}`,
    assigneeUserId: sub,
    startAt: dayIso(1),
    dueAt: dayIso(3),
  });
  await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Unassigned ${now}`,
    startAt: dayIso(1),
    dueAt: dayIso(3),
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await page.click('[data-testid="timeline-swimlane-assignee"]');
  await expect(page.locator('[data-testid="timeline-swimlane-assignee"]')).toHaveAttribute(
    'data-active',
    'true',
  );

  const initialOrder = await laneOrder(page);
  expect(initialOrder.length).toBeGreaterThanOrEqual(2);
  await dragTimelineLaneHeaderToLane(page, initialOrder[1]!, initialOrder[0]!);

  const expectedOrder = [initialOrder[1], initialOrder[0], ...initialOrder.slice(2)];
  await expect.poll(() => laneOrder(page)).toEqual(expectedOrder);

  await page.reload();
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await page.click('[data-testid="timeline-swimlane-assignee"]');
  await expect.poll(() => laneOrder(page)).toEqual(expectedOrder);
});

test('timeline manual row layout persists separately for section assignee and status swimlanes', async ({
  page,
}) => {
  const now = Date.now();
  const sub = `e2e-timeline-manual-layout-${now}`;
  const email = `${sub}@example.com`;

  await login(page, sub, email);
  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Timeline Manual Layout ${now}`,
  });
  const projectId = project.id as string;

  const taskA = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    title: `Manual Layout A ${now}`,
    assigneeUserId: sub,
    startAt: dayIso(1),
    dueAt: dayIso(5),
  });
  const taskB = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    title: `Manual Layout B ${now}`,
    assigneeUserId: sub,
    startAt: dayIso(1),
    dueAt: dayIso(5),
  });
  const taskC = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    title: `Manual Layout C ${now}`,
    assigneeUserId: sub,
    startAt: dayIso(1),
    dueAt: dayIso(5),
  });

  const taskIds = [taskA.id as string, taskB.id as string, taskC.id as string];

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await page.click('[data-testid="timeline-zoom-day"]');
  await expect(page.locator('[data-testid="timeline-zoom-day"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expect.poll(async () => [...(await orderedTaskIdsByTop(page, taskIds))].sort()).toEqual(
    [...taskIds].sort(),
  );
  const sectionInitialOrder = await orderedTaskIdsByTop(page, taskIds);
  const sectionExpectedOrder = [
    sectionInitialOrder[2]!,
    sectionInitialOrder[0]!,
    sectionInitialOrder[1]!,
  ];

  const sectionSave = page.waitForResponse((response) =>
    response.url().includes(`/projects/${projectId}/timeline/preferences/manual-layout/section`) &&
    response.request().method() === 'PUT' &&
    response.ok(),
  );
  await dragTimelineBarVertically(page, sectionExpectedOrder[0], -120);
  await sectionSave;
  await expect.poll(() => orderedTaskIdsByTop(page, taskIds)).toEqual(sectionExpectedOrder);

  await page.click('[data-testid="timeline-swimlane-assignee"]');
  await expect(page.locator('[data-testid="timeline-swimlane-assignee"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expect.poll(async () => [...(await orderedTaskIdsByTop(page, taskIds))].sort()).toEqual(
    [...taskIds].sort(),
  );
  const assigneeInitialOrder = await orderedTaskIdsByTop(page, taskIds);
  const assigneeExpectedOrder = [
    assigneeInitialOrder[1]!,
    assigneeInitialOrder[0]!,
    assigneeInitialOrder[2]!,
  ];

  const assigneeSave = page.waitForResponse((response) =>
    response.url().includes(`/projects/${projectId}/timeline/preferences/manual-layout/assignee`) &&
    response.request().method() === 'PUT' &&
    response.ok(),
  );
  await dragTimelineBarVertically(page, assigneeExpectedOrder[0], -80);
  await assigneeSave;
  await expect.poll(() => orderedTaskIdsByTop(page, taskIds)).toEqual(assigneeExpectedOrder);

  await page.click('[data-testid="timeline-swimlane-status"]');
  await expect(page.locator('[data-testid="timeline-swimlane-status"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expect.poll(async () => [...(await orderedTaskIdsByTop(page, taskIds))].sort()).toEqual(
    [...taskIds].sort(),
  );
  const statusInitialOrder = await orderedTaskIdsByTop(page, taskIds);
  const statusExpectedOrder = [
    statusInitialOrder[1]!,
    statusInitialOrder[2]!,
    statusInitialOrder[0]!,
  ];

  const statusSave = page.waitForResponse((response) =>
    response.url().includes(`/projects/${projectId}/timeline/preferences/manual-layout/status`) &&
    response.request().method() === 'PUT' &&
    response.ok(),
  );
  await dragTimelineBarVertically(page, statusInitialOrder[0]!, 100);
  await statusSave;
  await expect.poll(() => orderedTaskIdsByTop(page, taskIds)).toEqual(statusExpectedOrder);

  await page.reload();
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();

  await page.click('[data-testid="timeline-swimlane-section"]');
  await expect(page.locator('[data-testid="timeline-swimlane-section"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expect.poll(() => orderedTaskIdsByTop(page, taskIds)).toEqual(sectionExpectedOrder);

  await page.click('[data-testid="timeline-swimlane-assignee"]');
  await expect(page.locator('[data-testid="timeline-swimlane-assignee"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expect.poll(() => orderedTaskIdsByTop(page, taskIds)).toEqual(assigneeExpectedOrder);

  await page.click('[data-testid="timeline-swimlane-status"]');
  await expect(page.locator('[data-testid="timeline-swimlane-status"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expect.poll(() => orderedTaskIdsByTop(page, taskIds)).toEqual(statusExpectedOrder);
});

test('timeline dependency connectors stay attached after manual layout and across grouped lanes', async ({
  page,
}) => {
  const now = Date.now();
  const sub = `e2e-timeline-connectors-${now}`;
  const email = `${sub}@example.com`;

  await login(page, sub, email);
  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Timeline Connectors ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Timeline Connector Section',
  });

  const blockerTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Timeline Blocker ${now}`,
    status: 'IN_PROGRESS',
    assigneeUserId: sub,
    startAt: dayIso(1),
    dueAt: dayIso(4),
  });
  const blockedTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Timeline Blocked ${now}`,
    status: 'TODO',
    assigneeUserId: sub,
    startAt: dayIso(1),
    dueAt: dayIso(4),
  });
  await api(`/tasks/${blockedTask.id}/dependencies`, token, 'POST', {
    dependsOnId: blockerTask.id,
    type: 'BLOCKS',
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await page.click('[data-testid="timeline-zoom-day"]');
  await expect(page.locator('[data-testid="timeline-zoom-day"]')).toHaveAttribute(
    'data-active',
    'true',
  );

  const initialPath = await expectTimelineConnectorAnchored(page, blockerTask.id, blockedTask.id);

  const sectionOrder = await orderedTaskIdsByTop(page, [blockerTask.id, blockedTask.id]);
  const sectionExpectedOrder = [sectionOrder[1]!, sectionOrder[0]!];
  const movingTaskId = sectionExpectedOrder[0];
  await dragTimelineBarVertically(page, movingTaskId, -120);
  await expect.poll(() => orderedTaskIdsByTop(page, [blockerTask.id, blockedTask.id])).toEqual(
    sectionExpectedOrder,
  );

  const reorderedPath = await expectTimelineConnectorAnchored(
    page,
    blockerTask.id,
    blockedTask.id,
  );
  expect(reorderedPath.y1 === initialPath.y1 && reorderedPath.y2 === initialPath.y2).toBe(false);

  await page.click('[data-testid="timeline-swimlane-status"]');
  await expect(page.locator('[data-testid="timeline-swimlane-status"]')).toHaveAttribute(
    'data-active',
    'true',
  );

  const crossGroupPath = await expectTimelineConnectorAnchored(page, blockerTask.id, blockedTask.id);
  expect(crossGroupPath.y1).not.toBe(crossGroupPath.y2);
});

test('timeline drag can move task across assignee lanes into unassigned', async ({ page }) => {
  const now = Date.now();
  const sub = `e2e-timeline-move-${now}`;
  const email = `${sub}@example.com`;

  await login(page, sub, email);
  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Timeline Lane Move ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Timeline Section',
  });

  const movableTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Move To Unassigned ${now}`,
    assigneeUserId: sub,
    startAt: dayIso(1),
    dueAt: dayIso(4),
  });
  expect(movableTask.assigneeUserId).toBeTruthy();
  await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Anchor Assigned ${now}`,
    assigneeUserId: movableTask.assigneeUserId,
    startAt: dayIso(2),
    dueAt: dayIso(5),
  });
  await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Anchor Unassigned ${now}`,
    startAt: dayIso(2),
    dueAt: dayIso(5),
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await page.click('[data-testid="timeline-zoom-day"]');
  await expect(page.locator('[data-testid="timeline-zoom-day"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await page.click('[data-testid="timeline-swimlane-assignee"]');
  await expect(page.locator('[data-testid="timeline-swimlane-assignee"]')).toHaveAttribute(
    'data-active',
    'true',
  );

  const unassignedLaneTestId = 'timeline-lane-assignee-__unassigned__';
  const initialLaneOrder = await laneOrder(page);
  const assigneeLaneTestId = initialLaneOrder.find((lane) => lane !== unassignedLaneTestId);
  if (!assigneeLaneTestId) throw new Error('Expected an assignee lane before reassignment');

  await dragTimelineBarToLane(page, movableTask.id, unassignedLaneTestId);

  await expect
    .poll(async () => {
      const latest = await api(`/tasks/${movableTask.id}`, token);
      return latest.assigneeUserId;
    })
    .toBeNull();

  await dragTimelineBarToLane(page, movableTask.id, assigneeLaneTestId);
  await expect
    .poll(async () => {
      const latest = await api(`/tasks/${movableTask.id}`, token);
      return latest.assigneeUserId;
    })
    .toBe(movableTask.assigneeUserId);
});

test('timeline drag can move task across section and status lanes', async ({ page }) => {
  const now = Date.now();
  const sub = `e2e-timeline-lane-attrs-${now}`;
  const email = `${sub}@example.com`;

  await login(page, sub, email);
  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Timeline Lane Attributes ${now}`,
  });
  const projectId = project.id as string;
  const sectionA = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Section A',
  });
  const sectionB = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Section B',
  });

  const movableTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: sectionA.id,
    title: `Move Between Lanes ${now}`,
    startAt: dayIso(1),
    dueAt: dayIso(3),
  });
  await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: sectionB.id,
    title: `Section B Anchor ${now}`,
    startAt: dayIso(2),
    dueAt: dayIso(4),
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await page.click('[data-testid="timeline-zoom-day"]');
  await expect(page.locator('[data-testid="timeline-zoom-day"]')).toHaveAttribute(
    'data-active',
    'true',
  );

  await dragTimelineBarToLane(page, movableTask.id, `timeline-lane-section-${sectionB.id}`);
  await expect
    .poll(async () => {
      const latest = await api(`/tasks/${movableTask.id}`, token);
      return latest.sectionId;
    })
    .toBe(sectionB.id);

  await page.click('[data-testid="timeline-swimlane-status"]');
  await expect(page.locator('[data-testid="timeline-swimlane-status"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expect(page.locator('[data-testid="timeline-lane-status-IN_PROGRESS"]')).toBeVisible();
  await dragTimelineBarToLane(page, movableTask.id, 'timeline-lane-status-IN_PROGRESS');
  await expect
    .poll(async () => {
      const latest = await api(`/tasks/${movableTask.id}`, token);
      return latest.status;
    })
    .toBe('IN_PROGRESS');
});

test('timeline grouped bars stay in sync with drawer date edits after drag reschedule', async ({
  page,
}) => {
  const now = Date.now();
  const sub = `e2e-timeline-date-sync-${now}`;
  const email = `${sub}@example.com`;

  await login(page, sub, email);
  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Timeline Date Sync ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Timeline Date Sync Section',
  });

  const scheduledTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Date Sync Task ${now}`,
    assigneeUserId: sub,
    startAt: dayIso(1),
    dueAt: dayIso(2),
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await page.click('[data-testid="timeline-zoom-day"]');
  await expect(page.locator('[data-testid="timeline-zoom-day"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await page.click('[data-testid="timeline-swimlane-assignee"]');
  await expect(page.locator('[data-testid="timeline-swimlane-assignee"]')).toHaveAttribute(
    'data-active',
    'true',
  );

  const initialBox = await timelineBarBox(page, scheduledTask.id);
  await dragTimelineBarHorizontally(page, scheduledTask.id, 1);

  const draggedStartDate = dayIso(2).slice(0, 10);
  const draggedDueDate = dayIso(3).slice(0, 10);
  await expect
    .poll(async () => {
      const latest = await api(`/tasks/${scheduledTask.id}`, token);
      return {
        startAt: String(latest.startAt).slice(0, 10),
        dueAt: String(latest.dueAt).slice(0, 10),
      };
    })
    .toEqual({
      startAt: draggedStartDate,
      dueAt: draggedDueDate,
    });

  const draggedBox = await timelineBarBox(page, scheduledTask.id);
  expect(Math.abs((draggedBox.x - initialBox.x) - DAY_COLUMN_WIDTH)).toBeLessThanOrEqual(4);

  await page.click(`[data-testid="timeline-bar-${scheduledTask.id}"]`);
  await expect(page.locator('[data-testid="task-detail-start-date"]')).toHaveValue(draggedStartDate);
  await expect(page.locator('[data-testid="task-detail-due-date"]')).toHaveValue(draggedDueDate);

  const extendedDueDate = dayIso(5).slice(0, 10);
  const dueDateInput = page.locator('[data-testid="task-detail-due-date"]');
  await dueDateInput.fill(extendedDueDate);
  await expect(dueDateInput).toHaveValue(extendedDueDate);

  await expect
    .poll(async () => {
      const latest = await api(`/tasks/${scheduledTask.id}`, token);
      return String(latest.dueAt).slice(0, 10);
    })
    .toBe(extendedDueDate);

  const extendedBox = await timelineBarBox(page, scheduledTask.id);
  expect(Math.abs((extendedBox.width - draggedBox.width) - DAY_COLUMN_WIDTH * 2)).toBeLessThanOrEqual(4);
  await expect(page.locator(`[data-testid="timeline-lane-assignee-${sub}"]`)).toContainText(
    scheduledTask.title,
  );

  const widenedStartDate = dayIso(1).slice(0, 10);
  const startDateInput = page.locator('[data-testid="task-detail-start-date"]');
  await startDateInput.fill(widenedStartDate);
  await expect(startDateInput).toHaveValue(widenedStartDate);

  await expect
    .poll(async () => {
      const latest = await api(`/tasks/${scheduledTask.id}`, token);
      return String(latest.startAt).slice(0, 10);
    })
    .toBe(widenedStartDate);

  const widenedBox = await timelineBarBox(page, scheduledTask.id);
  expect(Math.abs((extendedBox.x - widenedBox.x) - DAY_COLUMN_WIDTH)).toBeLessThanOrEqual(4);
  expect(Math.abs((widenedBox.width - extendedBox.width) - DAY_COLUMN_WIDTH)).toBeLessThanOrEqual(4);
  await expect(page.locator('[data-testid="task-detail-start-date"]')).toHaveValue(widenedStartDate);
  await expect(page.locator('[data-testid="task-detail-due-date"]')).toHaveValue(extendedDueDate);
});

test('timeline can schedule unscheduled tasks via drag and drop', async ({ page }) => {
  const now = Date.now();
  const sub = `e2e-timeline-unscheduled-${now}`;
  const email = `${sub}@example.com`;

  await login(page, sub, email);
  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Timeline Unscheduled DnD ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Timeline Section',
  });

  const unscheduledTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Unscheduled ${now}`,
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await expect(
    page.locator(`[data-testid="timeline-unscheduled-${unscheduledTask.id}"]`),
  ).toBeVisible();

  const lane = page.locator('[data-testid^="timeline-lane-section-"]').first();
  await page
    .locator(`[data-testid="timeline-unscheduled-${unscheduledTask.id}"]`)
    .dragTo(lane, { targetPosition: { x: 320, y: 16 } });

  await expect
    .poll(async () => {
      const latest = await api(`/tasks/${unscheduledTask.id}`, token);
      return Boolean(latest.startAt && latest.dueAt);
    })
    .toBe(true);
  await expect(page.locator(`[data-testid="timeline-bar-${unscheduledTask.id}"]`)).toBeVisible();

  const scheduled = await api(`/tasks/${unscheduledTask.id}`, token);
  expect(String(scheduled.startAt).slice(0, 10)).toBe(String(scheduled.dueAt).slice(0, 10));
});

test('timeline unscheduled tray drop assigns grouped lane attributes in section assignee and status modes', async ({
  page,
}) => {
  const now = Date.now();
  const sub = `e2e-timeline-unscheduled-grouped-${now}`;
  const email = `${sub}@example.com`;

  await login(page, sub, email);
  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Timeline Unscheduled Grouped DnD ${now}`,
  });
  const projectId = project.id as string;
  const targetSection = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Target Section',
  });

  const sectionTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    title: `Section Drop ${now}`,
  });
  const assigneeTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    title: `Assignee Drop ${now}`,
  });
  const statusTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    title: `Status Drop ${now}`,
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();

  await dragUnscheduledTaskToLane(page, sectionTask.id, `timeline-lane-section-${targetSection.id}`);
  await expect
    .poll(async () => {
      const latest = await api(`/tasks/${sectionTask.id}`, token);
      return {
        sectionId: latest.sectionId as string,
        hasSchedule: Boolean(latest.startAt && latest.dueAt),
      };
    })
    .toEqual({
      sectionId: targetSection.id,
      hasSchedule: true,
    });

  await page.click('[data-testid="timeline-swimlane-assignee"]');
  await expect(page.locator('[data-testid="timeline-swimlane-assignee"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await dragUnscheduledTaskToLane(page, assigneeTask.id, `timeline-lane-assignee-${sub}`);
  await expect
    .poll(async () => {
      const latest = await api(`/tasks/${assigneeTask.id}`, token);
      return {
        assigneeUserId: latest.assigneeUserId as string | null,
        hasSchedule: Boolean(latest.startAt && latest.dueAt),
      };
    })
    .toEqual({
      assigneeUserId: sub,
      hasSchedule: true,
    });

  await page.click('[data-testid="timeline-swimlane-status"]');
  await expect(page.locator('[data-testid="timeline-swimlane-status"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await dragUnscheduledTaskToLane(page, statusTask.id, 'timeline-lane-status-BLOCKED');
  await expect
    .poll(async () => {
      const latest = await api(`/tasks/${statusTask.id}`, token);
      return {
        status: latest.status as string,
        hasSchedule: Boolean(latest.startAt && latest.dueAt),
      };
    })
    .toEqual({
      status: 'BLOCKED',
      hasSchedule: true,
    });

  await expect(page.locator(`[data-testid="timeline-bar-${sectionTask.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-testid="timeline-bar-${assigneeTask.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-testid="timeline-bar-${statusTask.id}"]`)).toBeVisible();
});

test('timeline compacts non-overlapping tasks into shared rows', async ({ page }) => {
  const now = Date.now();
  const sub = `e2e-timeline-packed-${now}`;
  const email = `${sub}@example.com`;

  await login(page, sub, email);
  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Timeline Packed Rows ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Packed Lane',
  });

  await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Packed A ${now}`,
    startAt: dayIso(1),
    dueAt: dayIso(2),
  });
  await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Packed B ${now}`,
    startAt: dayIso(4),
    dueAt: dayIso(5),
  });
  await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Packed C ${now}`,
    startAt: dayIso(2),
    dueAt: dayIso(4),
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await expect(page.locator(`[data-testid="timeline-lane-section-${section.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-testid^="timeline-row-section-${section.id}-"]`)).toHaveCount(2);
});
