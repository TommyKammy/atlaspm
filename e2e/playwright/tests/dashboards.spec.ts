import { expect, test, type Page } from '@playwright/test';

async function devLogin(page: Page, sub: string, email: string) {
  await page.goto('/login');
  await page.fill('input[placeholder="OIDC sub"]', sub);
  await page.fill('input[placeholder="Email"]', email);
  await page.click('button:has-text("Dev Login")');
  await page.waitForURL('**/');
}

test('dashboard create, open, widget add, and delete', async ({ page }) => {
  const stamp = Date.now();
  await devLogin(page, `e2e-dashboard-${stamp}`, `e2e-dashboard-${stamp}@example.com`);

  await page.goto('/dashboards');
  await expect(page.locator('h1:has-text("Dashboards")')).toBeVisible();

  await page.click('button:has-text("New Dashboard")');
  const createDialog = page.getByRole('dialog', { name: 'Create Dashboard' });
  await expect(createDialog).toBeVisible();
  await createDialog.locator('input#name').fill(`Dashboard ${stamp}`);
  await createDialog.getByRole('button', { name: 'Create Dashboard' }).click();

  await expect(page.getByRole('link', { name: `Dashboard ${stamp}` })).toBeVisible();
  await page.getByRole('link', { name: `Dashboard ${stamp}` }).click();
  await page.waitForURL(/\/dashboards\/[a-f0-9-]+$/);
  await expect(page.locator('button:has-text("Add Widget")').first()).toBeVisible();

  await page.click('button:has-text("Add Widget")');
  const addDialog = page.getByRole('dialog', { name: 'Add Widget' });
  await expect(addDialog).toBeVisible();
  await addDialog.getByRole('button', { name: 'Select widget type' }).click();
  await addDialog.getByRole('button', { name: /Task Completion/ }).click();
  await addDialog.getByRole('button', { name: 'Add Widget' }).click();
  await expect(addDialog).not.toBeVisible();
  await expect(page.getByText('Task Completion', { exact: true }).first()).toBeVisible();

  await page.click('button:has-text("Back")');
  await page.waitForURL('**/dashboards');

  const menuButton = page
    .getByRole('link', { name: `Dashboard ${stamp}` })
    .locator('..')
    .getByRole('button')
    .first();
  await menuButton.click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.click('text=Delete');
  await expect(page.locator(`text=Dashboard ${stamp}`)).toHaveCount(0);
});
