import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { DomainService } from '../common/domain.service';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { z } from 'zod';
import { ProjectRole, Prisma } from '@prisma/client';

const FieldTypeEnum = z.enum(['text', 'number', 'date', 'select', 'multi_select', 'user', 'checkbox', 'url', 'email', 'phone']);

const CreateFieldDefinitionSchema = z.object({
  name: z.string().min(1).max(100),
  fieldType: FieldTypeEnum,
  options: z.array(z.object({ id: z.string(), label: z.string(), color: z.string().optional() })).optional(),
  position: z.number().int().min(0).default(0),
});

const UpdateFieldDefinitionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  options: z.array(z.object({ id: z.string(), label: z.string(), color: z.string().optional() })).optional(),
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const UpdateFieldValueSchema = z.object({
  value: z.union([
    z.string().max(5000),
    z.number(),
    z.boolean(),
    z.array(z.string().max(100)).max(50),
    z.null(),
  ]),
});

@Controller('projects/:projectId/custom-fields')
@UseGuards(AuthGuard)
export class CustomFieldsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
  ) {}

  @Get('definitions')
  async listFieldDefinitions(
    @Param('projectId') projectId: string,
    @CurrentRequest() req: AppRequest,
    @Query('includeInactive') includeInactive?: string,
  ) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.VIEWER);
    return this.prisma.customFieldDefinition.findMany({
      where: {
        projectId,
        ...(includeInactive !== 'true' ? { isActive: true } : {}),
      },
      orderBy: { position: 'asc' },
    });
  }

  @Post('definitions')
  async createFieldDefinition(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @CurrentRequest() req: AppRequest,
  ) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.ADMIN);
    const data = CreateFieldDefinitionSchema.parse(body);
    
    return this.prisma.customFieldDefinition.create({
      data: {
        name: data.name,
        fieldType: data.fieldType,
        projectId,
        position: data.position,
        ...(data.options ? { options: data.options as Prisma.InputJsonValue } : {}),
      },
    });
  }

  @Patch('definitions/:fieldId')
  async updateFieldDefinition(
    @Param('projectId') projectId: string,
    @Param('fieldId') fieldId: string,
    @Body() body: unknown,
    @CurrentRequest() req: AppRequest,
  ) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.ADMIN);
    const data = UpdateFieldDefinitionSchema.parse(body);
    
    const updateData: { name?: string; options?: Prisma.InputJsonValue; position?: number; isActive?: boolean } = {};
    if (data.name) updateData.name = data.name;
    if (data.options) updateData.options = data.options as Prisma.InputJsonValue;
    if (data.position !== undefined) updateData.position = data.position;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    
    return this.prisma.customFieldDefinition.update({
      where: { id: fieldId },
      data: updateData,
    });
  }

  @Delete('definitions/:fieldId')
  async deleteFieldDefinition(
    @Param('projectId') projectId: string,
    @Param('fieldId') fieldId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.ADMIN);
    await this.prisma.customFieldDefinition.update({
      where: { id: fieldId },
      data: { isActive: false },
    });
    
    return { success: true };
  }

  @Get('values/:taskId')
  async getFieldValues(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.VIEWER);
    const values = await this.prisma.customFieldValue.findMany({
      where: { taskId },
      include: { fieldDefinition: true },
    });
    
    return values.map(v => ({
      fieldDefinitionId: v.fieldDefinitionId,
      fieldName: v.fieldDefinition.name,
      fieldType: v.fieldDefinition.fieldType,
      value: v.value,
    }));
  }

  @Post('values/:taskId/:fieldId')
  async setFieldValue(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Param('fieldId') fieldId: string,
    @Body() body: unknown,
    @CurrentRequest() req: AppRequest,
  ) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.MEMBER);
    const { value } = UpdateFieldValueSchema.parse(body);
    
    return this.prisma.customFieldValue.upsert({
      where: {
        fieldDefinitionId_taskId: {
          fieldDefinitionId: fieldId,
          taskId,
        },
      },
      create: {
        fieldDefinitionId: fieldId,
        taskId,
        value: value as Prisma.InputJsonValue,
      },
      update: {
        value: value as Prisma.InputJsonValue,
      },
    });
  }

  @Delete('values/:taskId/:fieldId')
  async deleteFieldValue(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Param('fieldId') fieldId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.MEMBER);
    await this.prisma.customFieldValue.deleteMany({
      where: {
        fieldDefinitionId: fieldId,
        taskId,
      },
    });
    
    return { success: true };
  }
}