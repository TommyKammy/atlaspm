import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GuestAccessStatus, ProjectRole, WorkspaceRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { AuthorizationService } from '../src/common/authorization.service';

describe('AuthorizationService guest authorization', () => {
  it('allows a project-scoped active guest grant to satisfy project access', async () => {
    const prisma = {
      workspaceMembership: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      projectMembership: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      guestAccessGrant: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'guest-grant-1',
          workspaceId: 'workspace-1',
          userId: 'guest-1',
          projectId: 'project-1',
          scopeType: 'PROJECT',
          projectRole: ProjectRole.MEMBER,
          status: GuestAccessStatus.ACTIVE,
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
    };

    const domain = new AuthorizationService(prisma as any);

    await expect(domain.requireProjectRole('project-1', 'guest-1', ProjectRole.VIEWER)).resolves.toMatchObject({
      projectId: 'project-1',
      userId: 'guest-1',
      role: ProjectRole.MEMBER,
    });
  });

  it('rejects revoked or expired guest grants for project access', async () => {
    const prisma = {
      workspaceMembership: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      projectMembership: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      guestAccessGrant: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: 'guest-grant-revoked',
            workspaceId: 'workspace-1',
            userId: 'guest-1',
            projectId: 'project-1',
            scopeType: 'PROJECT',
            projectRole: ProjectRole.VIEWER,
            status: GuestAccessStatus.REVOKED,
            revokedAt: new Date(),
            expiresAt: new Date(Date.now() + 60_000),
          })
          .mockResolvedValueOnce({
            id: 'guest-grant-expired',
            workspaceId: 'workspace-1',
            userId: 'guest-1',
            projectId: 'project-1',
            scopeType: 'PROJECT',
            projectRole: ProjectRole.VIEWER,
            status: GuestAccessStatus.ACTIVE,
            revokedAt: null,
            expiresAt: new Date(Date.now() - 60_000),
          }),
      },
    };

    const domain = new AuthorizationService(prisma as any);

    await expect(domain.requireProjectRole('project-1', 'guest-1', ProjectRole.VIEWER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(domain.requireProjectRole('project-1', 'guest-1', ProjectRole.VIEWER)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('does not treat guest grants as workspace membership for admin surfaces', async () => {
    const prisma = {
      workspaceMembership: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      projectMembership: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      guestAccessGrant: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'guest-workspace-grant-1',
          workspaceId: 'workspace-1',
          userId: 'guest-1',
          projectId: null,
          scopeType: 'WORKSPACE',
          projectRole: null,
          status: GuestAccessStatus.ACTIVE,
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
    };

    const domain = new AuthorizationService(prisma as any);

    await expect(domain.requireWorkspaceRole('workspace-1', 'guest-1', WorkspaceRole.WS_MEMBER)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
