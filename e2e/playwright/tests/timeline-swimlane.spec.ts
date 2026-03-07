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
  return date.toISOString();
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
  await page.mouse.move(startX + DAY_COLUMN_WIDTH * 0.1, targetY, { steps: 16 });
  await page.mouse.up();
}

async function timelineBarTop(page: Page, taskId: string) {
  const bar = page.locator(`[data-testid="timeline-bar-${taskId}"]`);
  await expect(bar).toBeVisible();
  const box = await bar.boundingBox();
  if (!box) throw new Error(`Unable to resolve timeline bar bounds for ${taskId}`);
  return box.y;
}

async function dragTimelineBarToTaskPosition(
  page: Page,
  taskId: string,
  targetTaskId: string,
  placement: 'before' | 'after' = 'after',
) {
  const source = page.locator(`[data-testid="timeline-bar-${taskId}"]`);
  const target = page.locator(`[data-testid="timeline-bar-${targetTaskId}"]`);
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  await page.waitForTimeout(100);
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error('Unable to resolve timeline bars for vertical reorder');
  }
  const sharedLeft = Math.max(sourceBox.x + 4, targetBox.x + 4);
  const sharedRight = Math.min(sourceBox.x + sourceBox.width - 4, targetBox.x + targetBox.width - 4);
  const dragX =
    sharedRight > sharedLeft
      ? sharedLeft + (sharedRight - sharedLeft) / 2
      : sourceBox.x + Math.min(Math.max(8, sourceBox.width / 4), sourceBox.width - 4);
  const startY = sourceBox.y + sourceBox.height / 2;
  const rowGap = Math.max(targetBox.y - sourceBox.y, targetBox.height);
  const targetY =
    placement === 'before'
      ? targetBox.y + Math.min(6, Math.max(3, targetBox.height * 0.2))
      : targetBox.y + rowGap + targetBox.height / 2;

  await page.mouse.move(dragX, startY);
  await page.mouse.down();
  await page.mouse.move(dragX, targetY, { steps: 16 });
  await page.mouse.up();
  await page.waitForTimeout(50);
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
  const defaultSection =
    sections.find((section: { isDefault?: boolean }) => section.isDefault) ?? sections[0];

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
  const saveResponse = freshPage.waitForResponse(
    (response) =>
      response.url().includes(`/projects/${projectId}/timeline/preferences/view-state/timeline`) &&
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
  await expect(
    savedDefaultPage.locator('[data-testid="timeline-swimlane-status"]'),
  ).toHaveAttribute('data-active', 'true');
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

test('timeline manual vertical reorder persists within section, assignee, and status lanes', async ({
  page,
}) => {
  const now = Date.now();
  const sub = `e2e-timeline-vertical-${now}`;
  const email = `${sub}@example.com`;

  await login(page, sub, email);
  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Timeline Vertical Reorder ${now}`,
  });
  const projectId = project.id as string;
  const sectionLane = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Section Lane',
  });
  const sharedSection = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Shared Lane',
  });

  const sectionTopTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: sectionLane.id,
    title: `Section Top ${now}`,
    status: 'TODO',
    startAt: dayIso(1),
    dueAt: dayIso(4),
  });
  const sectionBottomTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: sectionLane.id,
    title: `Section Bottom ${now}`,
    status: 'DONE',
    startAt: dayIso(2),
    dueAt: dayIso(5),
  });
  const assigneeTopTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: sharedSection.id,
    title: `Assignee Top ${now}`,
    assigneeUserId: sub,
    status: 'BLOCKED',
    startAt: dayIso(1),
    dueAt: dayIso(4),
  });
  const assigneeBottomTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: sharedSection.id,
    title: `Assignee Bottom ${now}`,
    assigneeUserId: sub,
    status: 'DONE',
    startAt: dayIso(2),
    dueAt: dayIso(5),
  });
  const statusTopTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: sharedSection.id,
    title: `Status Top ${now}`,
    status: 'IN_PROGRESS',
    startAt: dayIso(1),
    dueAt: dayIso(4),
  });
  const statusBottomTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: sharedSection.id,
    title: `Status Bottom ${now}`,
    status: 'IN_PROGRESS',
    startAt: dayIso(2),
    dueAt: dayIso(5),
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();

  await dragTimelineBarToTaskPosition(page, sectionTopTask.id, sectionBottomTask.id, 'after');
  await expect
    .poll(async () => {
      const [topY, bottomY] = await Promise.all([
        timelineBarTop(page, sectionTopTask.id),
        timelineBarTop(page, sectionBottomTask.id),
      ]);
      return topY > bottomY;
    })
    .toBe(true);

  await page.click('[data-testid="timeline-swimlane-assignee"]');
  await expect(page.locator('[data-testid="timeline-swimlane-assignee"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await dragTimelineBarToTaskPosition(page, assigneeTopTask.id, assigneeBottomTask.id, 'after');
  await expect
    .poll(async () => {
      const [topY, bottomY] = await Promise.all([
        timelineBarTop(page, assigneeTopTask.id),
        timelineBarTop(page, assigneeBottomTask.id),
      ]);
      return topY > bottomY;
    })
    .toBe(true);

  await page.click('[data-testid="timeline-swimlane-status"]');
  await expect(page.locator('[data-testid="timeline-swimlane-status"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await dragTimelineBarToTaskPosition(page, statusTopTask.id, statusBottomTask.id, 'after');
  await expect
    .poll(async () => {
      const [topY, bottomY] = await Promise.all([
        timelineBarTop(page, statusTopTask.id),
        timelineBarTop(page, statusBottomTask.id),
      ]);
      return topY > bottomY;
    })
    .toBe(true);

  await page.reload();
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();

  await expect
    .poll(async () => {
      const [topY, bottomY] = await Promise.all([
        timelineBarTop(page, statusTopTask.id),
        timelineBarTop(page, statusBottomTask.id),
      ]);
      return topY > bottomY;
    })
    .toBe(true);

  await page.click('[data-testid="timeline-swimlane-section"]');
  await expect
    .poll(async () => {
      const [topY, bottomY] = await Promise.all([
        timelineBarTop(page, sectionTopTask.id),
        timelineBarTop(page, sectionBottomTask.id),
      ]);
      return topY > bottomY;
    })
    .toBe(true);

  await page.click('[data-testid="timeline-swimlane-assignee"]');
  await expect
    .poll(async () => {
      const [topY, bottomY] = await Promise.all([
        timelineBarTop(page, assigneeTopTask.id),
        timelineBarTop(page, assigneeBottomTask.id),
      ]);
      return topY > bottomY;
    })
    .toBe(true);
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
