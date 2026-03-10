import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TaskCommentsService } from '../src/tasks/task-comments.service';

describe('TaskCommentsService', () => {
  it('rejects blank comment bodies before opening a transaction', async () => {
    const prisma = {
      task: {
        findFirstOrThrow: vi.fn().mockResolvedValue({
          id: 'task-1',
          projectId: 'project-1',
          assigneeUserId: 'user-2',
        }),
      },
      $transaction: vi.fn(),
    };
    const domain = {
      requireProjectRole: vi.fn().mockResolvedValue(undefined),
      appendAuditOutbox: vi.fn(),
    };
    const notifications = {
      createCommentNotification: vi.fn(),
    };
    const mentions = {
      syncTaskMentions: vi.fn(),
      extractMentionUserIdsFromComment: vi.fn(),
    };
    const service = new TaskCommentsService(prisma as any, domain as any, notifications as any, mentions as any);

    await expect(
      service.createComment(
        'task-1',
        '   ',
        { user: { sub: 'user-1' }, correlationId: 'corr-1' } as any,
      ),
    ).rejects.toThrow(ConflictException);

    expect(prisma.task.findFirstOrThrow).toHaveBeenCalledTimes(1);
    expect(domain.requireProjectRole).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
