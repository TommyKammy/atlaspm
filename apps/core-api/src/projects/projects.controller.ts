import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { IsEnum, IsString, IsUUID } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DomainService } from '../common/domain.service';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { ProjectRole } from '@prisma/client';

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

@Controller('projects')
@UseGuards(AuthGuard)
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
  async create(@Body() body: CreateProjectDto, @CurrentRequest() req: AppRequest) {
    await this.domain.ensureUser(req.user.sub, req.user.email, req.user.name);
    const wsMembership = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId: body.workspaceId, userId: req.user.sub } },
    });
    if (!wsMembership) {
      await this.prisma.workspaceMembership.create({
        data: { workspaceId: body.workspaceId, userId: req.user.sub },
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
  async members(@Param('id') projectId: string, @CurrentRequest() req: AppRequest) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.VIEWER);
    return this.prisma.projectMembership.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } });
  }

  @Post(':id/members')
  async addMember(
    @Param('id') projectId: string,
    @Body() body: AddMemberDto,
    @CurrentRequest() req: AppRequest,
  ) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.ADMIN);
    await this.domain.ensureUser(body.userId);
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
        action: 'project.member.upsert',
        afterJson: membership,
        correlationId: req.correlationId,
        outboxType: 'project.member.updated',
        payload: membership,
      });
      return membership;
    });
  }
}
