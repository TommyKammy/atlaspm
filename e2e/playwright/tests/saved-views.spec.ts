import { expect, test, type Page } from './helpers/browser-auth';

const API = process.env.E2E_CORE_API_URL ?? 'http://localhost:3001';

async function devLogin(page: Page, sub: string, email: string) {
  await page.goto('/login');
  await page.fill('input[placeholder="OIDC sub"]', sub);
  await page.fill('input[placeholder="Email"]', email);
  await page.click('button:has-text("Dev Login")');
  await page.waitForURL('**/');
}

async function getToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token'));
  if (!token) throw new Error('Missing atlaspm token');
  return token;
}

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
  if (!raw) return null;
  return JSON.parse(raw);
}

async function createProject(page: Page, token: string, name: string) {
  const workspaces = (await api('/workspaces', token)) as Array<{ id: string }>;
  const workspaceId = workspaces[0]?.id;
  if (!workspaceId) throw new Error('Workspace not found');

  const project = (await api('/projects', token, 'POST', {
    workspaceId,
    name,
  })) as { id: string };
  const sections = (await api(`/projects/${project.id}/sections`, token)) as Array<{
    id: string;
    isDefault?: boolean;
  }>;
  const defaultSectionId = sections.find((section) => section.isDefault)?.id ?? sections[0]?.id;
  if (!defaultSectionId) throw new Error('Default section not found');

  return { projectId: project.id, defaultSectionId };
}

test('saved views can save and reapply a named list view without refresh', async ({ page }) => {
  const stamp = Date.now();
  const sub = `e2e-saved-views-${stamp}`;
  await devLogin(page, sub, `e2e-saved-views-${stamp}@example.com`);
  const token = await getToken(page);

  const workspaces = (await api('/workspaces', token)) as Array<{ id: string }>;
  const workspaceId = workspaces[0]?.id;
  if (!workspaceId) throw new Error('Workspace not found');

  const project = (await api('/projects', token, 'POST', {
    workspaceId,
    name: `Saved Views Project ${stamp}`,
  })) as { id: string };

  await page.goto(`/projects/${project.id}`);
  await expect(page.locator('[data-testid="project-search-input"]')).toBeVisible();
  await expect(page.locator('[data-testid="add-new-trigger"]')).toBeVisible();

  await page.click('[data-testid="add-new-trigger"]');
  const quickAddInput = page.locator('[data-testid^="quick-add-input-"]').first();
  await expect(quickAddInput).toBeVisible();
  await quickAddInput.fill(`Done Task ${stamp}`);
  await quickAddInput.press('Enter');
  await expect(page.locator(`[data-task-title="Done Task ${stamp}"]`)).toBeVisible();

  await quickAddInput.fill(`Todo Task ${stamp}`);
  await quickAddInput.press('Enter');
  await expect(page.locator(`[data-task-title="Todo Task ${stamp}"]`)).toBeVisible();

  await page.locator(`[data-task-title="Done Task ${stamp}"] button[data-testid^="task-complete-"]`).first().click({
    force: true,
  });
  await expect(page.locator(`[data-task-title="Done Task ${stamp}"] select`).first()).toHaveValue('DONE');

  await page.click('[data-testid="project-filter-trigger"]');
  await page.click('[data-testid="project-filter-status-DONE"]');

  await expect(page.locator(`[data-task-title="Done Task ${stamp}"]`)).toBeVisible();
  await expect(page.locator(`[data-task-title="Todo Task ${stamp}"]`)).toHaveCount(0);

  await expect(page.locator('[data-testid="saved-view-trigger"]')).toBeVisible();
  await page.click('[data-testid="saved-view-trigger"]');
  await page.fill('[data-testid="saved-view-name-input"]', 'Done only');
  await page.click('[data-testid="saved-view-save"]');
  await expect(page.locator('[data-testid="saved-view-active-name"]')).toContainText('Done only');
  const savedViewApply = page.locator('[data-testid^="saved-view-apply-"]').filter({ hasText: 'Done only' });
  await expect(savedViewApply).toBeVisible();

  const renameButton = page.locator('[data-testid^="saved-view-rename-"]').first();
  await renameButton.click();
  const renameInput = page.locator('[data-testid^="saved-view-rename-input-"]').first();
  await renameInput.fill('Done renamed');
  await page.locator('[data-testid^="saved-view-rename-save-"]').first().click();
  await expect(page.locator('[data-testid="saved-view-active-name"]')).toContainText('Done renamed');

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes(`/projects/${project.id}/saved-views/defaults/list`) &&
        response.request().method() === 'PUT' &&
        response.ok(),
    ),
    page.click('[data-testid="saved-view-set-default"]'),
  ]);

  await page.click('[data-testid="project-filter-trigger"]');
  await page.click('[data-testid="project-filter-clear"]');
  await page.reload();
  await expect(page.locator(`[data-task-title="Done Task ${stamp}"]`)).toBeVisible();
  await expect(page.locator(`[data-task-title="Todo Task ${stamp}"]`)).toHaveCount(0);

  await page.click('[data-testid="saved-view-trigger"]');
  await page.locator('[data-testid^="saved-view-apply-"]').filter({ hasText: 'Done renamed' }).click();
  await expect(page.locator(`[data-task-title="Done Task ${stamp}"]`)).toBeVisible();
  await expect(page.locator(`[data-task-title="Todo Task ${stamp}"]`)).toHaveCount(0);

  await page.click('[data-testid="saved-view-trigger"]');
  await page.locator('[data-testid^="saved-view-delete-"]').first().click();
  await expect(page.locator('[data-testid^="saved-view-apply-"]').filter({ hasText: 'Done renamed' })).toHaveCount(0);
});

test('saved views apply per-mode state when switching from a named list view to a board default', async ({ page }) => {
  const stamp = Date.now();
  const sub = `e2e-saved-views-modes-${stamp}`;
  await devLogin(page, sub, `e2e-saved-views-modes-${stamp}@example.com`);
  const token = await getToken(page);
  const { projectId, defaultSectionId } = await createProject(page, token, `Saved Views Modes ${stamp}`);

  const doneTask = (await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: defaultSectionId,
    title: `Done Cross View ${stamp}`,
  })) as { id: string; version: number };
  const todoTask = (await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: defaultSectionId,
    title: `Todo Cross View ${stamp}`,
  })) as { id: string };
  await api(`/tasks/${doneTask.id}`, token, 'PATCH', { status: 'DONE', version: doneTask.version });

  const listView = (await api(`/projects/${projectId}/saved-views`, token, 'POST', {
    name: 'Done only',
    mode: 'list',
    state: {
      filters: {
        statusIds: ['DONE'],
      },
    },
  })) as { id: string };
  await api(`/projects/${projectId}/saved-views/defaults/board`, token, 'PUT', {
    state: {
      filters: {
        statusIds: ['IN_PROGRESS'],
      },
    },
  });

  await page.goto(`/projects/${projectId}?savedView=${listView.id}`);
  await expect(page.locator(`[data-task-title="Done Cross View ${stamp}"]`)).toBeVisible();
  await expect(page.locator(`[data-task-title="Todo Cross View ${stamp}"]`)).toHaveCount(0);
  await page.click('[data-testid="saved-view-trigger"]');
  await expect(page.locator('[data-testid="saved-view-active-name"]')).toContainText('Done only');
  await page.click('[data-testid="saved-view-trigger"]');

  await page.click('[data-testid="project-view-board"]');
  await expect(page.locator(`[data-task-title="Todo Cross View ${stamp}"]`)).toBeVisible();
  await expect(page.locator(`[data-task-title="Done Cross View ${stamp}"]`)).toHaveCount(0);
});

test('saved view fallback drops archived custom field filters on reload', async ({ page }) => {
  const stamp = Date.now();
  const sub = `e2e-saved-views-fallback-${stamp}`;
  await devLogin(page, sub, `e2e-saved-views-fallback-${stamp}@example.com`);
  const token = await getToken(page);
  const { projectId, defaultSectionId } = await createProject(page, token, `Saved Views Fallback ${stamp}`);

  const taskAlpha = (await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: defaultSectionId,
    title: `Fallback Alpha ${stamp}`,
  })) as { id: string; version: number };
  const taskBeta = (await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: defaultSectionId,
    title: `Fallback Beta ${stamp}`,
  })) as { id: string; version: number };

  const field = (await api(`/projects/${projectId}/custom-fields`, token, 'POST', {
    name: `Fallback Stage ${stamp}`,
    type: 'SELECT',
    options: [
      { label: 'Keep', value: 'keep' },
      { label: 'Focus', value: 'focus' },
    ],
  })) as { id: string; options: Array<{ id: string; value: string }> };
  const focusOptionId = field.options.find((option) => option.value === 'focus')?.id;
  if (!focusOptionId) throw new Error('Focus option not found');

  await api(`/tasks/${taskBeta.id}/custom-fields`, token, 'PATCH', {
    version: taskBeta.version,
    values: [{ fieldId: field.id, value: focusOptionId }],
  });

  const savedView = (await api(`/projects/${projectId}/saved-views`, token, 'POST', {
    name: 'Focus only',
    mode: 'list',
    state: {
      filters: {
        customFieldFilters: [
          {
            fieldId: field.id,
            type: 'SELECT',
            optionIds: [focusOptionId],
          },
        ],
      },
    },
  })) as { id: string };

  await page.goto(`/projects/${projectId}?savedView=${savedView.id}`);
  await expect(page.locator(`[data-task-title="Fallback Beta ${stamp}"]`)).toBeVisible();
  await expect(page.locator(`[data-task-title="Fallback Alpha ${stamp}"]`)).toHaveCount(0);
  await page.click('[data-testid="saved-view-trigger"]');
  await expect(page.locator('[data-testid="saved-view-active-name"]')).toContainText('Focus only');
  await page.click('[data-testid="saved-view-trigger"]');

  await api(`/custom-fields/${field.id}`, token, 'DELETE');

  await page.reload();
  await expect(page.locator(`[data-task-title="Fallback Alpha ${stamp}"]`)).toBeVisible();
  await expect(page.locator(`[data-task-title="Fallback Beta ${stamp}"]`)).toBeVisible();
  await page.click('[data-testid="saved-view-trigger"]');
  await expect(page.locator('[data-testid="saved-view-active-name"]')).toContainText('Focus only');
});
