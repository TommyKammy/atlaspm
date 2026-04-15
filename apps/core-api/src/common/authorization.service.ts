import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { GuestAccessScopeType, GuestAccessStatus, ProjectRole, WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthorizationService {
  private static readonly workspaceRoleRank: Record<WorkspaceRole, number> = { WS_MEMBER: 1, WS_ADMIN: 2 };
  private static readonly projectRoleRank: Record<ProjectRole, number> = { VIEWER: 1, MEMBER: 2, ADMIN: 3 };

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async requireWorkspaceRole(workspaceId: string, userId: string, min: WorkspaceRole) {
    const membership = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!membership) throw new NotFoundException('Workspace membership not found');
    if (AuthorizationService.workspaceRoleRank[membership.role] < AuthorizationService.workspaceRoleRank[min]) {
      throw new ForbiddenException('Insufficient workspace role');
    }
    return membership;
  }

  async requireWorkspaceMembership(workspaceId: string, userId: string) {
    const membership = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!membership) throw new NotFoundException('Workspace membership not found');
    return membership;
  }

  async requireProjectRole(projectId: string, userId: string, min: ProjectRole) {
    const membership = await this.prisma.projectMembership.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (membership) {
      if (AuthorizationService.projectRoleRank[membership.role] < AuthorizationService.projectRoleRank[min]) {
        throw new ForbiddenException('Insufficient role');
      }
      return membership;
    }

    const guestGrant = await this.prisma.guestAccessGrant.findFirst({
      where: {
        userId,
        projectId,
        scopeType: GuestAccessScopeType.PROJECT,
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!guestGrant) {
      throw new NotFoundException('Project membership not found');
    }
    if (guestGrant.status === GuestAccessStatus.REVOKED || guestGrant.revokedAt) {
      throw new ForbiddenException('Guest access has been revoked');
    }
    if (
      guestGrant.status === GuestAccessStatus.EXPIRED ||
      (guestGrant.expiresAt && guestGrant.expiresAt.getTime() <= Date.now())
    ) {
      throw new ForbiddenException('Guest access has expired');
    }
    if (!guestGrant.projectRole) {
      throw new ForbiddenException('Guest project access is not configured');
    }
    if (AuthorizationService.projectRoleRank[guestGrant.projectRole] < AuthorizationService.projectRoleRank[min]) {
      throw new ForbiddenException('Insufficient role');
    }
    return {
      id: guestGrant.id,
      projectId,
      userId,
      role: guestGrant.projectRole,
      createdAt: guestGrant.createdAt,
    };
  }
}
