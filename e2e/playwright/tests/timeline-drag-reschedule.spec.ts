import { expect, test, type Page } from './helpers/browser-auth';

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

function addDaysIso(value: string, deltaDays: number): string {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString();
}

async function loginWithTimelineEnabled(page: Page, sub: string, email: string) {
  await page.goto('/login');
  await page.evaluate(() => localStorage.setItem('atlaspm:feature:timeline', 'enabled'));
  await page.fill('input[placeholder="OIDC sub"]', sub);
  await page.fill('input[placeholder="Email"]', email);
  await page.click('button:has-text("Dev Login")');
  await page.waitForURL('**/');
}

async function dragTimelineBar(page: Page, taskId: string, deltaDays: number) {
  const bar = page.locator(`[data-testid="timeline-bar-${taskId}"]`);
  await bar.scrollIntoViewIfNeeded();
  await expect(bar).toBeVisible();
  await expect
    .poll(async () => {
      const resolved = await bar.boundingBox();
      return resolved ? { x: resolved.x, y: resolved.y, width: resolved.width, height: resolved.height } : null;
    })
    .not.toBeNull();
  const box = await bar.boundingBox();
  if (!box) throw new Error(`Unable to resolve bounds for timeline bar ${taskId}`);
  const startX = box.x + Math.min(Math.max(8, box.width / 4), box.width - 4);
  const startY = box.y + box.height / 2;
  await bar.dispatchEvent('pointerdown', {
    button: 0,
    clientX: startX,
    clientY: startY,
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
    { clientX: startX + deltaDays * DAY_COLUMN_WIDTH, clientY: startY },
  );
}

test('timeline drag reschedule supports optimistic success and conflict rollback banner', async ({ page }) => {
  const now = Date.now();
  const sub = `e2e-timeline-drag-${now}`;
  const email = `${sub}@example.com`;

  await loginWithTimelineEnabled(page, sub, email);
  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Timeline Drag ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', { name: 'Timeline Section' });

  const nowUtc = new Date();
  const baseStartIso = new Date(
    Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), nowUtc.getUTCDate() + 2, 0, 0, 0, 0),
  ).toISOString();
  const baseDueIso = addDaysIso(baseStartIso, 2);

  const taskA = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Drag Success ${now}`,
    startAt: baseStartIso,
    dueAt: baseDueIso,
  });
  const taskB = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Drag Conflict ${now}`,
    startAt: baseStartIso,
    dueAt: baseDueIso,
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await page.click('[data-testid="timeline-zoom-day"]');
  await expect(page.locator('[data-testid="timeline-zoom-day"]')).toHaveAttribute('data-active', 'true');

  const taskABefore = await api(`/tasks/${taskA.id}`, token);
  const expectedTaskADue = addDaysIso(taskABefore.dueAt, 2);
  await dragTimelineBar(page, taskA.id, 2);
  await expect
    .poll(async () => {
      const latest = await api(`/tasks/${taskA.id}`, token);
      return String(latest.dueAt).slice(0, 10);
    })
    .toBe(expectedTaskADue.slice(0, 10));

  const taskBStale = await api(`/tasks/${taskB.id}`, token);
  const externalTaskBDue = addDaysIso(taskBStale.dueAt, 1);
  await api(`/tasks/${taskB.id}/reschedule`, token, 'PATCH', {
    dueAt: externalTaskBDue,
    version: taskBStale.version,
  });

  await dragTimelineBar(page, taskB.id, 2);

  await expect(page.locator('[data-testid="timeline-reschedule-conflict-banner"]')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await expect
    .poll(async () => {
      const latest = await api(`/tasks/${taskB.id}`, token);
      return String(latest.dueAt).slice(0, 10);
    })
    .toBe(externalTaskBDue.slice(0, 10));
});

test('timeline drag on a parent task offers undo when many subtasks stay in place', async ({
  page,
}) => {
  const now = Date.now();
  const sub = `e2e-timeline-parent-move-${now}`;
  const email = `${sub}@example.com`;

  await loginWithTimelineEnabled(page, sub, email);
  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Timeline Parent Move ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', { name: 'Timeline Section' });

  const nowUtc = new Date();
  const baseStartIso = new Date(
    Date.UTC(nowUtc.getUTCFullYear(), nowUtc.getUTCMonth(), nowUtc.getUTCDate() + 2, 0, 0, 0, 0),
  ).toISOString();
  const baseDueIso = addDaysIso(baseStartIso, 2);

  const parentTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Drag Parent ${now}`,
    startAt: baseStartIso,
    dueAt: baseDueIso,
  });

  for (let index = 0; index < 5; index += 1) {
    const childStart = addDaysIso(baseStartIso, index);
    await api(`/tasks/${parentTask.id}/subtasks`, token, 'POST', {
      title: `Drag Child ${index + 1} ${now}`,
      startAt: childStart,
      dueAt: childStart,
    });
  }

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await page.click('[data-testid="timeline-zoom-day"]');
  await expect(page.locator('[data-testid="timeline-zoom-day"]')).toHaveAttribute('data-active', 'true');

  await dragTimelineBar(page, parentTask.id, 2);

  await expect(page.locator('[data-testid="timeline-parent-move-undo-banner"]')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-parent-move-undo-banner"]')).toContainText(
    '5',
  );
  await expect
    .poll(async () => {
      const latest = await api(`/tasks/${parentTask.id}`, token);
      return String(latest.startAt).slice(0, 10);
    })
    .toBe(addDaysIso(baseStartIso, 2).slice(0, 10));

  await page.click('[data-testid="timeline-parent-move-undo-action"]');

  await expect
    .poll(async () => {
      const latest = await api(`/tasks/${parentTask.id}`, token);
      return String(latest.startAt).slice(0, 10);
    })
    .toBe(baseStartIso.slice(0, 10));
});
