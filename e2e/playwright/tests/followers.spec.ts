import { expect, test, type Page } from './helpers/browser-auth';

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

test('project and task follower toggles persist across reloads and stay hidden from non-members', async ({
  browser,
  page,
}) => {
  const now = Date.now();
  const ownerSub = `e2e-followers-owner-${now}`;
  const ownerEmail = `${ownerSub}@example.com`;
  const ownerToken = await loginAs(page, ownerSub, ownerEmail);
  const project = await createProject(ownerToken, `Follower Controls ${now}`);
  const projectId = project.id;

  const workspaces = await api('/workspaces', ownerToken);
  const workspaceId = workspaces[0].id as string;
  const sections = await api(`/projects/${projectId}/sections`, ownerToken);
  const defaultSection = sections.find((section: { isDefault: boolean }) => section.isDefault) ?? sections[0];
  expect(defaultSection).toBeTruthy();

  const task = await api(`/projects/${projectId}/tasks`, ownerToken, 'POST', {
    sectionId: defaultSection.id,
    title: `Follower task ${now}`,
  });
  const taskId = task.id as string;

  const memberSub = `e2e.followers.member-${now}`;
  const memberEmail = `${memberSub}@example.com`;
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();

  const outsiderSub = `e2e.followers.outsider-${now}`;
  const outsiderEmail = `${outsiderSub}@example.com`;
  const outsiderContext = await browser.newContext();
  const outsiderPage = await outsiderContext.newPage();

  try {
    const memberToken = await loginAs(memberPage, memberSub, memberEmail);
    await inviteAndAcceptWorkspaceMember(ownerToken, workspaceId, memberEmail, memberToken);
    await api(`/projects/${projectId}/members`, ownerToken, 'POST', {
      userId: memberSub,
      role: 'VIEWER',
    });

    await loginAs(outsiderPage, outsiderSub, outsiderEmail);

    await memberPage.goto(`/projects/${projectId}`);
    const projectFollowToggle = memberPage.getByTestId('project-follow-toggle');
    const projectFollowerCount = memberPage.getByTestId('project-follower-count');
    await expect(projectFollowToggle).toContainText('Follow');
    await expect(projectFollowerCount).toContainText('0 followers');

    await projectFollowToggle.click();
    await expect(projectFollowToggle).toContainText('Following');
    await expect(projectFollowerCount).toContainText('1 follower');

    await memberPage.reload();
    await expect(projectFollowToggle).toContainText('Following');
    await expect(projectFollowerCount).toContainText('1 follower');

    await memberPage.goto(`/projects/${projectId}?task=${taskId}`);
    const taskFollowToggle = memberPage.getByTestId('task-follow-toggle');
    const taskFollowerCount = memberPage.getByTestId('task-follower-count');
    await expect(memberPage.getByTestId('task-detail-title-input')).toHaveValue(`Follower task ${now}`);
    await expect(taskFollowToggle).toContainText('Follow');
    await expect(taskFollowerCount).toContainText('0 followers');

    await taskFollowToggle.click();
    await expect(taskFollowToggle).toContainText('Following');
    await expect(taskFollowerCount).toContainText('1 follower');

    await memberPage.reload();
    await expect(memberPage.getByTestId('task-detail-title-input')).toHaveValue(`Follower task ${now}`);
    await expect(taskFollowToggle).toContainText('Following');
    await expect(taskFollowerCount).toContainText('1 follower');

    await taskFollowToggle.click();
    await expect(taskFollowToggle).toContainText('Follow');
    await expect(taskFollowerCount).toContainText('0 followers');

    await memberPage.goto(`/projects/${projectId}`);
    await projectFollowToggle.click();
    await expect(projectFollowToggle).toContainText('Follow');
    await expect(projectFollowerCount).toContainText('0 followers');

    await memberPage.reload();
    await expect(projectFollowToggle).toContainText('Follow');
    await expect(projectFollowerCount).toContainText('0 followers');

    await outsiderPage.goto(`/projects/${projectId}`);
    await expect(outsiderPage.getByTestId('project-follow-toggle')).toHaveCount(0);
    await expect(outsiderPage.getByTestId('task-follow-toggle')).toHaveCount(0);
  } finally {
    await outsiderContext.close();
    await memberContext.close();
  }
});
