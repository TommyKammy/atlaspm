import { expect, test, type Page } from '@playwright/test';

const API = process.env.E2E_CORE_API_URL ?? 'http://localhost:3001';

async function api(path: string, token: string, method = 'GET', body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const raw = await res.text();
  if (!raw) return null;
  return JSON.parse(raw);
}

async function login(page: Page) {
  const sub = `e2e-rules-user-${Date.now()}`;
  const email = `e2e-rules-${Date.now()}@example.com`;

  await page.goto('/login');
  await page.fill('input[placeholder="OIDC sub"]', sub);
  await page.fill('input[placeholder="Email"]', email);
  await page.click('button:has-text("Dev Login")');
  await page.waitForURL('**/');

  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  return { sub, email, token };
}

async function createProjectAndOpenRules(page: Page, token: string, projectNamePrefix: string) {
  const projectName = `${projectNamePrefix} ${Date.now()}`;
  await page.fill('input[placeholder="Project name"]', projectName);
  await page.click('[data-testid="create-project-btn"]');
  await expect(page.getByText(projectName).first()).toBeVisible();

  const projects = await api('/projects', token);
  const project = projects.find((p: any) => p.name === projectName);
  expect(project).toBeTruthy();

  await page.goto(`/projects/${project.id}/rules`);
  await expect(page.locator('[data-testid^="rule-card-"]').first()).toBeVisible({ timeout: 15000 });
}

test('Rules page renders with rule cards', async ({ page }) => {
  const { token } = await login(page);
  await createProjectAndOpenRules(page, token, 'Rules Render Test');
});

test('Rule can be created from rules page', async ({ page }) => {
  const { token } = await login(page);
  await createProjectAndOpenRules(page, token, 'Rules Create Test');

  const ruleName = `UI Rule ${Date.now()}`;

  await page.getByTestId('rule-create-button').click();
  await page.getByTestId('rule-create-name-input').fill(ruleName);
  await page.getByTestId('rule-create-save').click();

  await expect(page.getByText(ruleName)).toBeVisible({ timeout: 15000 });
});

test('Custom rule can be deleted from rules page', async ({ page }) => {
  const { token } = await login(page);
  await createProjectAndOpenRules(page, token, 'Rules Delete Test');

  const ruleName = `Delete Rule ${Date.now()}`;

  await page.getByTestId('rule-create-button').click();
  await page.getByTestId('rule-create-name-input').fill(ruleName);
  await page.getByTestId('rule-create-save').click();
  await expect(page.getByText(ruleName)).toBeVisible({ timeout: 15000 });

  const createdCard = page
    .locator('[data-testid^="rule-card-"]')
    .filter({ hasText: ruleName })
    .first();
  await expect(createdCard).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await createdCard.locator('[data-testid^="rule-delete-"]').click();
  await expect(createdCard).not.toBeVisible({ timeout: 15000 });
});

test('Rules page shows Japanese labels when locale is ja', async ({ page }) => {
  const { token } = await login(page);
  await createProjectAndOpenRules(page, token, 'Rules JA Test');

  await page.getByTestId('personal-settings-trigger').click();
  await page.getByTestId('language-toggle-menu').click();

  await expect(page.getByTestId('rule-create-button')).toHaveText('ルールを作成', { timeout: 15000 });
  await expect(page.locator('[data-testid^="rule-delete-"]').first()).toHaveText('削除', { timeout: 15000 });
});
