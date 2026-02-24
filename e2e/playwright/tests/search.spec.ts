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

async function loginAndCreateProject(page: Page): Promise<{ projectId: string; token: string }> {
  const sub = `e2e-search-${Date.now()}`;
  const email = `e2e-search-${Date.now()}@example.com`;

  await page.goto('/login');
  await page.fill('input[placeholder="OIDC sub"]', sub);
  await page.fill('input[placeholder="Email"]', email);
  await page.click('button:has-text("Dev Login")');
  await page.waitForURL('**/');

  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  expect(token).toBeTruthy();

  const projectName = `Search Test ${Date.now()}`;
  await page.fill('input[placeholder="Project name"]', projectName);
  await page.click('[data-testid="create-project-btn"]');
  await expect(page.getByText(projectName).first()).toBeVisible();

  const projects = await api('/projects', token);
  const project = projects.find((p: any) => p.name === projectName);
  expect(project).toBeTruthy();

  await page.goto(`/projects/${project.id}`);
  await page.waitForURL(`**/projects/${project.id}`);

  return { projectId: project.id, token };
}

async function createTaskViaAPI(token: string, projectId: string, title: string, description?: string): Promise<string> {
  const sections = await api(`/projects/${projectId}/sections`, token);
  const defaultSection = sections[0];
  
  const task = await api(`/projects/${projectId}/tasks`, token, 'POST', {
    title,
    description,
    sectionId: defaultSection.id,
  });
  
  return task.id;
}

test.describe('Search Feature', () => {
  test('should display global search input in header', async ({ page }) => {
    await loginAndCreateProject(page);
    
    await expect(page.getByTestId('global-search-input')).toBeVisible();
  });

  test('should navigate to search page from global search', async ({ page }) => {
    await loginAndCreateProject(page);
    
    const globalSearch = page.getByTestId('global-search-input');
    await globalSearch.fill('test query');
    await globalSearch.press('Enter');
    
    await page.waitForURL('**/search**');
    await expect(page.getByTestId('search-page-input')).toHaveValue('test query');
  });

  test('should display search results on search page', async ({ page }) => {
    const { projectId, token } = await loginAndCreateProject(page);
    
    const uniqueTitle = `Searchable Task ${Date.now()}`;
    await createTaskViaAPI(token, projectId, uniqueTitle, 'This is a searchable description');
    
    await page.goto(`/search?q=${encodeURIComponent(uniqueTitle)}`);
    
    await expect(page.getByTestId('search-result-item').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(uniqueTitle)).toBeVisible();
  });

  test('should filter search results by status', async ({ page }) => {
    const { projectId, token } = await loginAndCreateProject(page);
    
    const task1Title = `Done Task ${Date.now()}`;
    const task2Title = `Todo Task ${Date.now()}`;
    
    const task1Id = await createTaskViaAPI(token, projectId, task1Title);
    await createTaskViaAPI(token, projectId, task2Title);
    await api(`/tasks/${task1Id}`, token, 'PATCH', {
      status: 'DONE',
      progressPercent: 100,
      version: 1,
    });
    
    await page.goto('/search');
    await page.fill('[data-testid="search-page-input"]', 'Task');
    await page.selectOption('select', 'DONE');
    await page.click('button:has-text("Search")');
    
    await expect(page.getByText(/Found \d+ result/)).toBeVisible();
    await expect(page.getByText(task1Title)).toBeVisible();
  });

  test('should display no results message when search returns empty', async ({ page }) => {
    await loginAndCreateProject(page);
    
    await page.goto('/search?q=xyznonexistenttask123');
    
    await expect(page.getByText('No tasks found matching your search.')).toBeVisible();
    await expect(page.getByText('Found 0 results')).toBeVisible();
  });

  test('should paginate search results', async ({ page }) => {
    const { projectId, token } = await loginAndCreateProject(page);
    
    for (let i = 0; i < 25; i++) {
      await createTaskViaAPI(token, projectId, `Paginated Task ${i} ${Date.now()}`);
    }
    
    await page.goto('/search?q=Paginated+Task');
    
    await expect(page.getByText(/page 1 of/)).toBeVisible({ timeout: 10000 });
    
    const nextButton = page.getByRole('button', { name: 'Next' });
    if (await nextButton.isVisible()) {
      await nextButton.click();
      await expect(page.getByText(/page 2 of/)).toBeVisible();
    }
  });

  test('should navigate to task from search results', async ({ page }) => {
    const { projectId, token } = await loginAndCreateProject(page);
    
    const taskTitle = `Clickable Task ${Date.now()}`;
    await createTaskViaAPI(token, projectId, taskTitle);
    
    await page.goto(`/search?q=${encodeURIComponent(taskTitle)}`);
    
    await page.click('[data-testid="search-result-item"]');
    
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}`));
  });
});
