import { describe, expect, it, vi } from 'vitest';
import { SearchController, SEARCH_REINDEX_BATCH_SIZE } from '../src/search/search.controller';

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

describe('SearchController reindexAll', () => {
  it('streams deterministic batches and fetches custom field values per chunk', async () => {
    const firstBatch = Array.from({ length: SEARCH_REINDEX_BATCH_SIZE }, (_, index) =>
      buildTask(index + 1),
    );
    const secondBatch = [buildTask(SEARCH_REINDEX_BATCH_SIZE + 1)];
    const reindexedBatches: Array<{
      tasks: Array<{ id: string }>;
      metadataByTaskId?: Map<string, { customFieldText?: string | null }>;
    }> = [];

    const prisma = {
      workspaceMembership: {
        findFirst: vi.fn().mockResolvedValue({ id: 'membership-1' }),
      },
      task: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce(firstBatch)
          .mockResolvedValueOnce(secondBatch)
          .mockResolvedValueOnce([]),
      },
      taskCustomFieldValue: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              taskId: firstBatch[0].id,
              option: null,
              valueText: 'alpha',
              valueNumber: null,
              valueDate: null,
              valueBoolean: null,
            },
            {
              taskId: firstBatch[firstBatch.length - 1].id,
              option: null,
              valueText: null,
              valueNumber: 7,
              valueDate: null,
              valueBoolean: null,
            },
          ])
          .mockResolvedValueOnce([
            {
              taskId: secondBatch[0].id,
              option: { label: 'Enterprise', value: 'enterprise' },
              valueText: null,
              valueNumber: null,
              valueDate: null,
              valueBoolean: null,
            },
          ]),
      },
    };
    const searchService = {
      isSearchEnabled: vi.fn().mockReturnValue(true),
      reindexAll: vi.fn(async (batches: AsyncIterable<any>) => {
        let count = 0;
        for await (const batch of batches) {
          reindexedBatches.push(batch);
          count += batch.tasks.length;
        }
        return count;
      }),
    };

    const controller = new SearchController(searchService as any, prisma as any);

    const result = await controller.reindexAll({
      user: { sub: 'user-1' },
      correlationId: 'corr-1',
    } as any);

    expect(result).toEqual({
      success: true,
      message: `Reindexed ${SEARCH_REINDEX_BATCH_SIZE + 1} tasks`,
      count: SEARCH_REINDEX_BATCH_SIZE + 1,
    });

    expect(prisma.task.findMany).toHaveBeenCalledTimes(3);
    expect(prisma.task.findMany.mock.calls[0]?.[0]).toMatchObject({
      orderBy: { id: 'asc' },
      take: SEARCH_REINDEX_BATCH_SIZE,
    });
    expect(prisma.task.findMany.mock.calls[1]?.[0]).toMatchObject({
      orderBy: { id: 'asc' },
      take: SEARCH_REINDEX_BATCH_SIZE,
      cursor: { id: firstBatch[firstBatch.length - 1].id },
      skip: 1,
    });
    expect(prisma.taskCustomFieldValue.findMany).toHaveBeenCalledTimes(2);

    const firstCustomFieldArgs = prisma.taskCustomFieldValue.findMany.mock.calls[0]?.[0];
    const secondCustomFieldArgs = prisma.taskCustomFieldValue.findMany.mock.calls[1]?.[0];
    expect(firstCustomFieldArgs.where.taskId.in).toHaveLength(SEARCH_REINDEX_BATCH_SIZE);
    expect(firstCustomFieldArgs.where.taskId.in[0]).toBe(firstBatch[0].id);
    expect(firstCustomFieldArgs.where.taskId.in.at(-1)).toBe(firstBatch[firstBatch.length - 1].id);
    expect(firstCustomFieldArgs.select).toEqual({
      taskId: true,
      valueText: true,
      valueNumber: true,
      valueDate: true,
      valueBoolean: true,
      option: { select: { label: true, value: true } },
    });
    expect(secondCustomFieldArgs.where.taskId.in).toEqual([secondBatch[0].id]);

    expect(reindexedBatches).toHaveLength(2);
    expect(reindexedBatches[0]?.tasks.map((task) => task.id)).toEqual(firstBatch.map((task) => task.id));
    expect(reindexedBatches[0]?.metadataByTaskId?.get(firstBatch[0].id)).toEqual({
      customFieldText: 'alpha',
    });
    expect(reindexedBatches[0]?.metadataByTaskId?.get(firstBatch[firstBatch.length - 1].id)).toEqual({
      customFieldText: '7',
    });
    expect(reindexedBatches[1]?.tasks.map((task) => task.id)).toEqual([secondBatch[0].id]);
    expect(reindexedBatches[1]?.metadataByTaskId?.get(secondBatch[0].id)).toEqual({
      customFieldText: 'Enterprise',
    });
  });
});
