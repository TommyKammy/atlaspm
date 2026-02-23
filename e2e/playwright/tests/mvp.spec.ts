import { expect, test, type Page } from '@playwright/test';

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

async function dragTaskToTask(page: Page, taskTitle: string, targetTitle: string) {
  const source = page.locator(`[data-task-title="${taskTitle}"]`).first();
  const target = page.locator(`[data-task-title="${targetTitle}"]`).first();
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();

  const sourceHandle = source.locator('button[data-testid^="drag-handle-"]').first();
  await expect(sourceHandle).toBeVisible();
  await sourceHandle.dragTo(target, { force: true });
}

test('AtlasPM Asana-like UX flow', async ({ page }) => {
  const sub = `e2e-user-${Date.now()}`;
  const email = `e2e-${Date.now()}@example.com`;

  await page.goto('/login');
  await page.fill('input[placeholder="OIDC sub"]', sub);
  await page.fill('input[placeholder="Email"]', email);
  await page.click('button:has-text("Dev Login")');
  await page.waitForURL('**/');

  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const projectName1 = `UX Project A ${Date.now()}`;
  const projectName2 = `UX Project B ${Date.now()}`;

  await page.fill('input[placeholder="Project name"]', projectName1);
  await page.click('[data-testid="create-project-btn"]');
  await expect(page.getByText(projectName1).first()).toBeVisible();

  await page.fill('input[placeholder="Project name"]', projectName2);
  await page.click('[data-testid="create-project-btn"]');
  await expect(page.getByText(projectName2).first()).toBeVisible();

  const projects = await api('/projects', token);
  const projectA = projects.find((p: any) => p.name === projectName1);
  const projectB = projects.find((p: any) => p.name === projectName2);
  expect(projectA).toBeTruthy();
  expect(projectB).toBeTruthy();

  const sidebar = page.locator('aside');
  await expect(sidebar.getByRole('link', { name: projectName1 })).toBeVisible();
  await expect(sidebar.getByRole('link', { name: projectName2 })).toBeVisible();

  await sidebar.getByRole('link', { name: projectName2 }).click();
  await page.waitForURL(`**/projects/${projectB.id}`);

  await sidebar.getByRole('link', { name: projectName1 }).click();
  await page.waitForURL(`**/projects/${projectA.id}`);

  await page.fill('[data-testid="new-section-input"]', 'Backlog');
  await page.click('[data-testid="create-section-btn"]');
  await expect(page.getByRole('heading', { name: 'Backlog' })).toBeVisible();

  await page.fill('[data-testid="new-section-input"]', 'Doing');
  await page.click('[data-testid="create-section-btn"]');
  await expect(page.getByRole('heading', { name: 'Doing' })).toBeVisible();

  let sections = await api(`/projects/${projectA.id}/sections`, token);
  const backlog = sections.find((s: any) => s.name === 'Backlog');
  const doing = sections.find((s: any) => s.name === 'Doing');
  expect(backlog).toBeTruthy();
  expect(doing).toBeTruthy();

  await page.click(`[data-testid="quick-add-open-${backlog.id}"]`);
  const quickAddBacklog = page.locator(`[data-testid="quick-add-input-${backlog.id}"]`);
  await quickAddBacklog.fill('Task A');
  await quickAddBacklog.press('Enter');
  await expect(page.locator('[data-task-title="Task A"]')).toBeVisible();

  await quickAddBacklog.fill('Task B');
  await quickAddBacklog.press('Enter');
  await expect(page.locator('[data-task-title="Task B"]')).toBeVisible();

  await quickAddBacklog.fill('Task C');
  await quickAddBacklog.press('Enter');
  await expect(page.locator('[data-task-title="Task C"]')).toBeVisible();

  await page.click(`[data-testid="quick-add-open-${doing.id}"]`);
  const quickAddDoing = page.locator(`[data-testid="quick-add-input-${doing.id}"]`);
  await quickAddDoing.fill('Task D');
  await quickAddDoing.press('Enter');
  await expect(page.locator('[data-task-title="Task D"]')).toBeVisible();

  await page.reload();
  await expect(page.locator('[data-task-title="Task A"]')).toBeVisible();
  await expect(page.locator('[data-task-title="Task B"]')).toBeVisible();
  await expect(page.locator('[data-task-title="Task C"]')).toBeVisible();

  await dragTaskToTask(page, 'Task B', 'Task C');
  await expect
    .poll(async () => {
      const taskGroups = await api(`/projects/${projectA.id}/tasks?groupBy=section`, token);
      const backlogGroup = taskGroups.find((g: any) => g.section.id === backlog.id);
      return backlogGroup.tasks[0]?.title ?? '';
    })
    .toBe('Task B');

  let grouped = await api(`/projects/${projectA.id}/tasks?groupBy=section`, token);
  const backlogAfterReorder = grouped.find((g: any) => g.section.id === backlog.id);
  const taskB = backlogAfterReorder.tasks.find((t: any) => t.title === 'Task B');

  grouped = await api(`/projects/${projectA.id}/tasks?groupBy=section`, token);
  const doingBeforeMove = grouped.find((g: any) => g.section.id === doing.id);
  const taskD = doingBeforeMove.tasks.find((t: any) => t.title === 'Task D');
  expect(taskD).toBeTruthy();
  await api(`/sections/${doing.id}/tasks/reorder`, token, 'POST', {
    taskId: taskB.id,
    beforeTaskId: null,
    afterTaskId: taskD.id,
  });

  await page.reload();
  grouped = await api(`/projects/${projectA.id}/tasks?groupBy=section`, token);
  const doingAfterMove = grouped.find((g: any) => g.section.id === doing.id);
  const movedTask = doingAfterMove.tasks.find((t: any) => t.id === taskB.id);
  expect(movedTask).toBeTruthy();

  await page.click(`[data-testid="assignee-trigger-${movedTask.id}"]`);
  await page.fill(`[data-testid="assignee-search-${movedTask.id}"]`, email.split('@')[0] ?? '');
  await page.click(`[data-testid="assignee-option-${movedTask.id}-${sub}"]`);

  await page.reload();
  grouped = await api(`/projects/${projectA.id}/tasks?groupBy=section`, token);
  const doingAfterAssign = grouped.find((g: any) => g.section.id === doing.id);
  const assignedTask = doingAfterAssign.tasks.find((t: any) => t.id === movedTask.id);
  expect(assignedTask.assigneeUserId).toBe(sub);

  const progressInput = page.locator(`[data-testid="task-${movedTask.id}"] input[type="number"]`).first();
  await progressInput.fill('50');
  await expect
    .poll(async () => {
      const task = await api(`/projects/${projectA.id}/tasks?groupBy=section`, token);
      const inDoing = task.find((g: any) => g.section.id === doing.id).tasks.find((t: any) => t.id === movedTask.id);
      return inDoing.status;
    })
    .toBe('IN_PROGRESS');

  await progressInput.fill('100');
  await expect
    .poll(async () => {
      const task = await api(`/projects/${projectA.id}/tasks?groupBy=section`, token);
      const inDoing = task.find((g: any) => g.section.id === doing.id).tasks.find((t: any) => t.id === movedTask.id);
      return { status: inDoing.status, completedAt: Boolean(inDoing.completedAt) };
    })
    .toEqual({ status: 'DONE', completedAt: true });

  await page.click('[data-testid="rules-page-link"]');
  await page.waitForURL(`**/projects/${projectA.id}/rules`);

  const firstRuleCard = page.locator('[data-testid^="rule-card-"]').first();
  await expect(firstRuleCard).toBeVisible();
  const firstRuleId = (await firstRuleCard.getAttribute('data-testid'))!.replace('rule-card-', '');
  const updatedRuleName = `Updated Rule ${Date.now()}`;

  await page.click(`[data-testid="rule-edit-${firstRuleId}"]`);
  await page.fill(`[data-testid="rule-name-input-${firstRuleId}"]`, updatedRuleName);
  await page.click(`[data-testid="rule-save-${firstRuleId}"]`);
  await expect(page.locator(`[data-testid="rule-name-${firstRuleId}"]`)).toHaveText(updatedRuleName);

  await page.reload();
  await expect(page.locator(`[data-testid="rule-name-${firstRuleId}"]`)).toHaveText(updatedRuleName);

  const audit = await api(`/tasks/${movedTask.id}/audit`, token);
  expect(audit.length).toBeGreaterThan(0);

  const outbox = await api('/outbox', token);
  expect(outbox.some((event: any) => String(event.type).startsWith('task.'))).toBeTruthy();
  expect(outbox.some((event: any) => String(event.type).startsWith('rule.'))).toBeTruthy();
});
