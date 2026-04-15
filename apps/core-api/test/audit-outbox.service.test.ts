import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { AuditOutboxService } from '../src/common/audit-outbox.service';

describe('AuditOutboxService', () => {
  it('serializes Date values before writing JSON columns', async () => {
    const tx = {
      auditEvent: { create: vi.fn() },
      outboxEvent: { create: vi.fn() },
    };
    const service = new AuditOutboxService();
    const createdAt = new Date('2026-04-15T12:34:56.000Z');

    await service.appendAuditOutbox({
      tx: tx as any,
      actor: 'user-1',
      entityType: 'Project',
      entityId: 'project-1',
      action: 'project.updated',
      beforeJson: { createdAt },
      afterJson: { nested: { createdAt } },
      correlationId: 'corr-1',
      outboxType: 'project.updated',
      payload: { createdAt },
    });

    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        beforeJson: { createdAt: createdAt.toISOString() },
        afterJson: { nested: { createdAt: createdAt.toISOString() } },
      }),
    });
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payload: { createdAt: createdAt.toISOString() },
      }),
    });
  });

  it('preserves undefined and null JSON semantics', async () => {
    const tx = {
      auditEvent: { create: vi.fn() },
      outboxEvent: { create: vi.fn() },
    };
    const service = new AuditOutboxService();

    await service.appendAuditOutbox({
      tx: tx as any,
      actor: 'user-1',
      entityType: 'Project',
      entityId: 'project-1',
      action: 'project.updated',
      beforeJson: undefined,
      afterJson: null,
      correlationId: 'corr-1',
      outboxType: 'project.updated',
      payload: null,
    });

    expect(tx.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        beforeJson: undefined,
        afterJson: Prisma.JsonNull,
      }),
    });
    expect(tx.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payload: Prisma.JsonNull,
      }),
    });
  });
});
