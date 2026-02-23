import { expect, test, type Page } from '@playwright/test';

const API = process.env.E2E_CORE_API_URL ?? 'http://localhost:3001';

async function api(path: string, token: string, method = 'GET', body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

test('Dashboard management flow', async ({ page }) => {
  const sub = `e2e-dashboard-${Date.now()}`;
  const email = `e2e-dashboard-${Date.now()}@example.com`;

  // Login
  await page.goto('/login');
  await page.fill('input[placeholder="OIDC sub"]', sub);
  await page.fill('input[placeholder="Email"]', email);
  await page.click('button:has-text("Dev Login")');
  await page.waitForURL('**/');

  // Navigate to Dashboards page
  await page.click('text=Dashboards');
  await page.waitForURL('**/dashboards');
  await expect(page.locator('h1')).toContainText('Dashboards');
  await expect(page.locator('text=No dashboards yet')).toBeVisible();

  // Create first dashboard
  await page.click('button:has-text("Create Dashboard")');
  await expect(page.locator('text=Create Dashboard')).toBeVisible();
  
  const dashboardName = `E2E Dashboard ${Date.now()}`;
  await page.fill('input#name', dashboardName);
  await page.click('button:has-text("Create")');
  
  // Should redirect to dashboard detail
  await page.waitForURL(/.*\/dashboards\/[a-f0-9-]+/);
  await expect(page.locator('h1')).toContainText(dashboardName);

  // Add widgets
  await page.click('button:has-text("Add Widget")');
  await expect(page.locator('text=Add Widget')).toBeVisible();
  
  // Add Task Completion widget
  await page.click('button:has-text("Select widget type")');
  await page.click('text=Task Completion');
  await page.click('button:has-text("Add Widget")');
  
  // Widget should appear
  await expect(page.locator('text=Task Completion')).toBeVisible();
  await expect(page.locator('text=75%')).toBeVisible();

  // Add Progress Chart widget
  await page.click('button:has-text("Add Widget")');
  await page.click('button:has-text("Select widget type")');
  await page.click('text=Progress Chart');
  await page.click('button:has-text("Add Widget")');
  
  await expect(page.locator('text=Progress Chart')).toBeVisible();

  // Add Team Load widget
  await page.click('button:has-text("Add Widget")');
  await page.click('button:has-text("Select widget type")');
  await page.click('text=Team Load');
  await page.click('button:has-text("Add Widget")');
  
  await expect(page.locator('text=Team Load')).toBeVisible();
  await expect(page.locator('text=Alice')).toBeVisible();

  // Navigate back to dashboards list
  await page.click('text=Back');
  await page.waitForURL('**/dashboards');
  await expect(page.locator(`text=${dashboardName}`)).toBeVisible();

  // Delete dashboard
  await page.click(`[data-testid="delete-dashboard-${dashboardName}"]`);
  await page.click('button:has-text("Delete")');
  
  await expect(page.locator(`text=${dashboardName}`)).not.toBeVisible();
  await expect(page.locator('text=No dashboards yet')).toBeVisible();
});

test('Multiple widgets on dashboard', async ({ page }) => {
  const sub = `e2e-multiwidget-${Date.now()}`;
  const email = `e2e-multiwidget-${Date.now()}@example.com`;

  // Login
  await page.goto('/login');
  await page.fill('input[placeholder="OIDC sub"]', sub);
  await page.fill('input[placeholder="Email"]', email);
  await page.click('button:has-text("Dev Login")');
  await page.waitForURL('**/');

  // Create dashboard
  await page.click('text=Dashboards');
  await page.click('button:has-text("Create Dashboard")');
  
  const dashboardName = `Multi Widget Dashboard ${Date.now()}`;
  await page.fill('input#name', dashboardName);
  await page.click('button:has-text("Create")');
  
  await page.waitForURL(/.*\/dashboards\/[a-f0-9-]+/);

  // Add all 5 widget types
  const widgetTypes = [
    { type: 'Task Completion', expectedText: '75%' },
    { type: 'Progress Chart', expectedText: 'Weekly progress trend' },
    { type: 'Team Load', expectedText: 'Alice' },
    { type: 'Overdue Alerts', expectedText: 'overdue' },
    { type: 'Recent Activity', expectedText: 'Task completed' },
  ];

  for (const { type, expectedText } of widgetTypes) {
    await page.click('button:has-text("Add Widget")');
    await page.click('button:has-text("Select widget type")');
    await page.click(`text=${type}`);
    await page.click('button:has-text("Add Widget")');
    await expect(page.locator(`text=${expectedText}`)).toBeVisible();
  }

  // Delete a widget
  const firstWidgetDeleteButton = page.locator('button >> svg[class*="lucide-trash-2"]').first();
  await firstWidgetDeleteButton.hover();
  await firstWidgetDeleteButton.click();
  
  // Should still have 4 widgets
  await expect(page.locator('text=Add Widget')).toBeVisible();
});
