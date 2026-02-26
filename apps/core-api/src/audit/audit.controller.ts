import { BadRequestException, Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
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
  async outbox(
    @CurrentRequest() req: AppRequest,
    @Query('projectId') projectId?: string,
  ) {
    if (!projectId) throw new BadRequestException('projectId is required');
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.VIEWER);

    const [projectTaskRows, projectSectionRows, outbox] = await Promise.all([
      this.prisma.task.findMany({ where: { projectId }, select: { id: true } }),
      this.prisma.section.findMany({ where: { projectId }, select: { id: true } }),
      this.prisma.outboxEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 500 }),
    ]);
    const projectTaskIds = new Set(projectTaskRows.map((row) => row.id));
    const projectSectionIds = new Set(projectSectionRows.map((row) => row.id));

    const scoped = outbox.filter((event) => {
      const payload = event.payload as unknown;
      const projectIds = this.collectStringValues(payload, 'projectId');
      if (projectIds.includes(projectId)) return true;

      const taskIds = this.collectStringValues(payload, 'taskId');
      if (taskIds.some((taskId) => projectTaskIds.has(taskId))) return true;

      const sectionIds = this.collectStringValues(payload, 'sectionId');
      if (sectionIds.some((sectionId) => projectSectionIds.has(sectionId))) return true;

      return false;
    });

    return scoped.slice(0, 100);
  }

  private collectStringValues(value: unknown, key: string): string[] {
    const result = new Set<string>();
    const walk = (input: unknown) => {
      if (!input || typeof input !== 'object') return;
      if (Array.isArray(input)) {
        for (const item of input) walk(item);
        return;
      }
      const record = input as Record<string, unknown>;
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim()) {
        result.add(candidate);
      }
      for (const nested of Object.values(record)) {
        walk(nested);
      }
    };
    walk(value);
    return [...result];
  }
}
