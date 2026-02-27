import { expect, test } from '@playwright/test';

const API = process.env.E2E_CORE_API_URL ?? 'http://localhost:3001';

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
  const raw = await res.text();
  return raw ? JSON.parse(raw) : null;
}

test('custom field filter persists after reload and clears correctly', async ({ page }) => {
  const ts = Date.now();
  const sub = `cf-filter-${ts}`;
  const email = `cf-filter-${ts}@example.com`;
  const projectName = `CF Project ${ts}`;

  await page.goto('/login');
  await page.fill('input[placeholder="OIDC sub"]', sub);
  await page.fill('input[placeholder="Email"]', email);
  await page.click('button:has-text("Dev Login")');
  await page.waitForURL('**/');

  await page.fill('input[placeholder="Project name"]', projectName);
  await page.click('[data-testid="create-project-btn"]');

  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  let project: any = null;
  await expect
    .poll(async () => {
      const projects = await api('/projects', token);
      project = projects.find((candidate: any) => candidate.name === projectName) ?? null;
      return Boolean(project?.id);
    })
    .toBe(true);

  await page.goto(`/projects/${project.id}`);
  await expect(page.locator('[data-testid="add-new-trigger"]')).toBeVisible();

  const sections = await api(`/projects/${project.id}/sections`, token);
  const noSection = sections.find((section: any) => section.isDefault);
  expect(noSection).toBeTruthy();

  await page.click('[data-testid="add-new-trigger"]');
  const quickAdd = page.locator(`[data-testid="quick-add-input-${noSection.id}"]`);
  await expect(quickAdd).toBeVisible();
  await quickAdd.fill('Task Alpha');
  await quickAdd.press('Enter');
  await quickAdd.fill('Task Beta');
  await quickAdd.press('Enter');
  await expect(page.locator('[data-task-title="Task Alpha"]')).toBeVisible();
  await expect(page.locator('[data-task-title="Task Beta"]')).toBeVisible();

  const groupedTasks = await api(`/projects/${project.id}/tasks?groupBy=section`, token);
  const taskBeta = groupedTasks.flatMap((group: any) => group.tasks).find((task: any) => task.title === 'Task Beta');
  expect(taskBeta).toBeTruthy();

  const stageField = await api(`/projects/${project.id}/custom-fields`, token, 'POST', {
    name: `Stage ${ts}`,
    type: 'SELECT',
    options: [{ label: 'Option A', value: 'option_a' }],
  });
  const stageOption = stageField.options.find((option: any) => !option.archivedAt);
  expect(stageOption?.id).toBeTruthy();

  await api(`/tasks/${taskBeta.id}/custom-fields`, token, 'PATCH', {
    version: taskBeta.version,
    values: [{ fieldId: stageField.id, value: stageOption.id }],
  });

  await page.reload();
  await page.click('[data-testid="project-filter-trigger"]');
  await expect(page.locator(`[data-testid="project-filter-cf-${stageField.id}-option-${stageOption.id}"]`)).toBeVisible();
  await page.click(`[data-testid="project-filter-cf-${stageField.id}-option-${stageOption.id}"]`);
  await expect(page.locator('[data-task-title="Task Beta"]')).toBeVisible();
  await expect(page.locator('[data-task-title="Task Alpha"]')).toHaveCount(0);

  await page.reload();
  await expect(page.locator('[data-task-title="Task Beta"]')).toBeVisible();
  await expect(page.locator('[data-task-title="Task Alpha"]')).toHaveCount(0);

  await page.click('[data-testid="project-filter-trigger"]');
  await page.click('[data-testid="project-filter-clear"]');
  await expect(page.locator('[data-task-title="Task Alpha"]')).toBeVisible();
  await expect(page.locator('[data-task-title="Task Beta"]')).toBeVisible();
});
