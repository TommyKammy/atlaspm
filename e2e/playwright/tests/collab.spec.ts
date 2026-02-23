import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

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

async function setupTaskForProject(page: Page, projectName: string, sectionName: string, taskTitle: string) {
  const token = await tokenFrom(page);
  const ws = await api('/workspaces', token);
  const workspaceId = ws[0].id;
  const project = await api('/projects', token, 'POST', { workspaceId, name: projectName });
  const section = await api(`/projects/${project.id}/sections`, token, 'POST', { name: sectionName });
  const task = await api(`/projects/${project.id}/tasks`, token, 'POST', { title: taskTitle, sectionId: section.id });
  return { token, workspaceId, project, section, task };
}

async function inviteAndAcceptWorkspaceMember(
  adminToken: string,
  workspaceId: string,
  inviteEmail: string,
  invitedUserToken: string,
) {
  const invitation = await api(`/workspaces/${workspaceId}/invitations`, adminToken, 'POST', {
    email: inviteEmail,
    role: 'WS_MEMBER',
  });
  const inviteToken = String(invitation.inviteLink).split('inviteToken=')[1];
  if (!inviteToken) throw new Error('Missing invite token');
  await api('/invitations/accept', invitedUserToken, 'POST', { token: inviteToken });
}

async function openTask(page: Page, projectId: string, taskId: string) {
  await page.goto(`/projects/${projectId}`);
  await page.click(`[data-testid="open-task-${taskId}"]`);
  await expect(page.locator('[data-testid="task-description-content"]')).toBeVisible();
}

test('collab authz: MEMBER edits, VIEWER observes read-only', async ({ browser, page }) => {
  const ownerSub = `owner-${Date.now()}`;
  const viewerSub = `viewer-${Date.now()}`;

  await login(page, ownerSub, `${ownerSub}@example.com`);
  const { token, workspaceId, project, task } = await setupTaskForProject(
    page,
    `Collab Auth ${Date.now()}`,
    'Realtime',
    'Shared Task',
  );

  const viewerContext = await browser.newContext();
  const viewerPage = await viewerContext.newPage();
  await login(viewerPage, viewerSub, `${viewerSub}@example.com`);
  const viewerToken = await tokenFrom(viewerPage);
  await inviteAndAcceptWorkspaceMember(token, workspaceId, `${viewerSub}@example.com`, viewerToken);
  await api(`/projects/${project.id}/members`, token, 'POST', {
    userId: viewerSub,
    role: 'VIEWER',
  });

  await openTask(page, project.id, task.id);
  await openTask(viewerPage, project.id, task.id);

  await expect(viewerPage.locator('[data-testid="collab-readonly-banner"]')).toBeVisible();

  const memberEditor = page.locator('[data-testid="task-description-content"]').first();
  await memberEditor.click();
  await memberEditor.type('Member writes live text.');

  await expect
    .poll(async () => {
      const text = await viewerPage.locator('[data-testid="task-description-content"]').innerText();
      return text.includes('Member writes live text.');
    })
    .toBeTruthy();

  const viewerEditor = viewerPage.locator('[data-testid="task-description-content"]').first();
  const beforeText = await viewerEditor.innerText();
  await viewerEditor.click();
  await viewerEditor.type('viewer should not edit');
  await expect
    .poll(async () => {
      const latest = await viewerEditor.innerText();
      return latest === beforeText;
    })
    .toBeTruthy();

  await viewerContext.close();
});

test('collab multi-member sync + snapshot persistence + presence', async ({ browser, page }) => {
  const memberASub = `member-a-${Date.now()}`;
  const memberBSub = `member-b-${Date.now()}`;

  await login(page, memberASub, `${memberASub}@example.com`);
  const { token, workspaceId, project, task } = await setupTaskForProject(
    page,
    `Collab Persist ${Date.now()}`,
    'Realtime',
    'Persistent Task',
  );

  const memberBContext = await browser.newContext();
  const memberBPage = await memberBContext.newPage();
  await login(memberBPage, memberBSub, `${memberBSub}@example.com`);
  const memberBToken = await tokenFrom(memberBPage);
  await inviteAndAcceptWorkspaceMember(token, workspaceId, `${memberBSub}@example.com`, memberBToken);
  await api(`/projects/${project.id}/members`, token, 'POST', {
    userId: memberBSub,
    role: 'MEMBER',
  });

  await openTask(page, project.id, task.id);
  await openTask(memberBPage, project.id, task.id);

  await expect(page.locator('[data-testid="collab-presence-badge"]')).toContainText('2 users');
  await expect(memberBPage.locator('[data-testid="collab-presence-badge"]')).toContainText('2 users');

  const editorA = page.locator('[data-testid="task-description-content"]').first();
  const editorB = memberBPage.locator('[data-testid="task-description-content"]').first();

  await editorA.click();
  await editorA.type('A says hello. ');

  await expect
    .poll(async () => {
      const text = await editorB.innerText();
      return text.includes('A says hello.');
    })
    .toBeTruthy();

  await editorB.click();
  await editorB.type('B replies.');

  await expect
    .poll(async () => {
      const text = await editorA.innerText();
      return text.includes('B replies.');
    })
    .toBeTruthy();

  await page.waitForTimeout(4500);
  await page.reload();
  await memberBPage.reload();
  await openTask(page, project.id, task.id);
  await openTask(memberBPage, project.id, task.id);

  await expect
    .poll(async () => {
      const detail = await api(`/tasks/${task.id}`, token);
      const text = JSON.stringify(detail.descriptionDoc ?? {});
      return text.includes('A says hello.') && text.includes('B replies.');
    })
    .toBeTruthy();

  await memberBContext.close();
});
