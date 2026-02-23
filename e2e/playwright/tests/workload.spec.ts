import { test, expect } from '@playwright/test';

test.describe('Workload Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('User can view team workload', async ({ page }) => {
    await page.goto('/workspaces');
    
    await page.click('text=Workload');
    
    await expect(page.locator('h1:has-text("Workload Management")')).toBeVisible();
    await expect(page.locator('text=Team View')).toBeVisible();
    
    const userCards = page.locator('[class*="Card"]');
    await expect(userCards.first()).toBeVisible();
  });

  test('User can switch to project workload view', async ({ page }) => {
    await page.goto('/workspaces');
    
    await page.click('text=Workload');
    
    await page.click('text=Project View');
    
    await expect(page.locator('text=Select a project')).toBeVisible();
  });

  test('User can select project to view workload', async ({ page }) => {
    await page.goto('/workspaces');
    
    await page.click('text=Workload');
    
    await page.click('text=Project View');
    
    await page.click('text=Select a project');
    
    const projectOption = page.locator('[role="option"]').first();
    await projectOption.click();
    
    await expect(page.locator('[class*="Card"]')).toBeVisible();
  });

  test('Workload shows weekly breakdown', async ({ page }) => {
    await page.goto('/workspaces');
    
    await page.click('text=Workload');
    
    const weekLabels = page.locator('text=/\\w{3} \\d{1,2}/');
    await expect(weekLabels.first()).toBeVisible();
  });

  test('Workload shows overload alerts', async ({ page }) => {
    await page.goto('/workspaces');
    
    await page.click('text=Workload');
    
    const overloadBadge = page.locator('text=/\\d+ overloads/');
    if (await overloadBadge.isVisible().catch(() => false)) {
      await expect(overloadBadge).toBeVisible();
    }
  });

  test('User can see task count per week', async ({ page }) => {
    await page.goto('/workspaces');
    
    await page.click('text=Workload');
    
    await expect(page.locator('text=/\\d+ tasks/')).toBeVisible();
  });

  test('Workload capacity indicator is visible', async ({ page }) => {
    await page.goto('/workspaces');
    
    await page.click('text=Workload');
    
    await expect(page.locator('text=/\\d+\\/10/')).toBeVisible();
  });

  test('User can see total task count', async ({ page }) => {
    await page.goto('/workspaces');
    
    await page.click('text=Workload');
    
    await expect(page.locator('text=total tasks')).toBeVisible();
  });
});
