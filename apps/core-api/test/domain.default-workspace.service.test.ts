import { describe, expect, it, vi } from 'vitest';
import { WorkspaceRole } from '@prisma/client';
import { WorkspaceDefaultsService } from '../src/common/workspace-defaults.service';
import { templateDefinition } from '../src/rules/rule-definition';

describe('WorkspaceDefaultsService default workspace bootstrap', () => {
  it('returns an existing membership workspace after a retryable transaction conflict', async () => {
    const workspace = {
      id: 'workspace-1',
      name: 'Default Workspace',
    };
    const prisma = {
      $transaction: vi.fn().mockRejectedValue({
        code: 'P2034',
        message: 'write conflict during serializable transaction',
      }),
      workspaceMembership: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'membership-1',
          workspaceId: workspace.id,
          userId: 'user-1',
          role: WorkspaceRole.WS_ADMIN,
          workspace,
        }),
      },
    };

    const domain = new WorkspaceDefaultsService(prisma as any, { appendAuditOutbox: vi.fn() } as any);

    await expect(domain.ensureDefaultWorkspaceForUser('user-1')).resolves.toEqual(workspace);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.workspaceMembership.findFirst).toHaveBeenCalledTimes(1);
  });
});

describe('WorkspaceDefaultsService project defaults', () => {
  it('runs project default provisioning inside a transaction', async () => {
    const existingRules = {
      progress_to_done: {
        id: 'rule-1',
        projectId: 'project-1',
        templateKey: 'progress_to_done',
        definition: templateDefinition('progress_to_done'),
      },
      progress_to_in_progress: {
        id: 'rule-2',
        projectId: 'project-1',
        templateKey: 'progress_to_in_progress',
        definition: templateDefinition('progress_to_in_progress'),
      },
    };
    const tx = {
      section: {
        findFirst: vi.fn().mockResolvedValue({ id: 'section-1', projectId: 'project-1', isDefault: true }),
      },
      rule: {
        findUnique: vi.fn().mockImplementation(({ where: { projectId_templateKey } }) =>
          Promise.resolve(existingRules[projectId_templateKey.templateKey as keyof typeof existingRules]),
        ),
        update: vi.fn(),
        create: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (txArg: typeof tx) => Promise<void>) => callback(tx)),
    };
    const auditOutbox = { appendAuditOutbox: vi.fn() };
    const service = new WorkspaceDefaultsService(prisma as any, auditOutbox as any);

    await service.ensureProjectDefaults('project-1', 'user-1', 'corr-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 5000,
      timeout: 10000,
      isolationLevel: 'Serializable',
    });
    expect(tx.section.findFirst).toHaveBeenCalledTimes(1);
    expect(auditOutbox.appendAuditOutbox).not.toHaveBeenCalled();
  });

  it('retries project default provisioning after a serializable transaction conflict', async () => {
    const tx = {
      section: {
        findFirst: vi.fn().mockResolvedValue({ id: 'section-1', projectId: 'project-1', isDefault: true }),
      },
      rule: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'rule-1',
            projectId: 'project-1',
            name: 'Progress to Done',
            templateKey: 'progress_to_done',
            definition: templateDefinition('progress_to_done'),
          })
          .mockResolvedValueOnce({
            id: 'rule-2',
            projectId: 'project-1',
            name: 'Progress to In Progress',
            templateKey: 'progress_to_in_progress',
            definition: templateDefinition('progress_to_in_progress'),
          }),
        update: vi.fn(),
        create: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi
        .fn()
        .mockRejectedValueOnce({ code: 'P2034', message: 'serialization failure' })
        .mockImplementationOnce(async (callback: (txArg: typeof tx) => Promise<void>) => callback(tx)),
    };
    const auditOutbox = { appendAuditOutbox: vi.fn() };
    const service = new WorkspaceDefaultsService(prisma as any, auditOutbox as any);

    await expect(service.ensureProjectDefaults('project-1', 'user-1', 'corr-1')).resolves.toBeUndefined();
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.section.findFirst).toHaveBeenCalledTimes(1);
  });

  it('emits rule.updated instead of rule.created when repairing an existing template', async () => {
    const existingRule = {
      id: 'rule-1',
      projectId: 'project-1',
      name: 'Progress to Done',
      templateKey: 'progress_to_done',
      definition: null,
      enabled: true,
      cooldownSec: 60,
    };
    const updatedRule = {
      ...existingRule,
      definition: templateDefinition('progress_to_done'),
    };
    const tx = {
      section: {
        findFirst: vi.fn().mockResolvedValue({ id: 'section-1', projectId: 'project-1', isDefault: true }),
      },
      rule: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce(existingRule)
          .mockResolvedValueOnce({
            id: 'rule-2',
            projectId: 'project-1',
            name: 'Progress to In Progress',
            templateKey: 'progress_to_in_progress',
            definition: templateDefinition('progress_to_in_progress'),
            enabled: true,
            cooldownSec: 60,
          }),
        update: vi.fn().mockResolvedValue(updatedRule),
        create: vi.fn(),
      },
    };
    const auditOutbox = { appendAuditOutbox: vi.fn() };
    const service = new WorkspaceDefaultsService({} as any, auditOutbox as any);

    await service.ensureProjectDefaultsInTx(tx as any, 'project-1', 'user-1', 'corr-1');

    expect(tx.rule.update).toHaveBeenCalledWith({
      where: { id: existingRule.id },
      data: { definition: templateDefinition('progress_to_done') },
    });
    expect(auditOutbox.appendAuditOutbox).toHaveBeenCalledTimes(1);
    expect(auditOutbox.appendAuditOutbox).toHaveBeenCalledWith({
      tx,
      actor: 'user-1',
      entityType: 'Rule',
      entityId: updatedRule.id,
      action: 'rule.ensure_template',
      beforeJson: existingRule,
      afterJson: updatedRule,
      correlationId: 'corr-1',
      outboxType: 'rule.updated',
      payload: updatedRule,
    });
  });

  it('does not update an existing template when only JSON property order differs', async () => {
    const reorderedDefinition = {
      actions: [{ status: 'DONE', type: 'setStatus' }, { type: 'setCompletedAtNow' }],
      conditions: [{ value: 100, op: 'eq', field: 'progressPercent' }],
      logicalOperator: 'AND',
      trigger: 'task.progress.changed',
    };
    const tx = {
      section: {
        findFirst: vi.fn().mockResolvedValue({ id: 'section-1', projectId: 'project-1', isDefault: true }),
      },
      rule: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'rule-1',
            projectId: 'project-1',
            name: 'Progress to Done',
            templateKey: 'progress_to_done',
            definition: reorderedDefinition,
            enabled: true,
            cooldownSec: 60,
          })
          .mockResolvedValueOnce({
            id: 'rule-2',
            projectId: 'project-1',
            name: 'Progress to In Progress',
            templateKey: 'progress_to_in_progress',
            definition: templateDefinition('progress_to_in_progress'),
            enabled: true,
            cooldownSec: 60,
          }),
        update: vi.fn(),
        create: vi.fn(),
      },
    };
    const auditOutbox = { appendAuditOutbox: vi.fn() };
    const service = new WorkspaceDefaultsService({} as any, auditOutbox as any);

    await service.ensureProjectDefaultsInTx(tx as any, 'project-1', 'user-1', 'corr-1');

    expect(tx.rule.update).not.toHaveBeenCalled();
    expect(auditOutbox.appendAuditOutbox).not.toHaveBeenCalled();
  });
});
