import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  Inject,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  IsOptional,
  IsString,
  IsBoolean,
  IsEnum,
  IsInt,
  IsDate,
  IsArray,
  Min,
  Max,
  ArrayMinSize,
  ArrayMaxSize,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DomainService } from '../common/domain.service';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { Prisma, ProjectRole, RecurringFrequency, Priority } from '@prisma/client';
import {
  calculateInitialNextScheduledAt,
  normalizeRecurringDate,
} from './recurrence-policy';

class CreateRecurringRuleDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(RecurringFrequency)
  frequency: RecurringFrequency;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  interval?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(7)
  daysOfWeek?: number[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;

  @IsString()
  sectionId: string;

  @IsOptional()
  @IsUUID()
  sourceTaskId?: string;

  @IsOptional()
  @IsString()
  assigneeUserId?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @Type(() => Date)
  @IsDate()
  startDate: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;
}

class UpdateRecurringRuleDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(RecurringFrequency)
  frequency?: RecurringFrequency;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  interval?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(7)
  daysOfWeek?: number[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfMonth?: number;

  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsString()
  assigneeUserId?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

class ListRecurringRulesQuery {
  @IsOptional()
  @IsString()
  includeInactive?: string;
}

@Controller()
@UseGuards(AuthGuard)
export class RecurringTasksController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
  ) {}

  @Post('projects/:id/recurring-rules')
  async create(
    @Param('id') projectId: string,
    @Body() body: CreateRecurringRuleDto,
    @CurrentRequest() req: AppRequest,
  ) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.MEMBER);

    const trimmedTitle = body.title.trim();
    if (!trimmedTitle) {
      throw new ConflictException('Title cannot be empty');
    }

    const section = await this.prisma.section.findFirst({
      where: { id: body.sectionId, projectId },
    });
    if (!section) {
      throw new NotFoundException('Section not found');
    }

    if (body.sourceTaskId) {
      const sourceTask = await this.prisma.task.findFirst({
        where: {
          id: body.sourceTaskId,
          projectId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!sourceTask) {
        throw new NotFoundException('Source task not found');
      }
    }

    this.validateRecurringConfig(body);

    const startDate = normalizeRecurringDate(body.startDate);
    const endDate = body.endDate ? normalizeRecurringDate(body.endDate) : undefined;
    this.validateDateWindow(startDate, endDate);
    const nextScheduledAt = calculateInitialNextScheduledAt({
      frequency: body.frequency,
      interval: body.interval,
      daysOfWeek: body.daysOfWeek,
      dayOfMonth: body.dayOfMonth,
      startDate,
    });

    try {
      return await this.prisma.$transaction(async (tx) => {
        const rule = await tx.recurringRule.create({
          data: {
            projectId,
            title: trimmedTitle,
            description: body.description?.trim(),
            frequency: body.frequency,
            interval: body.interval ?? 1,
            daysOfWeek: body.daysOfWeek ?? [],
            dayOfMonth: body.dayOfMonth,
            sectionId: body.sectionId,
            sourceTaskId: body.sourceTaskId,
            assigneeUserId: body.assigneeUserId,
            priority: body.priority,
            tags: body.tags ?? [],
            startDate,
            endDate,
            nextScheduledAt,
          },
        });

        await this.domain.appendAuditOutbox({
          tx,
          actor: req.user.sub,
          entityType: 'RecurringRule',
          entityId: rule.id,
          action: 'recurring_rule.created',
          afterJson: rule,
          correlationId: req.correlationId,
          outboxType: 'recurring_rule.created',
          payload: { ruleId: rule.id, projectId },
        });

        return rule;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2002'
        && Array.isArray(error.meta?.target)
        && error.meta.target.includes('sourceTaskId')
      ) {
        throw new ConflictException('Source task already has a recurring rule');
      }
      throw error;
    }
  }

  @Get('projects/:id/recurring-rules')
  async list(
    @Param('id') projectId: string,
    @Query() query: ListRecurringRulesQuery,
    @CurrentRequest() req: AppRequest,
  ) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.MEMBER);

    const includeInactive = query.includeInactive === 'true';
    const rules = await this.prisma.recurringRule.findMany({
      where: {
        projectId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: {
        _count: {
          select: { tasks: true, generations: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rules;
  }

  @Get('recurring-rules/:id')
  async get(
    @Param('id') ruleId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    const rule = await this.prisma.recurringRule.findFirst({
      where: { id: ruleId },
      include: {
        _count: {
          select: { tasks: true, generations: true },
        },
      },
    });

    if (!rule) {
      throw new NotFoundException('Recurring rule not found');
    }

    await this.domain.requireProjectRole(rule.projectId, req.user.sub, ProjectRole.MEMBER);

    return rule;
  }

  @Put('recurring-rules/:id')
  async update(
    @Param('id') ruleId: string,
    @Body() body: UpdateRecurringRuleDto,
    @CurrentRequest() req: AppRequest,
  ) {
    if (body.startDate === null) {
      throw new BadRequestException('startDate cannot be null');
    }

    const rule = await this.prisma.recurringRule.findFirst({
      where: { id: ruleId },
    });

    if (!rule) {
      throw new NotFoundException('Recurring rule not found');
    }

    await this.domain.requireProjectRole(rule.projectId, req.user.sub, ProjectRole.MEMBER);

    if (body.title !== undefined) {
      const trimmedTitle = body.title.trim();
      if (!trimmedTitle) {
        throw new ConflictException('Title cannot be empty');
      }
    }

    if (body.sectionId) {
      const section = await this.prisma.section.findFirst({
        where: { id: body.sectionId, projectId: rule.projectId },
      });
      if (!section) {
        throw new NotFoundException('Section not found');
      }
    }

    this.validateRecurringConfig({
      frequency: body.frequency ?? rule.frequency,
      daysOfWeek: body.daysOfWeek ?? rule.daysOfWeek,
      dayOfMonth: body.dayOfMonth ?? rule.dayOfMonth,
    } as CreateRecurringRuleDto);

    const effectiveStartDate = normalizeRecurringDate(body.startDate ?? rule.startDate);
    const effectiveEndDate =
      body.endDate !== undefined
        ? body.endDate
          ? normalizeRecurringDate(body.endDate)
          : null
        : rule.endDate;
    this.validateDateWindow(effectiveStartDate, effectiveEndDate ?? undefined);

    const scheduleChanged = 
      body.frequency !== undefined ||
      body.interval !== undefined ||
      body.daysOfWeek !== undefined ||
      body.dayOfMonth !== undefined ||
      body.startDate !== undefined;

    return this.prisma.$transaction(async (tx) => {
      const data: Parameters<typeof tx.recurringRule.update>[0]['data'] = {};

      if (body.title !== undefined) data.title = body.title.trim();
      if (body.description !== undefined) data.description = body.description?.trim() ?? null;
      if (body.frequency !== undefined) data.frequency = body.frequency;
      if (body.interval !== undefined) data.interval = body.interval;
      if (body.daysOfWeek !== undefined) data.daysOfWeek = body.daysOfWeek;
      if (body.dayOfMonth !== undefined) data.dayOfMonth = body.dayOfMonth ?? null;
      if (body.sectionId !== undefined) data.section = { connect: { id: body.sectionId } };
      if (body.assigneeUserId !== undefined) data.assigneeUserId = body.assigneeUserId ?? null;
      if (body.priority !== undefined) data.priority = body.priority ?? null;
      if (body.tags !== undefined) data.tags = body.tags;
      if (body.startDate !== undefined) data.startDate = effectiveStartDate;
      if (body.endDate !== undefined) data.endDate = effectiveEndDate ?? null;
      if (body.isActive !== undefined) data.isActive = body.isActive;

      if (scheduleChanged) {
        data.nextScheduledAt = calculateInitialNextScheduledAt({
          frequency: body.frequency ?? rule.frequency,
          interval: body.interval ?? rule.interval,
          daysOfWeek: body.daysOfWeek ?? rule.daysOfWeek,
          dayOfMonth: body.dayOfMonth ?? rule.dayOfMonth,
          startDate: effectiveStartDate,
        });
      }

      const updated = await tx.recurringRule.update({
        where: { id: ruleId },
        data,
      });

      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'RecurringRule',
        entityId: ruleId,
        action: 'recurring_rule.updated',
        beforeJson: rule,
        afterJson: updated,
        correlationId: req.correlationId,
        outboxType: 'recurring_rule.updated',
        payload: { ruleId },
      });

      return updated;
    });
  }

  private validateDateWindow(startDate: Date, endDate?: Date | null) {
    if (endDate && normalizeRecurringDate(endDate) < normalizeRecurringDate(startDate)) {
      throw new ConflictException('endDate must be on or after startDate');
    }
  }

  @Delete('recurring-rules/:id')
  async delete(
    @Param('id') ruleId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    const rule = await this.prisma.recurringRule.findFirst({
      where: { id: ruleId },
    });

    if (!rule) {
      throw new NotFoundException('Recurring rule not found');
    }

    await this.domain.requireProjectRole(rule.projectId, req.user.sub, ProjectRole.MEMBER);

    return this.prisma.$transaction(async (tx) => {
      await tx.recurringRule.delete({
        where: { id: ruleId },
      });

      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'RecurringRule',
        entityId: ruleId,
        action: 'recurring_rule.deleted',
        beforeJson: rule,
        correlationId: req.correlationId,
        outboxType: 'recurring_rule.deleted',
        payload: { ruleId },
      });

      return { deleted: true };
    });
  }

  private validateRecurringConfig(body: CreateRecurringRuleDto | { frequency: RecurringFrequency; daysOfWeek?: number[]; dayOfMonth?: number | null }) {
    if (body.frequency === RecurringFrequency.WEEKLY) {
      if (!body.daysOfWeek || body.daysOfWeek.length === 0) {
        throw new ConflictException('Weekly recurrence requires at least one day of week (0-6)');
      }
      for (const day of body.daysOfWeek) {
        if (day < 0 || day > 6) {
          throw new ConflictException('Days of week must be between 0 (Sunday) and 6 (Saturday)');
        }
      }
    }

    if (body.frequency === RecurringFrequency.MONTHLY) {
      if (body.dayOfMonth === undefined || body.dayOfMonth === null) {
        throw new ConflictException('Monthly recurrence requires dayOfMonth (1-31)');
      }
      if (body.dayOfMonth < 1 || body.dayOfMonth > 31) {
        throw new ConflictException('Day of month must be between 1 and 31');
      }
    }
  }
}
