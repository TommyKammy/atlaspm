import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  archiveGoal,
  createGoal,
  getGoal,
  getGoalHistory,
  getGoalProjects,
  linkGoalProject,
  listGoals,
  unlinkGoalProject,
  updateGoal,
} from './goals';

describe('goals api client', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
  });

  test('uses the public goal endpoints', async () => {
    await listGoals('ws-1');
    await listGoals('ws-1', { includeArchived: true });
    await getGoal('goal-1');
    await getGoalHistory('goal-1');
    await getGoalHistory('goal-1', { take: 25 });
    await getGoalProjects('goal-1');
    await createGoal({ workspaceId: 'ws-1', title: 'Launch expansion' });
    await updateGoal('goal-1', { progressPercent: 40, status: 'AT_RISK' });
    await linkGoalProject('goal-1', 'project-1');
    await unlinkGoalProject('goal-1', 'project-1');
    await archiveGoal('goal-1');

    const calls = vi.mocked(globalThis.fetch).mock.calls.map(([url, init]) => ({
      url,
      method: init?.method ?? 'GET',
      body: init?.body,
    }));

    expect(calls).toEqual([
      {
        url: 'http://localhost:3001/workspaces/ws-1/goals',
        method: 'GET',
        body: undefined,
      },
      {
        url: 'http://localhost:3001/workspaces/ws-1/goals?includeArchived=true',
        method: 'GET',
        body: undefined,
      },
      {
        url: 'http://localhost:3001/goals/goal-1',
        method: 'GET',
        body: undefined,
      },
      {
        url: 'http://localhost:3001/goals/goal-1/history',
        method: 'GET',
        body: undefined,
      },
      {
        url: 'http://localhost:3001/goals/goal-1/history?take=25',
        method: 'GET',
        body: undefined,
      },
      {
        url: 'http://localhost:3001/goals/goal-1/projects',
        method: 'GET',
        body: undefined,
      },
      {
        url: 'http://localhost:3001/goals',
        method: 'POST',
        body: JSON.stringify({ workspaceId: 'ws-1', title: 'Launch expansion' }),
      },
      {
        url: 'http://localhost:3001/goals/goal-1',
        method: 'PATCH',
        body: JSON.stringify({ progressPercent: 40, status: 'AT_RISK' }),
      },
      {
        url: 'http://localhost:3001/goals/goal-1/projects',
        method: 'POST',
        body: JSON.stringify({ projectId: 'project-1' }),
      },
      {
        url: 'http://localhost:3001/goals/goal-1/projects/project-1',
        method: 'DELETE',
        body: undefined,
      },
      {
        url: 'http://localhost:3001/goals/goal-1',
        method: 'DELETE',
        body: undefined,
      },
    ]);
  });
});
