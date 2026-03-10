import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchService } from '../src/search/search.service';

function buildTask(id: number) {
  return {
    id: `task-${id.toString().padStart(4, '0')}`,
    title: `Task ${id}`,
    description: null,
    projectId: 'project-1',
    assigneeUserId: null,
    status: 'TODO',
    priority: 'MEDIUM',
    dueAt: null,
    startAt: null,
    tags: [],
    parentId: null,
    createdAt: new Date('2026-03-10T00:00:00.000Z'),
    updatedAt: new Date('2026-03-10T00:00:00.000Z'),
  };
}

async function* batches() {
  yield { tasks: [buildTask(1), buildTask(2)] };
  yield { tasks: [buildTask(3)] };
  yield { tasks: [buildTask(4)] };
}

describe('SearchService reindexAll', () => {
  const originalSearchEnabled = process.env.SEARCH_ENABLED;
  const originalAlgoliaAppId = process.env.ALGOLIA_APP_ID;
  const originalAlgoliaApiKey = process.env.ALGOLIA_API_KEY;

  afterEach(() => {
    process.env.SEARCH_ENABLED = originalSearchEnabled;
    process.env.ALGOLIA_APP_ID = originalAlgoliaAppId;
    process.env.ALGOLIA_API_KEY = originalAlgoliaApiKey;
    vi.restoreAllMocks();
  });

  it('stops and does not count the first failed batch', async () => {
    process.env.SEARCH_ENABLED = 'false';
    delete process.env.ALGOLIA_APP_ID;
    delete process.env.ALGOLIA_API_KEY;

    const service = new SearchService();
    const client = {
      clearObjects: vi.fn().mockResolvedValue(undefined),
      batch: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('algolia down')),
    };

    (service as any).isEnabled = true;
    (service as any).client = client;

    const processed = await service.reindexAll(batches());

    expect(processed).toBe(2);
    expect(client.clearObjects).toHaveBeenCalledTimes(1);
    expect(client.batch).toHaveBeenCalledTimes(2);
    expect((service as any).isEnabled).toBe(false);
    expect((service as any).client).toBeNull();
  });
});
