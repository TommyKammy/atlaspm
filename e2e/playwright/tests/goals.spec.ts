import { expect, test, type Browser, type Page } from './helpers/browser-auth';

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

async function createProject(token: string, workspaceId: string, name: string) {
  return api('/projects', token, 'POST', { workspaceId, name }) as Promise<{ id: string; name: string }>;
}

async function createGoal(
  token: string,
  workspaceId: string,
  title: string,
  projectId?: string,
) {
  const goal = (await api('/goals', token, 'POST', { workspaceId, title })) as { id: string; title: string };
  if (projectId) {
    await api(`/goals/${goal.id}/projects`, token, 'POST', { projectId });
  }
  return goal;
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

async function setupOwner(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const now = Date.now();
  const sub = `e2e-goals-owner-${now}`;
  const email = `${sub}@example.com`;
  const token = await loginAs(page, sub, email);
  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;

  return { context, page, token, workspaceId, now };
}

test('goal management supports linkage, rollups, history, and reload persistence', async ({ browser }) => {
  const { context, page, token, workspaceId, now } = await setupOwner(browser);

  try {
    const project = await createProject(token, workspaceId, `Goal Rollup ${now}`);
    const goalTitle = `Ship launch ${now}`;
    const updatedTitle = `${goalTitle} rev 2`;

    await page.goto(`/workspaces/${workspaceId}/goals`);
    await page.getByRole('button', { name: 'New goal' }).click();
    await page.getByLabel('Name').fill(goalTitle);
    await page.getByLabel('Description').fill('Coordinate launch readiness across teams.');
    await page.getByLabel('Status').selectOption('ON_TRACK');
    await page.getByLabel('Progress').fill('35');
    const createGoalResponse = page.waitForResponse(
      (response) => response.url().includes('/goals') && response.request().method() === 'POST' && response.status() === 201,
    );
    await page.getByRole('button', { name: 'Create goal' }).click();
    await createGoalResponse;

    await expect(page.getByText(goalTitle)).toBeVisible();
    await page.getByRole('heading', { name: goalTitle }).click();

    await expect(page).toHaveURL(new RegExp(`/workspaces/${workspaceId}/goals/`));
    await expect(page.getByText('35%').first()).toBeVisible();

    await page.getByRole('button', { name: 'Edit goal' }).click();
    await page.getByLabel('Name').fill(updatedTitle);
    await page.getByLabel('Status').selectOption('AT_RISK');
    await page.getByLabel('Progress').fill('40');
    const updateGoalResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/goals/') && response.request().method() === 'PATCH' && response.status() === 200,
    );
    await page.getByRole('button', { name: 'Save changes' }).click();
    await updateGoalResponse;

    await expect(page.getByRole('heading', { name: updatedTitle })).toBeVisible();
    await expect(page.getByText('40%').first()).toBeVisible();
    await expect(page.getByText('At risk').first()).toBeVisible();

    await page.getByRole('button', { name: 'Link project' }).click();
    await page.getByPlaceholder('Search projects').fill(project.name);
    const linkProjectResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/projects') && response.request().method() === 'POST' && response.status() === 201,
    );
    await page.getByText(project.name, { exact: true }).click();
    await linkProjectResponse;

    await expect(page.getByText(project.name)).toBeVisible();

    await page.goto(`/projects/${project.id}`);
    await expect(page.getByText(updatedTitle)).toBeVisible();

    await page.getByTestId('status-update-compose-trigger').click();
    await page.getByTestId('status-update-health-select').selectOption('ON_TRACK');
    await page.getByTestId('status-update-summary-input').fill('Launch readiness is back on track.');
    const statusUpdateResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/projects/${project.id}/status-updates`) &&
        response.request().method() === 'POST' &&
        response.status() === 201,
    );
    await page.getByTestId('status-update-submit').click();
    await statusUpdateResponse;

    await expect(page.getByText('100%').first()).toBeVisible();
    await expect(page.getByText('On track').first()).toBeVisible();

    await page.reload();
    await expect(page.getByText(updatedTitle)).toBeVisible();
    await expect(page.getByText('100%').first()).toBeVisible();

    await page.goto(`/workspaces/${workspaceId}/goals`);
    await page.getByRole('heading', { name: updatedTitle }).click();
    await expect(page.getByText('Goal history')).toBeVisible();
    await expect(page.getByText('Goal updated').first()).toBeVisible();
    await expect(page.getByText('Rollup updated').first()).toBeVisible();
    await expect(page.getByText('100%').first()).toBeVisible();
  } finally {
    await context.close();
  }
});

test('project viewers can see aligned goals but not edit goal alignment or status updates', async ({ browser }) => {
  const { context: ownerContext, page: ownerPage, token: ownerToken, workspaceId, now } = await setupOwner(browser);
  const viewerContext = await browser.newContext();
  const viewerPage = await viewerContext.newPage();

  try {
    const project = await createProject(ownerToken, workspaceId, `Viewer Goals ${now}`);
    const goal = await createGoal(ownerToken, workspaceId, `Viewer-visible goal ${now}`, project.id);

    const viewerSub = `e2e-goals-viewer-${now}`;
    const viewerEmail = `${viewerSub}@example.com`;
    const viewerToken = await loginAs(viewerPage, viewerSub, viewerEmail);
    await inviteAndAcceptWorkspaceMember(ownerToken, workspaceId, viewerEmail, viewerToken);
    await api(`/projects/${project.id}/members`, ownerToken, 'POST', {
      userId: viewerSub,
      role: 'VIEWER',
    });

    await viewerPage.goto(`/projects/${project.id}`);

    await expect(viewerPage.getByText(goal.title)).toBeVisible();
    await expect(viewerPage.getByRole('button', { name: 'Add goal alignment' })).toHaveCount(0);
    await expect(viewerPage.getByRole('button', { name: 'Unlink project' })).toHaveCount(0);
    await expect(viewerPage.getByTestId('status-update-compose-trigger')).toHaveCount(0);
    await viewerPage.reload();
    await expect(viewerPage.getByText(goal.title)).toBeVisible();

    await ownerPage.goto(`/projects/${project.id}`);
    await expect(ownerPage.getByText(goal.title)).toBeVisible();
  } finally {
    await viewerContext.close();
    await ownerContext.close();
  }
});
