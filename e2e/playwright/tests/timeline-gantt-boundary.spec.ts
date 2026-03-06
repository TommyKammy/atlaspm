import { expect, test, type Page } from '@playwright/test';

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

function dayIso(deltaDays: number) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString();
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

test('timeline and gantt controls stay isolated while list ordering remains stable', async ({ page }) => {
  const now = Date.now();
  const sub = `e2e-tl-gt-boundary-${now}`;
  const email = `${sub}@example.com`;

  await page.goto('/login');
  await page.fill('input[placeholder="OIDC sub"]', sub);
  await page.fill('input[placeholder="Email"]', email);
  await page.click('button:has-text("Dev Login")');
  await page.waitForURL('**/');

  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const workspaces = await api('/workspaces', token);
  const workspaceId = workspaces[0].id as string;
  const project = await api('/projects', token, 'POST', {
    workspaceId,
    name: `Timeline Gantt Boundary ${now}`,
  });
  const projectId = project.id as string;
  const sections = await api(`/projects/${projectId}/sections`, token);
  const defaultSection = sections.find((section: any) => section.isDefault) ?? sections[0];

  const earlierTitle = `Boundary Earlier ${now}`;
  const laterTitle = `Boundary Later ${now}`;

  const earlierTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: defaultSection.id,
    title: earlierTitle,
    startAt: dayIso(1),
    dueAt: dayIso(2),
  });
  const laterTask = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    sectionId: defaultSection.id,
    title: laterTitle,
    startAt: dayIso(1),
    dueAt: dayIso(7),
  });
  await api(`/tasks/${laterTask.id}/dependencies`, token, 'POST', {
    dependsOnId: earlierTask.id,
    type: 'BLOCKS',
  });

  await page.goto(`/projects/${projectId}?view=timeline`);
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-swimlane-toggle"]')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-sort-toggle"]')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-schedule-filter-toggle"]')).toBeVisible();
  await expect(page.locator('[data-testid="gantt-risk-filter-toggle"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="gantt-strict-mode"]')).toHaveCount(0);
  await page.click('[data-testid="timeline-swimlane-status"]');
  await expect(page.locator('[data-testid="timeline-swimlane-status"]')).toHaveAttribute('data-active', 'true');
  await page.click('[data-testid="timeline-zoom-month"]');
  await expect(page.locator('[data-testid="timeline-zoom-month"]')).toHaveAttribute('data-active', 'true');

  await page.click('[data-testid="project-view-gantt"]');
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}.*view=gantt`));
  await expect(page.locator('[data-testid="timeline-view"]')).toBeVisible();
  await expect(page.locator('[data-testid="gantt-risk-filter-toggle"]')).toBeVisible();
  await expect(page.locator('[data-testid="gantt-strict-mode"]')).toBeVisible();
  await expect(page.locator('[data-testid="timeline-swimlane-toggle"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="timeline-sort-toggle"]')).toHaveCount(0);
  await page.click('[data-testid="gantt-filter-risk"]');
  await expect(page.locator('[data-testid="gantt-filter-risk"]')).toHaveAttribute('data-active', 'true');
  await page.click('[data-testid="gantt-strict-mode"]');
  await expect(page.locator('[data-testid="gantt-strict-mode"]')).toHaveAttribute('data-active', 'true');
  await expect(page.locator('[data-testid="timeline-save-default"]')).toBeEnabled();
  const saveResponse = page.waitForResponse((response) =>
    response.url().includes(`/projects/${projectId}/timeline/preferences/view-state/gantt`) &&
    response.request().method() === 'PUT' &&
    response.ok(),
  );
  await page.click('[data-testid="timeline-save-default"]');
  await saveResponse;
  await clearTimelineViewState(page, projectId, sub, 'gantt');

  await page.reload();
  await expect(page.locator('[data-testid="gantt-filter-risk"]')).toHaveAttribute('data-active', 'true');
  await expect(page.locator('[data-testid="gantt-strict-mode"]')).toHaveAttribute('data-active', 'true');

  await page.click('[data-testid="project-view-timeline"]');
  await expect(page.locator('[data-testid="timeline-swimlane-status"]')).toHaveAttribute('data-active', 'true');
  await expect(page.locator('[data-testid="timeline-zoom-month"]')).toHaveAttribute('data-active', 'true');

  await page.click('[data-testid="project-view-list"]');
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}.*view=list`));
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
