import { test, expect } from '@playwright/test';

test.describe('Portfolio Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('User can create a new portfolio', async ({ page }) => {
    await page.goto('/workspaces');
    
    await page.click('text=New Portfolio');
    await page.fill('input[id="name"]', 'Test Portfolio');
    await page.fill('textarea[id="description"]', 'A test portfolio for E2E testing');
    await page.click('button:has-text("Create Portfolio")');
    
    await expect(page.locator('text=Test Portfolio')).toBeVisible();
    await expect(page.locator('text=A test portfolio for E2E testing')).toBeVisible();
  });

  test('User can view portfolio list with progress', async ({ page }) => {
    await page.goto('/workspaces');
    
    await expect(page.locator('h1:has-text("Portfolios")')).toBeVisible();
    
    const portfolios = page.locator('[class*="grid"] > div');
    await expect(portfolios.first()).toBeVisible();
    
    await expect(page.locator('text=% complete')).toBeVisible();
  });

  test('User can add projects to portfolio', async ({ page }) => {
    await page.goto('/workspaces');
    
    await page.click('text=Test Portfolio');
    
    await page.click('text=Add Project');
    
    const projectOption = page.locator('[role="option"]').first();
    await projectOption.click();
    
    await expect(page.locator('text=Projects')).toBeVisible();
    await expect(page.locator('[class*="grid"] > div').first()).toBeVisible();
  });

  test('User can view portfolio progress aggregation', async ({ page }) => {
    await page.goto('/workspaces');
    
    await page.click('text=Test Portfolio');
    
    await expect(page.locator('text=Total Tasks')).toBeVisible();
    await expect(page.locator('text=Completed')).toBeVisible();
    await expect(page.locator('text=In Progress')).toBeVisible();
    await expect(page.locator('text=To Do')).toBeVisible();
    
    await expect(page.locator('[class*="progress"]')).toBeVisible();
  });

  test('User can remove project from portfolio', async ({ page }) => {
    await page.goto('/workspaces');
    
    await page.click('text=Test Portfolio');
    
    const removeButton = page.locator('button:has([class*="trash"])').first();
    await removeButton.click();
    
    await expect(page.locator('text=No projects in this portfolio yet')).toBeVisible();
  });

  test('User can delete a portfolio', async ({ page }) => {
    await page.goto('/workspaces');
    
    const portfolioCard = page.locator('text=Test Portfolio').locator('..').locator('..');
    await portfolioCard.locator('button:has([class*="more"])').click();
    
    await page.click('text=Delete');
    
    await expect(page.locator('text=Test Portfolio')).not.toBeVisible();
  });

  test('Portfolio enforces 50 project limit', async ({ page }) => {
    await page.goto('/workspaces');
    
    await page.click('text=Test Portfolio');
    
    for (let i = 0; i < 52; i++) {
      await page.click('text=Add Project');
      const projectOption = page.locator('[role="option"]').first();
      if (await projectOption.isVisible().catch(() => false)) {
        await projectOption.click();
      } else {
        break;
      }
    }
    
    const addButton = page.locator('text=Add Project');
    if (await addButton.isEnabled()) {
      await addButton.click();
      await expect(page.locator('text=cannot contain more than 50 projects')).toBeVisible();
    }
  });

  test('User can edit portfolio details', async ({ page }) => {
    await page.goto('/workspaces');
    
    await page.click('text=Test Portfolio');
    
    await page.click('text=Edit Details');
    
    await page.fill('input[id="edit-name"]', 'Updated Portfolio Name');
    await page.fill('textarea[id="edit-description"]', 'Updated description');
    
    await page.click('text=Save');
    
    await expect(page.locator('text=Updated Portfolio Name')).toBeVisible();
    await expect(page.locator('text=Updated description')).toBeVisible();
  });
});
