import { expect, test, type Locator, type Page } from '@playwright/test';
import path from 'node:path';

const API = process.env.E2E_CORE_API_URL ?? 'http://localhost:3001';

async function api(path: string, token: string, method = 'GET', body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const raw = await res.text();
  if (!raw) return null;
  return JSON.parse(raw);
}

async function dragTaskToTask(page: Page, taskTitle: string, targetTitle: string) {
  const source = page.locator(`[data-task-title="${taskTitle}"]`).first();
  const target = page.locator(`[data-task-title="${targetTitle}"]`).first();
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('Unable to resolve drag coordinates for list task');
  await page.mouse.move(sourceBox.x + 24, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + 36, sourceBox.y + sourceBox.height / 2);
  await page.mouse.move(targetBox.x + 24, targetBox.y + targetBox.height / 2, { steps: 16 });
  await page.mouse.up();
}

async function dragBoardTaskToTask(page: Page, taskTitle: string, targetTitle: string) {
  const source = page.locator(`[data-testid^="board-task-"][data-task-title="${taskTitle}"]`).first();
  const target = page.locator(`[data-testid^="board-task-"][data-task-title="${targetTitle}"]`).first();
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('Unable to resolve drag coordinates for board task');
  await page.mouse.move(sourceBox.x + 24, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + 36, sourceBox.y + sourceBox.height / 2);
  await page.mouse.move(targetBox.x + 24, targetBox.y + targetBox.height / 2, { steps: 16 });
  await page.mouse.up();
}

async function dragLocatorToLocator(page: Page, source: Locator, target: Locator) {
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('Unable to resolve drag coordinates');
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 12, sourceBox.y + sourceBox.height / 2, { steps: 3 });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 16 });
  await page.mouse.up();
}

async function switchProjectView(page: Page, view: 'list' | 'board' | 'calendar' | 'files') {
  await page.click(`[data-testid="project-view-${view}"]`);
  await expect(page).toHaveURL(new RegExp(`[?&]view=${view}`));
}

function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

test('AtlasPM Asana-like UX flow', async ({ page }) => {
  const sub = `e2e-user-${Date.now()}`;
  const email = `e2e-${Date.now()}@example.com`;

  await page.goto('/login');
  await page.fill('input[placeholder="OIDC sub"]', sub);
  await page.fill('input[placeholder="Email"]', email);
  await page.click('button:has-text("Dev Login")');
  await page.waitForURL('**/');

  await page.click('[data-testid="theme-toggle"]');
  await page.click('text=Dark');
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.classList.contains('dark')))
    .toBeTruthy();
  await page.reload();
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.classList.contains('dark')))
    .toBeTruthy();

  await page.click('[data-testid="theme-toggle"]');
  await page.click('text=Light');
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.classList.contains('dark')))
    .toBeFalsy();
  await page.reload();
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.classList.contains('dark')))
    .toBeFalsy();

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
  await expect(page.locator('[data-testid="add-new-trigger"]')).toBeVisible();
  await expect(page.locator('[data-testid="project-search-input"]')).toBeVisible();
  await expect(page.locator('[data-testid="column-resize-name"]')).toBeVisible();

  const initialNameColumnWidth = await page
    .locator('table')
    .first()
    .locator('col')
    .first()
    .evaluate((el) => Number.parseInt((el as HTMLTableColElement).style.width || '0', 10));
  const resizeHandle = page.locator('[data-testid="column-resize-name"]').first();
  const resizeBox = await resizeHandle.boundingBox();
  expect(resizeBox).toBeTruthy();
  if (!resizeBox) {
    throw new Error('column resize handle not rendered');
  }
  await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(resizeBox.x + 40, resizeBox.y + resizeBox.height / 2);
  await page.mouse.up();
  await expect
    .poll(async () => {
      return page
        .locator('table')
        .first()
        .locator('col')
        .first()
        .evaluate((el) => Number.parseInt((el as HTMLTableColElement).style.width || '0', 10));
    })
    .toBeGreaterThan(initialNameColumnWidth);

  await page.click('[data-testid="add-new-menu-trigger"]');
  await page.click('[data-testid="add-new-section"]');
  await page.fill('[data-testid="new-section-input"]', 'Backlog');
  await page.click('[data-testid="create-section-btn"]');
  await expect(page.getByText('Backlog').first()).toBeVisible();

  await page.click('[data-testid="add-new-menu-trigger"]');
  await page.click('[data-testid="add-new-section"]');
  await page.fill('[data-testid="new-section-input"]', 'Doing');
  await page.click('[data-testid="create-section-btn"]');
  await expect(page.getByText('Doing').first()).toBeVisible();

  let sections = await api(`/projects/${projectA.id}/sections`, token);
  const noSection = sections.find((s: any) => s.isDefault);
  const backlog = sections.find((s: any) => s.name === 'Backlog');
  const doing = sections.find((s: any) => s.name === 'Doing');
  expect(noSection).toBeTruthy();
  expect(backlog).toBeTruthy();
  expect(doing).toBeTruthy();

  await page.click('[data-testid="project-sections-icon"]');
  await expect(page.locator('[data-testid="project-sections-popover"]')).toBeVisible();
  await expect(page.locator(`[data-testid="project-sections-jump-${backlog.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-testid="project-sections-jump-${doing.id}"]`)).toBeVisible();
  await page.click(`[data-testid="project-sections-jump-${doing.id}"]`);
  await expect(page.locator(`[data-testid="section-${doing.id}"]`)).toHaveAttribute('data-highlighted', 'true');

  await page.click('[data-testid="project-sections-icon"]');
  await page.click('[data-testid="project-sections-add"]');
  await page.fill('[data-testid="new-section-input"]', 'Later');
  await page.click('[data-testid="create-section-btn"]');
  await expect(page.getByText('Later').first()).toBeVisible();

  await page.click('[data-testid="add-new-trigger"]');
  const quickAddNoSection = page.locator(`[data-testid="quick-add-input-${noSection.id}"]`);
  await expect(quickAddNoSection).toBeVisible();
  await page.waitForTimeout(250);
  await expect(quickAddNoSection).toBeVisible();
  await quickAddNoSection.fill('Task A');
  await quickAddNoSection.press('Enter');
  await expect(page.locator('[data-task-title="Task A"]')).toBeVisible();

  await quickAddNoSection.fill('Task B');
  await quickAddNoSection.press('Enter');
  await expect(page.locator('[data-task-title="Task B"]')).toBeVisible();

  await quickAddNoSection.fill('Task C');
  await quickAddNoSection.press('Enter');
  await expect(page.locator('[data-task-title="Task C"]')).toBeVisible();

  const projectSearch = page.locator('[data-testid="project-search-input"]').first();
  await projectSearch.fill('Task A');
  await expect(page.locator('[data-task-title="Task A"]')).toBeVisible();
  await expect(page.locator('[data-task-title="Task B"]')).toHaveCount(0);
  await projectSearch.fill('Task');
  await expect(page.locator('[data-task-title="Task A"]')).toBeVisible();
  await expect(page.locator('[data-task-title="Task B"]')).toBeVisible();
  await projectSearch.fill('');
  await expect(page.locator('[data-task-title="Task B"]')).toBeVisible();

  await page.locator('[data-task-title="Task A"] button[data-testid^="task-complete-"]').first().click({ force: true });
  await expect(page.locator('[data-task-title="Task A"] select').first()).toHaveValue('DONE');

  await page.click('[data-testid="project-filter-trigger"]');
  await page.click('[data-testid="project-filter-status-DONE"]');
  await expect(page.locator('[data-task-title="Task A"]')).toBeVisible();
  await expect(page.locator('[data-task-title="Task B"]')).toHaveCount(0);

  await page.reload();
  await expect(page.locator('[data-task-title="Task A"]')).toBeVisible();
  await expect(page.locator('[data-task-title="Task B"]')).toHaveCount(0);

  await page.click('[data-testid="project-filter-trigger"]');
  await page.click('[data-testid="project-filter-clear"]');
  await expect(page.locator('[data-task-title="Task B"]')).toBeVisible();

  await page.locator('[data-task-title="Task C"] button[data-testid^="delete-task-"]').first().click({ force: true });
  await expect(page.locator('[data-testid="delete-undo-banner"]')).toBeVisible();
  await page.click('[data-testid="delete-undo-action"]');
  await expect(page.locator('[data-task-title="Task C"]')).toBeVisible();

  await page.click(`[data-testid="quick-add-open-${doing.id}"]`);
  const quickAddDoing = page.locator(`[data-testid="quick-add-input-${doing.id}"]`);
  await quickAddDoing.fill('Task D');
  await quickAddDoing.press('Enter');
  await expect(page.locator('[data-task-title="Task D"]')).toBeVisible();

  await switchProjectView(page, 'board');
  await dragBoardTaskToTask(page, 'Task C', 'Task D');
  await expect
    .poll(async () => {
      const taskGroups = await api(`/projects/${projectA.id}/tasks?groupBy=section`, token);
      const doingGroup = taskGroups.find((g: any) => g.section.id === doing.id);
      return doingGroup.tasks.some((task: any) => task.title === 'Task C');
    }, { timeout: 20000 })
    .toBe(true);
  await switchProjectView(page, 'list');

  await switchProjectView(page, 'calendar');
  const targetDate = toIsoDate(new Date());
  const taskAData = await api(`/projects/${projectA.id}/tasks?groupBy=section`, token);
  const taskAId = taskAData.flatMap((g: any) => g.tasks).find((task: any) => task.title === 'Task A').id;
  await expect(page.locator(`[data-testid="calendar-no-due-task-${taskAId}"]`)).toBeVisible();
  await expect(page.locator(`[data-testid="calendar-day-${targetDate}"]`)).toBeVisible();
  await dragLocatorToLocator(
    page,
    page.locator(`[data-testid="calendar-no-due-task-${taskAId}"]`),
    page.locator(`[data-testid="calendar-day-${targetDate}"]`),
  );
  await expect
    .poll(async () => {
      const taskGroups = await api(`/projects/${projectA.id}/tasks?groupBy=section`, token);
      const taskAAfter = taskGroups.flatMap((g: any) => g.tasks).find((task: any) => task.id === taskAId);
      return taskAAfter?.dueAt ? String(taskAAfter.dueAt).slice(0, 10) : null;
    })
    .toBe(targetDate);

  await page.click('[data-testid="calendar-field-start"]');
  await expect(page.locator(`[data-testid="calendar-no-start-task-${taskAId}"]`)).toBeVisible();
  await dragLocatorToLocator(
    page,
    page.locator(`[data-testid="calendar-no-start-task-${taskAId}"]`),
    page.locator(`[data-testid="calendar-day-${targetDate}"]`),
  );
  await expect
    .poll(async () => {
      const taskGroups = await api(`/projects/${projectA.id}/tasks?groupBy=section`, token);
      const taskAAfter = taskGroups.flatMap((g: any) => g.tasks).find((task: any) => task.id === taskAId);
      return taskAAfter?.startAt ? String(taskAAfter.startAt).slice(0, 10) : null;
    })
    .toBe(targetDate);
  await dragLocatorToLocator(
    page,
    page.locator(`[data-testid="calendar-task-${taskAId}"]`),
    page.locator('[data-testid="calendar-no-start"]'),
  );
  await expect
    .poll(async () => {
      const taskGroups = await api(`/projects/${projectA.id}/tasks?groupBy=section`, token);
      const taskAAfter = taskGroups.flatMap((g: any) => g.tasks).find((task: any) => task.id === taskAId);
      return taskAAfter?.startAt ?? null;
    })
    .toBe(null);
  await page.click('[data-testid="calendar-field-due"]');
  await switchProjectView(page, 'list');

  await page.reload();
  await expect(page.locator('[data-task-title="Task A"]')).toBeVisible();
  await expect(page.locator('[data-task-title="Task B"]')).toBeVisible();
  await expect(page.locator('[data-task-title="Task C"]')).toBeVisible();

  await dragTaskToTask(page, 'Task B', 'Task A');
  await expect
    .poll(async () => {
      const taskGroups = await api(`/projects/${projectA.id}/tasks?groupBy=section`, token);
      const unsectionedGroup = taskGroups.find((g: any) => g.section.id === noSection.id);
      return unsectionedGroup.tasks[0]?.title ?? '';
    })
    .toBe('Task B');

  let grouped = await api(`/projects/${projectA.id}/tasks?groupBy=section`, token);
  const taskB = grouped.flatMap((g: any) => g.tasks).find((t: any) => t.title === 'Task B');
  expect(taskB).toBeTruthy();

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

  const renamedSection = `Doing Updated ${Date.now()}`;
  const sectionLabel = page.locator('[data-testid^="section-name-label-"]').first();
  await sectionLabel.click();
  const sectionInput = page.locator('[data-testid^="section-name-input-"]').first();
  await sectionInput.fill(renamedSection);
  await sectionInput.press('Enter');
  await expect(page.locator('[data-testid^="section-name-label-"]').first()).toHaveText(renamedSection);

  const renamedTask = `Task B Renamed ${Date.now()}`;
  await page.click(`[data-testid="task-title-label-${movedTask.id}"]`);
  await page.fill(`[data-testid="task-title-input-${movedTask.id}"]`, renamedTask);
  await page.press(`[data-testid="task-title-input-${movedTask.id}"]`, 'Enter');
  await expect(page.locator(`[data-task-title="${renamedTask}"]`)).toBeVisible();

  await page.reload();
  await expect(page.locator('[data-testid^="section-name-label-"]').first()).toHaveText(renamedSection);
  await expect(page.locator(`[data-task-title="${renamedTask}"]`)).toBeVisible();

  await page.click(`[data-testid="open-task-${movedTask.id}"]`);
  const editor = page.locator('[data-testid="task-description-content"]');
  await expect(editor).toBeVisible();
  await expect(page.locator('[data-testid="subtask-rollup"]')).toBeVisible();
  await expect(page.locator('[data-testid="dependency-blocked-indicator"]')).toHaveText('Dependencies clear');
  await editor.click();
  await editor.fill('Detailed implementation plan for this task.');

  await editor.type('\n/quo');
  await expect(page.locator('[data-testid="slash-menu"]')).toBeVisible();
  await page.locator('[data-testid="slash-item-quote"]').first().click({ force: true });
  await editor.type('Quote block from slash menu');

  await editor.type('\n/cod');
  await page.locator('[data-testid="slash-item-code"]').first().click({ force: true });
  await editor.type('const phaseTwo = true;');

  await editor.type('\nMention ');
  await editor.type('@');
  await expect(page.locator('[data-testid="mention-menu"]')).toBeVisible();
  await page.click(`[data-testid="mention-option-${sub}"]`);

  await editor.type(' LinkText');

  await editor.type('\n/tab');
  await page.locator('[data-testid="slash-item-table"]').first().click({ force: true });
  await expect(page.locator('[data-testid="task-description-content"] table')).toBeVisible();
  await expect(page.locator('[data-testid="table-controls"]')).toBeVisible();
  await page.locator('[data-testid="task-description-content"] table th').first().click();
  await page.click('[data-testid="table-add-column-right"]');
  await page.locator('[data-testid="task-description-content"] table td').first().click();
  await page.click('[data-testid="table-add-row-below"]');

  await editor.type('\n/image');
  await page.locator('[data-testid="slash-item-image"]').first().click({ force: true });
  const fixturePath = path.resolve(process.cwd(), 'fixtures/pixel.png');
  await page.setInputFiles('[data-testid="description-image-input"]', fixturePath);
  await expect(editor.locator('img')).toBeVisible();

  await expect
    .poll(async () => {
      const detail = await api(`/tasks/${movedTask.id}`, token);
      const content = JSON.stringify(detail.descriptionDoc ?? {});
      const findTable = (node: any): any => {
        if (!node || typeof node !== 'object') return null;
        if (node.type === 'table') return node;
        if (!Array.isArray(node.content)) return null;
        for (const child of node.content) {
          const found = findTable(child);
          if (found) return found;
        }
        return null;
      };
      const tableNode = findTable(detail.descriptionDoc);
      const rowCount = Array.isArray(tableNode?.content) ? tableNode.content.length : 0;
      const colCount = Array.isArray(tableNode?.content?.[0]?.content) ? tableNode.content[0].content.length : 0;
      return {
        version: detail.descriptionVersion,
        hasQuote: content.includes('blockquote'),
        hasCode: content.includes('codeBlock'),
        hasMention: content.includes(`\"id\":\"${sub}\"`),
        hasImage: content.includes('/public/attachments/'),
        tableRows: rowCount,
        tableCols: colCount,
      };
    })
    .toMatchObject({
      version: expect.any(Number),
      hasQuote: true,
      hasCode: true,
      hasMention: true,
      hasImage: true,
    });

  await expect
    .poll(async () => {
      const detail = await api(`/tasks/${movedTask.id}`, token);
      const findTable = (node: any): any => {
        if (!node || typeof node !== 'object') return null;
        if (node.type === 'table') return node;
        if (!Array.isArray(node.content)) return null;
        for (const child of node.content) {
          const found = findTable(child);
          if (found) return found;
        }
        return null;
      };
      const tableNode = findTable(detail.descriptionDoc);
      const rowCount = Array.isArray(tableNode?.content) ? tableNode.content.length : 0;
      const colCount = Array.isArray(tableNode?.content?.[0]?.content) ? tableNode.content[0].content.length : 0;
      return rowCount >= 3 && colCount >= 3;
    })
    .toBe(true);

  await page.click('button[aria-label="Close task detail"]');

  const unreadBeforeOpen = await api('/notifications/unread-count', token);
  expect(unreadBeforeOpen.count).toBeGreaterThan(0);

  await page.click('[data-testid="notification-center-trigger"]');
  const notificationItem = page.locator('[data-testid^="notification-item-"]').first();
  await expect(notificationItem).toBeVisible();
  await notificationItem.click();
  await page.waitForURL(`**/projects/${projectA.id}?task=*`);

  await page.goto('/inbox');
  await expect(page.locator('[data-testid="inbox-page"]')).toBeVisible();
  await expect(page.locator('[data-testid^="inbox-notification-"]').first()).toBeVisible();
  await page.locator('[data-testid^="inbox-open-task-"]').first().click({ force: true });
  await page.waitForURL(`**/projects/${projectA.id}?task=*`);
  await expect(page.locator('[data-testid="task-description-content"]')).toBeVisible();
  await page.click('button[aria-label="Close task detail"]');
  await page.goto(`/projects/${projectA.id}`);

  await expect
    .poll(async () => {
      const unreadAfterOpen = await api('/notifications/unread-count', token);
      return unreadAfterOpen.count;
    })
    .toBeLessThan(unreadBeforeOpen.count);

  await switchProjectView(page, 'files');
  await expect(page.locator('[data-testid="files-mime-filter"]')).toBeVisible();
  await page.selectOption('[data-testid="files-mime-filter"]', 'IMAGE');
  await expect(page.getByText('pixel.png').first()).toBeVisible();
  await page.selectOption('[data-testid="files-uploader-filter"]', sub);
  await expect(page.getByText('pixel.png').first()).toBeVisible();

  const attachmentRows = await api(`/tasks/${movedTask.id}/attachments`, token);
  const uploadedAttachmentId = attachmentRows.find((row: any) => row.fileName === 'pixel.png')?.id;
  expect(uploadedAttachmentId).toBeTruthy();

  await page.click(`[data-testid="file-delete-${uploadedAttachmentId}"]`);
  await expect(page.locator(`[data-testid="file-row-${uploadedAttachmentId}"]`)).toHaveCount(0);

  await page.click('[data-testid="files-toggle-deleted"]');
  await expect(page.locator(`[data-testid="file-row-${uploadedAttachmentId}"]`)).toBeVisible();
  await page.click(`[data-testid="file-restore-${uploadedAttachmentId}"]`);
  await page.click('[data-testid="files-toggle-deleted"]');
  await expect(page.locator(`[data-testid="file-row-${uploadedAttachmentId}"]`)).toBeVisible();

  await switchProjectView(page, 'list');
  await page.click(`[data-testid="open-task-${movedTask.id}"]`);

  const reminderInput = page.locator('[data-testid="task-reminder-input"]');
  await expect(reminderInput).toBeVisible();
  const now = new Date();
  now.setDate(now.getDate() + 1);
  now.setHours(now.getHours() + 1);
  const reminderLocal = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}T${`${now.getHours()}`.padStart(2, '0')}:${`${now.getMinutes()}`.padStart(2, '0')}`;
  await reminderInput.fill(reminderLocal);
  await page.click('[data-testid="task-reminder-save"]');

  await expect
    .poll(async () => {
      const reminder = await api(`/tasks/${movedTask.id}/reminder`, token);
      return Boolean(reminder?.id);
    })
    .toBe(true);

  const subtaskTitle = `Subtask from e2e ${Date.now()}`;
  await page.click('[data-testid="subtasks-add-btn"]');
  await page.fill('[data-testid="create-subtask-title"]', subtaskTitle);
  await page.click('[data-testid="create-subtask-submit"]');
  await expect(page.locator('[data-testid="subtasks-section"]').getByText(subtaskTitle)).toBeVisible();
  await expect
    .poll(async () => {
      const subtasks = await api(`/tasks/${movedTask.id}/subtasks`, token);
      return subtasks.some((task: any) => task.title === subtaskTitle);
    })
    .toBe(true);

  await page.click('[data-testid="task-detail-tab-comments"]');
  await page.fill('[data-testid="comment-composer"]', `First comment from e2e @[${sub}|${sub}]`);
  await page.click('[data-testid="add-comment-btn"]');
  await expect(page.getByText('First comment from e2e')).toBeVisible();
  await expect(page.locator('[data-testid^="comment-mention-pill-"]').first()).toBeVisible();

  await page.click('button:has-text("Edit")');
  await page.fill('div[data-testid^="comment-"] input', `Edited comment from e2e @[${sub}|${sub}]`);
  await page.click('button:has-text("Save")');
  await expect(page.getByText('Edited comment from e2e')).toBeVisible();

  await page.reload();
  await page.click(`[data-testid="open-task-${movedTask.id}"]`);
  await expect(page.locator('[data-testid="task-description-content"] img')).toBeVisible();
  await expect(page.locator('[data-testid="task-reminder-input"]')).not.toHaveValue('');
  await page.click('[data-testid="task-detail-tab-comments"]');
  await expect(page.getByText('Edited comment from e2e')).toBeVisible();
  await expect(page.locator('[data-testid^="comment-mention-pill-"]').first()).toBeVisible();
  await page.click('[data-testid="task-detail-tab-activity"]');
  await expect(page.getByText(/updated description/i).first()).toBeVisible();
  await expect(page.getByText(/added a comment/i).first()).toBeVisible();
  await expect(page.getByText(/added an attachment/i).first()).toBeVisible();
  await expect(page.getByText(/added a mention/i).first()).toBeVisible();
  await expect(page.getByText(/set a reminder/i).first()).toBeVisible();
  await page.click('button[aria-label="Close task detail"]');

  const groupedBeforeProgress = await api(`/projects/${projectA.id}/tasks?groupBy=section`, token);
  const taskBeforeProgress = groupedBeforeProgress
    .find((g: any) => g.section.id === doing.id)
    .tasks.find((t: any) => t.id === movedTask.id);
  await api(`/tasks/${movedTask.id}`, token, 'PATCH', { progressPercent: 50, version: taskBeforeProgress.version });
  await expect
    .poll(async () => {
      const task = await api(`/projects/${projectA.id}/tasks?groupBy=section`, token);
      const inDoing = task.find((g: any) => g.section.id === doing.id).tasks.find((t: any) => t.id === movedTask.id);
      return inDoing.status;
    })
    .toBe('IN_PROGRESS');

  const groupedBeforeDone = await api(`/projects/${projectA.id}/tasks?groupBy=section`, token);
  const taskBeforeDone = groupedBeforeDone
    .find((g: any) => g.section.id === doing.id)
    .tasks.find((t: any) => t.id === movedTask.id);
  await api(`/tasks/${movedTask.id}`, token, 'PATCH', { progressPercent: 100, version: taskBeforeDone.version });
  await expect
    .poll(async () => {
      const task = await api(`/projects/${projectA.id}/tasks?groupBy=section`, token);
      const inDoing = task.find((g: any) => g.section.id === doing.id).tasks.find((t: any) => t.id === movedTask.id);
      return { status: inDoing.status, completedAt: Boolean(inDoing.completedAt) };
    })
    .toEqual({ status: 'DONE', completedAt: true });

  await page.click('[data-testid="project-settings-menu-trigger"]');
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

  const outbox = await api(`/outbox?projectId=${projectA.id}`, token);
  expect(outbox.some((event: any) => String(event.type).startsWith('task.'))).toBeTruthy();
  expect(outbox.some((event: any) => String(event.type).startsWith('rule.'))).toBeTruthy();
});
