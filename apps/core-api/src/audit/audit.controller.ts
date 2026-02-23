import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DomainService } from '../common/domain.service';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { ProjectRole } from '@prisma/client';

@Controller()
@UseGuards(AuthGuard)
export class AuditController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
  ) {}

  @Get('tasks/:id/audit')
  async taskAudit(@Param('id') taskId: string, @CurrentRequest() req: AppRequest) {
    const task = await this.prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.VIEWER);
    return this.prisma.auditEvent.findMany({ where: { entityType: 'Task', entityId: taskId }, orderBy: { createdAt: 'desc' } });
  }

  @Get('projects/:id/audit')
  async projectAudit(@Param('id') projectId: string, @CurrentRequest() req: AppRequest) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.VIEWER);
    return this.prisma.auditEvent.findMany({ where: { entityType: 'Project', entityId: projectId }, orderBy: { createdAt: 'desc' } });
  }

  @Get('sections/:id/audit')
  async sectionAudit(@Param('id') sectionId: string, @CurrentRequest() req: AppRequest) {
    const section = await this.prisma.section.findUniqueOrThrow({ where: { id: sectionId } });
    await this.domain.requireProjectRole(section.projectId, req.user.sub, ProjectRole.VIEWER);
    return this.prisma.auditEvent.findMany({ where: { entityType: 'Section', entityId: sectionId }, orderBy: { createdAt: 'desc' } });
  }

  @Get('outbox')
  async outbox(@CurrentRequest() req: AppRequest) {
    await this.domain.ensureUser(req.user.sub, req.user.email, req.user.name);
    return this.prisma.outboxEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  }
}
