import { test, expect, type Page } from '@playwright/test';

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

  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('Missing drag bounding boxes');

  const reorderRequest = page.waitForResponse(
    (resp) =>
      resp.url().includes('/sections/') &&
      resp.url().includes('/tasks/reorder') &&
      resp.request().method() === 'POST' &&
      resp.status() < 400,
    { timeout: 15000 },
  );

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
  await page.mouse.up();
  await reorderRequest;
}

test('AtlasPM MVP flow', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[placeholder="OIDC sub"]', `e2e-user-${Date.now()}`);
  await page.fill('input[placeholder="Email"]', 'e2e@example.com');
  await page.click('button:has-text("Dev Login")');

  await page.waitForURL('**/');

  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  await page.goto('/');
  await page.fill('input[placeholder="Project name"]', `E2E Project ${Date.now()}`);
  await page.click('[data-testid="create-project-btn"]');
  const projectLink = page.locator('a[href^="/projects/"]').first();
  await expect(projectLink).toBeVisible();
  const href = await projectLink.getAttribute('href');
  expect(href).toBeTruthy();
  const projectId = String(href).split('/').pop()!;
  await page.goto(`/projects/${projectId}`);

  await api(`/projects/${projectId}/sections`, token, 'POST', { name: 'Backlog' });
  await api(`/projects/${projectId}/sections`, token, 'POST', { name: 'Doing' });
  await page.reload();

  const sections = await api(`/projects/${projectId}/sections`, token);
  const backlog = sections.find((s: any) => s.name === 'Backlog');
  const doing = sections.find((s: any) => s.name === 'Doing');

  await api(`/projects/${projectId}/tasks`, token, 'POST', { title: 'Task A', sectionId: backlog.id });
  await api(`/projects/${projectId}/tasks`, token, 'POST', { title: 'Task B', sectionId: backlog.id });
  await api(`/projects/${projectId}/tasks`, token, 'POST', { title: 'Task C', sectionId: doing.id });

  await page.reload();
  let grouped = await api(`/projects/${projectId}/tasks?groupBy=section`, token);
  const backlogGroup = grouped.find((g: any) => g.section.id === backlog.id);
  expect(backlogGroup.tasks.length).toBeGreaterThanOrEqual(2);

  const taskA = backlogGroup.tasks.find((t: any) => t.title === 'Task A');
  const taskB = backlogGroup.tasks.find((t: any) => t.title === 'Task B');

  await dragTaskToTask(page, 'Task A', 'Task B');

  await page.reload();
  grouped = await api(`/projects/${projectId}/tasks?groupBy=section`, token);
  const backlogAfterReorder = grouped.find((g: any) => g.section.id === backlog.id);
  expect(backlogAfterReorder.tasks[0].id).toBe(taskA.id);

  await dragTaskToTask(page, 'Task A', 'Task C');

  await page.reload();
  grouped = await api(`/projects/${projectId}/tasks?groupBy=section`, token);
  const doingAfterMove = grouped.find((g: any) => g.section.id === doing.id);
  expect(doingAfterMove.tasks.some((t: any) => t.id === taskA.id)).toBeTruthy();
  const movedTaskA = doingAfterMove.tasks.find((t: any) => t.id === taskA.id);
  expect(movedTaskA).toBeTruthy();

  const progress50 = await api(`/tasks/${taskA.id}`, token, 'PATCH', {
    progressPercent: 50,
    version: movedTaskA.version,
  });
  expect(progress50.status).toBe('IN_PROGRESS');

  const progress100 = await api(`/tasks/${taskA.id}`, token, 'PATCH', { progressPercent: 100, version: progress50.version });
  expect(progress100.status).toBe('DONE');
  expect(progress100.completedAt).toBeTruthy();

  const audit = await api(`/tasks/${taskA.id}/audit`, token);
  expect(audit.length).toBeGreaterThan(0);

  const outbox = await api('/outbox', token);
  expect(outbox.some((e: any) => String(e.type).startsWith('task.'))).toBeTruthy();
});
