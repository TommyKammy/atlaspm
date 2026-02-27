import { Body, ConflictException, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsEnum, IsString, IsUUID } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DomainService } from '../common/domain.service';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { ProjectRole, WorkspaceRole } from '@prisma/client';
import { ProjectRoleGuard, RequireProjectRole, RequireWorkspaceRole, WorkspaceRoleGuard } from '../auth/role.guard';

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
    @Inject(DomainService) private readonly domain: DomainService,
  ) {}

  @Get()
  async list(@CurrentRequest() req: AppRequest) {
    return this.prisma.project.findMany({
      where: { memberships: { some: { userId: req.user.sub } } },
      orderBy: { createdAt: 'asc' },
    });
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

    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: { workspaceId: body.workspaceId, name: body.name },
      });
      await tx.projectMembership.create({
        data: { projectId: project.id, userId: req.user.sub, role: ProjectRole.ADMIN },
      });
      await this.domain.appendAuditOutbox({
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
      await this.domain.ensureProjectDefaultsInTx(tx, project.id, req.user.sub, req.correlationId);
      return project;
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
      await this.domain.appendAuditOutbox({
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
      await this.domain.appendAuditOutbox({
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
      await this.domain.appendAuditOutbox({
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
}
