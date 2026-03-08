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

  return loginAs(page, `e2e-status-updates-${suffix}`, `e2e-status-updates-${suffix}@example.com`);
}

async function loginAs(page: Page, sub: string, email: string) {
  await page.goto('/login');
  await page.fill('input[placeholder="OIDC sub"]', sub);
  await page.fill('input[placeholder="Email"]', email);
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

async function inviteAndAcceptWorkspaceMember(
  ownerToken: string,
  workspaceId: string,
  inviteEmail: string,
  invitedUserToken: string,
) {
  const invitation = await api(`/workspaces/${workspaceId}/invitations`, ownerToken, 'POST', {
    email: inviteEmail,
    role: 'WS_MEMBER',
  });
  const inviteToken = String(invitation.inviteLink).split('inviteToken=')[1];
  expect(inviteToken).toBeTruthy();
  await api('/invitations/accept', invitedUserToken, 'POST', { token: inviteToken });
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

test('project status update mentions notify project members and open back into the update context', async ({ browser, page }) => {
  const now = Date.now();
  const ownerToken = await loginAs(page, `e2e-status-owner-${now}`, `e2e-status-owner-${now}@example.com`);
  const project = await createProject(ownerToken, `Status Mentions ${now}`);
  const projectId = project.id;
  const workspaces = await api('/workspaces', ownerToken);
  const workspaceId = workspaces[0].id as string;

  const memberSub = `e2e.status.member-${now}`;
  const memberEmail = `${memberSub}@example.com`;
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();

  try {
    const memberToken = await loginAs(memberPage, memberSub, memberEmail);
    await inviteAndAcceptWorkspaceMember(ownerToken, workspaceId, memberEmail, memberToken);
    await api(`/projects/${projectId}/members`, ownerToken, 'POST', {
      userId: memberSub,
      role: 'MEMBER',
    });

    const createdSummary = `Need @${memberSub} to sign off on the launch checklist.`;
    const expectedMentionLabel = `@${memberSub}`;

    await page.goto(`/projects/${projectId}`);
    await page.getByTestId('status-update-compose-trigger').click();
    await page.getByTestId('status-update-health-select').selectOption('AT_RISK');
    await page.getByTestId('status-update-summary-input').fill(createdSummary);
    await page
      .getByTestId('status-update-blockers-input')
      .fill(`Waiting on @${memberSub} to confirm the migration timing`);
    await page.getByTestId('status-update-next-steps-input').fill(`Review rollback notes with @${memberSub}`);
    await page.getByTestId('status-update-submit').click();

    await expect(page.locator('[data-testid^="status-update-item-"]').first()).toContainText(expectedMentionLabel);

    await memberPage.goto('/inbox');
    const mentionNotification = memberPage.locator('[data-testid^="inbox-notification-"]').first();
    await expect(mentionNotification).toContainText('mentioned you in a project update');
    await expect(mentionNotification).toContainText(expectedMentionLabel);

    await mentionNotification.getByRole('button', { name: 'Open update' }).click();
    await expect(memberPage).toHaveURL(new RegExp(`/projects/${projectId}\\?statusUpdate=`));
    await expect(memberPage.locator('[data-testid^="status-update-item-"]').first()).toContainText(expectedMentionLabel);
  } finally {
    await memberContext.close();
  }
});
