import { expect, test } from './helpers/browser-auth';

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

  const stageFieldName = `Stage ${ts}`;
  await page.click('[data-testid="add-custom-field-trigger"]');
  await page.fill('[data-testid="custom-field-name-input"]', stageFieldName);
  await page.selectOption('[data-testid="custom-field-type-select"]', 'SELECT');
  await page.click('[data-testid="create-custom-field-btn"]');
  await expect(page.getByText(stageFieldName).first()).toBeVisible();

  let stageField: any = null;
  await expect
    .poll(async () => {
      const fields = await api(`/projects/${project.id}/custom-fields`, token);
      stageField = fields.find((field: any) => field.name === stageFieldName) ?? null;
      return Boolean(stageField?.id);
    })
    .toBe(true);
  const stageOption = stageField.options.find((option: any) => !option.archivedAt);
  expect(stageOption?.id).toBeTruthy();

  const renamedStageFieldName = `${stageFieldName} Edited`;
  await page.click('[data-testid="manage-custom-field-trigger"]');
  await page.fill(`[data-testid="custom-field-name-edit-${stageField.id}"]`, renamedStageFieldName);
  await page.fill(
    `[data-testid="custom-field-options-edit-${stageField.id}"]`,
    'Backlog|backlog\nReady|ready',
  );
  await page.click(`[data-testid="custom-field-save-${stageField.id}"]`);
  await expect
    .poll(async () => {
      const fields = await api(`/projects/${project.id}/custom-fields`, token);
      const field = fields.find((candidate: any) => candidate.id === stageField.id);
      return field?.name ?? '';
    })
    .toBe(renamedStageFieldName);
  await page.keyboard.press('Escape');

  stageField = await api(`/projects/${project.id}/custom-fields`, token).then((fields: any[]) =>
    fields.find((candidate) => candidate.id === stageField.id),
  );
  const readyOption = stageField.options.find((option: any) => option.value === 'ready');
  expect(readyOption?.id).toBeTruthy();

  await page.selectOption(
    `[data-testid="task-custom-select-${taskBeta.id}-${stageField.id}"]`,
    readyOption.id,
  );
  await expect
    .poll(async () => {
      const groups = await api(`/projects/${project.id}/tasks?groupBy=section`, token);
      const beta = groups.flatMap((group: any) => group.tasks).find((task: any) => task.id === taskBeta.id);
      return beta?.customFieldValues?.find((value: any) => value.fieldId === stageField.id)?.optionId ?? null;
    })
    .toBe(readyOption.id);

  await page.reload();
  await page.click('[data-testid="project-filter-trigger"]');
  await expect(page.locator(`[data-testid="project-filter-cf-${stageField.id}-option-${readyOption.id}"]`)).toBeVisible();
  await page.click(`[data-testid="project-filter-cf-${stageField.id}-option-${readyOption.id}"]`);
  await expect(page.locator('[data-task-title="Task Beta"]')).toBeVisible();
  await expect(page.locator('[data-task-title="Task Alpha"]')).toHaveCount(0);

  await page.reload();
  await expect(page.locator('[data-task-title="Task Beta"]')).toBeVisible();
  await expect(page.locator('[data-task-title="Task Alpha"]')).toHaveCount(0);

  await page.click('[data-testid="project-filter-trigger"]');
  await page.click('[data-testid="project-filter-clear"]');
  await expect(page.locator('[data-task-title="Task Alpha"]')).toBeVisible();
  await expect(page.locator('[data-task-title="Task Beta"]')).toBeVisible();

  await page.click('[data-testid="manage-custom-field-trigger"]');
  await page.click(`[data-testid="custom-field-delete-${stageField.id}"]`);
  await expect
    .poll(async () => {
      const fields = await api(`/projects/${project.id}/custom-fields`, token);
      return fields.some((field: any) => field.id === stageField.id);
    })
    .toBe(false);
});
