import type { Page } from '@playwright/test';

const API = process.env.E2E_CORE_API_URL ?? 'http://localhost:3001';

type Workspace = {
  id: string;
};

type Project = {
  id: string;
};

type Section = {
  id: string;
  isDefault?: boolean;
};

type Task = {
  id: string;
  title: string;
  startAt: string | null;
  dueAt: string | null;
  version: number;
  sectionId: string | null;
};

export type TimelineFixtureSession = {
  token: string;
  userId: string;
  email: string;
  workspaceId: string;
  dayIso: (offsetDays: number) => string;
  lateUtcIso: (offsetDays: number) => string;
  dateOnlyLabel: (value: string) => string;
};

export type ManualPlacementFixture = {
  projectId: string;
  sectionId: string;
  longTask: Task;
  earlyTask: Task;
  lateTask: Task;
};

export type ResizeFixture = {
  projectId: string;
  task: Task;
  startAt: string;
  dueAt: string;
  resizedDueAt: string;
};

export type DatePersistenceFixture = {
  projectId: string;
  task: Task;
  nextStartDate: string;
  nextDueDate: string;
};

export type GroupedSubtasksFixture = {
  projectId: string;
  sectionAId: string;
  sectionBId: string;
  parent: Task;
  child: Task;
};

export type ViewTransitionFixture = {
  projectId: string;
  defaultSectionId: string;
  earlierTask: Task;
  laterTask: Task;
};

async function api<T>(path: string, token: string, method = 'GET', body?: unknown): Promise<T> {
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
  return raw ? (JSON.parse(raw) as T) : (null as T);
}

export async function loginDevUser(page: Page, sub: string, email: string) {
  await page.goto('/login');
  await page.fill('input[placeholder="OIDC sub"]', sub);
  await page.fill('input[placeholder="Email"]', email);
  await page.click('button:has-text("Dev Login")');
  await page.waitForURL('**/');
}

function buildDayFactory(anchor: Date, hour: number) {
  return (offsetDays: number) => {
    const next = new Date(anchor);
    next.setUTCHours(hour, 0, 0, 0);
    next.setUTCDate(next.getUTCDate() + offsetDays);
    return next.toISOString();
  };
}

function dateOnlyLabel(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US');
}

async function createProject(session: TimelineFixtureSession, name: string) {
  return api<Project>('/projects', session.token, 'POST', {
    workspaceId: session.workspaceId,
    name,
  });
}

async function createSection(session: TimelineFixtureSession, projectId: string, name: string) {
  return api<Section>(`/projects/${projectId}/sections`, session.token, 'POST', { name });
}

async function listSections(session: TimelineFixtureSession, projectId: string) {
  return api<Section[]>(`/projects/${projectId}/sections`, session.token);
}

async function createTask(
  session: TimelineFixtureSession,
  projectId: string,
  body: Record<string, unknown>,
) {
  return api<Task>(`/projects/${projectId}/tasks`, session.token, 'POST', body);
}

async function createSubtask(session: TimelineFixtureSession, parentTaskId: string, body: Record<string, unknown>) {
  return api<Task>(`/tasks/${parentTaskId}/subtasks`, session.token, 'POST', body);
}

async function createDependency(
  session: TimelineFixtureSession,
  taskId: string,
  dependsOnId: string,
) {
  await api(`/tasks/${taskId}/dependencies`, session.token, 'POST', {
    dependsOnId,
    type: 'BLOCKS',
  });
}

export async function createTimelineFixtureSession(
  page: Page,
  prefix: string,
): Promise<TimelineFixtureSession> {
  const userId = `${prefix}-${Date.now()}`;
  const email = `${userId}@example.com`;

  await loginDevUser(page, userId, email);
  const token = await page.evaluate(() => localStorage.getItem('atlaspm_token') || '');
  if (!token) {
    throw new Error('Expected atlaspm_token after dev login');
  }

  const workspaces = await api<Workspace[]>('/workspaces', token);
  const workspaceId = workspaces[0]?.id;
  if (!workspaceId) {
    throw new Error('Expected at least one workspace for dev login');
  }

  const anchor = new Date();
  anchor.setUTCHours(0, 0, 0, 0);

  return {
    token,
    userId,
    email,
    workspaceId,
    dayIso: buildDayFactory(anchor, 0),
    lateUtcIso: buildDayFactory(anchor, 23),
    dateOnlyLabel,
  };
}

export async function seedManualPlacementFixture(
  session: TimelineFixtureSession,
): Promise<ManualPlacementFixture> {
  const project = await createProject(session, 'Timeline Manual Placement Fixture');
  const section = await createSection(session, project.id, 'Manual Section');
  const longTask = await createTask(session, project.id, {
    sectionId: section.id,
    title: 'Long task',
    startAt: session.dayIso(1),
    dueAt: session.dayIso(7),
  });
  const earlyTask = await createTask(session, project.id, {
    sectionId: section.id,
    title: 'Early task',
    startAt: session.dayIso(1),
    dueAt: session.dayIso(2),
  });
  const lateTask = await createTask(session, project.id, {
    sectionId: section.id,
    title: 'Late task',
    startAt: session.dayIso(9),
    dueAt: session.dayIso(10),
  });

  return {
    projectId: project.id,
    sectionId: section.id,
    longTask,
    earlyTask,
    lateTask,
  };
}

export async function seedResizeFixture(session: TimelineFixtureSession): Promise<ResizeFixture> {
  const project = await createProject(session, 'Timeline Resize Fixture');
  const section = await createSection(session, project.id, 'Resize Section');
  const startAt = session.dayIso(2);
  const dueAt = session.dayIso(3);
  const resizedDueAt = session.dayIso(5);
  const task = await createTask(session, project.id, {
    sectionId: section.id,
    title: 'Resize task',
    startAt,
    dueAt,
  });

  return {
    projectId: project.id,
    task,
    startAt,
    dueAt,
    resizedDueAt,
  };
}

export async function seedDatePersistenceFixture(
  session: TimelineFixtureSession,
): Promise<DatePersistenceFixture> {
  const project = await createProject(session, 'Timeline Date Persistence Fixture');
  const section = await createSection(session, project.id, 'Date Section');
  const task = await createTask(session, project.id, {
    sectionId: section.id,
    title: 'Date persistence task',
    startAt: session.dayIso(1),
    dueAt: session.dayIso(3),
  });

  return {
    projectId: project.id,
    task,
    nextStartDate: session.dayIso(3).slice(0, 10),
    nextDueDate: session.dayIso(6).slice(0, 10),
  };
}

export async function seedGroupedSubtasksFixture(
  session: TimelineFixtureSession,
): Promise<GroupedSubtasksFixture> {
  const project = await createProject(session, 'Timeline Grouped Subtasks Fixture');
  const sectionA = await createSection(session, project.id, 'Section A');
  const sectionB = await createSection(session, project.id, 'Section B');
  const parent = await createTask(session, project.id, {
    sectionId: sectionA.id,
    title: 'Grouped parent',
    startAt: session.dayIso(1),
    dueAt: session.dayIso(4),
  });
  const child = await createSubtask(session, parent.id, {
    title: 'Grouped child',
    startAt: session.dayIso(2),
    dueAt: session.dayIso(2),
  });

  return {
    projectId: project.id,
    sectionAId: sectionA.id,
    sectionBId: sectionB.id,
    parent,
    child,
  };
}

export async function seedViewTransitionFixture(
  session: TimelineFixtureSession,
): Promise<ViewTransitionFixture> {
  const project = await createProject(session, 'Timeline Gantt View Transition Fixture');
  const sections = await listSections(session, project.id);
  const defaultSection = sections.find((section) => section.isDefault) ?? sections[0];
  if (!defaultSection) {
    throw new Error('Expected a default section in the seeded project');
  }

  const earlierTask = await createTask(session, project.id, {
    sectionId: defaultSection.id,
    title: 'Boundary earlier',
    startAt: session.dayIso(1),
    dueAt: session.dayIso(2),
  });
  const laterTask = await createTask(session, project.id, {
    sectionId: defaultSection.id,
    title: 'Boundary later',
    startAt: session.dayIso(1),
    dueAt: session.dayIso(7),
  });
  await createDependency(session, laterTask.id, earlierTask.id);

  return {
    projectId: project.id,
    defaultSectionId: defaultSection.id,
    earlierTask,
    laterTask,
  };
}

export async function getTask(session: TimelineFixtureSession, taskId: string) {
  return api<Task>(`/tasks/${taskId}`, session.token);
}
