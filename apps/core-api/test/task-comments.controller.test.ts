import { describe, expect, it, vi } from 'vitest';
import { TaskCommentsController } from '../src/tasks/task-comments.controller';

describe('TaskCommentsController', () => {
  it('delegates comment and mention routes to TaskCommentsService', async () => {
    const service = {
      listMentions: vi.fn().mockResolvedValue(['mention']),
      listComments: vi.fn().mockResolvedValue(['comment']),
      createComment: vi.fn().mockResolvedValue({ id: 'comment-1' }),
      patchComment: vi.fn().mockResolvedValue({ id: 'comment-1', body: 'edited' }),
      deleteComment: vi.fn().mockResolvedValue({ id: 'comment-1', deletedAt: new Date() }),
    };
    const controller = new TaskCommentsController(service as any);
    const req = { user: { sub: 'user-1' }, correlationId: 'corr-1' } as any;

    await expect(controller.listMentions('task-1', req)).resolves.toEqual(['mention']);
    await expect(controller.listComments('task-1', req)).resolves.toEqual(['comment']);
    await expect(controller.createComment('task-1', { body: 'hello' } as any, req)).resolves.toEqual({
      id: 'comment-1',
    });
    await expect(controller.patchComment('comment-1', { body: 'edited' } as any, req)).resolves.toEqual({
      id: 'comment-1',
      body: 'edited',
    });
    await expect(controller.deleteComment('comment-1', req)).resolves.toMatchObject({ id: 'comment-1' });

    expect(service.listMentions).toHaveBeenCalledWith('task-1', req);
    expect(service.listComments).toHaveBeenCalledWith('task-1', req);
    expect(service.createComment).toHaveBeenCalledWith('task-1', 'hello', req);
    expect(service.patchComment).toHaveBeenCalledWith('comment-1', 'edited', req);
    expect(service.deleteComment).toHaveBeenCalledWith('comment-1', req);
  });
});
