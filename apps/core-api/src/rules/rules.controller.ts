import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DomainService } from '../common/domain.service';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { ProjectRole } from '@prisma/client';

class CreateRuleDto {
  @IsString()
  name!: string;

  @IsString()
  templateKey!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  cooldownSec?: number;
}

class PatchRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  cooldownSec?: number;
}

@Controller()
@UseGuards(AuthGuard)
export class RulesController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
  ) {}

  @Get('projects/:id/rules')
  async list(@Param('id') projectId: string, @CurrentRequest() req: AppRequest) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.VIEWER);
    return this.prisma.rule.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } });
  }

  @Post('projects/:id/rules')
  async create(@Param('id') projectId: string, @Body() body: CreateRuleDto, @CurrentRequest() req: AppRequest) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.MEMBER);
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.rule.create({
        data: {
          projectId,
          name: body.name,
          templateKey: body.templateKey,
          enabled: body.enabled ?? true,
          cooldownSec: body.cooldownSec ?? 60,
        },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Rule',
        entityId: rule.id,
        action: 'rule.created',
        afterJson: rule,
        correlationId: req.correlationId,
        outboxType: 'rule.created',
        payload: rule,
      });
      return rule;
    });
  }

  @Patch('rules/:id')
  async patch(@Param('id') id: string, @Body() body: PatchRuleDto, @CurrentRequest() req: AppRequest) {
    const rule = await this.prisma.rule.findUniqueOrThrow({ where: { id } });
    await this.domain.requireProjectRole(rule.projectId, req.user.sub, ProjectRole.MEMBER);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.rule.update({ where: { id }, data: body });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Rule',
        entityId: id,
        action: 'rule.updated',
        beforeJson: rule,
        afterJson: updated,
        correlationId: req.correlationId,
        outboxType: 'rule.updated',
        payload: updated,
      });
      return updated;
    });
  }

  @Post('rules/:id/enable')
  async enable(@Param('id') id: string, @CurrentRequest() req: AppRequest) {
    return this.setEnabled(id, true, req);
  }

  @Post('rules/:id/disable')
  async disable(@Param('id') id: string, @CurrentRequest() req: AppRequest) {
    return this.setEnabled(id, false, req);
  }

  private async setEnabled(id: string, enabled: boolean, req: AppRequest) {
    const rule = await this.prisma.rule.findUniqueOrThrow({ where: { id } });
    await this.domain.requireProjectRole(rule.projectId, req.user.sub, ProjectRole.MEMBER);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.rule.update({ where: { id }, data: { enabled } });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Rule',
        entityId: id,
        action: enabled ? 'rule.enabled' : 'rule.disabled',
        beforeJson: rule,
        afterJson: updated,
        correlationId: req.correlationId,
        outboxType: enabled ? 'rule.enabled' : 'rule.disabled',
        payload: updated,
      });
      return updated;
    });
  }
}
