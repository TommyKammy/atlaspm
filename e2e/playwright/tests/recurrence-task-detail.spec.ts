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

async function loginAndCreateProject(page: Page): Promise<{ projectId: string; token: string }> {
  const suffix = Date.now();

  await page.goto('/login');
  await page.fill('input[placeholder="OIDC sub"]', `e2e-recurrence-${suffix}`);
  await page.fill('input[placeholder="Email"]', `e2e-recurrence-${suffix}@example.com`);
  await page.click('button:has-text("Dev Login")');
  await page.waitForURL('**/');

  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;

  const projectName = `Recurrence UI ${suffix}`;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: projectName,
  });

  await page.goto(`/projects/${project.id}`);
  await page.waitForURL(`**/projects/${project.id}`);

  return { projectId: project.id as string, token };
}

async function createTaskViaApi(token: string, projectId: string, title: string) {
  const sections = await api(`/projects/${projectId}/sections`, token);
  const defaultSection = sections.find((section: { isDefault?: boolean }) => section.isDefault) ?? sections[0];
  return api(`/projects/${projectId}/tasks`, token, 'POST', {
    title,
    sectionId: defaultSection.id,
  });
}

async function listRecurringRules(token: string, projectId: string) {
  return api(`/projects/${projectId}/recurring-rules?includeInactive=true`, token) as Promise<Array<Record<string, unknown>>>;
}

test('task detail supports creating, editing, and disabling recurrence', async ({ page }) => {
  const { projectId, token } = await loginAndCreateProject(page);
  const task = await createTaskViaApi(token, projectId, 'Recurring UI Task');

  await page.goto(`/projects/${projectId}`);
  await page.getByTestId(`open-task-${task.id}`).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await expect(page.getByTestId('task-detail-recurrence-section')).toBeVisible();
  await expect(page.getByTestId('task-detail-recurrence-create')).toBeVisible();

  await page.getByTestId('task-detail-recurrence-create').click();
  await page.getByTestId('task-detail-recurrence-frequency').selectOption('WEEKLY');
  await page.getByTestId('task-detail-recurrence-interval').fill('2');
  await page.getByTestId('task-detail-recurrence-weekday-1').click();
  await page.getByTestId('task-detail-recurrence-weekday-3').click();
  await page.getByTestId('task-detail-recurrence-start-date').fill('2026-03-10');
  await page.getByTestId('task-detail-recurrence-save').click();

  let createdRuleId = '';
  await expect.poll(async () => {
    const rules = await listRecurringRules(token, projectId);
    const rule = rules.find((item) => item.title === 'Recurring UI Task');
    createdRuleId = (rule?.id as string | undefined) ?? '';
    return {
      count: rules.length,
      frequency: rule?.frequency,
      interval: rule?.interval,
      daysOfWeek: rule?.daysOfWeek,
      isActive: rule?.isActive,
    };
  }).toEqual({
    count: 1,
    frequency: 'WEEKLY',
    interval: 2,
    daysOfWeek: [1, 3],
    isActive: true,
  });
  expect(createdRuleId).toBeTruthy();

  await expect(page.getByTestId('task-detail-recurrence-summary')).toContainText('Every 2 weeks');
  await expect(page.getByTestId('task-detail-recurrence-edit')).toBeVisible();
  await expect(page.getByTestId('task-detail-recurrence-disable')).toBeVisible();

  await page.getByTestId('task-detail-recurrence-edit').click();
  await page.getByTestId('task-detail-recurrence-frequency').selectOption('MONTHLY');
  await page.getByTestId('task-detail-recurrence-day-of-month').fill('15');
  await page.getByTestId('task-detail-recurrence-save').click();

  await expect.poll(async () => {
    const rules = await listRecurringRules(token, projectId);
    const rule = rules.find((item) => item.id === createdRuleId);
    return {
      frequency: rule?.frequency,
      dayOfMonth: rule?.dayOfMonth,
      isActive: rule?.isActive,
    };
  }).toEqual({
    frequency: 'MONTHLY',
    dayOfMonth: 15,
    isActive: true,
  });

  await expect(page.getByTestId('task-detail-recurrence-summary')).toContainText('Day 15');

  await page.getByTestId('task-detail-recurrence-disable').click();

  await expect.poll(async () => {
    const rules = await listRecurringRules(token, projectId);
    const rule = rules.find((item) => item.id === createdRuleId);
    return rule?.isActive;
  }).toBe(false);

  await expect(page.getByTestId('task-detail-recurrence-summary')).toContainText('Disabled');
});
