import { expect, test, type Page } from '@playwright/test';

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
  const savedViewApply = page.locator('[data-testid="saved-view-apply-Done only"]');
  await expect(savedViewApply).toBeVisible();

  const renameButton = page.locator('[data-testid^="saved-view-rename-"]').first();
  await renameButton.click();
  const renameInput = page.locator('[data-testid^="saved-view-rename-input-"]').first();
  await renameInput.fill('Done renamed');
  await page.locator('[data-testid^="saved-view-rename-save-"]').first().click();
  await expect(page.locator('[data-testid="saved-view-active-name"]')).toContainText('Done renamed');

  await page.click('[data-testid="saved-view-set-default"]');

  await page.click('[data-testid="project-filter-trigger"]');
  await page.click('[data-testid="project-filter-clear"]');
  await page.reload();
  await expect(page.locator(`[data-task-title="Done Task ${stamp}"]`)).toBeVisible();
  await expect(page.locator(`[data-task-title="Todo Task ${stamp}"]`)).toHaveCount(0);

  await page.click('[data-testid="saved-view-trigger"]');
  await page.click('[data-testid="saved-view-apply-Done renamed"]');
  await expect(page.locator(`[data-task-title="Done Task ${stamp}"]`)).toBeVisible();
  await expect(page.locator(`[data-task-title="Todo Task ${stamp}"]`)).toHaveCount(0);

  await page.click('[data-testid="saved-view-trigger"]');
  await page.locator('[data-testid^="saved-view-delete-"]').first().click();
  await expect(page.locator('[data-testid="saved-view-apply-Done renamed"]')).toHaveCount(0);
});
