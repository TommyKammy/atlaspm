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
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}T00:00:00.000Z`;
}

function laneRailTestId(laneTestId: string) {
  return laneTestId.replace('timeline-lane-', 'timeline-lane-rail-');
}

async function expectHeaderOnlyRail(page: Page, laneTestId: string, hiddenTaskTitles: string[]) {
  const laneRail = page.locator(`[data-testid="${laneRailTestId(laneTestId)}"]`);
  await expect(laneRail).toHaveAttribute('data-header-only', 'true');
  for (const taskTitle of hiddenTaskTitles) {
    await expect(laneRail).not.toContainText(taskTitle);
  }
}

async function expectTaskRailHidden(page: Page, taskIds: string[]) {
  for (const taskId of taskIds) {
    await expect(page.locator(`[data-testid="timeline-rail-task-${taskId}"]`)).toHaveCount(0);
    await expect(page.locator(`[data-testid="timeline-rail-branch-${taskId}"]`)).toHaveCount(0);
    await expect(page.locator(`[data-testid="timeline-bar-${taskId}"]`)).toBeVisible();
  }
}

test('timeline grouped swimlanes keep left rails header-only even when subtasks share a lane', async ({
  page,
}) => {
  const now = Date.now();
  const sub = `e2e-timeline-grouped-subtasks-${now}`;
  const email = `${sub}@example.com`;

  await login(page, sub, email);

  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Timeline Grouped Subtasks ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Timeline Section',
  });

  const sameGroupParent = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Same Group Parent ${now}`,
    assigneeUserId: sub,
    startAt: dayIso(0),
    dueAt: dayIso(4),
  });
  const sameGroupChild = await api(`/tasks/${sameGroupParent.id}/subtasks`, token, 'POST', {
    title: `Same Group Child ${now}`,
    startAt: dayIso(1),
    dueAt: dayIso(2),
  });
  await api(`/tasks/${sameGroupChild.id}`, token, 'PATCH', {
    assigneeUserId: sub,
    version: sameGroupChild.version,
  });

  const splitGroupParent = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Split Group Parent ${now}`,
    assigneeUserId: sub,
    startAt: dayIso(5),
    dueAt: dayIso(8),
  });
  const splitGroupChild = await api(`/tasks/${splitGroupParent.id}/subtasks`, token, 'POST', {
    title: `Split Group Child ${now}`,
    startAt: dayIso(6),
    dueAt: dayIso(7),
  });
  await api(`/tasks/${splitGroupChild.id}`, token, 'PATCH', {
    assigneeUserId: null,
    progressPercent: 100,
    status: 'DONE',
    version: splitGroupChild.version,
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();

  await page.click('[data-testid="timeline-swimlane-assignee"]');
  await expect(page.locator('[data-testid="timeline-swimlane-assignee"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expectHeaderOnlyRail(page, `timeline-lane-assignee-${sub}`, [
    sameGroupParent.title,
    sameGroupChild.title,
    splitGroupParent.title,
  ]);
  await expectHeaderOnlyRail(page, 'timeline-lane-assignee-__unassigned__', [splitGroupChild.title]);
  await expectTaskRailHidden(page, [
    sameGroupParent.id,
    sameGroupChild.id,
    splitGroupParent.id,
    splitGroupChild.id,
  ]);

  await page.click('[data-testid="timeline-swimlane-status"]');
  await expect(page.locator('[data-testid="timeline-swimlane-status"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expectHeaderOnlyRail(page, 'timeline-lane-status-IN_PROGRESS', [
    sameGroupParent.title,
    sameGroupChild.title,
    splitGroupParent.title,
  ]);
  await expectHeaderOnlyRail(page, 'timeline-lane-status-DONE', [splitGroupChild.title]);
  await expectTaskRailHidden(page, [
    sameGroupParent.id,
    sameGroupChild.id,
    splitGroupParent.id,
    splitGroupChild.id,
  ]);
});

test('timeline grouped rails ignore unscheduled subtasks when visible lanes stay flat', async ({
  page,
}) => {
  const now = Date.now();
  const sub = `e2e-timeline-unscheduled-subtasks-${now}`;
  const email = `${sub}@example.com`;

  await login(page, sub, email);

  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Timeline Unscheduled Subtasks ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Timeline Section',
  });

  const parentTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Visible Parent ${now}`,
    assigneeUserId: sub,
    startAt: dayIso(0),
    dueAt: dayIso(3),
  });
  const unscheduledChild = await api(`/tasks/${parentTask.id}/subtasks`, token, 'POST', {
    title: `Hidden Child ${now}`,
  });
  await api(`/tasks/${unscheduledChild.id}`, token, 'PATCH', {
    assigneeUserId: sub,
    version: unscheduledChild.version,
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();

  await page.click('[data-testid="timeline-swimlane-assignee"]');
  await expect(page.locator('[data-testid="timeline-swimlane-assignee"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expectHeaderOnlyRail(page, `timeline-lane-assignee-${sub}`, [
    parentTask.title,
    unscheduledChild.title,
  ]);
  await expectTaskRailHidden(page, [parentTask.id]);

  await page.click('[data-testid="timeline-swimlane-status"]');
  await expect(page.locator('[data-testid="timeline-swimlane-status"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expectHeaderOnlyRail(page, 'timeline-lane-status-IN_PROGRESS', [
    parentTask.title,
    unscheduledChild.title,
  ]);
  await expectTaskRailHidden(page, [parentTask.id]);
});

test('timeline subtask detail navigation preserves the timeline view query', async ({ page }) => {
  const now = Date.now();
  const sub = `e2e-timeline-subtask-route-${now}`;
  const email = `${sub}@example.com`;

  await login(page, sub, email);

  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Timeline Subtask Route ${now}`,
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, token, 'POST', {
    name: 'Timeline Section',
  });

  const parentTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: section.id,
    title: `Route Parent ${now}`,
    assigneeUserId: sub,
    startAt: dayIso(0),
    dueAt: dayIso(3),
  });
  const childTask = await api(`/tasks/${parentTask.id}/subtasks`, token, 'POST', {
    title: `Route Child ${now}`,
    startAt: dayIso(1),
    dueAt: dayIso(2),
  });

  await page.goto(`/projects/${projectId}?view=timeline&task=${childTask.id}`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}\\?view=timeline&task=${childTask.id}`));
  await expect(page.locator('[data-testid="task-detail-title-input"]')).toHaveValue(childTask.title);

  await page
    .getByTestId('subtasks-section')
    .getByRole('button', { name: parentTask.title })
    .click();

  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}\\?view=timeline&task=${parentTask.id}`));
  await expect(page.locator('[data-testid="task-detail-title-input"]')).toHaveValue(parentTask.title);
});
