import {
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
} from 'class-validator';
import { Type } from 'class-transformer';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DomainService } from '../common/domain.service';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { ProjectRole, RecurringFrequency, Priority } from '@prisma/client';

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

    this.validateRecurringConfig(body);

    const nextScheduledAt = this.calculateNextOccurrence(body);

    return this.prisma.$transaction(async (tx) => {
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
          assigneeUserId: body.assigneeUserId,
          priority: body.priority,
          tags: body.tags ?? [],
          startDate: body.startDate,
          endDate: body.endDate,
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
      if (body.startDate !== undefined) data.startDate = body.startDate;
      if (body.endDate !== undefined) data.endDate = body.endDate ?? null;
      if (body.isActive !== undefined) data.isActive = body.isActive;

      if (scheduleChanged) {
        const updatedRule = {
          ...rule,
          ...(body.frequency !== undefined && { frequency: body.frequency }),
          ...(body.interval !== undefined && { interval: body.interval }),
          ...(body.daysOfWeek !== undefined && { daysOfWeek: body.daysOfWeek }),
          ...(body.dayOfMonth !== undefined && { dayOfMonth: body.dayOfMonth }),
          ...(body.startDate !== undefined && { startDate: body.startDate }),
        };
        data.nextScheduledAt = this.calculateNextOccurrence(updatedRule as CreateRecurringRuleDto);
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

  private calculateNextOccurrence(body: CreateRecurringRuleDto): Date {
    const now = new Date();
    const startDate = new Date(body.startDate);
    
    if (startDate > now) {
      return startDate;
    }

    const nextDate = new Date(now);
    nextDate.setHours(0, 0, 0, 0);

    switch (body.frequency) {
      case RecurringFrequency.DAILY:
        nextDate.setDate(nextDate.getDate() + (body.interval ?? 1));
        break;
      
      case RecurringFrequency.WEEKLY:
        if (body.daysOfWeek && body.daysOfWeek.length > 0) {
          const currentDay = nextDate.getDay();
          const sortedDays = [...body.daysOfWeek].sort((a, b) => a - b);
          const firstDay = sortedDays[0]!;

          let daysUntilNext = -1;
          for (const day of sortedDays) {
            if (day > currentDay) {
              daysUntilNext = day - currentDay;
              break;
            }
          }

          if (daysUntilNext === -1) {
            daysUntilNext = 7 - currentDay + firstDay;
            if ((body.interval ?? 1) > 1) {
              daysUntilNext += 7 * ((body.interval ?? 1) - 1);
            }
          }

          nextDate.setDate(nextDate.getDate() + daysUntilNext);
        } else {
          nextDate.setDate(nextDate.getDate() + 7 * (body.interval ?? 1));
        }
        break;

      case RecurringFrequency.MONTHLY:
        if (body.dayOfMonth) {
          nextDate.setMonth(nextDate.getMonth() + (body.interval ?? 1));
          const lastDayOfMonth = new Date(
            nextDate.getFullYear(),
            nextDate.getMonth() + 1,
            0,
          ).getDate();
          nextDate.setDate(Math.min(body.dayOfMonth, lastDayOfMonth));
        }
        break;
    }

    return nextDate;
  }
}
