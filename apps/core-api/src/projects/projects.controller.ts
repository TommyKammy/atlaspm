import { Body, ConflictException, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { GuestAccessScopeType, GuestAccessStatus, Prisma, ProjectRole, WorkspaceRole } from '@prisma/client';
import { IsEnum, IsString, IsUUID } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { ProjectRoleGuard, RequireProjectRole, RequireWorkspaceRole, WorkspaceRoleGuard } from '../auth/role.guard';
import { WorkspaceDefaultsService } from '../common/workspace-defaults.service';

class CreateProjectDto {
  @IsUUID()
  workspaceId!: string;

  @IsString()
  name!: string;
}

class AddMemberDto {
  @IsString()
  userId!: string;

  @IsEnum(ProjectRole)
  role!: ProjectRole;
}

class UpdateProjectMemberDto {
  @IsEnum(ProjectRole)
  role!: ProjectRole;
}

@Controller('projects')
@UseGuards(AuthGuard, WorkspaceRoleGuard, ProjectRoleGuard)
export class ProjectsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditOutboxService) private readonly auditOutbox: AuditOutboxService,
    @Inject(WorkspaceDefaultsService) private readonly defaults: WorkspaceDefaultsService,
  ) {}

  @Get()
  async list(@CurrentRequest() req: AppRequest) {
    const projects = await this.prisma.project.findMany({
      where: {
        OR: [
          { memberships: { some: { userId: req.user.sub } } },
          {
            guestAccessGrants: {
              some: {
                userId: req.user.sub,
                scopeType: GuestAccessScopeType.PROJECT,
                status: GuestAccessStatus.ACTIVE,
                revokedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              },
            },
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    return this.hydrateProjectsWithFollowerState(projects, req.user.sub);
  }

  @Post()
  @RequireWorkspaceRole(WorkspaceRole.WS_MEMBER, { source: 'body', key: 'workspaceId' })
  async create(@Body() body: CreateProjectDto, @CurrentRequest() req: AppRequest) {
    const wsMembership = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId: body.workspaceId, userId: req.user.sub } },
    });
    if (!wsMembership) {
      await this.prisma.workspaceMembership.create({
        data: { workspaceId: body.workspaceId, userId: req.user.sub, role: WorkspaceRole.WS_MEMBER },
      });
    }

    const project = await this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: { workspaceId: body.workspaceId, name: body.name },
      });
      await tx.projectMembership.create({
        data: { projectId: project.id, userId: req.user.sub, role: ProjectRole.ADMIN },
      });
      await this.auditOutbox.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Project',
        entityId: project.id,
        action: 'project.created',
        afterJson: project,
        correlationId: req.correlationId,
        outboxType: 'project.created',
        payload: project,
      });
      await this.defaults.ensureProjectDefaultsInTx(tx, project.id, req.user.sub, req.correlationId);
      return project;
    });
    return this.hydrateProjectWithFollowerState(project, req.user.sub);
  }

  @Get(':id/followers')
  @RequireProjectRole(ProjectRole.VIEWER)
  async followers(@Param('id') projectId: string, @CurrentRequest() req: AppRequest) {
    const followers = await this.prisma.projectFollower.findMany({
      where: { projectId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      followerCount: followers.length,
      isFollowedByCurrentUser: followers.some((follower) => follower.userId === req.user.sub),
      followers: followers.map((follower) => ({
        id: follower.id,
        projectId: follower.projectId,
        userId: follower.userId,
        createdAt: follower.createdAt,
        user: {
          id: follower.user.id,
          email: follower.user.email,
          displayName: follower.user.displayName ?? follower.user.email ?? follower.user.id,
          avatarUrl: null,
        },
      })),
    };
  }

  @Post(':id/followers')
  @RequireProjectRole(ProjectRole.VIEWER)
  async follow(@Param('id') projectId: string, @CurrentRequest() req: AppRequest) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const follower = await tx.projectFollower.create({
          data: { projectId, userId: req.user.sub },
        });
        await this.auditOutbox.appendAuditOutbox({
          tx,
          actor: req.user.sub,
          entityType: 'ProjectFollower',
          entityId: follower.id,
          action: 'project.followed',
          afterJson: follower,
          correlationId: req.correlationId,
          outboxType: 'project.followed',
          payload: { projectId, userId: req.user.sub },
        });
        const followerCount = await tx.projectFollower.count({ where: { projectId } });
        return {
          id: follower.id,
          projectId: follower.projectId,
          userId: follower.userId,
          createdAt: follower.createdAt,
          followerCount,
          isFollowedByCurrentUser: true,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Project already followed');
      }
      throw error;
    }
  }

  @Delete(':id/followers/me')
  @RequireProjectRole(ProjectRole.VIEWER)
  async unfollow(@Param('id') projectId: string, @CurrentRequest() req: AppRequest) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.projectFollower.findUnique({
        where: { projectId_userId: { projectId, userId: req.user.sub } },
      });
      if (existing) {
        await tx.projectFollower.delete({ where: { id: existing.id } });
        await this.auditOutbox.appendAuditOutbox({
          tx,
          actor: req.user.sub,
          entityType: 'ProjectFollower',
          entityId: existing.id,
          action: 'project.unfollowed',
          beforeJson: existing,
          correlationId: req.correlationId,
          outboxType: 'project.unfollowed',
          payload: { projectId, userId: req.user.sub },
        });
      }
      const followerCount = await tx.projectFollower.count({ where: { projectId } });
      return { ok: true, followerCount, isFollowedByCurrentUser: false };
    });
  }

  @Get(':id/members')
  @RequireProjectRole(ProjectRole.VIEWER)
  async members(@Param('id') projectId: string) {
    const members = await this.prisma.projectMembership.findMany({
      where: { projectId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    return members.map((member) => ({
      id: member.id,
      projectId: member.projectId,
      userId: member.userId,
      role: member.role,
      createdAt: member.createdAt,
      user: {
        id: member.user.id,
        email: member.user.email,
        displayName: member.user.displayName ?? member.user.email ?? member.user.id,
        avatarUrl: null,
      },
    }));
  }

  @Post(':id/members')
  @RequireProjectRole(ProjectRole.ADMIN)
  async addMember(
    @Param('id') projectId: string,
    @Body() body: AddMemberDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    const workspaceMembership = await this.prisma.workspaceMembership.findUnique({
      where: {
        workspaceId_userId: { workspaceId: project.workspaceId, userId: body.userId },
      },
    });
    if (!workspaceMembership) {
      throw new ConflictException('User is not a member of the workspace');
    }
    return this.prisma.$transaction(async (tx) => {
      const membership = await tx.projectMembership.upsert({
        where: { projectId_userId: { projectId, userId: body.userId } },
        create: { projectId, userId: body.userId, role: body.role },
        update: { role: body.role },
      });
      await this.auditOutbox.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'ProjectMembership',
        entityId: membership.id,
        action: 'project.member.added',
        afterJson: membership,
        correlationId: req.correlationId,
        outboxType: 'project.member.added',
        payload: membership,
      });
      return membership;
    });
  }

  @Patch(':id/members/:userId')
  @RequireProjectRole(ProjectRole.ADMIN)
  async updateMember(
    @Param('id') projectId: string,
    @Param('userId') userId: string,
    @Body() body: UpdateProjectMemberDto,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.projectMembership.findUniqueOrThrow({
        where: { projectId_userId: { projectId, userId } },
      });
      const updated = await tx.projectMembership.update({
        where: { id: existing.id },
        data: { role: body.role },
      });
      await this.auditOutbox.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'ProjectMembership',
        entityId: existing.id,
        action: 'project.member.role_changed',
        beforeJson: existing,
        afterJson: updated,
        correlationId: req.correlationId,
        outboxType: 'project.member.role_changed',
        payload: updated,
      });
      return updated;
    });
  }

  @Delete(':id/members/:userId')
  @RequireProjectRole(ProjectRole.ADMIN)
  async removeMember(
    @Param('id') projectId: string,
    @Param('userId') userId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.projectMembership.findUniqueOrThrow({
        where: { projectId_userId: { projectId, userId } },
      });
      await tx.projectMembership.delete({ where: { id: existing.id } });
      await this.auditOutbox.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'ProjectMembership',
        entityId: existing.id,
        action: 'project.member.removed',
        beforeJson: existing,
        correlationId: req.correlationId,
        outboxType: 'project.member.removed',
        payload: { projectId, userId },
      });
      return { ok: true };
    });
  }

  private async hydrateProjectWithFollowerState<T extends { id: string }>(project: T, userId: string) {
    const [hydratedProject] = await this.hydrateProjectsWithFollowerState([project], userId);
    return hydratedProject;
  }

  private async hydrateProjectsWithFollowerState<T extends { id: string }>(projects: T[], userId: string) {
    if (!projects.length) return [];

    const projectIds = projects.map((project) => project.id);
    const [followerCounts, followedProjects] = await Promise.all([
      this.prisma.projectFollower.groupBy({
        by: ['projectId'],
        where: { projectId: { in: projectIds } },
        _count: { _all: true },
      }),
      this.prisma.projectFollower.findMany({
        where: { projectId: { in: projectIds }, userId },
        select: { projectId: true },
      }),
    ]);

    const counts = new Map<string, number>();
    for (const followerCount of followerCounts) {
      counts.set(followerCount.projectId, followerCount._count._all);
    }
    const followedProjectIds = new Set(followedProjects.map((project) => project.projectId));

    return projects.map((project) => ({
      ...project,
      followerCount: counts.get(project.id) ?? 0,
      isFollowedByCurrentUser: followedProjectIds.has(project.id),
    }));
  }
}
