import { expect, test, type Page } from '@playwright/test';

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

async function createProjectAndOpenRules(page: Page, projectNamePrefix: string) {
  const projectName = `${projectNamePrefix} ${Date.now()}`;
  await page.fill('input[placeholder="Project name"]', projectName);
  await page.click('[data-testid="create-project-btn"]');
  const projectLink = page.locator('a[href^="/projects/"]', { hasText: projectName }).first();
  await expect(projectLink).toBeVisible();

  const href = await projectLink.getAttribute('href');
  expect(href).toBeTruthy();
  const projectId = href?.match(/\/projects\/([^/?#]+)/)?.[1];
  expect(projectId).toBeTruthy();

  await projectLink.click();
  await page.waitForURL(`**/projects/${projectId}`);
  await page.getByTestId('project-settings-menu-trigger').click();
  await page.getByTestId('rules-page-link').click();
  await page.waitForURL(`**/projects/${projectId}/rules`);
  await expect(page.locator('[data-testid^="rule-card-"]').first()).toBeVisible({ timeout: 15000 });
}

test('Rules page renders with rule cards', async ({ page }) => {
  await login(page);
  await createProjectAndOpenRules(page, 'Rules Render Test');
});

test('Rule can be created from rules page', async ({ page }) => {
  await login(page);
  await createProjectAndOpenRules(page, 'Rules Create Test');

  const ruleName = `UI Rule ${Date.now()}`;

  await page.getByTestId('rule-create-button').click();
  await page.getByTestId('rule-create-name-input').fill(ruleName);
  await page.getByTestId('rule-create-save').click();

  await expect(page.getByText(ruleName)).toBeVisible({ timeout: 15000 });
});

test('Custom rule can be deleted from rules page', async ({ page }) => {
  await login(page);
  await createProjectAndOpenRules(page, 'Rules Delete Test');

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
  await login(page);
  await createProjectAndOpenRules(page, 'Rules JA Test');

  await page.getByTestId('personal-settings-trigger').click();
  await page.getByTestId('language-toggle-menu').click();

  await expect(page.getByTestId('rule-create-button')).toHaveText('ルールを作成', { timeout: 15000 });
  await expect(page.locator('[data-testid^="rule-delete-"]').first()).toHaveText('削除', { timeout: 15000 });
});
