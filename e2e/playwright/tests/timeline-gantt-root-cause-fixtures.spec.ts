import { expect, test, type Page } from './helpers/browser-auth';
import {
  createTimelineFixtureSession,
  getTask,
  loginDevUser,
  seedDatePersistenceFixture,
  seedGroupedSubtasksFixture,
  seedManualPlacementFixture,
  seedResizeFixture,
  seedViewTransitionFixture,
} from './helpers/timeline-root-cause-fixtures';

const DAY_COLUMN_WIDTH = 64;

test.use({ timezoneId: 'Asia/Tokyo', locale: 'en-US' });

async function timelineBarBox(page: Page, taskId: string) {
  const bar = page.locator(`[data-testid="timeline-bar-${taskId}"]`).first();
  await bar.scrollIntoViewIfNeeded();
  await expect(bar).toBeVisible();
  await expect
    .poll(async () => {
      const box = await bar.boundingBox();
      return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
    })
    .not.toBeNull();
  const box = await bar.boundingBox();
  if (!box) {
    throw new Error(`Unable to resolve bounds for timeline bar ${taskId}`);
  }
  return box;
}

async function timelineBarTop(page: Page, taskId: string) {
  return (await timelineBarBox(page, taskId)).y;
}

async function waitForTimelineTask(page: Page, taskId: string) {
  const bar = page.locator(`[data-testid="timeline-bar-${taskId}"]`).first();
  await bar.waitFor({ state: 'visible' });
  await expect
    .poll(async () => {
      const box = await bar.boundingBox();
      return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
    })
    .not.toBeNull();
}

async function dragTimelineBarToTarget(page: Page, taskId: string, targetTestId: string) {
  const barBox = await timelineBarBox(page, taskId);
  const target = page.locator(`[data-testid="${targetTestId}"]`);
  await expect(target).toBeVisible();
  const targetBox = await target.boundingBox();
  if (!targetBox) {
    throw new Error(`Unable to resolve target bounds for ${targetTestId}`);
  }

  const startX = barBox.x + Math.min(Math.max(8, barBox.width / 4), barBox.width - 4);
  const startY = barBox.y + barBox.height / 2;
  const targetX = Math.min(Math.max(startX, targetBox.x + 18), targetBox.x + targetBox.width - 18);
  const targetY = targetBox.y + targetBox.height / 2;

  const bar = page.locator(`[data-testid="timeline-bar-${taskId}"]`).first();
  await bar.dispatchEvent('pointerdown', {
    button: 0,
    clientX: startX,
    clientY: startY,
    pointerType: 'mouse',
    isPrimary: true,
    bubbles: true,
  });
  await page.evaluate(
    ({ clientX, clientY }) => {
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX,
          clientY,
          pointerType: 'mouse',
          isPrimary: true,
          bubbles: true,
        }),
      );
      window.dispatchEvent(
        new PointerEvent('pointerup', {
          clientX,
          clientY,
          pointerType: 'mouse',
          isPrimary: true,
          bubbles: true,
        }),
      );
    },
    { clientX: targetX, clientY: targetY },
  );
}

async function dragTimelineBarToLane(page: Page, taskId: string, laneTestId: string) {
  const barBox = await timelineBarBox(page, taskId);
  const lane = page.locator(`[data-testid="${laneTestId}"]`);
  await expect(lane).toBeVisible();
  const laneBox = await lane.boundingBox();
  if (!laneBox) {
    throw new Error(`Unable to resolve lane bounds for ${laneTestId}`);
  }

  const startX = barBox.x + Math.min(Math.max(8, barBox.width / 4), barBox.width - 4);
  const startY = barBox.y + barBox.height / 2;
  const targetY = laneBox.y + Math.min(Math.max(18, laneBox.height * 0.85), laneBox.height - 10);

  const bar = page.locator(`[data-testid="timeline-bar-${taskId}"]`).first();
  await bar.dispatchEvent('pointerdown', {
    button: 0,
    clientX: startX,
    clientY: startY,
    pointerType: 'mouse',
    isPrimary: true,
    bubbles: true,
  });
  await page.evaluate(
    ({ clientX, clientY }) => {
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX,
          clientY,
          pointerType: 'mouse',
          isPrimary: true,
          bubbles: true,
        }),
      );
      window.dispatchEvent(
        new PointerEvent('pointerup', {
          clientX,
          clientY,
          pointerType: 'mouse',
          isPrimary: true,
          bubbles: true,
        }),
      );
    },
    { clientX: startX + 20, clientY: targetY },
  );
}

async function resizeTimelineBar(page: Page, taskId: string, edge: 'start' | 'end', deltaDays: number) {
  const bar = page.locator(`[data-testid="timeline-bar-${taskId}"]`).first();
  await expect(bar).toBeVisible();
  await bar.hover();

  const handle = page.locator(`[data-testid="timeline-resize-${edge}-${taskId}"]`);
  await expect(handle).toBeVisible();
  const handleBox = await handle.boundingBox();
  if (!handleBox) {
    throw new Error(`Unable to resolve resize handle bounds for ${taskId}`);
  }

  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(50);
  await page.mouse.move(startX + deltaDays * DAY_COLUMN_WIDTH, startY, { steps: 18 });
  await page.mouse.up();
}

async function clearTimelineViewState(
  page: Page,
  projectId: string,
  userId: string,
  mode: 'timeline' | 'gantt',
) {
  await page.evaluate(
    ({ keys }) => {
      for (const key of keys) {
        window.localStorage.removeItem(key);
      }
    },
    {
      keys: [
        `atlaspm:timeline-view:${projectId}:${mode}`,
        `atlaspm:timeline-view:${projectId}:${mode}:${userId}`,
        `atlaspm:timeline-view:${userId}:${projectId}:${mode}`,
      ],
    },
  );
}

test('stable fixture keeps manual placement persisted after footer and row moves', async ({ page }) => {
  const session = await createTimelineFixtureSession(page, 'e2e-root-fixture-manual');
  const fixture = await seedManualPlacementFixture(session);

  await page.goto(`/projects/${fixture.projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();

  await expect
    .poll(async () => Math.abs((await timelineBarTop(page, fixture.earlyTask.id)) - (await timelineBarTop(page, fixture.lateTask.id))))
    .toBeLessThanOrEqual(2);
  await expect
    .poll(async () => Math.abs((await timelineBarTop(page, fixture.longTask.id)) - (await timelineBarTop(page, fixture.earlyTask.id))))
    .toBeGreaterThan(24);

  const moveDownSave = page.waitForResponse((response) =>
    response.url().includes(`/projects/${fixture.projectId}/timeline/preferences/manual-layout/section`) &&
    response.request().method() === 'PUT' &&
    response.ok(),
  );
  await dragTimelineBarToTarget(page, fixture.lateTask.id, `timeline-footer-row-section-${fixture.sectionId}`);
  await moveDownSave;
  await waitForTimelineTask(page, fixture.earlyTask.id);
  await waitForTimelineTask(page, fixture.lateTask.id);
  await expect
    .poll(async () => (await timelineBarTop(page, fixture.lateTask.id)) - (await timelineBarTop(page, fixture.earlyTask.id)))
    .toBeGreaterThan(24);

  await page.reload();
  await page.waitForLoadState('networkidle');
  await waitForTimelineTask(page, fixture.earlyTask.id);
  await waitForTimelineTask(page, fixture.lateTask.id);
  await expect
    .poll(async () => (await timelineBarTop(page, fixture.lateTask.id)) - (await timelineBarTop(page, fixture.earlyTask.id)))
    .toBeGreaterThan(24);

  const moveUpSave = page.waitForResponse((response) =>
    response.url().includes(`/projects/${fixture.projectId}/timeline/preferences/manual-layout/section`) &&
    response.request().method() === 'PUT' &&
    response.ok(),
  );
  await dragTimelineBarToTarget(page, fixture.lateTask.id, `timeline-row-section-${fixture.sectionId}-0`);
  await moveUpSave;
  await waitForTimelineTask(page, fixture.earlyTask.id);
  await waitForTimelineTask(page, fixture.lateTask.id);
  await expect
    .poll(async () => Math.abs((await timelineBarTop(page, fixture.lateTask.id)) - (await timelineBarTop(page, fixture.earlyTask.id))))
    .toBeLessThanOrEqual(2);
});

test('stable fixture keeps resize, drawer dates, reload, and gantt aligned', async ({ page }) => {
  const session = await createTimelineFixtureSession(page, 'e2e-root-fixture-resize');
  const fixture = await seedResizeFixture(session);
  const expectedStartDate = fixture.startAt.slice(0, 10);
  const expectedResizedDueDate = fixture.resizedDueAt.slice(0, 10);
  const expectedTitle = `${session.dateOnlyLabel(fixture.startAt)} - ${session.dateOnlyLabel(
    fixture.resizedDueAt,
  )}`;

  await page.goto(`/projects/${fixture.projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await page.click('[data-testid="timeline-zoom-day"]');
  await expect(page.locator('[data-testid="timeline-zoom-day"]')).toHaveAttribute('data-active', 'true');

  await resizeTimelineBar(page, fixture.task.id, 'end', 2);

  await expect
    .poll(async () => String((await getTask(session, fixture.task.id)).dueAt).slice(0, 10))
    .toBe(expectedResizedDueDate);

  await page.click(`[data-testid="timeline-bar-${fixture.task.id}"]`);
  await expect(page.locator('[data-testid="task-detail-start-date"]')).toHaveValue(expectedStartDate);
  await expect(page.locator('[data-testid="task-detail-due-date"]')).toHaveValue(expectedResizedDueDate);
  await page.keyboard.press('Escape');

  await page.reload();
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await expect(page.locator(`[data-testid="timeline-bar-${fixture.task.id}"]`)).toHaveAttribute(
    'title',
    expectedTitle,
  );

  await page.click('[data-testid="project-view-gantt"]');
  await expect(page).toHaveURL(new RegExp(`/projects/${fixture.projectId}.*view=gantt`));
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await expect(page.locator(`[data-testid="timeline-bar-${fixture.task.id}"]`)).toHaveAttribute(
    'title',
    expectedTitle,
  );
});

test('stable fixture persists drawer date inputs and reloads them', async ({ page }) => {
  const session = await createTimelineFixtureSession(page, 'e2e-root-fixture-dates');
  const fixture = await seedDatePersistenceFixture(session);
  const startDateInput = page.locator('[data-testid="task-detail-start-date"]');
  const dueDateInput = page.locator('[data-testid="task-detail-due-date"]');
  const titleInput = page.locator('[data-testid="task-detail-title-input"]');

  await page.goto(`/projects/${fixture.projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await page.click(`[data-testid="timeline-bar-${fixture.task.id}"]`);
  await expect(titleInput).toHaveValue(fixture.task.title);

  await startDateInput.fill(fixture.nextStartDate);
  await dueDateInput.click();
  await expect
    .poll(async () => String((await getTask(session, fixture.task.id)).startAt).slice(0, 10))
    .toBe(fixture.nextStartDate);

  await dueDateInput.fill(fixture.nextDueDate);
  await titleInput.click();
  await expect
    .poll(async () => String((await getTask(session, fixture.task.id)).dueAt).slice(0, 10))
    .toBe(fixture.nextDueDate);

  await page.reload();
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await page.click(`[data-testid="timeline-bar-${fixture.task.id}"]`);
  await expect(startDateInput).toHaveValue(fixture.nextStartDate);
  await expect(dueDateInput).toHaveValue(fixture.nextDueDate);
});

test('stable fixture blocks grouped subtasks from crossing section lanes', async ({ page }) => {
  const session = await createTimelineFixtureSession(page, 'e2e-root-fixture-grouped');
  const fixture = await seedGroupedSubtasksFixture(session);

  await page.goto(`/projects/${fixture.projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();

  await dragTimelineBarToLane(page, fixture.child.id, `timeline-lane-section-${fixture.sectionBId}`);

  await expect(page.locator('[data-testid="timeline-parent-move-warning-banner"]')).toContainText(
    /同じグループ|same group/i,
  );
  await expect
    .poll(async () => (await getTask(session, fixture.child.id)).sectionId)
    .toBe(fixture.sectionAId);
});

test('stable fixture keeps timeline and gantt transitions isolated across saved state', async ({
  browser,
  page,
}) => {
  const session = await createTimelineFixtureSession(page, 'e2e-root-fixture-view');
  const fixture = await seedViewTransitionFixture(session);

  await page.goto(`/projects/${fixture.projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-swimlane-toggle"]')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-sort-toggle"]')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-schedule-filter-toggle"]')).toBeVisible();
  await expect(page.locator('[data-testid="gantt-risk-filter-toggle"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="gantt-strict-mode"]')).toHaveCount(0);

  await page.click('[data-testid="timeline-swimlane-status"]');
  await expect(page.locator('[data-testid="timeline-swimlane-status"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await page.click('[data-testid="timeline-zoom-month"]');
  await expect(page.locator('[data-testid="timeline-zoom-month"]')).toHaveAttribute(
    'data-active',
    'true',
  );

  await page.click('[data-testid="project-view-gantt"]');
  await expect(page).toHaveURL(new RegExp(`/projects/${fixture.projectId}.*view=gantt`));
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await expect(page.locator('[data-testid="gantt-risk-filter-toggle"]')).toBeVisible();
  await expect(page.locator('[data-testid="gantt-strict-mode"]')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-swimlane-toggle"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="timeline-sort-toggle"]')).toHaveCount(0);

  await page.click('[data-testid="gantt-filter-risk"]');
  await expect(page.locator('[data-testid="gantt-filter-risk"]')).toHaveAttribute('data-active', 'true');
  await page.click('[data-testid="gantt-strict-mode"]');
  await expect(page.locator('[data-testid="gantt-strict-mode"]')).toHaveAttribute('data-active', 'true');

  const saveDefault = page.waitForResponse((response) =>
    response.url().includes(`/projects/${fixture.projectId}/timeline/preferences/view-state/gantt`) &&
    response.request().method() === 'PUT' &&
    response.ok(),
  );
  await page.click('[data-testid="timeline-save-default"]');
  await saveDefault;

  const savedDefaultContext = await browser.newContext({ locale: 'en-US', timezoneId: 'Asia/Tokyo' });
  const savedDefaultPage = await savedDefaultContext.newPage();
  await loginDevUser(savedDefaultPage, session.userId, session.email);
  await clearTimelineViewState(savedDefaultPage, fixture.projectId, session.userId, 'gantt');
  await savedDefaultPage.goto(`/projects/${fixture.projectId}?view=gantt`);
  await expect(savedDefaultPage.locator('[data-testid="gantt-filter-risk"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expect(savedDefaultPage.locator('[data-testid="gantt-strict-mode"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await savedDefaultContext.close();

  await page.click('[data-testid="project-view-timeline"]');
  await expect(page.locator('[data-testid="timeline-swimlane-status"]')).toHaveAttribute(
    'data-active',
    'true',
  );
  await expect(page.locator('[data-testid="timeline-zoom-month"]')).toHaveAttribute(
    'data-active',
    'true',
  );

  await page.click('[data-testid="project-view-list"]');
  await expect(page).toHaveURL(new RegExp(`/projects/${fixture.projectId}.*view=list`));
  await expect(page.locator(`[data-task-title="${fixture.earlierTask.title}"]`)).toBeVisible();
  await expect(page.locator(`[data-task-title="${fixture.laterTask.title}"]`)).toBeVisible();

  await expect
    .poll(async () => {
      const titlesInOrder = await page
        .locator(`[data-testid="section-${fixture.defaultSectionId}"] [data-task-title]`)
        .evaluateAll((elements) =>
          elements
            .map((element) => element.getAttribute('data-task-title') ?? '')
            .filter(Boolean),
        );
      const earlierIndex = titlesInOrder.indexOf(fixture.earlierTask.title);
      const laterIndex = titlesInOrder.indexOf(fixture.laterTask.title);
      return earlierIndex >= 0 && laterIndex >= 0 ? earlierIndex < laterIndex : false;
    })
    .toBe(true);
});
