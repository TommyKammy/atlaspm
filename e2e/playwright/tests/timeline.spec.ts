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

function dayIso(deltaDays: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + deltaDays);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}T00:00:00.000Z`;
}

async function timelineBarBox(page: Page, taskId: string) {
  const bar = page.locator(`[data-testid="timeline-bar-${taskId}"]`);
  await bar.scrollIntoViewIfNeeded();
  await expect(bar).toBeVisible();
  await expect
    .poll(async () => {
      const box = await bar.boundingBox();
      return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
    })
    .not.toBeNull();
  const box = await bar.boundingBox();
  if (!box) {
    throw new Error(`Expected timeline bar bounds for ${taskId}`);
  }
  return box;
}

async function dragTimelineBarHorizontally(page: Page, taskId: string, deltaX: number, altKey = false) {
  const bar = page.locator(`[data-testid="timeline-bar-${taskId}"]`);
  const box = await timelineBarBox(page, taskId);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await bar.dispatchEvent('pointerdown', {
    button: 0,
    clientX: startX,
    clientY: startY,
    pointerType: 'mouse',
    isPrimary: true,
    bubbles: true,
    altKey,
  });
  await page.evaluate(
    ({ clientX, clientY, altKey }) => {
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX,
          clientY,
          pointerType: 'mouse',
          isPrimary: true,
          bubbles: true,
          altKey,
        }),
      );
      window.dispatchEvent(
        new PointerEvent('pointerup', {
          clientX,
          clientY,
          pointerType: 'mouse',
          isPrimary: true,
          bubbles: true,
          altKey,
        }),
      );
    },
    { clientX: startX + deltaX, clientY: startY, altKey },
  );
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

  const section = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Timeline Section',
  });

  const taskA = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Timeline Task A ${now}`,
    startAt: dayIso(-1),
    dueAt: dayIso(2),
  });
  const taskB = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Timeline Task B ${now}`,
    startAt: dayIso(2),
    dueAt: dayIso(4),
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
  await expect(
    page.locator(`[data-testid="timeline-connector-${taskA.id}-${taskB.id}"]`),
  ).toBeVisible();

  await page.click(`[data-testid="timeline-bar-${taskB.id}"]`);
  await expect(page.locator('[data-testid="task-detail-title-input"]')).toHaveValue(
    `Timeline Task B ${now}`,
  );
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="task-detail-title-input"]')).toHaveCount(0);

  await page.click(`[data-testid="timeline-bar-${taskA.id}"]`);
  await expect(page.locator('[data-testid="task-detail-title-input"]')).toHaveValue(
    `Timeline Task A ${now}`,
  );
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-testid="task-detail-title-input"]')).toHaveCount(0);

  await page.click('[data-testid="timeline-zoom-month"]');
  await expect(page.locator('[data-testid="timeline-zoom-month"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await page.click('[data-testid="timeline-next-window"]');
  const windowLabel = await page.locator('[data-testid="timeline-window-label"]').textContent();

  await page.reload();
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-zoom-month"]')).toHaveAttribute(
    'data-active',
    'true',
  );
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
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Timeline Section',
  });

  const taskA = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Timeline Source ${now}`,
    startAt: dayIso(0),
    dueAt: dayIso(3),
  });
  const taskB = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Timeline Target ${now}`,
    startAt: dayIso(4),
    dueAt: dayIso(6),
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

  await handle.dispatchEvent('pointerdown', {
    button: 0,
    clientX: handleBox.x + handleBox.width / 2,
    clientY: handleBox.y + handleBox.height / 2,
    pointerType: 'mouse',
    isPrimary: true,
    bubbles: true,
  });
  await page.evaluate(
    ({ clientX, clientY }) => {
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX,
          clientY,
          pointerType: 'mouse',
          isPrimary: true,
          bubbles: true,
        }),
      );
    },
    {
      clientX: targetBox.x + 12,
      clientY: targetBox.y + targetBox.height / 2,
    },
  );
  await expect(page.locator('[data-testid="timeline-dependency-preview"]')).toHaveCount(1);
  await page.evaluate(
    ({ clientX, clientY }) => {
      window.dispatchEvent(
        new PointerEvent('pointerup', {
          clientX,
          clientY,
          pointerType: 'mouse',
          isPrimary: true,
          bubbles: true,
        }),
      );
    },
    {
      clientX: targetBox.x + 12,
      clientY: targetBox.y + targetBox.height / 2,
    },
  );

  await expect(page.locator('[data-testid="timeline-dependency-preview"]')).toHaveCount(0);

  await expect
    .poll(async () => {
      const dependencies = (await api(`/tasks/${taskB.id}/dependencies`, token)) as Array<{
        dependsOnId: string;
      }>;
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
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Timeline Section',
  });

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
  await expect(page.locator(`[data-testid="timeline-bar-${blocked.id}"]`)).toHaveAttribute(
    'data-at-risk',
    'true',
  );
  await expect(page.locator(`[data-testid="timeline-bar-${blocked.id}"]`)).toHaveAttribute(
    'data-risk-kind',
    /open blockers|late blockers|未解決ブロッカー|期限遅延依存/,
  );
});

test('timeline multi-select shifts multiple tasks together', async ({ page }) => {
  const now = Date.now();
  const sub = `e2e-timeline-multi-${now}`;
  const email = `e2e-timeline-multi-${now}@example.com`;

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
    name: `Timeline Multi ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Timeline Section',
  });

  const taskA = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Timeline Multi A ${now}`,
    startAt: dayIso(0),
    dueAt: dayIso(2),
  });
  const taskB = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Timeline Multi B ${now}`,
    startAt: dayIso(4),
    dueAt: dayIso(6),
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();

  const firstBar = page.locator(`[data-testid="timeline-bar-${taskA.id}"]`);
  const secondBar = page.locator(`[data-testid="timeline-bar-${taskB.id}"]`);
  const firstBox = await firstBar.boundingBox();
  if (!firstBox) {
    throw new Error('Expected timeline bars to have bounds');
  }

  await firstBar.click({ modifiers: ['Shift'] });
  await secondBar.click({ modifiers: ['Shift'] });

  await expect(page.locator('[data-testid="timeline-selection-count"]')).toContainText('2');
  await expect(firstBar).toHaveAttribute('data-selected', 'true');
  await expect(secondBar).toHaveAttribute('data-selected', 'true');

  const dragStart = await firstBar.boundingBox();
  if (!dragStart) {
    throw new Error('Expected selected timeline bar bounds');
  }

  const deltaX = 72;
  await page.mouse.move(dragStart.x + dragStart.width / 2, dragStart.y + dragStart.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    dragStart.x + dragStart.width / 2 + deltaX,
    dragStart.y + dragStart.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();

  await expect
    .poll(async () => {
      const [updatedA, updatedB] = await Promise.all([
        api(`/tasks/${taskA.id}`, token),
        api(`/tasks/${taskB.id}`, token),
      ]);
      return {
        a: updatedA.startAt as string,
        b: updatedB.startAt as string,
      };
    })
    .toEqual({
      a: dayIso(2),
      b: dayIso(6),
    });
});

test('timeline marquee selection can shift multiple tasks together immediately', async ({
  page,
}) => {
  const now = Date.now();
  const sub = `e2e-timeline-marquee-${now}`;
  const email = `e2e-timeline-marquee-${now}@example.com`;

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
    name: `Timeline Marquee ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Timeline Section',
  });

  const taskA = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Timeline Marquee A ${now}`,
    startAt: dayIso(0),
    dueAt: dayIso(2),
  });
  const taskB = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Timeline Marquee B ${now}`,
    startAt: dayIso(4),
    dueAt: dayIso(6),
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();

  const firstBar = page.locator(`[data-testid="timeline-bar-${taskA.id}"]`);
  const secondBar = page.locator(`[data-testid="timeline-bar-${taskB.id}"]`);
  const firstBox = await firstBar.boundingBox();
  const secondBox = await secondBar.boundingBox();
  const selectionSurface = page.locator('[data-testid="timeline-selection-surface"]');
  const selectionSurfaceBox = await selectionSurface.boundingBox();
  if (!firstBox || !secondBox || !selectionSurfaceBox) {
    throw new Error('Expected timeline bars and selection surface to have bounds');
  }

  const startX = selectionSurfaceBox.x + selectionSurfaceBox.width - 24;
  const startY = firstBox.y - 8;
  const endX = Math.min(firstBox.x, secondBox.x) - 12;
  const endY = Math.max(firstBox.y + firstBox.height, secondBox.y + secondBox.height) + 20;

  await selectionSurface.dispatchEvent('pointerdown', {
    button: 0,
    clientX: startX,
    clientY: startY,
    pointerType: 'mouse',
    isPrimary: true,
    bubbles: true,
  });
  await page.evaluate(
    ({ startX: sx, startY: sy, endX: ex, endY: ey }) => {
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: (sx + ex) / 2,
          clientY: (sy + ey) / 2,
          pointerType: 'mouse',
          isPrimary: true,
          bubbles: true,
        }),
      );
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: ex,
          clientY: ey,
          pointerType: 'mouse',
          isPrimary: true,
          bubbles: true,
        }),
      );
    },
    { startX, startY, endX, endY },
  );
  await expect(page.locator('[data-testid="timeline-selection-box"]')).toBeVisible();
  await page.evaluate(
    ({ clientX, clientY }) => {
      window.dispatchEvent(
        new PointerEvent('pointerup', {
          clientX,
          clientY,
          pointerType: 'mouse',
          isPrimary: true,
          bubbles: true,
        }),
      );
    },
    { clientX: endX, clientY: endY },
  );
  await expect(page.locator('[data-testid="timeline-selection-count"]')).toContainText('2');
  await expect(firstBar).toHaveAttribute('data-selected', 'true');
  await expect(secondBar).toHaveAttribute('data-selected', 'true');
  const dragBox = await firstBar.boundingBox();
  if (!dragBox) {
    throw new Error('Expected selected first bar bounds after marquee');
  }

  const deltaX = 72;
  await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dragBox.x + dragBox.width / 2 + deltaX, dragBox.y + dragBox.height / 2, {
    steps: 12,
  });
  await page.mouse.up();

  await expect
    .poll(async () => {
      const [updatedA, updatedB] = await Promise.all([
        api(`/tasks/${taskA.id}`, token),
        api(`/tasks/${taskB.id}`, token),
      ]);
      return {
        a: updatedA.startAt as string,
        b: updatedB.startAt as string,
      };
    })
    .toEqual({
      a: dayIso(2),
      b: dayIso(6),
    });
});

test('timeline working-days drag skips weekends and Alt keeps calendar-day placement', async ({
  page,
}) => {
  const now = Date.now();
  const sub = `e2e-timeline-working-days-${now}`;
  const email = `e2e-timeline-working-days-${now}@example.com`;

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
    name: `Timeline Working Days ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Timeline Section',
  });

  const friday = new Date('2026-03-06T00:00:00.000Z');
  const saturday = new Date('2026-03-07T00:00:00.000Z');
  const monday = new Date('2026-03-09T00:00:00.000Z');

  const taskA = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Timeline Working Days A ${now}`,
    startAt: friday.toISOString(),
    dueAt: friday.toISOString(),
  });
  const taskB = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Timeline Working Days B ${now}`,
    startAt: friday.toISOString(),
    dueAt: friday.toISOString(),
  });

  await api(`/projects/${projectId}/timeline/preferences/view-state/timeline`, token, 'PUT', {
    zoom: 'day',
    anchorDate: friday.toISOString(),
    swimlane: 'section',
    sortMode: 'manual',
    scheduleFilter: 'scheduled',
    workingDaysOnly: true,
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-working-days-toggle"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expect(page.locator('[data-testid="timeline-zoom-day"]')).toHaveAttribute(
    'data-active',
    'true',
  );

  const secondBar = page.locator(`[data-testid="timeline-bar-${taskB.id}"]`);
  const firstBox = await timelineBarBox(page, taskA.id);

  const deltaX = 64;

  await dragTimelineBarHorizontally(page, taskA.id, deltaX);

  await expect
    .poll(async () => {
      const updated = await api(`/tasks/${taskA.id}`, token);
      return updated.startAt as string;
    })
    .toBe(monday.toISOString());

  const secondBox = await secondBar.boundingBox();
  if (!secondBox) {
    throw new Error('Expected second timeline bar to have bounds after rerender');
  }

  await dragTimelineBarHorizontally(page, taskB.id, deltaX, true);

  await expect
    .poll(async () => {
      const updated = await api(`/tasks/${taskB.id}`, token);
      return updated.startAt as string;
    })
    .toBe(saturday.toISOString());
});

test('timeline align action saves dependency chains ahead of unrelated blockers', async ({
  page,
}) => {
  const now = Date.now();
  const sub = `e2e-timeline-align-${now}`;
  const email = `e2e-timeline-align-${now}@example.com`;

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
    name: `Timeline Align ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Timeline Section',
  });

  const blocker = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Timeline Blocker ${now}`,
    startAt: '2026-03-02T00:00:00.000Z',
    dueAt: '2026-03-10T00:00:00.000Z',
  });
  const chainA = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Timeline Chain A ${now}`,
    startAt: '2026-03-05T00:00:00.000Z',
    dueAt: '2026-03-06T00:00:00.000Z',
  });
  const chainB = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Timeline Chain B ${now}`,
    startAt: '2026-03-07T00:00:00.000Z',
    dueAt: '2026-03-08T00:00:00.000Z',
  });
  await api(`/tasks/${chainB.id}/dependencies`, token, 'POST', {
    dependsOnId: chainA.id,
    type: 'BLOCKS',
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();

  const blockerBar = page.locator(`[data-testid="timeline-bar-${blocker.id}"]`);
  const chainABar = page.locator(`[data-testid="timeline-bar-${chainA.id}"]`);
  const chainBBar = page.locator(`[data-testid="timeline-bar-${chainB.id}"]`);

  const beforeBlockerBox = await blockerBar.boundingBox();
  const beforeChainABox = await chainABar.boundingBox();
  if (!beforeBlockerBox || !beforeChainABox) {
    throw new Error('Expected timeline bars before align');
  }
  expect(beforeChainABox.y).toBeGreaterThan(beforeBlockerBox.y);

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        response.url().includes(
          `/projects/${projectId}/timeline/preferences/manual-layout/section`,
        ),
    ),
    page.click('[data-testid="timeline-align-toggle"]'),
  ]);

  await expect
    .poll(async () => {
      const [nextBlockerBox, nextChainABox, nextChainBBox] = await Promise.all([
        blockerBar.boundingBox(),
        chainABar.boundingBox(),
        chainBBar.boundingBox(),
      ]);
      return {
        blockerY: Math.round(nextBlockerBox?.y ?? -1),
        chainAY: Math.round(nextChainABox?.y ?? -1),
        chainBY: Math.round(nextChainBBox?.y ?? -1),
      };
    })
    .toMatchObject({
      chainAY: Math.round(beforeBlockerBox.y),
      chainBY: Math.round(beforeBlockerBox.y),
    });

  await expect
    .poll(async () => {
      const [nextBlockerBox, nextChainBBox] = await Promise.all([
        blockerBar.boundingBox(),
        chainBBar.boundingBox(),
      ]);
      return Math.round((nextBlockerBox?.y ?? -1) - (nextChainBBox?.y ?? -1));
    })
    .toBeGreaterThan(0);

  await page.reload();
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();

  await expect
    .poll(async () => {
      const [nextBlockerBox, nextChainABox, nextChainBBox] = await Promise.all([
        blockerBar.boundingBox(),
        chainABar.boundingBox(),
        chainBBar.boundingBox(),
      ]);
      return {
        blockerY: Math.round(nextBlockerBox?.y ?? -1),
        chainAY: Math.round(nextChainABox?.y ?? -1),
        chainBY: Math.round(nextChainBBox?.y ?? -1),
      };
    })
    .toMatchObject({
      chainAY: Math.round(beforeBlockerBox.y),
      chainBY: Math.round(beforeBlockerBox.y),
    });

  await expect
    .poll(async () => {
      const [nextBlockerBox, nextChainBBox] = await Promise.all([
        blockerBar.boundingBox(),
        chainBBar.boundingBox(),
      ]);
      return Math.round((nextBlockerBox?.y ?? -1) - (nextChainBBox?.y ?? -1));
    })
    .toBeGreaterThan(0);
});
