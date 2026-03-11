import { expect, test, type BrowserContext, type Page } from './helpers/browser-auth';

const API = process.env.E2E_CORE_API_URL ?? 'http://localhost:3001';

async function api(path: string, token: string, method = 'GET', body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const raw = await res.text();
  return raw ? JSON.parse(raw) : null;
}

async function apiStatus(path: string, token: string, method = 'GET', body?: unknown) {
  return fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
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
  if (!token) {
    throw new Error('Missing token');
  }
  return token;
}

test('guest invitation lifecycle keeps access scoped across reloads and revocation', async ({
  browser,
  page,
}) => {
  test.setTimeout(90_000);
  const now = Date.now();
  const ownerSub = `guest-admin-${now}`;
  const ownerEmail = `${ownerSub}@example.com`;
  const guestSub = `guest-user-${now}`;
  const guestEmail = `${guestSub}@vendor.example`;
  const grantedProjectName = `Guest Granted ${now}`;
  const deniedProjectName = `Guest Denied ${now}`;

  await login(page, ownerSub, ownerEmail);
  const ownerToken = await tokenFrom(page);
  const workspaces = await api('/workspaces', ownerToken);
  const workspaceId = workspaces[0].id as string;

  const grantedProject = await api('/projects', ownerToken, 'POST', {
    workspaceId,
    name: grantedProjectName,
  });
  const deniedProject = await api('/projects', ownerToken, 'POST', {
    workspaceId,
    name: deniedProjectName,
  });

  await page.goto(`/projects/${grantedProject.id}/members`);
  await expect(page).toHaveURL(new RegExp(`/projects/${grantedProject.id}/members`));
  const inviteOpenButton = page.getByTestId('project-guest-invite-open');
  await expect(inviteOpenButton).toBeVisible({ timeout: 15_000 });
  await inviteOpenButton.scrollIntoViewIfNeeded();
  await inviteOpenButton.click();

  const guestEmailInput = page.getByTestId('project-guest-email-input');
  await expect(guestEmailInput).toBeVisible({ timeout: 10_000 });
  await guestEmailInput.fill(guestEmail);
  await page.selectOption('[data-testid="project-guest-role-select"]', 'VIEWER');
  await page.getByTestId('project-guest-invite-submit').click();
  await expect(page.locator('[data-testid="project-guest-invite-link"]')).toBeVisible();

  const inviteLink = await page.locator('[data-testid="project-guest-invite-link"]').innerText();
  expect(inviteLink).toContain('inviteToken=');

  await expect
    .poll(async () => {
      const entries = await api(`/projects/${grantedProject.id}/guest-access`, ownerToken);
      return entries.find((entry: { email: string }) => entry.email === guestEmail)?.state;
    })
    .toBe('pending');

  const guestEntries = await api(`/projects/${grantedProject.id}/guest-access`, ownerToken);
  const invitation = guestEntries.find((entry: { email: string }) => entry.email === guestEmail);
  expect(invitation?.invitationId).toBeTruthy();
  const invitationId = invitation.invitationId as string;

  const guestContext: BrowserContext = await browser.newContext();
  const guestPage = await guestContext.newPage();

  try {
    await guestPage.goto(inviteLink);
    await guestPage.fill('input[placeholder="OIDC sub"]', guestSub);
    await guestPage.fill('input[placeholder="Email"]', guestEmail);
    await guestPage.click('button:has-text("Dev Login")');
    await guestPage.waitForURL('**/');

    const guestToken = await tokenFrom(guestPage);

    await expect
      .poll(async () => {
        const entries = await api(`/projects/${grantedProject.id}/guest-access`, ownerToken);
        return entries.find((entry: { email: string }) => entry.email === guestEmail)?.state;
      })
      .toBe('accepted');

    await page.reload();
    await expect(page.locator(`[data-testid="project-guest-row-${invitationId}"]`)).toContainText('Accepted');

    await guestPage.goto('/');
    const guestSidebar = guestPage.locator('aside');
    await expect(guestSidebar.getByRole('link', { name: grantedProjectName })).toBeVisible();
    await expect(guestSidebar.getByRole('link', { name: deniedProjectName })).toHaveCount(0);

    const guestProjects = await api('/projects', guestToken);
    expect(guestProjects.map((project: { id: string }) => project.id)).toContain(grantedProject.id);
    expect(guestProjects.map((project: { id: string }) => project.id)).not.toContain(deniedProject.id);

    const deniedProjectRes = await apiStatus(`/projects/${deniedProject.id}/sections`, guestToken);
    expect(deniedProjectRes.status).toBe(404);

    await guestPage.reload();
    await expect(guestSidebar.getByRole('link', { name: grantedProjectName })).toBeVisible();
    await expect(guestSidebar.getByRole('link', { name: deniedProjectName })).toHaveCount(0);

    await page.click(`[data-testid="project-guest-revoke-${invitationId}"]`);
    await expect(page.locator(`[data-testid="project-guest-row-${invitationId}"]`)).toContainText('Revoked');

    await page.reload();
    await expect(page.locator(`[data-testid="project-guest-row-${invitationId}"]`)).toContainText('Revoked');

    await expect
      .poll(async () => {
        const projects = await api('/projects', guestToken);
        return projects.some((project: { id: string }) => project.id === grantedProject.id);
      })
      .toBe(false);

    const revokedProjectRes = await apiStatus(`/projects/${grantedProject.id}/sections`, guestToken);
    expect(revokedProjectRes.status).toBe(403);

    await guestPage.goto('/');
    await guestPage.reload();
    await expect(guestSidebar.getByRole('link', { name: grantedProjectName })).toHaveCount(0);
    await expect(guestSidebar.getByRole('link', { name: deniedProjectName })).toHaveCount(0);
  } finally {
    await guestContext.close();
  }
});
