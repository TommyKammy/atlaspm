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

async function login(page: Page) {
  const suffix = Date.now();
  await page.goto('/login');
  await page.fill('input[placeholder="OIDC sub"]', `e2e-deadline-sort-${suffix}`);
  await page.fill('input[placeholder="Email"]', `e2e-deadline-sort-${suffix}@example.com`);
  await page.click('button:has-text("Dev Login")');
  await page.waitForURL('**/');
  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();
  return token;
}

function dueDateIso(daysFromToday: number) {
  const value = new Date();
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + daysFromToday);
  return value.toISOString();
}

test('list view orders earlier deadlines above later deadlines in the same section', async ({ page }) => {
  const token = await login(page);
  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;

  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Deadline Sort ${Date.now()}`,
  });
  const projectId = project.id as string;
  const sections = await api(`/projects/${projectId}/sections`, token);
  const defaultSection = sections.find((section: any) => section.isDefault) ?? sections[0];

  const earlierTitle = `Earlier Deadline ${Date.now()}`;
  const laterTitle = `Later Deadline ${Date.now()}`;

  await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: defaultSection.id,
    title: earlierTitle,
    dueAt: dueDateIso(1),
  });

  await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: defaultSection.id,
    title: laterTitle,
    dueAt: dueDateIso(6),
  });

  await page.goto(`/projects/${projectId}`);
  await expect(page.locator(`[data-task-title="${earlierTitle}"]`)).toBeVisible();
  await expect(page.locator(`[data-task-title="${laterTitle}"]`)).toBeVisible();

  await expect
    .poll(async () => {
      const titlesInOrder = await page
        .locator(`[data-testid="section-${defaultSection.id}"] [data-task-title]`)
        .evaluateAll((elements) =>
          elements
            .map((element) => element.getAttribute('data-task-title') ?? '')
            .filter(Boolean),
        );
      const earlierIndex = titlesInOrder.indexOf(earlierTitle);
      const laterIndex = titlesInOrder.indexOf(laterTitle);
      return earlierIndex >= 0 && laterIndex >= 0 ? earlierIndex < laterIndex : false;
    })
    .toBe(true);
});
