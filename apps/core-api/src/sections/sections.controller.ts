import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsArray, IsString, IsUUID } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DomainService } from '../common/domain.service';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { ProjectRole } from '@prisma/client';
import { ProjectRoleGuard, RequireProjectRole } from '../auth/role.guard';

class CreateSectionDto {
  @IsString()
  name!: string;
}

class PatchSectionDto {
  @IsString()
  name!: string;
}

class ReorderSectionDto {
  @IsUUID()
  projectId!: string;

  @IsArray()
  @IsUUID('4', { each: true })
  orderedSectionIds!: string[];
}

@Controller()
@UseGuards(AuthGuard, ProjectRoleGuard)
export class SectionsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
  ) {}

  @Get('projects/:id/sections')
  @RequireProjectRole(ProjectRole.VIEWER)
  async list(@Param('id') projectId: string) {
    return this.prisma.section.findMany({ where: { projectId }, orderBy: { position: 'asc' } });
  }

  @Post('projects/:id/sections')
  @RequireProjectRole(ProjectRole.MEMBER)
  async create(
    @Param('id') projectId: string,
    @Body() body: CreateSectionDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const last = await this.prisma.section.findFirst({ where: { projectId }, orderBy: { position: 'desc' } });
    return this.prisma.$transaction(async (tx) => {
      const section = await tx.section.create({
        data: { projectId, name: body.name, position: (last?.position ?? 0) + 1000 },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Section',
        entityId: section.id,
        action: 'section.created',
        afterJson: section,
        correlationId: req.correlationId,
        outboxType: 'section.created',
        payload: section,
      });
      return section;
    });
  }

  @Patch('sections/:id')
  async patch(@Param('id') id: string, @Body() body: PatchSectionDto, @CurrentRequest() req: AppRequest) {
    const section = await this.prisma.section.findUniqueOrThrow({ where: { id } });
    await this.domain.requireProjectRole(section.projectId, req.user.sub, ProjectRole.MEMBER);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.section.update({ where: { id }, data: { name: body.name } });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Section',
        entityId: id,
        action: 'section.updated',
        beforeJson: section,
        afterJson: updated,
        correlationId: req.correlationId,
        outboxType: 'section.updated',
        payload: updated,
      });
      return updated;
    });
  }

  @Post('sections/reorder')
  @RequireProjectRole(ProjectRole.MEMBER, { source: 'body', key: 'projectId' })
  async reorder(@Body() body: ReorderSectionDto, @CurrentRequest() req: AppRequest) {
    const sections = await this.prisma.section.findMany({ where: { projectId: body.projectId }, orderBy: { position: 'asc' } });
    const ids = new Set(sections.map((s) => s.id));
    if (body.orderedSectionIds.some((id) => !ids.has(id)) || body.orderedSectionIds.length !== sections.length) {
      throw new BadRequestException('Invalid section ordering payload');
    }

    return this.prisma.$transaction(async (tx) => {
      for (const [i, sectionId] of body.orderedSectionIds.entries()) {
        await tx.section.update({ where: { id: sectionId }, data: { position: (i + 1) * 1000 } });
      }
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Section',
        entityId: body.projectId,
        action: 'section.reordered',
        beforeJson: sections,
        afterJson: body.orderedSectionIds,
        correlationId: req.correlationId,
        outboxType: 'section.reordered',
        payload: body,
      });
      return this.prisma.section.findMany({ where: { projectId: body.projectId }, orderBy: { position: 'asc' } });
    });
  }
}
