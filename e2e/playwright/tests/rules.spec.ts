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

test('Rules page renders with rule cards', async ({ page }) => {
  const { token } = await login(page);

  const projectName = `Rules Test ${Date.now()}`;
  await page.fill('input[placeholder="Project name"]', projectName);
  await page.click('[data-testid="create-project-btn"]');
  await expect(page.getByText(projectName).first()).toBeVisible();

  const projects = await api('/projects', token);
  const project = projects.find((p: any) => p.name === projectName);
  expect(project).toBeTruthy();

  await page.goto(`/projects/${project.id}/rules`);

  const firstRuleCard = page.locator('[data-testid^="rule-card-"]').first();
  await expect(firstRuleCard).toBeVisible({ timeout: 15000 });
});
