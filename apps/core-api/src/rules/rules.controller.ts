import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DomainService } from '../common/domain.service';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { Prisma, ProjectRole } from '@prisma/client';
import { parseRuleDefinition, templateDefinition } from './rule-definition';
import { ProjectRoleGuard, RequireProjectRole } from '../auth/role.guard';

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

  @IsOptional()
  definition?: unknown;
}

class PatchRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  cooldownSec?: number;

  @IsOptional()
  definition?: unknown;
}

@Controller()
@UseGuards(AuthGuard, ProjectRoleGuard)
export class RulesController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
  ) {}

  @Get('projects/:id/rules')
  @RequireProjectRole(ProjectRole.VIEWER)
  async list(@Param('id') projectId: string) {
    return this.prisma.rule.findMany({ where: { projectId }, orderBy: { createdAt: 'asc' } });
  }

  @Post('projects/:id/rules')
  @RequireProjectRole(ProjectRole.MEMBER)
  async create(@Param('id') projectId: string, @Body() body: CreateRuleDto, @CurrentRequest() req: AppRequest) {
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.rule.create({
        data: {
          projectId,
          name: body.name,
          templateKey: body.templateKey,
          definition: (body.definition
            ? parseRuleDefinition(body.definition)
            : templateDefinition(body.templateKey)) as Prisma.InputJsonValue,
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
    const definition = body.definition ? parseRuleDefinition(body.definition) : undefined;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.rule.update({
        where: { id },
        data: {
          name: body.name,
          cooldownSec: body.cooldownSec,
          definition: definition as Prisma.InputJsonValue | undefined,
        },
      });
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
