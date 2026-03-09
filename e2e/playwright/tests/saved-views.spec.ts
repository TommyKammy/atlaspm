import { expect, test, type Browser, type Page } from '@playwright/test';

const API = process.env.E2E_CORE_API_URL ?? 'http://localhost:3001';

async function api(path: string, token: string, method = 'GET', body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
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

async function openSavedViews(page: Page) {
  await page.click('[data-testid="project-saved-views-trigger"]');
  await expect(page.locator('[data-testid="project-saved-views-popover"]')).toBeVisible();
}

async function openFilter(page: Page) {
  await page.click('[data-testid="project-filter-trigger"]');
}

async function filterDoneOnly(page: Page) {
  await openFilter(page);
  const done = page.locator('[data-testid="project-filter-status-DONE"] input');
  if (!(await done.isChecked())) {
    await page.click('[data-testid="project-filter-status-DONE"]');
    await expect(done).toBeChecked();
  }
  const todo = page.locator('[data-testid="project-filter-status-TODO"] input');
  if (await todo.isChecked()) {
    await page.click('[data-testid="project-filter-status-TODO"]');
    await expect(todo).not.toBeChecked();
  }
}

async function expectDoneOnlyVisible(page: Page) {
  await expect(page.locator('[data-task-title="Task Beta"]')).toBeVisible();
  await expect(page.locator('[data-task-title="Task Alpha"]')).toHaveCount(0);
}

async function expectTodoOnlyVisible(page: Page) {
  await expect(page.locator('[data-task-title="Task Alpha"]')).toBeVisible();
  await expect(page.locator('[data-task-title="Task Beta"]')).toHaveCount(0);
}

async function createProjectFixture(page: Page, token: string) {
  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const now = Date.now();
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Saved Views ${now}`,
  });
  const projectId = project.id as string;
  const sections = await api(`/projects/${projectId}/sections`, token);
  const defaultSection = sections.find((section: any) => section.isDefault) ?? sections[0];

  const taskAlpha = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: defaultSection.id,
    title: 'Task Alpha',
  });
  const taskBeta = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: defaultSection.id,
    title: 'Task Beta',
  });
  await api(`/tasks/${taskAlpha.id}`, token, 'PATCH', {
    status: 'TODO',
    version: taskAlpha.version,
  });
  await api(`/tasks/${taskBeta.id}`, token, 'PATCH', {
    status: 'DONE',
    version: taskBeta.version,
  });

  await page.goto(`/projects/${projectId}`);
  await expect(page.locator('[data-testid="add-new-trigger"]')).toBeVisible();
  await expect(page.locator('[data-task-title="Task Alpha"]')).toBeVisible();
  await expect(page.locator('[data-task-title="Task Beta"]')).toBeVisible();

  return { projectId, taskAlpha, taskBeta };
}

async function openFreshProject(browser: Browser, sub: string, email: string, projectId: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, sub, email);
  await page.goto(`/projects/${projectId}`);
  await expect(page.locator('[data-testid="add-new-trigger"]')).toBeVisible();
  return { context, page };
}

test('saved view header flow supports save, default, apply, rename, and delete without refresh', async ({
  browser,
  page,
}) => {
  const now = Date.now();
  const sub = `saved-views-${now}`;
  const email = `${sub}@example.com`;

  await login(page, sub, email);

  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const { projectId } = await createProjectFixture(page, token);

  await filterDoneOnly(page);
  await expectDoneOnlyVisible(page);

  await openSavedViews(page);
  await page.click('[data-testid="project-save-view-trigger"]');
  await page.fill('[data-testid="project-save-view-name-input"]', 'Done only');
  await page.click('[data-testid="project-save-view-confirm"]');

  let savedView: any = null;
  await expect
    .poll(async () => {
      const response = await api(`/projects/${projectId}/saved-views`, token);
      savedView = response.views.find((view: any) => view.name === 'Done only') ?? null;
      return Boolean(savedView?.id);
    })
    .toBe(true);
  expect(savedView.mode).toBe('list');

  await openSavedViews(page);
  await page.click('[data-testid="project-save-default-view"]');
  await expect
    .poll(async () => {
      const response = await api(`/projects/${projectId}/saved-views`, token);
      return response.defaultsByMode.list?.filters?.statusIds?.join(',') ?? '';
    })
    .toBe('DONE');

  await page.goto(`/projects/${projectId}?statuses=TODO`);
  await expect(page.locator('[data-testid="add-new-trigger"]')).toBeVisible();
  await expectTodoOnlyVisible(page);

  await openSavedViews(page);
  await page.click(`[data-testid="project-saved-view-apply-${savedView.id}"]`);
  await expectDoneOnlyVisible(page);

  await openSavedViews(page);
  await page.click(`[data-testid="project-saved-view-rename-${savedView.id}"]`);
  await page.fill('[data-testid="project-rename-view-name-input"]', 'Done later');
  await page.click('[data-testid="project-rename-view-confirm"]');
  await expect
    .poll(async () => {
      const response = await api(`/projects/${projectId}/saved-views`, token);
      return response.views.find((view: any) => view.id === savedView.id)?.name ?? null;
    })
    .toBe('Done later');

  const fresh = await openFreshProject(browser, sub, email, projectId);
  await expectDoneOnlyVisible(fresh.page);
  await fresh.context.close();

  await openSavedViews(page);
  await page.click(`[data-testid="project-saved-view-delete-${savedView.id}"]`);
  await page.click('[data-testid="project-delete-view-confirm"]');
  await expect
    .poll(async () => {
      const response = await api(`/projects/${projectId}/saved-views`, token);
      return response.views.length;
    })
    .toBe(0);
});
