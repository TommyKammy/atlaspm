import { BadRequestException, Body, Controller, Get, Inject, Post, Query, UseGuards } from '@nestjs/common';
import { IsString, IsUrl, IsUUID } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DomainService } from '../common/domain.service';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { ProjectRole } from '@prisma/client';

class CreateWebhookDto {
  @IsUUID()
  projectId!: string;

  @IsString()
  @IsUrl({ require_tld: false })
  targetUrl!: string;
}

@Controller('webhooks')
@UseGuards(AuthGuard)
export class WebhooksController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
  ) {}

  @Post()
  async create(@Body() body: CreateWebhookDto, @CurrentRequest() req: AppRequest) {
    await this.domain.requireProjectRole(body.projectId, req.user.sub, ProjectRole.ADMIN);
    return this.prisma.$transaction(async (tx) => {
      const webhook = await tx.webhook.create({ data: body });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Webhook',
        entityId: webhook.id,
        action: 'webhook.created',
        afterJson: webhook,
        correlationId: req.correlationId,
        outboxType: 'webhook.created',
        payload: webhook,
      });
      return webhook;
    });
  }

  @Get('dlq')
  async listDeadLetterEvents(@Query('projectId') projectId: string | undefined, @CurrentRequest() req: AppRequest) {
    if (!projectId) throw new BadRequestException('projectId is required');
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.ADMIN);

    const [projectTaskRows, projectSectionRows, deadLetterEvents] = await Promise.all([
      this.prisma.task.findMany({ where: { projectId }, select: { id: true } }),
      this.prisma.section.findMany({ where: { projectId }, select: { id: true } }),
      this.prisma.outboxEvent.findMany({
        where: { deadLetteredAt: { not: null } },
        orderBy: { deadLetteredAt: 'desc' },
        take: 200,
      }),
    ]);
    const projectTaskIds = new Set(projectTaskRows.map((row) => row.id));
    const projectSectionIds = new Set(projectSectionRows.map((row) => row.id));

    return deadLetterEvents.filter((event) => {
      const payload = event.payload as unknown;
      const projectIds = this.collectStringValues(payload, 'projectId');
      if (projectIds.includes(projectId)) return true;

      const taskIds = this.collectStringValues(payload, 'taskId');
      if (taskIds.some((taskId) => projectTaskIds.has(taskId))) return true;

      const sectionIds = this.collectStringValues(payload, 'sectionId');
      if (sectionIds.some((sectionId) => projectSectionIds.has(sectionId))) return true;

      return false;
    });
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
