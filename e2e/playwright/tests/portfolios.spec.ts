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
  return res.json();
}

test('portfolio create and project add flow', async ({ page }) => {
  const stamp = Date.now();
  const sub = `e2e-portfolio-${stamp}`;
  await devLogin(page, sub, `e2e-portfolio-${stamp}@example.com`);
  const token = await getToken(page);

  const workspaces = (await api('/workspaces', token)) as Array<{ id: string }>;
  const workspaceId = workspaces[0]?.id;
  if (!workspaceId) throw new Error('Workspace not found');

  const project = (await api('/projects', token, 'POST', {
    workspaceId,
    name: `Portfolio Project ${stamp}`,
  })) as { id: string };

  await page.goto(`/workspaces/${workspaceId}/portfolios`);
  await expect(page.locator('h1:has-text("Portfolios")')).toBeVisible();

  await page.click('button:has-text("New Portfolio")');
  const createDialog = page.getByRole('dialog', { name: 'Create Portfolio' });
  await expect(createDialog).toBeVisible();
  await createDialog.locator('input#name').fill(`Portfolio ${stamp}`);
  await createDialog.locator('textarea#description').fill('E2E portfolio');
  await createDialog.getByRole('button', { name: 'Create Portfolio' }).click();

  await expect(page.locator(`text=Portfolio ${stamp}`)).toBeVisible();
  await page.click(`text=Portfolio ${stamp}`);

  await page.click('button:has-text("Add Project")');
  await page.fill('input[placeholder="Search projects..."]', 'Portfolio Project');
  await page.click(`text=Portfolio Project ${stamp}`);
  await expect(page.locator(`text=Portfolio Project ${stamp}`)).toBeVisible();

  await page.reload();
  await expect(page.locator(`text=Portfolio Project ${stamp}`)).toBeVisible();
  await expect(page.locator('text=Total Tasks')).toBeVisible();

  void project;
});
