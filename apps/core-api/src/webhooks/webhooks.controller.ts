import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
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
}
