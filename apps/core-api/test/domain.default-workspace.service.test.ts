import { describe, expect, it, vi } from 'vitest';
import { WorkspaceRole } from '@prisma/client';
import { WorkspaceDefaultsService } from '../src/common/workspace-defaults.service';

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
