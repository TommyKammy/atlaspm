import { expect, test, type Page } from './helpers/browser-auth';

const API = process.env.E2E_CORE_API_URL ?? 'http://localhost:3001';

type ApiOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

async function apiRaw(path: string, token: string, options: ApiOptions = {}) {
  const res = await fetch(`${API}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return res;
}

async function api(path: string, token: string, options: ApiOptions = {}) {
  const res = await apiRaw(path, token, options);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const raw = await res.text();
  return raw ? JSON.parse(raw) : null;
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

function normalizeConflictDetails(payload: any) {
  if (payload?.error?.details?.latest && typeof payload?.error?.details?.message === 'string') {
    return payload.error.details;
  }
  return payload;
}

test('timeline reschedule conflict: one success, one 409; audit keeps actor/correlation', async ({ browser, page }) => {
  const now = Date.now();
  const ownerSub = `timeline-owner-${now}`;
  const memberSub = `timeline-member-${now}`;

  await login(page, ownerSub, `${ownerSub}@example.com`);
  await page.evaluate(() => localStorage.setItem('atlaspm:feature:timeline', 'enabled'));
  const ownerToken = await tokenFrom(page);

  const workspaces = await api('/workspaces', ownerToken);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', ownerToken, {
    method: 'POST',
    body: { workspaceId, name: `Timeline Conflict ${now}` },
  });
  const projectId = project.id as string;
  const section = await api(`/projects/${projectId}/sections`, ownerToken, { method: 'POST', body: { name: 'Backlog' } });

  const startAt = new Date();
  startAt.setDate(startAt.getDate() + 1);
  startAt.setHours(0, 0, 0, 0);
  const dueAt = new Date(startAt);
  dueAt.setDate(dueAt.getDate() + 2);
  const task = await api(`/projects/${projectId}/tasks`, ownerToken, {
    method: 'POST',
    body: { sectionId: section.id, title: `Conflict Task ${now}`, startAt: startAt.toISOString(), dueAt: dueAt.toISOString() },
  });
  const taskId = task.id as string;

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  try {
    await login(memberPage, memberSub, `${memberSub}@example.com`);
    await memberPage.evaluate(() => localStorage.setItem('atlaspm:feature:timeline', 'enabled'));
    const memberToken = await tokenFrom(memberPage);

    const invitation = await api(`/workspaces/${workspaceId}/invitations`, ownerToken, {
      method: 'POST',
      body: { email: `${memberSub}@example.com`, role: 'WS_MEMBER' },
    });
    const inviteToken = String(invitation.inviteLink).split('inviteToken=')[1];
    expect(inviteToken).toBeTruthy();
    await api('/invitations/accept', memberToken, { method: 'POST', body: { token: inviteToken } });
    await api(`/projects/${projectId}/members`, ownerToken, {
      method: 'POST',
      body: { userId: memberSub, role: 'MEMBER' },
    });

    await page.goto(`/projects/${projectId}?view=timeline`);
    await memberPage.goto(`/projects/${projectId}?view=timeline`);
    await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
    await expect(memberPage.locator('[data-testid="timeline-view"]')).toBeVisible();

    const freshTask = await api(`/tasks/${taskId}`, ownerToken);
    const staleVersion = freshTask.version as number;

    const ownerCorrelationId = `e2e-reschedule-owner-${now}`;
    const memberCorrelationId = `e2e-reschedule-member-${now}`;

    const ownerDueAt = new Date(dueAt);
    ownerDueAt.setDate(ownerDueAt.getDate() + 3);
    const memberDueAt = new Date(dueAt);
    memberDueAt.setDate(memberDueAt.getDate() + 5);

    const [ownerRes, memberRes] = await Promise.all([
      apiRaw(`/tasks/${taskId}/reschedule`, ownerToken, {
        method: 'PATCH',
        headers: { 'x-correlation-id': ownerCorrelationId },
        body: { dueAt: ownerDueAt.toISOString(), version: staleVersion },
      }),
      apiRaw(`/tasks/${taskId}/reschedule`, memberToken, {
        method: 'PATCH',
        headers: { 'x-correlation-id': memberCorrelationId },
        body: { dueAt: memberDueAt.toISOString(), version: staleVersion },
      }),
    ]);

    const ownerBody = await ownerRes.json();
    const memberBody = await memberRes.json();
    const statuses = [ownerRes.status, memberRes.status].sort((a, b) => a - b);

    if (!(statuses[0] === 200 && statuses[1] === 409)) {
      throw new Error(
        [
          'Expected exactly one 200 and one 409 response status.',
          `Got ownerRes.status=${ownerRes.status}, memberRes.status=${memberRes.status}.`,
          `ownerBody=${JSON.stringify(ownerBody)},`,
          `memberBody=${JSON.stringify(memberBody)}`,
        ].join(' '),
      );
    }

    const successMeta =
      ownerRes.status === 200
        ? { actor: ownerSub, correlationId: ownerCorrelationId, body: ownerBody }
        : { actor: memberSub, correlationId: memberCorrelationId, body: memberBody };
    const conflictBody = normalizeConflictDetails(ownerRes.status === 409 ? ownerBody : memberBody);

    expect(conflictBody).toMatchObject({
      message: 'Version conflict',
      latest: {
        version: successMeta.body.version,
      },
    });

    const audit = await api(`/tasks/${taskId}/audit`, ownerToken);
    const rescheduleEvents = (audit as Array<any>).filter((event) => event.action === 'task.rescheduled');
    expect(rescheduleEvents).toHaveLength(1);
    expect(rescheduleEvents[0].actor).toBe(successMeta.actor);
    expect(rescheduleEvents[0].correlationId).toBe(successMeta.correlationId);
  } finally {
    await memberContext.close();
  }
});
