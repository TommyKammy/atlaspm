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

test('project members page shows readable audit before/after diffs', async ({ browser, page }) => {
  const adminSub = `audit-admin-${Date.now()}`;
  const adminEmail = `${adminSub}@example.com`;
  const invitedSub = `audit-member-${Date.now()}`;
  const invitedEmail = `${invitedSub}@example.com`;

  await login(page, adminSub, adminEmail);
  const adminToken = await tokenFrom(page);

  const workspaces = await api('/workspaces', adminToken);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', adminToken, 'POST', {
    workspaceId,
    name: `Audit Members ${Date.now()}`,
  });

  const invitation = await api(`/workspaces/${workspaceId}/invitations`, adminToken, 'POST', {
    email: invitedEmail,
    role: 'WS_MEMBER',
  });
  const inviteUrl = new URL(String(invitation.inviteLink));
  const inviteToken = inviteUrl.searchParams.get('inviteToken');
  expect(inviteToken).toBeTruthy();
  if (!inviteToken) {
    throw new Error(`Invite token missing from inviteLink: ${invitation.inviteLink}`);
  }

  const invitedContext: BrowserContext = await browser.newContext();
  const invitedPage = await invitedContext.newPage();
  await login(invitedPage, invitedSub, invitedEmail);
  const invitedToken = await tokenFrom(invitedPage);
  await api('/invitations/accept', invitedToken, 'POST', { token: inviteToken });

  await page.goto(`/projects/${project.id}/members`);
  await page.click('[data-testid="project-members-add-open"]');
  await page.click(`[data-testid="project-members-option-${invitedSub}"]`);
  await page.selectOption('[data-testid="project-members-role-select"]', 'MEMBER');
  await page.click('[data-testid="project-members-add-submit"]');
  await expect(page.locator(`[data-testid="project-member-row-${invitedSub}"]`)).toBeVisible();

  await page.selectOption(`[data-testid="project-member-role-${invitedSub}"]`, 'VIEWER');

  const latestActivity = page.locator('[data-testid^="activity-"]').first();
  await expect(latestActivity).toContainText(/changed member role/i);
  await expect(latestActivity).toContainText('Changes');
  await expect(latestActivity).toContainText(/Before:\s*MEMBER/);
  await expect(latestActivity).toContainText(/After:\s*VIEWER/);

  await invitedContext.close();
});
