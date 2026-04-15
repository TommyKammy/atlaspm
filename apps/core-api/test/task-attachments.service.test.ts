import { ConflictException } from '@nestjs/common';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskAttachmentsService } from '../src/tasks/task-attachments.service';

describe('TaskAttachmentsService', () => {
  const storageDirs: string[] = [];

  afterEach(async () => {
    delete process.env.ATTACHMENT_STORAGE_DIR;
    await Promise.all(storageDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('rejects uploads that lose the race before touching the filesystem', async () => {
    const storageDir = await mkdtemp(path.join(os.tmpdir(), 'atlaspm-attachments-race-'));
    storageDirs.push(storageDir);
    process.env.ATTACHMENT_STORAGE_DIR = storageDir;

    const prisma = {
      taskAttachment: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          id: 'attachment-1',
          taskId: 'task-1',
          uploadToken: 'token-1',
          storageKey: 'task-1/race.png',
          deletedAt: null,
          completedAt: null,
          task: { projectId: 'project-1' },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const auditOutbox = {
      appendAuditOutbox: vi.fn(),
    };
    const authorization = {
      requireProjectRole: vi.fn().mockResolvedValue(undefined),
    };
    const downloadUrls = {
      buildUrl: vi.fn(),
    };
    const service = new TaskAttachmentsService(
      prisma as any,
      auditOutbox as any,
      authorization as any,
      downloadUrls as any,
    );
    const uploadPath = path.join(storageDir, 'task-1', 'race.png');

    await expect(
      service.uploadAttachment(
        'attachment-1',
        'token-1',
        {
          mimetype: 'image/png',
          size: 4,
          buffer: Buffer.from([1, 2, 3, 4]),
        },
        { user: { sub: 'user-1' } } as any,
      ),
    ).rejects.toThrowError(new ConflictException('Attachment is no longer uploadable'));

    expect(prisma.taskAttachment.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'attachment-1',
        uploadToken: 'token-1',
        deletedAt: null,
        completedAt: null,
      },
      data: { sizeBytes: 4, mimeType: 'image/png' },
    });
    await expect(readFile(uploadPath)).rejects.toThrow();
  });
});
