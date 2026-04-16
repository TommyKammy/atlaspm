import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  api: vi.fn(),
}));

import { api } from '@/lib/api';
import { listProjects } from './projects';
import { listTaskProjectLinks } from './task-project-links';

describe('list API helpers', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test('listProjects returns an empty array for non-array responses', async () => {
    vi.mocked(api).mockResolvedValueOnce(null);

    await expect(listProjects()).resolves.toEqual([]);
  });

  test('listTaskProjectLinks returns an empty array for non-array responses', async () => {
    vi.mocked(api).mockResolvedValueOnce(null);

    await expect(listTaskProjectLinks('task-1')).resolves.toEqual([]);
  });
});
