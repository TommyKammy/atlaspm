import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CustomFieldType, Prisma, ProjectRole } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DomainService } from '../common/domain.service';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { parseCustomFieldDefinition } from './custom-field.validation';

class CustomFieldOptionDto {
  @IsString()
  @MaxLength(80)
  label!: string;

  @IsString()
  @MaxLength(80)
  value!: string;

  @IsOptional()
  @IsString()
  @MaxLength(7)
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  position?: number;
}

class CreateCustomFieldDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsEnum(CustomFieldType)
  type!: CustomFieldType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  position?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomFieldOptionDto)
  options?: CustomFieldOptionDto[];
}

class PatchCustomFieldDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsEnum(CustomFieldType)
  type?: CustomFieldType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  position?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomFieldOptionDto)
  options?: CustomFieldOptionDto[];
}

type FieldWithOptions = Prisma.CustomFieldDefinitionGetPayload<{
  include: { options: true };
}>;

@Controller()
@UseGuards(AuthGuard)
export class CustomFieldsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
  ) {}

  @Get('projects/:id/custom-fields')
  async list(
    @Param('id') projectId: string,
    @Query('includeArchived') includeArchivedRaw: string | undefined,
    @CurrentRequest() req: AppRequest,
  ) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.VIEWER);
    const includeArchived = includeArchivedRaw === 'true';

    const fields = await this.prisma.customFieldDefinition.findMany({
      where: {
        projectId,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      include: {
        options: {
          where: includeArchived ? undefined : { archivedAt: null },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        },
      },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });

    return fields.map((field) => this.toResponse(field));
  }

  @Post('projects/:id/custom-fields')
  async create(
    @Param('id') projectId: string,
    @Body() body: CreateCustomFieldDto,
    @CurrentRequest() req: AppRequest,
  ) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.MEMBER);
    const parsed = parseCustomFieldDefinition(body);

    return this.prisma.$transaction(async (tx) => {
      const maxPosition = await tx.customFieldDefinition.aggregate({
        where: { projectId },
        _max: { position: true },
      });
      const nextPosition = (maxPosition._max.position ?? 0) + 1000;

      const created = await tx.customFieldDefinition.create({
        data: {
          projectId,
          name: parsed.name,
          type: parsed.type,
          description: parsed.description,
          required: parsed.required ?? false,
          position: parsed.position ?? nextPosition,
          options: parsed.options
            ? {
                create: parsed.options.map((option, index) => ({
                  label: option.label,
                  value: option.value,
                  color: option.color,
                  position: option.position ?? (index + 1) * 1000,
                })),
              }
            : undefined,
        },
        include: { options: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
      });

      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'CustomFieldDefinition',
        entityId: created.id,
        action: 'custom_field.created',
        afterJson: created,
        correlationId: req.correlationId,
        outboxType: 'custom_field.created',
        payload: created,
      });

      return this.toResponse(created);
    });
  }

  @Patch('custom-fields/:id')
  async patch(
    @Param('id') fieldId: string,
    @Body() body: PatchCustomFieldDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const existing = await this.prisma.customFieldDefinition.findUnique({
      where: { id: fieldId },
      include: { options: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] } },
    });
    if (!existing) {
      throw new NotFoundException('Custom field definition not found');
    }
    if (existing.archivedAt) {
      throw new ConflictException('Archived custom fields cannot be updated');
    }

    await this.domain.requireProjectRole(existing.projectId, req.user.sub, ProjectRole.MEMBER);

    const activeExistingOptions = existing.options.filter((option) => !option.archivedAt);
    const targetType = body.type ?? existing.type;
    const mergedOptions =
      targetType === CustomFieldType.SELECT
        ? body.options === undefined
          ? activeExistingOptions.map((option) => ({
              label: option.label,
              value: option.value,
              color: option.color ?? undefined,
              position: option.position,
            }))
          : body.options
        : undefined;
    const mergedForValidation = {
      name: body.name ?? existing.name,
      type: targetType,
      description:
        body.description === undefined
          ? (existing.description ?? undefined)
          : (body.description ?? undefined),
      required: body.required ?? existing.required,
      position: body.position ?? existing.position,
      options: mergedOptions,
    };
    const parsed = parseCustomFieldDefinition(mergedForValidation);

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const shouldReplaceOptions = body.options !== undefined || parsed.type !== existing.type;
      if (shouldReplaceOptions) {
        await tx.customFieldOption.updateMany({
          where: { fieldId, archivedAt: null },
          data: { archivedAt: now },
        });
        if (parsed.type === CustomFieldType.SELECT && parsed.options) {
          await tx.customFieldOption.createMany({
            data: parsed.options.map((option, index) => ({
              fieldId,
              label: option.label,
              value: option.value,
              color: option.color,
              position: option.position ?? (index + 1) * 1000,
            })),
          });
        }
      }

      const updated = await tx.customFieldDefinition.update({
        where: { id: fieldId },
        data: {
          name: parsed.name,
          type: parsed.type,
          description: parsed.description,
          required: parsed.required ?? false,
          position: parsed.position ?? existing.position,
        },
        include: {
          options: { where: { archivedAt: null }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
        },
      });

      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'CustomFieldDefinition',
        entityId: fieldId,
        action: 'custom_field.updated',
        beforeJson: existing,
        afterJson: updated,
        correlationId: req.correlationId,
        outboxType: 'custom_field.updated',
        payload: updated,
      });

      return this.toResponse(updated);
    });
  }

  @Delete('custom-fields/:id')
  async archive(@Param('id') fieldId: string, @CurrentRequest() req: AppRequest) {
    const existing = await this.prisma.customFieldDefinition.findUnique({
      where: { id: fieldId },
      include: { options: true },
    });
    if (!existing) {
      throw new NotFoundException('Custom field definition not found');
    }
    await this.domain.requireProjectRole(existing.projectId, req.user.sub, ProjectRole.MEMBER);

    if (existing.archivedAt) {
      return { ok: true };
    }

    return this.prisma.$transaction(async (tx) => {
      const archivedAt = new Date();
      const archived = await tx.customFieldDefinition.update({
        where: { id: fieldId },
        data: { archivedAt },
        include: { options: true },
      });
      await tx.customFieldOption.updateMany({
        where: { fieldId, archivedAt: null },
        data: { archivedAt },
      });

      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'CustomFieldDefinition',
        entityId: fieldId,
        action: 'custom_field.archived',
        beforeJson: existing,
        afterJson: archived,
        correlationId: req.correlationId,
        outboxType: 'custom_field.archived',
        payload: archived,
      });
      return { ok: true };
    });
  }

  private toResponse(field: FieldWithOptions) {
    return {
      id: field.id,
      projectId: field.projectId,
      name: field.name,
      type: field.type,
      description: field.description,
      required: field.required,
      position: field.position,
      archivedAt: field.archivedAt,
      createdAt: field.createdAt,
      updatedAt: field.updatedAt,
      options: field.options.map((option) => ({
        id: option.id,
        label: option.label,
        value: option.value,
        color: option.color,
        position: option.position,
        archivedAt: option.archivedAt,
        createdAt: option.createdAt,
        updatedAt: option.updatedAt,
      })),
    };
  }
}
