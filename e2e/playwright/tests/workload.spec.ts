import { expect, test, type Browser, type Page } from './helpers/browser-auth';

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
  if (!inviteToken) throw new Error('Missing workspace invite token');
  await api('/invitations/accept', invitedUserToken, 'POST', { token: inviteToken });
}

function nextUtcWeekday(dayOfWeek: number) {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  const delta = (dayOfWeek - date.getUTCDay() + 7) % 7 || 7;
  date.setUTCDate(date.getUTCDate() + delta);
  return date;
}

async function createCapacityScenario(browser: Browser) {
  const stamp = Date.now();
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  const ownerSub = `e2e-workload-owner-${stamp}`;
  const ownerEmail = `${ownerSub}@example.com`;
  await devLogin(ownerPage, ownerSub, ownerEmail);
  const ownerToken = await getToken(ownerPage);

  const workspaces = (await api('/workspaces', ownerToken)) as Array<{ id: string }>;
  const workspaceId = workspaces[0]?.id;
  if (!workspaceId) throw new Error('Workspace not found');

  const project = (await api('/projects', ownerToken, 'POST', {
    workspaceId,
    name: `Workload Capacity ${stamp}`,
  })) as { id: string };

  const overloadedSub = `e2e-workload-over-${stamp}`;
  const overloadedEmail = `${overloadedSub}@example.com`;
  const overloadedContext = await browser.newContext();
  const overloadedPage = await overloadedContext.newPage();
  await devLogin(overloadedPage, overloadedSub, overloadedEmail);
  const overloadedToken = await getToken(overloadedPage);
  await inviteAndAcceptWorkspaceMember(ownerToken, workspaceId, overloadedEmail, overloadedToken);

  const reducedSub = `e2e-workload-reduced-${stamp}`;
  const reducedEmail = `${reducedSub}@example.com`;
  const reducedContext = await browser.newContext();
  const reducedPage = await reducedContext.newPage();
  await devLogin(reducedPage, reducedSub, reducedEmail);
  const reducedToken = await getToken(reducedPage);
  await inviteAndAcceptWorkspaceMember(ownerToken, workspaceId, reducedEmail, reducedToken);

  await api(`/projects/${project.id}/members`, ownerToken, 'POST', {
    userId: overloadedSub,
    role: 'MEMBER',
  });
  await api(`/projects/${project.id}/members`, ownerToken, 'POST', {
    userId: reducedSub,
    role: 'MEMBER',
  });

  const nextTuesday = nextUtcWeekday(2);
  const dateOnly = nextTuesday.toISOString().slice(0, 10);
  const dueAt = nextTuesday.toISOString();

  await api(`/workspaces/${workspaceId}/capacity-schedules`, ownerToken, 'POST', {
    subjectType: 'WORKSPACE',
    name: `Workspace Tuesday ${stamp}`,
    timeZone: 'UTC',
    hoursPerDay: 8,
    daysOfWeek: [2],
  });

  await api(`/workspaces/${workspaceId}/capacity-schedules`, ownerToken, 'POST', {
    subjectType: 'USER',
    subjectUserId: overloadedSub,
    name: `Overloaded Tuesday ${stamp}`,
    timeZone: 'UTC',
    hoursPerDay: 6,
    daysOfWeek: [2],
  });

  await api(`/workspaces/${workspaceId}/time-off`, ownerToken, 'POST', {
    userId: reducedSub,
    startDate: dateOnly,
    endDate: dateOnly,
    minutesPerDay: 120,
    reason: 'Training',
  });

  for (let index = 0; index < 3; index += 1) {
    const task = (await api(`/projects/${project.id}/tasks`, ownerToken, 'POST', {
      title: `Over capacity ${stamp}-${index + 1}`,
      assigneeUserId: overloadedSub,
      dueAt,
    })) as { id: string };
    await api(`/tasks/${task.id}/estimate`, ownerToken, 'PATCH', { estimateMinutes: 140 });
  }

  const reducedTask = (await api(`/projects/${project.id}/tasks`, ownerToken, 'POST', {
    title: `Reduced capacity ${stamp}`,
    assigneeUserId: reducedSub,
    dueAt,
  })) as { id: string };
  await api(`/tasks/${reducedTask.id}/estimate`, ownerToken, 'PATCH', { estimateMinutes: 300 });

  return {
    ownerContext,
    ownerPage,
    workspaceId,
    ownerEmail,
    overloadedContext,
    overloadedPage,
    overloadedEmail,
    reducedContext,
    reducedPage,
    reducedEmail,
  };
}

test('workload page renders and supports view switching', async ({ page }) => {
  const stamp = Date.now();
  const sub = `e2e-workload-${stamp}`;
  await devLogin(page, sub, `e2e-workload-${stamp}@example.com`);
  const token = await getToken(page);

  const workspaces = (await api('/workspaces', token)) as Array<{ id: string }>;
  const workspaceId = workspaces[0]?.id;
  if (!workspaceId) throw new Error('Workspace not found');

  const project = (await api('/projects', token, 'POST', {
    workspaceId,
    name: `Workload Project ${stamp}`,
  })) as { id: string };

  await api(`/projects/${project.id}/tasks`, token, 'POST', {
    title: `Workload Task ${stamp}`,
    assigneeUserId: sub,
    dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  });

  await page.goto(`/workspaces/${workspaceId}/workload`);
  await expect(page.locator('h1:has-text("Workload Management")')).toBeVisible();
  await expect(page.locator('text=Team View')).toBeVisible();
  await expect(page.locator(`text=e2e-workload-${stamp}@example.com`)).toBeVisible();

  await page.click('text=Project View');
  const projectPicker = page.getByRole('button', { name: 'Select a project' });
  await expect(projectPicker).toBeVisible();
  await projectPicker.click();
  await page.getByRole('button', { name: `Workload Project ${stamp}` }).click();

  await expect(page.locator(`text=Workload Task ${stamp}`)).toBeVisible();
  await expect(page.locator('text=total tasks')).toBeVisible();
});

test('workload page shows capacity-aware indicators, filters, and reload state', async ({ browser }) => {
  const {
    ownerContext,
    ownerPage,
    workspaceId,
    overloadedEmail,
    reducedEmail,
    overloadedContext,
    reducedContext,
  } = await createCapacityScenario(browser);

  try {
    await ownerPage.goto(`/workspaces/${workspaceId}/workload`);

    await expect(ownerPage.locator(`text=${overloadedEmail}`)).toBeVisible();
    await expect(ownerPage.locator(`text=${reducedEmail}`)).toBeVisible();
    await expect(ownerPage.locator('text=+1 over capacity')).toBeVisible();
    await expect(ownerPage.locator('text=Reduced capacity')).toBeVisible();
    await expect(ownerPage.locator('text=2 task capacity')).toBeVisible();

    await ownerPage.reload();
    await expect(ownerPage.locator(`text=${overloadedEmail}`)).toBeVisible();
    await expect(ownerPage.locator(`text=${reducedEmail}`)).toBeVisible();
    await expect(ownerPage.locator('text=+1 over capacity')).toBeVisible();
    await expect(ownerPage.locator('text=Reduced capacity')).toBeVisible();

    await ownerPage.getByRole('button', { name: 'Effort View' }).click();
    await expect(ownerPage.locator('text=+1h over capacity')).toBeVisible();
    await expect(ownerPage.locator('text=5h / 6h')).toBeVisible();

    await ownerPage.getByRole('button', { name: /All people \(/ }).click();
    await ownerPage.getByRole('option', { name: /Over capacity \(/ }).click();
    await expect(ownerPage.locator(`text=${overloadedEmail}`)).toBeVisible();
    await expect(ownerPage.locator(`text=${reducedEmail}`)).toHaveCount(0);

    await ownerPage.getByRole('button', { name: /Over capacity \(/ }).click();
    await ownerPage.getByRole('option', { name: /Reduced capacity \(/ }).click();
    await expect(ownerPage.locator(`text=${reducedEmail}`)).toBeVisible();
    await expect(ownerPage.locator(`text=${overloadedEmail}`)).toHaveCount(0);
    await expect(ownerPage.locator('text=5h / 6h')).toBeVisible();
  } finally {
    await reducedContext.close();
    await overloadedContext.close();
    await ownerContext.close();
  }
});

test('non-admin team members only see their own workload cards', async ({ browser }) => {
  const {
    ownerContext,
    overloadedContext,
    reducedContext,
    reducedPage,
    workspaceId,
    ownerEmail,
    overloadedEmail,
    reducedEmail,
  } = await createCapacityScenario(browser);

  try {
    await reducedPage.goto(`/workspaces/${workspaceId}/workload`);

    await expect(reducedPage.locator(`text=${reducedEmail}`)).toBeVisible();
    await expect(reducedPage.locator(`text=${overloadedEmail}`)).toHaveCount(0);
    await expect(reducedPage.locator(`text=${ownerEmail}`)).toHaveCount(0);
    await expect(reducedPage.locator('text=Reduced capacity')).toBeVisible();

    await reducedPage.reload();
    await expect(reducedPage.locator(`text=${reducedEmail}`)).toBeVisible();
    await expect(reducedPage.locator(`text=${overloadedEmail}`)).toHaveCount(0);
  } finally {
    await reducedContext.close();
    await overloadedContext.close();
    await ownerContext.close();
  }
});
