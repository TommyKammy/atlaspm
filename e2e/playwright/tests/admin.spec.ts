import { expect, test, type BrowserContext, type Page } from '@playwright/test';

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

async function login(page: Page, sub: string, email: string) {
  await page.goto('/login');
  await page.fill('input[placeholder="OIDC sub"]', sub);
  await page.fill('input[placeholder="Email"]', email);
  await page.click('button:has-text("Dev Login")');
  await page.waitForURL('**/');
}

async function tokenFrom(page: Page) {
  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  if (!token) throw new Error('Missing token');
  return token;
}

test('admin users and project members management', async ({ browser, page }) => {
  const adminSub = `ws-admin-${Date.now()}`;
  const adminEmail = `${adminSub}@example.com`;
  const invitedSub = `invited-${Date.now()}`;
  const invitedEmail = `${invitedSub}@example.com`;

  await login(page, adminSub, adminEmail);
  const adminToken = await tokenFrom(page);

  const workspaces = await api('/workspaces', adminToken);
  const workspaceId = workspaces[0].id;

  const project = await api('/projects', adminToken, 'POST', {
    workspaceId,
    name: `Admin Members ${Date.now()}`,
  });

  await page.click('[data-testid="sidebar-admin-users"]');
  await page.waitForURL('**/admin/users');

  await page.click('[data-testid="invite-user-open"]');
  await page.fill('[data-testid="invite-email-input"]', invitedEmail);
  await page.selectOption('[data-testid="invite-role-select"]', 'WS_MEMBER');
  await page.click('[data-testid="invite-submit"]');
  await expect(page.locator('[data-testid="invite-link-value"]')).toBeVisible();

  const inviteLink = await page.locator('[data-testid="invite-link-value"]').innerText();
  const inviteToken = inviteLink.split('inviteToken=')[1];
  expect(inviteToken).toBeTruthy();
  await page.keyboard.press('Escape');

  const invitedContext: BrowserContext = await browser.newContext();
  const invitedPage = await invitedContext.newPage();
  await login(invitedPage, invitedSub, invitedEmail);
  const invitedTokenJwt = await tokenFrom(invitedPage);
  await api('/invitations/accept', invitedTokenJwt, 'POST', { token: inviteToken });

  await page.fill('[data-testid="admin-users-search"]', invitedSub);
  await expect(page.locator(`[data-testid="admin-user-row-${invitedSub}"]`)).toBeVisible();

  await page.click(`[data-testid="admin-user-toggle-status-${invitedSub}"]`);
  await expect
    .poll(async () => {
      const users = await api(`/workspaces/${workspaceId}/users?query=${encodeURIComponent(invitedSub)}`, adminToken);
      return users.find((row: any) => row.id === invitedSub)?.status;
    })
    .toBe('SUSPENDED');

  await page.reload();
  await page.fill('[data-testid="admin-users-search"]', invitedSub);
  await expect(page.locator(`[data-testid="admin-user-row-${invitedSub}"]`)).toContainText('SUSPENDED');

  await page.click(`[data-testid="admin-user-toggle-status-${invitedSub}"]`);
  await expect
    .poll(async () => {
      const users = await api(`/workspaces/${workspaceId}/users?query=${encodeURIComponent(invitedSub)}`, adminToken);
      return users.find((row: any) => row.id === invitedSub)?.status;
    })
    .toBe('ACTIVE');

  await page.goto(`/projects/${project.id}`);
  await page.click('[data-testid="project-members-page-link"]');
  await page.waitForURL(`**/projects/${project.id}/members`);

  await page.click('[data-testid="project-members-add-open"]');
  await page.click(`[data-testid="project-members-option-${invitedSub}"]`);
  await page.selectOption('[data-testid="project-members-role-select"]', 'MEMBER');
  await page.click('[data-testid="project-members-add-submit"]');

  await expect(page.locator(`[data-testid="project-member-row-${invitedSub}"]`)).toBeVisible();
  await page.selectOption(`[data-testid="project-member-role-${invitedSub}"]`, 'VIEWER');
  await expect
    .poll(async () => {
      const members = await api(`/projects/${project.id}/members`, adminToken);
      return members.find((member: any) => member.userId === invitedSub)?.role;
    })
    .toBe('VIEWER');

  await page.click(`[data-testid="project-member-remove-${invitedSub}"]`);
  await expect(page.locator(`[data-testid="project-member-row-${invitedSub}"]`)).toHaveCount(0);

  await page.reload();
  await expect(page.locator(`[data-testid="project-member-row-${invitedSub}"]`)).toHaveCount(0);

  await invitedContext.close();
});
