import { expect, test, type Page } from '@playwright/test';

const API = process.env.E2E_CORE_API_URL ?? 'http://localhost:3001';

async function api(path: string, token: string, method = 'GET', body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);

  const raw = await res.text();
  return raw ? JSON.parse(raw) : null;
}

async function login(page: Page) {
  const suffix = Date.now();

  await page.goto('/login');
  await page.fill('input[placeholder="OIDC sub"]', `e2e-status-updates-${suffix}`);
  await page.fill('input[placeholder="Email"]', `e2e-status-updates-${suffix}@example.com`);
  await page.click('button:has-text("Dev Login")');
  await page.waitForURL('**/');

  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();
  return token;
}

async function createProject(token: string, name: string) {
  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  return api('/projects', token, 'POST', { workspaceId, name }) as Promise<{ id: string }>;
}

test('project page keeps status update compose and history in project context', async ({ page }) => {
  const token = await login(page);
  const project = await createProject(token, `Status Updates ${Date.now()}`);
  const projectId = project.id;

  const seededSummary = 'Kickoff finished and implementation remains on track.';
  const createdSummary = 'UI compose flow captured the latest release risk.';

  await api(`/projects/${projectId}/status-updates`, token, 'POST', {
    health: 'ON_TRACK',
    summary: seededSummary,
    blockers: ['Waiting for analytics credentials'],
    nextSteps: ['Confirm migration window'],
  });

  await page.goto(`/projects/${projectId}`);

  await expect(page.getByTestId('project-status-updates')).toBeVisible();
  await expect(page.getByText(seededSummary)).toBeVisible();

  await page.getByTestId('status-update-compose-trigger').click();
  await page.getByTestId('status-update-health-select').selectOption('AT_RISK');
  await page.getByTestId('status-update-summary-input').fill(createdSummary);
  await page.getByTestId('status-update-blockers-input').fill('Schema review still open');
  await page.getByTestId('status-update-next-steps-input').fill('Close review and rerun regression');
  const createResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/projects/${projectId}/status-updates`) &&
      response.request().method() === 'POST' &&
      response.status() === 201,
  );
  await page.getByTestId('status-update-submit').click();
  await createResponse;

  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`));
  await expect(page.getByTestId('status-update-summary-input')).toHaveCount(0);
  await expect(page.locator('[data-testid^="status-update-item-"]').first()).toContainText(createdSummary);

  const statusUpdates = await api(`/projects/${projectId}/status-updates`, token);
  expect(statusUpdates.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ summary: createdSummary, health: 'AT_RISK' }),
      expect.objectContaining({ summary: seededSummary, health: 'ON_TRACK' }),
    ]),
  );
});
