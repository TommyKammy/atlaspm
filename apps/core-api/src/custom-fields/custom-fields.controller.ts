import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { ProjectRolesGuard } from '../common/project-roles.guard';
import { ProjectRole } from '@prisma/client';
import { RequireProjectRole } from '../common/require-project-role.decorator';
import { z } from 'zod';

const FieldTypeEnum = z.enum(['text', 'number', 'date', 'select', 'multi_select', 'user', 'checkbox', 'url', 'email', 'phone']);

type FieldType = z.infer<typeof FieldTypeEnum>;

const CreateFieldDefinitionSchema = z.object({
  name: z.string().min(1).max(100),
  fieldType: FieldTypeEnum,
  options: z.array(z.object({ id: z.string(), label: z.string(), color: z.string().optional() })).optional(),
  config: z.record(z.unknown()).default({}),
  position: z.number().int().min(0).default(0),
});

const UpdateFieldDefinitionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  options: z.array(z.object({ id: z.string(), label: z.string(), color: z.string().optional() })).optional(),
  config: z.record(z.unknown()).optional(),
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const UpdateFieldValueSchema = z.object({
  value: z.unknown(),
});

@Controller('projects/:projectId/custom-fields')
@UseGuards(AuthGuard, ProjectRolesGuard)
export class CustomFieldsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('definitions')
  @RequireProjectRole(ProjectRole.VIEWER)
  async listFieldDefinitions(
    @Param('projectId') projectId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.prisma.customFieldDefinition.findMany({
      where: {
        projectId,
        ...(includeInactive !== 'true' ? { isActive: true } : {}),
      },
      orderBy: { position: 'asc' },
    });
  }

  @Post('definitions')
  @RequireProjectRole(ProjectRole.ADMIN)
  async createFieldDefinition(
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @CurrentRequest() req: AppRequest,
  ) {
    const data = CreateFieldDefinitionSchema.parse(body);
    
    return this.prisma.customFieldDefinition.create({
      data: {
        ...data,
        projectId,
      },
    });
  }

  @Patch('definitions/:fieldId')
  @RequireProjectRole(ProjectRole.ADMIN)
  async updateFieldDefinition(
    @Param('projectId') projectId: string,
    @Param('fieldId') fieldId: string,
    @Body() body: unknown,
  ) {
    const data = UpdateFieldDefinitionSchema.parse(body);
    
    return this.prisma.customFieldDefinition.update({
      where: { id: fieldId },
      data,
    });
  }

  @Delete('definitions/:fieldId')
  @RequireProjectRole(ProjectRole.ADMIN)
  async deleteFieldDefinition(
    @Param('projectId') projectId: string,
    @Param('fieldId') fieldId: string,
  ) {
    await this.prisma.customFieldDefinition.update({
      where: { id: fieldId },
      data: { isActive: false },
    });
    
    return { success: true };
  }

  @Get('values/:taskId')
  @RequireProjectRole(ProjectRole.VIEWER)
  async getFieldValues(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
  ) {
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
  @RequireProjectRole(ProjectRole.MEMBER)
  async setFieldValue(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Param('fieldId') fieldId: string,
    @Body() body: unknown,
  ) {
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
        value: value as never,
      },
      update: {
        value: value as never,
      },
    });
  }

  @Delete('values/:taskId/:fieldId')
  @RequireProjectRole(ProjectRole.MEMBER)
  async deleteFieldValue(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Param('fieldId') fieldId: string,
  ) {
    await this.prisma.customFieldValue.deleteMany({
      where: {
        fieldDefinitionId: fieldId,
        taskId,
      },
    });
    
    return { success: true };
  }
}
