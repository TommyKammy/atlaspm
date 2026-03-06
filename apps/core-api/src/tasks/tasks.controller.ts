import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ConflictException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import {
  Allow,
  IsBoolean,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DomainService } from '../common/domain.service';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { assertValidDateRange } from '../common/date-validation';
import { Prisma, Priority, ProjectRole, TaskStatus, TaskType, DependencyType, CustomFieldType } from '@prisma/client';
import { completeTaskLifecycle, DomainConflictError, DomainNotFoundError } from '@atlaspm/domain';
import { SubtaskService } from './subtask.service';
import { SearchService } from '../search/search.service';
import { createTaskLifecycleUnitOfWorkFromTx } from './task-lifecycle-prisma.adapter';
import { FileInterceptor } from '@nestjs/platform-express';
import { promises as fs } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { resolveAttachmentPath } from './attachment-storage';
import {
  parseRuleDefinition,
  templateDefinition,
  type RuleDefinition,
} from '../rules/rule-definition';
import { NotificationsService } from '../notifications/notifications.service';
import { Type } from 'class-transformer';
import {
  parseCustomFieldValue,
  parseTaskCustomFieldFilters,
  parseTaskCustomFieldSort,
  type ParsedCustomFieldValue,
  type TaskCustomFieldFilter,
} from '../custom-fields/custom-field.validation';

class TaskQuery {
  @IsOptional()
  @IsString()
  groupBy?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsString()
  assignee?: string;

  @IsOptional()
  @IsISO8601()
  dueFrom?: string;

  @IsOptional()
  @IsISO8601()
  dueTo?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  sortBy?: 'dueAt' | 'progressPercent' | 'updatedAt';

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';

  @IsOptional()
  @IsString()
  deleted?: 'true' | 'false';

  @IsOptional()
  @IsString()
  cf?: string;

  @IsOptional()
  @IsString()
  customFieldFilters?: string;

  @IsOptional()
  @IsUUID()
  customFieldSortFieldId?: string;

  @IsOptional()
  @IsString()
  customFieldSortOrder?: 'asc' | 'desc';
}

class CreateTaskDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskType)
  type?: TaskType;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsString()
  assigneeUserId?: string;

  @IsOptional()
  @IsISO8601()
  startAt?: string;

  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  @IsOptional()
  @IsISO8601()
  baselineStartAt?: string;

  @IsOptional()
  @IsISO8601()
  baselineDueAt?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsUUID()
  sectionId?: string;
}

class PatchTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskType)
  type?: TaskType;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsString()
  assigneeUserId?: string | null;

  @IsOptional()
  @IsISO8601()
  startAt?: string | null;

  @IsOptional()
  @IsISO8601()
  dueAt?: string | null;

  @IsOptional()
  @IsISO8601()
  baselineStartAt?: string | null;

  @IsOptional()
  @IsISO8601()
  baselineDueAt?: string | null;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsInt()
  version?: number;
}

class RescheduleTaskDto {
  @IsOptional()
  @IsISO8601()
  startAt?: string | null;

  @IsOptional()
  @IsISO8601()
  dueAt?: string | null;

  @IsInt()
  version!: number;
}

class PutTimelineLaneOrderDto {
  @IsArray()
  @IsString({ each: true })
  laneOrder!: string[];
}

class PutTimelineViewStateDto {
  @IsOptional()
  @IsString()
  zoom?: 'day' | 'week' | 'month';

  @IsOptional()
  @IsISO8601()
  anchorDate?: string;

  @IsOptional()
  @IsString()
  swimlane?: 'section' | 'assignee' | 'status';

  @IsOptional()
  @IsString()
  sortMode?: 'manual' | 'startAt' | 'dueAt';

  @IsOptional()
  @IsString()
  scheduleFilter?: 'all' | 'scheduled' | 'unscheduled';

  @IsOptional()
  @IsString()
  ganttRiskFilterMode?: 'all' | 'risk';

  @IsOptional()
  @IsBoolean()
  ganttStrictMode?: boolean;
}
class PatchTaskCustomFieldValueDto {
  @IsUUID()
  fieldId!: string;

  @Allow()
  value?: unknown;
}

class TimelineMoveTaskDto {
  @IsOptional()
  @Allow()
  assigneeUserId?: string | null;

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsISO8601()
  startAt?: string | null;

  @IsOptional()
  @IsISO8601()
  dueAt?: string | null;

  @IsOptional()
  @IsISO8601()
  dropAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  durationDays?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => PatchTaskCustomFieldValueDto)
  customFieldMove?: PatchTaskCustomFieldValueDto;

  @IsInt()
  version!: number;
}

class CompleteTaskDto {
  @IsBoolean()
  done!: boolean;

  @IsInt()
  version!: number;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

class PatchTaskCustomFieldsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PatchTaskCustomFieldValueDto)
  values!: PatchTaskCustomFieldValueDto[];

  @IsInt()
  version!: number;
}

class BulkTaskDto {
  @IsArray()
  taskIds!: string[];

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsString()
  assigneeUserId?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number;
}

class ReorderTaskDto {
  @IsUUID()
  taskId!: string;

  @IsOptional()
  @IsUUID()
  beforeTaskId?: string | null;

  @IsOptional()
  @IsUUID()
  afterTaskId?: string | null;

  @IsOptional()
  @IsUUID()
  fromSectionId?: string;

  @IsOptional()
  @IsInt()
  expectedVersion?: number;
}

class PatchDescriptionDto {
  @IsObject()
  descriptionDoc!: Record<string, unknown>;

  @IsInt()
  @Min(0)
  expectedVersion!: number;
}

class CreateTaskCommentDto {
  @IsString()
  @MaxLength(5000)
  body!: string;
}

class PatchTaskCommentDto {
  @IsString()
  @MaxLength(5000)
  body!: string;
}

class InitiateAttachmentDto {
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @MaxLength(120)
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(10_000_000)
  sizeBytes!: number;
}

class CompleteAttachmentDto {
  @IsUUID()
  attachmentId!: string;
}

class UpsertTaskReminderDto {
  @IsISO8601()
  remindAt!: string;
}

class CreateSubtaskDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @IsOptional()
  @IsString()
  assigneeUserId?: string;

  @IsOptional()
  @IsISO8601()
  startAt?: string;

  @IsOptional()
  @IsISO8601()
  dueAt?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];
}

class AddDependencyDto {
  @IsUUID()
  dependsOnId!: string;

  @IsOptional()
  @IsEnum(DependencyType)
  type?: DependencyType;
}

const MAX_DESCRIPTION_DOC_BYTES = 200_000;
const MAX_DESCRIPTION_TEXT_LENGTH = 20_000;
const MAX_COMMENT_BODY_LENGTH = 5000;
const MAX_IMAGE_UPLOAD_BYTES = 5_000_000;
const IMAGE_MIME_ALLOWLIST = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const TIMELINE_GROUP_BY_VALUES = ['section', 'assignee'] as const;
const TIMELINE_VIEW_MODE_VALUES = ['timeline', 'gantt'] as const;
const TIMELINE_ZOOM_VALUES = ['day', 'week', 'month'] as const;
const TIMELINE_SWIMLANE_VALUES = ['section', 'assignee', 'status'] as const;
const TIMELINE_SORT_MODE_VALUES = ['manual', 'startAt', 'dueAt'] as const;
const TIMELINE_SCHEDULE_FILTER_VALUES = ['all', 'scheduled', 'unscheduled'] as const;
const GANTT_RISK_FILTER_MODE_VALUES = ['all', 'risk'] as const;

type TimelineGroupBy = (typeof TIMELINE_GROUP_BY_VALUES)[number];
type TimelineViewMode = (typeof TIMELINE_VIEW_MODE_VALUES)[number];

type TaskCustomFieldValueWithRelations = Prisma.TaskCustomFieldValueGetPayload<{
  include: {
    field: { select: { id: true; name: true; type: true; required: true; archivedAt: true; position: true } };
    option: { select: { id: true; label: true; value: true; color: true; archivedAt: true } };
  };
}>;

type SerializedTaskCustomFieldValue = {
  id: string;
  taskId: string;
  fieldId: string;
  optionId: string | null;
  valueText: string | null;
  valueNumber: number | null;
  valueDate: Date | null;
  valueBoolean: boolean | null;
  createdAt: Date;
  updatedAt: Date;
  field: {
    id: string;
    name: string;
    type: string;
    required: boolean;
    position: number;
  } | null;
  option: {
    id: string;
    label: string;
    value: string;
    color: string | null;
  } | null;
};

@Controller()
@UseGuards(AuthGuard)
export class TasksController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
    @Inject(SubtaskService) private readonly subtaskService: SubtaskService,
    @Inject(SearchService) private readonly searchService: SearchService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  @Get('projects/:id/tasks')
  async list(@Param('id') projectId: string, @Query() query: TaskQuery, @CurrentRequest() req: AppRequest) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.VIEWER);

    const customFieldFilters = parseTaskCustomFieldFilters(query.customFieldFilters ?? query.cf);
    const customFieldSort = parseTaskCustomFieldSort(query.customFieldSortFieldId, query.customFieldSortOrder);

    const includeDeleted = query.deleted === 'true';
    const where: Prisma.TaskWhereInput = {
      projectId,
      deletedAt: includeDeleted ? { not: null } : null,
    };
    if (query.status) where.status = query.status;
    if (query.assignee) where.assigneeUserId = query.assignee;
    if (query.dueFrom || query.dueTo) {
      where.dueAt = {
        gte: query.dueFrom ? new Date(query.dueFrom) : undefined,
        lte: query.dueTo ? new Date(query.dueTo) : undefined,
      };
    }
    if (query.tag) where.tags = { has: query.tag };
    if (customFieldFilters.length) {
      const customFilterWhere = customFieldFilters.map((filter) => this.toTaskCustomFieldFilterWhere(filter));
      if (customFilterWhere.length) {
        const currentAnd = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
        where.AND = [...currentAnd, ...customFilterWhere];
      }
    }
    if (query.q) {
      const trimmed = query.q.trim();
      const maybeNumber = Number(trimmed);
      where.OR = [
        { title: { contains: trimmed, mode: 'insensitive' } },
        { description: { contains: trimmed, mode: 'insensitive' } },
        { descriptionText: { contains: trimmed, mode: 'insensitive' } },
        { section: { name: { contains: trimmed, mode: 'insensitive' } } },
        {
          customFieldValues: {
            some: {
              field: { archivedAt: null },
              valueText: { contains: trimmed, mode: 'insensitive' },
            },
          },
        },
      ];
      if (Number.isFinite(maybeNumber)) {
        where.OR.push({
          customFieldValues: {
            some: {
              field: { archivedAt: null, type: CustomFieldType.NUMBER },
              valueNumber: maybeNumber,
            },
          },
        });
      }
    }

    const orderBy = query.sortBy
      ? { [query.sortBy]: query.sortOrder ?? 'asc' }
      : [{ sectionId: 'asc' as const }, { position: 'asc' as const }];

    const tasks = await this.prisma.task.findMany({ where, orderBy });
    const hydratedTasksRaw = await this.hydrateTasksWithCustomFieldValues(tasks);
    const hydratedTasks = customFieldSort
      ? this.sortHydratedTasksByCustomField(hydratedTasksRaw, customFieldSort.fieldId, customFieldSort.order)
      : hydratedTasksRaw;
    const hasExplicitSort = Boolean(query.sortBy || customFieldSort);
    if (query.groupBy === 'section') {
      const sections = await this.prisma.section.findMany({ where: { projectId }, orderBy: { position: 'asc' } });
      return sections.map((section) => ({
        section,
        tasks: hydratedTasks
          .filter((t) => t.sectionId === section.id)
          .sort((a, b) => (hasExplicitSort ? 0 : Number(a.position) - Number(b.position))),
      }));
    }
    return hydratedTasks;
  }

  @Get('projects/:id/timeline/preferences')
  async getTimelinePreferences(@Param('id') projectId: string, @CurrentRequest() req: AppRequest) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.VIEWER);
    const preferences = await this.prisma.projectTimelinePreference.findUnique({
      where: { projectId_userId: { projectId, userId: req.user.sub } },
    });
    return {
      projectId,
      userId: req.user.sub,
      laneOrderBySection: preferences?.laneOrderBySection ?? [],
      laneOrderByAssignee: preferences?.laneOrderByAssignee ?? [],
      timelineViewState: preferences?.timelineViewState ?? null,
      ganttViewState: preferences?.ganttViewState ?? null,
    };
  }

  @Put('projects/:id/timeline/preferences/:groupBy')
  async putTimelineLaneOrder(
    @Param('id') projectId: string,
    @Param('groupBy') rawGroupBy: string,
    @Body() body: PutTimelineLaneOrderDto,
    @CurrentRequest() req: AppRequest,
  ) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.MEMBER);
    const groupBy = this.parseTimelineGroupBy(rawGroupBy);
    const normalizedLaneOrder = this.domain.normalizeTimelineLaneOrder(body.laneOrder);

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.projectTimelinePreference.findUnique({
        where: { projectId_userId: { projectId, userId: req.user.sub } },
      });
      const updated = await tx.projectTimelinePreference.upsert({
        where: { projectId_userId: { projectId, userId: req.user.sub } },
        create: {
          projectId,
          userId: req.user.sub,
          laneOrderBySection: groupBy === 'section' ? normalizedLaneOrder : [],
          laneOrderByAssignee: groupBy === 'assignee' ? normalizedLaneOrder : [],
        },
        update:
          groupBy === 'section'
            ? { laneOrderBySection: normalizedLaneOrder }
            : { laneOrderByAssignee: normalizedLaneOrder },
      });

      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'ProjectTimelinePreference',
        entityId: updated.id,
        action: 'project.timeline.preferences.updated',
        beforeJson: before,
        afterJson: updated,
        correlationId: req.correlationId,
        outboxType: 'project.timeline.preferences.updated',
        payload: {
          projectId,
          userId: req.user.sub,
          groupBy,
          laneOrder: normalizedLaneOrder,
        },
      });

      return {
        projectId,
        userId: req.user.sub,
        laneOrderBySection: updated.laneOrderBySection,
        laneOrderByAssignee: updated.laneOrderByAssignee,
        timelineViewState: updated.timelineViewState ?? null,
        ganttViewState: updated.ganttViewState ?? null,
      };
    });
  }

  @Put('projects/:id/timeline/preferences/view-state/:mode')
  async putTimelineViewState(
    @Param('id') projectId: string,
    @Param('mode') rawMode: string,
    @Body() body: PutTimelineViewStateDto,
    @CurrentRequest() req: AppRequest,
  ) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.MEMBER);
    const mode = this.parseTimelineViewMode(rawMode);
    const normalizedViewState = this.normalizeTimelineViewState(mode, body);

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.projectTimelinePreference.findUnique({
        where: { projectId_userId: { projectId, userId: req.user.sub } },
      });
      const updated = await tx.projectTimelinePreference.upsert({
        where: { projectId_userId: { projectId, userId: req.user.sub } },
        create: {
          projectId,
          userId: req.user.sub,
          ...(mode === 'timeline' ? { timelineViewState: normalizedViewState } : {}),
          ...(mode === 'gantt' ? { ganttViewState: normalizedViewState } : {}),
        },
        update:
          mode === 'timeline'
            ? { timelineViewState: normalizedViewState }
            : { ganttViewState: normalizedViewState },
      });

      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'ProjectTimelinePreference',
        entityId: updated.id,
        action: 'project.timeline.view_state.updated',
        beforeJson: before,
        afterJson: updated,
        correlationId: req.correlationId,
        outboxType: 'project.timeline.view_state.updated',
        payload: {
          projectId,
          userId: req.user.sub,
          mode,
          viewState: normalizedViewState,
        },
      });

      return {
        projectId,
        userId: req.user.sub,
        laneOrderBySection: updated.laneOrderBySection,
        laneOrderByAssignee: updated.laneOrderByAssignee,
        timelineViewState: updated.timelineViewState ?? null,
        ganttViewState: updated.ganttViewState ?? null,
      };
    });
  }

  @Get('tasks/:id')
  async getOne(@Param('id') id: string, @CurrentRequest() req: AppRequest) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.VIEWER);
    const [hydratedTask] = await this.hydrateTasksWithCustomFieldValues([task]);
    return hydratedTask;
  }

  @Post('projects/:id/tasks')
  async create(@Param('id') projectId: string, @Body() body: CreateTaskDto, @CurrentRequest() req: AppRequest) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.MEMBER);

    assertValidDateRange(body.startAt, body.dueAt);
    assertValidDateRange(body.baselineStartAt, body.baselineDueAt, {
      startField: 'baselineStartAt',
      dueField: 'baselineDueAt',
    });

    let sectionId = body.sectionId;
    if (!sectionId) {
      const defaultSection = await this.prisma.section.findFirst({ where: { projectId, isDefault: true } });
      if (!defaultSection) throw new NotFoundException('Default section missing');
      sectionId = defaultSection.id;
    }

    const topTask = await this.prisma.task.findFirst({
      where: { projectId, sectionId, deletedAt: null },
      orderBy: { position: 'asc' },
    });
    const position = (topTask?.position ?? 1000) - 1000;
    const taskType = body.type ?? TaskType.TASK;
    
    const requestedStatus = body.status ?? TaskStatus.TODO;
    const progress = this.domain.deriveNormalizedTaskProgress({
      taskType,
      progress: body.progressPercent ?? 0,
      status: requestedStatus,
      hasStatusOverride: body.status !== undefined,
    });
    
    const progressAutomation = this.domain.deriveTaskProgressAutomation(progress, requestedStatus, null);
    const status = progressAutomation.status;
    const completedAt = status === TaskStatus.DONE ? progressAutomation.completedAt : null;

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          projectId,
          sectionId,
          title: body.title,
          description: body.description,
          status,
          type: taskType,
          progressPercent: progress,
          priority: body.priority,
          assigneeUserId: body.assigneeUserId,
          startAt: body.startAt ? new Date(body.startAt) : null,
          dueAt: body.dueAt ? new Date(body.dueAt) : null,
          baselineStartAt: body.baselineStartAt ? new Date(body.baselineStartAt) : null,
          baselineDueAt: body.baselineDueAt ? new Date(body.baselineDueAt) : null,
          tags: body.tags ?? [],
          completedAt,
          position,
        },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: task.id,
        action: 'task.created',
        afterJson: task,
        correlationId: req.correlationId,
        outboxType: 'task.created',
        payload: task,
      });
      await this.applyProgressRules(tx, task.id, req.correlationId);
      return task;
    }).then((task) => {
      void this.indexTaskWithCustomFields(task);
      return task;
    });
  }

  @Patch('tasks/:id')
  async patch(@Param('id') id: string, @Body() body: PatchTaskDto, @CurrentRequest() req: AppRequest) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);
    if (body.version && body.version !== task.version) throw new ConflictException('Version conflict');

    const effectiveStartAt = body.startAt === undefined ? task.startAt?.toISOString() : body.startAt;
    const effectiveDueAt = body.dueAt === undefined ? task.dueAt?.toISOString() : body.dueAt;
    assertValidDateRange(effectiveStartAt, effectiveDueAt);
    const effectiveBaselineStartAt =
      body.baselineStartAt === undefined
        ? task.baselineStartAt?.toISOString()
        : body.baselineStartAt;
    const effectiveBaselineDueAt =
      body.baselineDueAt === undefined
        ? task.baselineDueAt?.toISOString()
        : body.baselineDueAt;
    assertValidDateRange(effectiveBaselineStartAt, effectiveBaselineDueAt, {
      startField: 'baselineStartAt',
      dueField: 'baselineDueAt',
    });

    const newType = body.type ?? task.type;
    const requestedStatus = body.status ?? task.status;
    const progress = this.domain.deriveNormalizedTaskProgress({
      taskType: newType,
      progress: body.progressPercent ?? task.progressPercent,
      status: requestedStatus,
      hasStatusOverride: body.status !== undefined,
    });
    
    const progressAutomation =
      body.status === undefined
        ? this.domain.deriveTaskProgressAutomation(progress, task.status, task.completedAt)
        : null;
    const status = body.status ?? progressAutomation?.status ?? task.status;
    const completedAt =
      status === TaskStatus.DONE
        ? task.completedAt ?? progressAutomation?.completedAt ?? new Date()
        : null;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id },
        data: {
          title: body.title,
          description: body.description,
          status,
          type: newType,
          progressPercent: progress,
          priority: body.priority,
          assigneeUserId: body.assigneeUserId,
          startAt: body.startAt ? new Date(body.startAt) : body.startAt === null ? null : undefined,
          dueAt: body.dueAt ? new Date(body.dueAt) : body.dueAt === null ? null : undefined,
          baselineStartAt:
            body.baselineStartAt
              ? new Date(body.baselineStartAt)
              : body.baselineStartAt === null
                ? null
                : undefined,
          baselineDueAt:
            body.baselineDueAt
              ? new Date(body.baselineDueAt)
              : body.baselineDueAt === null
                ? null
                : undefined,
          tags: body.tags,
          sectionId: body.sectionId,
          completedAt,
          version: { increment: 1 },
        },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: id,
        action: 'task.updated',
        beforeJson: task,
        afterJson: updated,
        correlationId: req.correlationId,
        outboxType: 'task.updated',
        payload: updated,
      });
      await this.applyProgressRules(tx, id, req.correlationId);

      const newAssigneeId = body.assigneeUserId;
      const assigneeChanged = newAssigneeId !== undefined && newAssigneeId !== task.assigneeUserId && newAssigneeId !== null;
      if (assigneeChanged) {
        await this.notifications.createTaskAssignmentNotification(tx, {
          userId: newAssigneeId,
          projectId: task.projectId,
          taskId: id,
          triggeredByUserId: req.user.sub,
          actor: req.user.sub,
          correlationId: req.correlationId,
        });
      }

      const postUpdateAssigneeId = updated.assigneeUserId;
      let dueDateChanged = false;
      if (body.dueAt !== undefined && postUpdateAssigneeId) {
        if (body.dueAt === null) {
          dueDateChanged = task.dueAt !== null;
        } else {
          const newDueDate = new Date(body.dueAt).getTime();
          const oldDueDate = task.dueAt ? task.dueAt.getTime() : null;
          dueDateChanged = newDueDate !== oldDueDate;
        }
      }
      if (dueDateChanged && postUpdateAssigneeId) {
        await this.notifications.createDueDateNotification(tx, {
          userId: postUpdateAssigneeId,
          projectId: task.projectId,
          taskId: id,
          triggeredByUserId: req.user.sub,
          actor: req.user.sub,
          correlationId: req.correlationId,
        });
      }

      const statusChanged = status !== task.status;
      const shouldNotifyAssigneeOfStatus = statusChanged && postUpdateAssigneeId && postUpdateAssigneeId !== req.user.sub;
      if (shouldNotifyAssigneeOfStatus) {
        await this.notifications.createStatusChangeNotification(tx, {
          userId: postUpdateAssigneeId,
          projectId: task.projectId,
          taskId: id,
          triggeredByUserId: req.user.sub,
          actor: req.user.sub,
          correlationId: req.correlationId,
        });
      }

      return updated;
    }).then((updated) => {
      void this.indexTaskWithCustomFields(updated);
      return updated;
    });
  }

  @Patch('tasks/:id/reschedule')
  async reschedule(@Param('id') id: string, @Body() body: RescheduleTaskDto, @CurrentRequest() req: AppRequest) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);
    if (body.startAt === undefined && body.dueAt === undefined) {
      throw new BadRequestException('Either startAt or dueAt must be provided');
    }
    if (body.version !== task.version) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Version conflict',
        latest: {
          version: task.version,
          startAt: task.startAt,
          dueAt: task.dueAt,
        },
      });
    }
    const effectiveStartAt = body.startAt === undefined ? task.startAt?.toISOString() : body.startAt;
    const effectiveDueAt = body.dueAt === undefined ? task.dueAt?.toISOString() : body.dueAt;
    assertValidDateRange(effectiveStartAt, effectiveDueAt);

    return this.prisma.$transaction(async (tx) => {
      const updatedRows = await tx.task.updateMany({
        where: { id, deletedAt: null, version: body.version },
        data: {
          startAt: body.startAt ? new Date(body.startAt) : body.startAt === null ? null : undefined,
          dueAt: body.dueAt ? new Date(body.dueAt) : body.dueAt === null ? null : undefined,
          version: { increment: 1 },
        },
      });
      if (updatedRows.count === 0) {
        const latest = await tx.task.findFirstOrThrow({ where: { id, deletedAt: null } });
        throw new ConflictException({
          statusCode: 409,
          message: 'Version conflict',
          latest: {
            version: latest.version,
            startAt: latest.startAt,
            dueAt: latest.dueAt,
          },
        });
      }

      const updated = await tx.task.findFirstOrThrow({ where: { id, deletedAt: null } });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: id,
        action: 'task.rescheduled',
        beforeJson: {
          version: task.version,
          startAt: task.startAt,
          dueAt: task.dueAt,
        },
        afterJson: {
          version: updated.version,
          startAt: updated.startAt,
          dueAt: updated.dueAt,
        },
        correlationId: req.correlationId,
        outboxType: 'task.rescheduled',
        payload: {
          taskId: id,
          projectId: task.projectId,
          version: updated.version,
          startAt: updated.startAt,
          dueAt: updated.dueAt,
        },
      });
      return updated;
    }).then((updated) => {
      void this.indexTaskWithCustomFields(updated);
      return updated;
    });
  }

  @Patch('tasks/:id/timeline-move')
  async moveInTimeline(@Param('id') id: string, @Body() body: TimelineMoveTaskDto, @CurrentRequest() req: AppRequest) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);

    const rawDropAt = body.dropAt;
    const hasSchedulePatch = body.startAt !== undefined || body.dueAt !== undefined;
    const hasAssigneePatch = body.assigneeUserId !== undefined;
    const hasSectionPatch = body.sectionId !== undefined;
    const hasStatusPatch = body.status !== undefined;
    const hasCustomFieldPatch = body.customFieldMove !== undefined;
    const hasDrop = rawDropAt !== undefined && rawDropAt !== null;
    if (body.sectionId === null) {
      throw new BadRequestException('sectionId must not be null');
    }
    if (body.status === null) {
      throw new BadRequestException('status must not be null');
    }
    if (!hasSchedulePatch && !hasAssigneePatch && !hasSectionPatch && !hasStatusPatch && !hasCustomFieldPatch && !hasDrop) {
      throw new BadRequestException(
        'At least one of assigneeUserId, sectionId, status, customFieldMove, startAt, dueAt, or dropAt must be provided',
      );
    }
    if (body.durationDays !== undefined && !hasDrop) {
      throw new BadRequestException('durationDays requires dropAt');
    }
    if (hasDrop && hasSchedulePatch) {
      throw new BadRequestException('dropAt cannot be combined with startAt/dueAt');
    }
    if (hasDrop && (typeof rawDropAt !== 'string' || !rawDropAt.trim())) {
      throw new BadRequestException('dropAt must be a non-empty ISO datetime string');
    }
    if (
      hasAssigneePatch
      && body.assigneeUserId !== null
      && (typeof body.assigneeUserId !== 'string' || !body.assigneeUserId.trim())
    ) {
      throw new BadRequestException('assigneeUserId must be a non-empty string or null');
    }
    if (hasAssigneePatch && typeof body.assigneeUserId === 'string') {
      await this.domain.requireProjectRole(task.projectId, body.assigneeUserId, ProjectRole.VIEWER);
    }
    if (hasSectionPatch) {
      const section = await this.prisma.section.findFirst({
        where: { id: body.sectionId, projectId: task.projectId },
        select: { id: true },
      });
      if (!section) throw new NotFoundException('Section not found');
    }

    if (body.version !== task.version) {
      throw new ConflictException({
        message: 'Version conflict',
        latest: {
          version: task.version,
          assigneeUserId: task.assigneeUserId,
          sectionId: task.sectionId,
          status: task.status,
          startAt: task.startAt,
          dueAt: task.dueAt,
        },
      });
    }

    let nextStartAt: Date | null = task.startAt;
    let nextDueAt: Date | null = task.dueAt;
    if (hasDrop) {
      const dropSchedule = this.domain.deriveTimelineDropSchedule({
        dropAt: new Date(rawDropAt),
        currentStartAt: task.startAt,
        currentDueAt: task.dueAt,
        durationDays: body.durationDays,
      });
      nextStartAt = dropSchedule.startAt;
      nextDueAt = dropSchedule.dueAt;
    } else {
      if (body.startAt !== undefined) {
        nextStartAt = body.startAt ? new Date(body.startAt) : null;
      }
      if (body.dueAt !== undefined) {
        nextDueAt = body.dueAt ? new Date(body.dueAt) : null;
      }
    }
    this.domain.assertTimelineScheduleRange(nextStartAt, nextDueAt);
    assertValidDateRange(nextStartAt?.toISOString() ?? null, nextDueAt?.toISOString() ?? null);

    let parsedCustomFieldMove: {
      definition: Prisma.CustomFieldDefinitionGetPayload<{
        include: { options: true };
      }>;
      parsed: ParsedCustomFieldValue | null;
    } | null = null;
    let serializedBeforeCustomFieldValues: SerializedTaskCustomFieldValue[] = [];
    if (hasCustomFieldPatch) {
      if (!body.customFieldMove || !Object.prototype.hasOwnProperty.call(body.customFieldMove, 'value')) {
        throw new ConflictException('customFieldMove.value is required');
      }
      const definition = await this.prisma.customFieldDefinition.findFirst({
        where: {
          id: body.customFieldMove.fieldId,
          projectId: task.projectId,
          archivedAt: null,
        },
        include: {
          options: {
            where: { archivedAt: null },
          },
        },
      });
      if (!definition) {
        throw new ConflictException('Unknown or archived custom field definition');
      }
      const parsed = parseCustomFieldValue(
        {
          id: definition.id,
          type: definition.type,
          archivedAt: definition.archivedAt,
          options: definition.options.map((option) => ({
            id: option.id,
            value: option.value,
            archivedAt: option.archivedAt,
          })),
        },
        body.customFieldMove.value,
      );
      if (definition.required && parsed === null) {
        throw new ConflictException(`Required custom field cannot be empty: ${definition.name}`);
      }
      parsedCustomFieldMove = { definition, parsed };
      const beforeValues = await this.prisma.taskCustomFieldValue.findMany({
        where: {
          taskId: id,
          field: { archivedAt: null },
        },
        include: {
          field: { select: { id: true, name: true, type: true, required: true, archivedAt: true, position: true } },
          option: { select: { id: true, label: true, value: true, color: true, archivedAt: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
      serializedBeforeCustomFieldValues = beforeValues.map((value) => this.serializeTaskCustomFieldValue(value));
    }

    const nextStatus =
      hasStatusPatch
        ? body.status!
        : task.status;
    const nextProgress =
      hasStatusPatch
        ? this.domain.deriveNormalizedTaskProgress({
            taskType: task.type,
            progress: task.progressPercent,
            status: body.status!,
            hasStatusOverride: true,
          })
        : task.progressPercent;
    const nextCompletedAt =
      hasStatusPatch
        ? nextStatus === TaskStatus.DONE
          ? task.completedAt ?? new Date()
          : null
        : task.completedAt;

    return this.prisma.$transaction(async (tx) => {
      const updateData: Prisma.TaskUncheckedUpdateManyInput = {
        version: { increment: 1 },
      };
      if (hasAssigneePatch) {
        updateData.assigneeUserId = body.assigneeUserId;
      }
      if (hasDrop || body.startAt !== undefined) {
        updateData.startAt = nextStartAt;
      }
      if (hasDrop || body.dueAt !== undefined) {
        updateData.dueAt = nextDueAt;
      }
      if (hasSectionPatch) {
        updateData.sectionId = body.sectionId;
      }
      if (hasStatusPatch) {
        updateData.status = nextStatus;
        updateData.progressPercent = nextProgress;
        updateData.completedAt = nextCompletedAt;
      }

      const updatedRows = await tx.task.updateMany({
        where: { id, deletedAt: null, version: body.version },
        data: updateData,
      });
      if (updatedRows.count === 0) {
        const latest = await tx.task.findFirstOrThrow({ where: { id, deletedAt: null } });
        throw new ConflictException({
          message: 'Version conflict',
          latest: {
            version: latest.version,
            assigneeUserId: latest.assigneeUserId,
            sectionId: latest.sectionId,
            status: latest.status,
            startAt: latest.startAt,
            dueAt: latest.dueAt,
          },
        });
      }

      if (parsedCustomFieldMove) {
        if (parsedCustomFieldMove.parsed === null) {
          await tx.taskCustomFieldValue.deleteMany({
            where: { taskId: id, fieldId: parsedCustomFieldMove.definition.id },
          });
        } else {
          const storage = this.toCustomFieldStorage(parsedCustomFieldMove.parsed);
          await tx.taskCustomFieldValue.upsert({
            where: { taskId_fieldId: { taskId: id, fieldId: parsedCustomFieldMove.definition.id } },
            create: {
              taskId: id,
              fieldId: parsedCustomFieldMove.definition.id,
              ...storage,
            },
            update: storage,
          });
        }
      }

      const updated = await tx.task.findFirstOrThrow({ where: { id, deletedAt: null } });
      let serializedCurrentCustomFieldValues: SerializedTaskCustomFieldValue[] | undefined;
      if (parsedCustomFieldMove) {
        const currentValues = await tx.taskCustomFieldValue.findMany({
          where: {
            taskId: id,
            field: { archivedAt: null },
          },
          include: {
            field: { select: { id: true, name: true, type: true, required: true, archivedAt: true, position: true } },
            option: { select: { id: true, label: true, value: true, color: true, archivedAt: true } },
          },
          orderBy: { createdAt: 'asc' },
        });
        serializedCurrentCustomFieldValues = currentValues.map((value) => this.serializeTaskCustomFieldValue(value));
      }
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: id,
        action: 'task.timeline.moved',
        beforeJson: {
          version: task.version,
          assigneeUserId: task.assigneeUserId,
          sectionId: task.sectionId,
          status: task.status,
          startAt: task.startAt,
          dueAt: task.dueAt,
          ...(parsedCustomFieldMove ? { customFieldValues: serializedBeforeCustomFieldValues } : {}),
        },
        afterJson: {
          version: updated.version,
          assigneeUserId: updated.assigneeUserId,
          sectionId: updated.sectionId,
          status: updated.status,
          startAt: updated.startAt,
          dueAt: updated.dueAt,
          ...(serializedCurrentCustomFieldValues ? { customFieldValues: serializedCurrentCustomFieldValues } : {}),
        },
        correlationId: req.correlationId,
        outboxType: 'task.timeline.moved',
        payload: {
          taskId: id,
          projectId: task.projectId,
          version: updated.version,
          assigneeUserId: updated.assigneeUserId,
          sectionId: updated.sectionId,
          status: updated.status,
          startAt: updated.startAt,
          dueAt: updated.dueAt,
          movedByDrop: hasDrop,
          ...(body.customFieldMove ? { customFieldMove: body.customFieldMove } : {}),
        },
      });
      return {
        updated,
        customFieldValues: serializedCurrentCustomFieldValues,
      };
    }).then((updated) => {
      void this.reindexTaskById(updated.updated.id);
      return updated.customFieldValues
        ? { ...updated.updated, customFieldValues: updated.customFieldValues }
        : updated.updated;
    });
  }

  @Patch('tasks/:id/custom-fields')
  async patchCustomFields(
    @Param('id') id: string,
    @Body() body: PatchTaskCustomFieldsDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);

    if (body.version !== task.version) {
      throw new ConflictException({
        message: 'Version conflict',
        latestVersion: task.version,
      });
    }

    const seenFieldIds = new Set<string>();
    for (const entry of body.values) {
      if (!Object.prototype.hasOwnProperty.call(entry, 'value')) {
        throw new ConflictException(`value is required for field ${entry.fieldId}`);
      }
      if (seenFieldIds.has(entry.fieldId)) {
        throw new ConflictException(`Duplicate field update: ${entry.fieldId}`);
      }
      seenFieldIds.add(entry.fieldId);
    }

    const targetFieldIds = [...seenFieldIds];
    const definitions = await this.prisma.customFieldDefinition.findMany({
      where: {
        id: { in: targetFieldIds },
        projectId: task.projectId,
        archivedAt: null,
      },
      include: {
        options: {
          where: { archivedAt: null },
        },
      },
    });
    if (definitions.length !== targetFieldIds.length) {
      throw new ConflictException('Unknown or archived custom field definition');
    }
    const definitionById = new Map(definitions.map((definition) => [definition.id, definition]));

    const parsedUpdates = body.values.map((entry) => {
      const definition = definitionById.get(entry.fieldId);
      if (!definition) throw new ConflictException(`Unknown custom field: ${entry.fieldId}`);
      const parsed = parseCustomFieldValue(
        {
          id: definition.id,
          type: definition.type,
          archivedAt: definition.archivedAt,
          options: definition.options.map((option) => ({
            id: option.id,
            value: option.value,
            archivedAt: option.archivedAt,
          })),
        },
        entry.value,
      );
      if (definition.required && parsed === null) {
        throw new ConflictException(`Required custom field cannot be empty: ${definition.name}`);
      }
      return { definition, parsed };
    });

    const beforeValues = await this.prisma.taskCustomFieldValue.findMany({
      where: {
        taskId: id,
        field: { archivedAt: null },
      },
      include: {
        field: { select: { id: true, name: true, type: true, required: true, archivedAt: true, position: true } },
        option: { select: { id: true, label: true, value: true, color: true, archivedAt: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const serializedBefore = beforeValues.map((value) => this.serializeTaskCustomFieldValue(value));

    return this.prisma.$transaction(async (tx) => {
      for (const update of parsedUpdates) {
        if (update.parsed === null) {
          await tx.taskCustomFieldValue.deleteMany({
            where: { taskId: id, fieldId: update.definition.id },
          });
          continue;
        }
        const storage = this.toCustomFieldStorage(update.parsed);
        await tx.taskCustomFieldValue.upsert({
          where: { taskId_fieldId: { taskId: id, fieldId: update.definition.id } },
          create: {
            taskId: id,
            fieldId: update.definition.id,
            ...storage,
          },
          update: storage,
        });
      }

      const updatedTask = await tx.task.update({
        where: { id },
        data: { version: { increment: 1 } },
      });

      const currentValues = await tx.taskCustomFieldValue.findMany({
        where: {
          taskId: id,
          field: { archivedAt: null },
        },
        include: {
          field: { select: { id: true, name: true, type: true, required: true, archivedAt: true, position: true } },
          option: { select: { id: true, label: true, value: true, color: true, archivedAt: true } },
        },
        orderBy: { createdAt: 'asc' },
      });
      const serializedCurrent = currentValues.map((value) => this.serializeTaskCustomFieldValue(value));

      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: id,
        action: 'task.custom_fields.updated',
        beforeJson: { customFieldValues: serializedBefore, version: task.version },
        afterJson: { customFieldValues: serializedCurrent, version: updatedTask.version },
        correlationId: req.correlationId,
        outboxType: 'task.custom_fields.updated',
        payload: {
          taskId: id,
          projectId: task.projectId,
          version: updatedTask.version,
          customFieldValues: serializedCurrent,
        },
      });

      await this.applyProgressRules(tx, id, req.correlationId);
      const finalTask = await tx.task.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          version: true,
          status: true,
          progressPercent: true,
          completedAt: true,
        },
      });

      return {
        id: finalTask.id,
        version: finalTask.version,
        status: finalTask.status,
        progressPercent: finalTask.progressPercent,
        completedAt: finalTask.completedAt,
        customFieldValues: serializedCurrent,
      };
    }).then((updated) => {
      void this.reindexTaskById(updated.id);
      return updated;
    });
  }

  @Post('tasks/:id/complete')
  async complete(@Param('id') id: string, @Body() body: CompleteTaskDto, @CurrentRequest() req: AppRequest) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);

    return this.prisma.$transaction(async (tx) => {
      const unitOfWork = createTaskLifecycleUnitOfWorkFromTx(tx);
      const lifecycleResult = await completeTaskLifecycle(
        {
          taskId: id,
          done: body.done,
          expectedVersion: body.version,
          force: body.force,
        },
        unitOfWork,
      ).catch((error: unknown) => {
        if (error instanceof DomainNotFoundError) {
          throw new NotFoundException(error.message);
        }
        if (error instanceof DomainConflictError) {
          if (error.code === 'INCOMPLETE_SUBTASKS') {
            throw new ConflictException({
              message: error.message,
              code: error.code,
              openSubtaskCount: error.details?.openSubtaskCount,
            });
          }
          throw new ConflictException('Version conflict');
        }
        throw error;
      });
      const updated = await tx.task.findUniqueOrThrow({ where: { id } });

      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: id,
        action: lifecycleResult.action,
        beforeJson: lifecycleResult.previous,
        afterJson: updated,
        correlationId: req.correlationId,
        outboxType: lifecycleResult.action,
        payload: {
          taskId: id,
          projectId: task.projectId,
          done: body.done,
          status: updated.status,
          progressPercent: updated.progressPercent,
        },
      });
      await this.applyProgressRules(tx, id, req.correlationId);
      return updated;
    }).then((updated) => {
      void this.indexTaskWithCustomFields(updated);
      return updated;
    });
  }

  @Delete('tasks/:id')
  async remove(@Param('id') id: string, @CurrentRequest() req: AppRequest) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);
    if (task.deletedAt) return { success: true };

    return this.prisma.$transaction(async (tx) => {
      const subtreeIds = await this.collectSubtreeIds(tx, id);
      const now = new Date();
      const beforeTasks = await tx.task.findMany({
        where: { id: { in: subtreeIds } },
      });
      await tx.task.updateMany({
        where: { id: { in: subtreeIds } },
        data: { deletedAt: now, deletedByUserId: req.user.sub, updatedAt: now, version: { increment: 1 } },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: id,
        action: 'task.deleted',
        beforeJson: { taskIds: subtreeIds, tasks: beforeTasks },
        afterJson: { deletedAt: now, deletedByUserId: req.user.sub },
        correlationId: req.correlationId,
        outboxType: 'task.deleted',
        payload: { taskId: id, taskIds: subtreeIds, projectId: task.projectId, sectionId: task.sectionId },
      });
      return { success: true, deletedCount: subtreeIds.length, taskIds: subtreeIds };
    }).then((result) => {
      void this.removeTasksFromSearch(result.taskIds);
      return result;
    });
  }

  @Post('tasks/:id/restore')
  async restore(@Param('id') id: string, @CurrentRequest() req: AppRequest) {
    const task = await this.prisma.task.findUniqueOrThrow({ where: { id } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);
    if (!task.deletedAt) return task;

    return this.prisma.$transaction(async (tx) => {
      const subtreeIds = await this.collectSubtreeIds(tx, id, true);
      const restored = await tx.task.updateMany({
        where: { id: { in: subtreeIds } },
        data: { deletedAt: null, deletedByUserId: null, version: { increment: 1 } },
      });
      const updatedTask = await tx.task.findUniqueOrThrow({ where: { id } });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: id,
        action: 'task.restored',
        beforeJson: { taskIds: subtreeIds },
        afterJson: { restoredCount: restored.count },
        correlationId: req.correlationId,
        outboxType: 'task.restored',
        payload: { taskId: id, taskIds: subtreeIds, restoredCount: restored.count },
      });
      return { task: updatedTask, taskIds: subtreeIds };
    }).then((restoredTask) => {
      void this.reindexTasks(restoredTask.taskIds);
      return restoredTask.task;
    });
  }

  @Patch('tasks/:id/description')
  async patchDescription(
    @Param('id') id: string,
    @Body() body: PatchDescriptionDto,
    @CurrentRequest() req: AppRequest,
  ) {
    this.validateDescriptionDoc(body.descriptionDoc);
    const task = await this.prisma.task.findUniqueOrThrow({ where: { id } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);

    if (task.descriptionVersion !== body.expectedVersion) {
      throw new ConflictException({
        message: 'Description version conflict',
        latest: {
          descriptionDoc: task.descriptionDoc,
          descriptionVersion: task.descriptionVersion,
          descriptionUpdatedAt: task.descriptionUpdatedAt,
        },
      });
    }

    const descriptionText = this.extractPlainTextFromDoc(body.descriptionDoc).slice(0, MAX_DESCRIPTION_TEXT_LENGTH);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id },
        data: {
          descriptionDoc: body.descriptionDoc as Prisma.InputJsonValue,
          descriptionText,
          descriptionUpdatedAt: new Date(),
          descriptionVersion: { increment: 1 },
          version: { increment: 1 },
        },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: id,
        action: 'task.description.updated',
        beforeJson: {
          descriptionDoc: task.descriptionDoc,
          descriptionVersion: task.descriptionVersion,
          descriptionText: task.descriptionText,
        },
        afterJson: {
          descriptionDoc: updated.descriptionDoc,
          descriptionVersion: updated.descriptionVersion,
          descriptionText: updated.descriptionText,
        },
        correlationId: req.correlationId,
        outboxType: 'task.description.updated',
        payload: { taskId: id, descriptionVersion: updated.descriptionVersion },
      });
      await this.syncTaskMentions(
        tx,
        {
          taskId: id,
          sourceType: 'description',
          sourceId: '',
          mentionedUserIds: this.extractMentionUserIdsFromDoc(body.descriptionDoc),
        },
        req,
      );
      return updated;
    });
  }

  @Get('tasks/:id/mentions')
  async listMentions(@Param('id') taskId: string, @CurrentRequest() req: AppRequest) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id: taskId, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.VIEWER);

    const mentions = await this.prisma.taskMention.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: mentions.map((item) => item.mentionedUserId) } },
    });
    const userMap = new Map(users.map((user) => [user.id, user]));
    return mentions.map((mention) => ({
      ...mention,
      user: userMap.get(mention.mentionedUserId)
        ? {
            id: mention.mentionedUserId,
            displayName:
              userMap.get(mention.mentionedUserId)?.displayName ??
              userMap.get(mention.mentionedUserId)?.email ??
              mention.mentionedUserId,
            email: userMap.get(mention.mentionedUserId)?.email ?? null,
          }
        : null,
    }));
  }

  @Get('tasks/:id/comments')
  async listComments(@Param('id') taskId: string, @CurrentRequest() req: AppRequest) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id: taskId, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.VIEWER);
    const comments = await this.prisma.taskComment.findMany({
      where: { taskId, deletedAt: null },
      include: { task: { select: { projectId: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const users = await this.prisma.user.findMany({
      where: { id: { in: comments.map((comment) => comment.authorUserId) } },
    });
    const usersById = new Map(users.map((user) => [user.id, user]));

    return comments.map((comment) => {
      const user = usersById.get(comment.authorUserId);
      return {
        id: comment.id,
        taskId: comment.taskId,
        authorUserId: comment.authorUserId,
        body: comment.body,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        deletedAt: comment.deletedAt,
        author: {
          id: comment.authorUserId,
          displayName: user?.displayName ?? user?.email ?? comment.authorUserId,
          email: user?.email ?? null,
        },
      };
    });
  }

  @Post('tasks/:id/comments')
  async createComment(
    @Param('id') taskId: string,
    @Body() body: CreateTaskCommentDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id: taskId, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);
    const trimmedBody = body.body.trim();
    if (!trimmedBody) throw new ConflictException('Comment body cannot be empty');
    if (trimmedBody.length > MAX_COMMENT_BODY_LENGTH) throw new ConflictException('Comment is too long');

    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.taskComment.create({
        data: {
          taskId,
          authorUserId: req.user.sub,
          body: trimmedBody,
        },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: taskId,
        action: 'task.comment.created',
        afterJson: comment,
        correlationId: req.correlationId,
        outboxType: 'task.comment.created',
        payload: { taskId, commentId: comment.id },
      });
      await this.syncTaskMentions(
        tx,
        {
          taskId,
          sourceType: 'comment',
          sourceId: comment.id,
          mentionedUserIds: this.extractMentionUserIdsFromComment(trimmedBody),
        },
        req,
      );

      const taskAssigneeId = task.assigneeUserId;
      const assigneeShouldBeNotified = taskAssigneeId && taskAssigneeId !== req.user.sub;
      if (assigneeShouldBeNotified) {
        await this.notifications.createCommentNotification(tx, {
          userId: taskAssigneeId,
          projectId: task.projectId,
          taskId,
          commentId: comment.id,
          triggeredByUserId: req.user.sub,
          actor: req.user.sub,
          correlationId: req.correlationId,
        });
      }

      return comment;
    });
  }

  @Patch('comments/:id')
  async patchComment(
    @Param('id') id: string,
    @Body() body: PatchTaskCommentDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const comment = await this.prisma.taskComment.findUniqueOrThrow({ where: { id }, include: { task: true } });
    await this.domain.requireProjectRole(comment.task.projectId, req.user.sub, ProjectRole.MEMBER);
    if (comment.deletedAt) throw new NotFoundException('Comment not found');
    if (comment.authorUserId !== req.user.sub) throw new ForbiddenException('Can only edit your own comment');
    const trimmedBody = body.body.trim();
    if (!trimmedBody) throw new ConflictException('Comment body cannot be empty');
    if (trimmedBody.length > MAX_COMMENT_BODY_LENGTH) throw new ConflictException('Comment is too long');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.taskComment.update({
        where: { id },
        data: { body: trimmedBody },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: comment.taskId,
        action: 'task.comment.updated',
        beforeJson: comment,
        afterJson: updated,
        correlationId: req.correlationId,
        outboxType: 'task.comment.updated',
        payload: { taskId: comment.taskId, commentId: id },
      });
      await this.syncTaskMentions(
        tx,
        {
          taskId: comment.taskId,
          sourceType: 'comment',
          sourceId: id,
          mentionedUserIds: this.extractMentionUserIdsFromComment(trimmedBody),
        },
        req,
      );
      return updated;
    });
  }

  @Delete('comments/:id')
  async deleteComment(@Param('id') id: string, @CurrentRequest() req: AppRequest) {
    const comment = await this.prisma.taskComment.findUniqueOrThrow({ where: { id }, include: { task: true } });
    await this.domain.requireProjectRole(comment.task.projectId, req.user.sub, ProjectRole.MEMBER);
    if (comment.deletedAt) return comment;
    if (comment.authorUserId !== req.user.sub) throw new ForbiddenException('Can only delete your own comment');

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.taskComment.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      const existingMentions = await tx.taskMention.findMany({
        where: { taskId: comment.taskId, sourceType: 'comment', sourceId: id },
      });
      if (existingMentions.length) {
        await tx.taskMention.deleteMany({
          where: { id: { in: existingMentions.map((item) => item.id) } },
        });
        for (const mention of existingMentions) {
          await this.domain.appendAuditOutbox({
            tx,
            actor: req.user.sub,
            entityType: 'Task',
            entityId: comment.taskId,
            action: 'task.mention.deleted',
            beforeJson: mention,
            correlationId: req.correlationId,
            outboxType: 'task.mention.deleted',
            payload: {
              taskId: comment.taskId,
              mentionedUserId: mention.mentionedUserId,
              sourceType: 'comment',
              sourceId: id,
            },
          });
        }
      }
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: comment.taskId,
        action: 'task.comment.deleted',
        beforeJson: comment,
        afterJson: deleted,
        correlationId: req.correlationId,
        outboxType: 'task.comment.deleted',
        payload: { taskId: comment.taskId, commentId: id },
      });
      return deleted;
    });
  }

  @Get('tasks/:id/attachments')
  async listAttachments(
    @Param('id') taskId: string,
    @Query('includeDeleted') includeDeletedRaw: string | undefined,
    @CurrentRequest() req: AppRequest,
  ) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id: taskId, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.VIEWER);
    const includeDeleted = String(includeDeletedRaw ?? '').toLowerCase() === 'true';
    const where: Prisma.TaskAttachmentWhereInput = {
      taskId,
      completedAt: { not: null },
      ...(includeDeleted ? {} : { deletedAt: null }),
    };
    const attachments = await this.prisma.taskAttachment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return attachments.map((item) => ({
      ...item,
      url: `/public/attachments/${item.id}/${item.uploadToken}`,
    }));
  }

  @Post('tasks/:id/attachments/initiate')
  async initiateAttachment(
    @Param('id') taskId: string,
    @Body() body: InitiateAttachmentDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id: taskId, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);
    if (!IMAGE_MIME_ALLOWLIST.has(body.mimeType)) {
      throw new ConflictException('Unsupported image mime type');
    }
    if (body.sizeBytes > MAX_IMAGE_UPLOAD_BYTES) {
      throw new ConflictException('Image too large');
    }

    const uploadToken = randomBytes(16).toString('hex');
    const storageKey = `${taskId}/${randomUUID()}-${this.sanitizeFileName(body.fileName)}`;
    const attachment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.taskAttachment.create({
        data: {
          taskId,
          uploaderUserId: req.user.sub,
          fileName: this.sanitizeFileName(body.fileName),
          mimeType: body.mimeType,
          sizeBytes: body.sizeBytes,
          storageKey,
          uploadToken,
        },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: taskId,
        action: 'task.attachment.initiated',
        afterJson: created,
        correlationId: req.correlationId,
        outboxType: 'task.attachment.initiated',
        payload: { taskId, attachmentId: created.id },
      });
      return created;
    });

    return {
      attachmentId: attachment.id,
      uploadUrl: `/attachments/${attachment.id}/upload?token=${uploadToken}`,
      maxBytes: MAX_IMAGE_UPLOAD_BYTES,
    };
  }

  @Post('attachments/:id/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES },
    }),
  )
  async uploadAttachment(
    @Param('id') id: string,
    @Query('token') token: string,
    @UploadedFile() file: { mimetype: string; size: number; buffer: Buffer },
    @CurrentRequest() req: AppRequest,
  ) {
    if (!token) throw new ConflictException('Missing upload token');
    const attachment = await this.prisma.taskAttachment.findUniqueOrThrow({
      where: { id },
      include: { task: true },
    });
    await this.domain.requireProjectRole(attachment.task.projectId, req.user.sub, ProjectRole.MEMBER);
    if (!attachment.uploadToken || attachment.uploadToken !== token) {
      throw new ForbiddenException('Invalid upload token');
    }
    if (!file) throw new ConflictException('Missing file');
    if (!IMAGE_MIME_ALLOWLIST.has(file.mimetype)) throw new ConflictException('Unsupported image mime type');
    if (file.size <= 0 || file.size > MAX_IMAGE_UPLOAD_BYTES) throw new ConflictException('Image too large');

    const diskPath = resolveAttachmentPath(attachment.storageKey);
    await fs.mkdir(dirname(diskPath), { recursive: true });
    await fs.writeFile(diskPath, file.buffer);

    await this.prisma.taskAttachment.update({
      where: { id: attachment.id },
      data: { sizeBytes: file.size, mimeType: file.mimetype },
    });
    return { ok: true };
  }

  @Post('tasks/:id/attachments/complete')
  async completeAttachment(
    @Param('id') taskId: string,
    @Body() body: CompleteAttachmentDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id: taskId, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);
    const attachment = await this.prisma.taskAttachment.findUniqueOrThrow({
      where: { id: body.attachmentId },
    });
    if (attachment.taskId !== taskId) throw new ConflictException('Attachment does not belong to task');
    if (attachment.deletedAt) throw new NotFoundException('Attachment not found');

    const diskPath = resolveAttachmentPath(attachment.storageKey);
    const stat = await fs.stat(diskPath).catch(() => null);
    if (!stat) throw new ConflictException('Attachment upload not found');

    const accessToken = randomBytes(16).toString('hex');
    return this.prisma.$transaction(async (tx) => {
      const completed = await tx.taskAttachment.update({
        where: { id: attachment.id },
        data: { completedAt: new Date(), uploadToken: accessToken, sizeBytes: Number(stat.size) },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: taskId,
        action: 'task.attachment.created',
        afterJson: completed,
        correlationId: req.correlationId,
        outboxType: 'task.attachment.created',
        payload: { taskId, attachmentId: completed.id },
      });
      return {
        ...completed,
        url: `/public/attachments/${completed.id}/${accessToken}`,
      };
    });
  }

  @Delete('attachments/:id')
  async deleteAttachment(@Param('id') id: string, @CurrentRequest() req: AppRequest) {
    const attachment = await this.prisma.taskAttachment.findUniqueOrThrow({
      where: { id },
      include: { task: true },
    });
    await this.domain.requireProjectRole(attachment.task.projectId, req.user.sub, ProjectRole.MEMBER);
    if (attachment.deletedAt) return attachment;
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.taskAttachment.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: attachment.taskId,
        action: 'task.attachment.deleted',
        beforeJson: attachment,
        afterJson: deleted,
        correlationId: req.correlationId,
        outboxType: 'task.attachment.deleted',
        payload: { taskId: attachment.taskId, attachmentId: id },
      });
      return deleted;
    });
  }

  @Post('attachments/:id/restore')
  async restoreAttachment(@Param('id') id: string, @CurrentRequest() req: AppRequest) {
    const attachment = await this.prisma.taskAttachment.findUniqueOrThrow({
      where: { id },
      include: { task: true },
    });
    await this.domain.requireProjectRole(attachment.task.projectId, req.user.sub, ProjectRole.MEMBER);
    if (!attachment.deletedAt) return attachment;
    return this.prisma.$transaction(async (tx) => {
      const restored = await tx.taskAttachment.update({
        where: { id },
        data: { deletedAt: null },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: attachment.taskId,
        action: 'task.attachment.restored',
        beforeJson: attachment,
        afterJson: restored,
        correlationId: req.correlationId,
        outboxType: 'task.attachment.restored',
        payload: { taskId: attachment.taskId, attachmentId: id },
      });
      return restored;
    });
  }

  @Get('tasks/:id/reminder')
  async getMyReminder(@Param('id') taskId: string, @CurrentRequest() req: AppRequest) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id: taskId, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.VIEWER);
    const reminder = await this.prisma.taskReminder.findFirst({
      where: { taskId, userId: req.user.sub, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return reminder ?? null;
  }

  @Put('tasks/:id/reminder')
  async upsertMyReminder(
    @Param('id') taskId: string,
    @Body() body: UpsertTaskReminderDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id: taskId, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);
    const remindAt = new Date(body.remindAt);
    if (Number.isNaN(+remindAt)) throw new ConflictException('Invalid remindAt');

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.taskReminder.findFirst({
        where: { taskId, userId: req.user.sub, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      const reminder = current
        ? await tx.taskReminder.update({
            where: { id: current.id },
            data: { remindAt, deletedAt: null },
          })
        : await tx.taskReminder.create({
            data: { taskId, userId: req.user.sub, remindAt },
          });

      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: taskId,
        action: 'task.reminder.set',
        beforeJson: current,
        afterJson: reminder,
        correlationId: req.correlationId,
        outboxType: 'task.reminder.set',
        payload: { taskId, userId: req.user.sub, remindAt: reminder.remindAt },
      });
      return reminder;
    });
  }

  @Delete('tasks/:id/reminder')
  async clearMyReminder(@Param('id') taskId: string, @CurrentRequest() req: AppRequest) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id: taskId, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);
    const current = await this.prisma.taskReminder.findFirst({
      where: { taskId, userId: req.user.sub, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!current) return { ok: true };

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.taskReminder.update({
        where: { id: current.id },
        data: { deletedAt: new Date() },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: taskId,
        action: 'task.reminder.cleared',
        beforeJson: current,
        afterJson: deleted,
        correlationId: req.correlationId,
        outboxType: 'task.reminder.cleared',
        payload: { taskId, userId: req.user.sub },
      });
      return deleted;
    });
  }

  @Post('tasks/bulk')
  async bulk(@Body() body: BulkTaskDto, @CurrentRequest() req: AppRequest) {
    const tasks = await this.prisma.task.findMany({ where: { id: { in: body.taskIds }, deletedAt: null } });
    if (!tasks.length) return { count: 0 };
    const firstTask = tasks[0];
    if (!firstTask) return { count: 0 };
    const projectId = firstTask.projectId;
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.MEMBER);

    return this.prisma.$transaction(async (tx) => {
      const updated = [] as unknown[];
      for (const task of tasks) {
        const requestedStatus = body.status ?? task.status;
        const progress = this.domain.deriveNormalizedTaskProgress({
          taskType: task.type,
          progress: body.progressPercent ?? task.progressPercent,
          status: requestedStatus,
          hasStatusOverride: body.status !== undefined,
        });
        const canAutomateProgress = Number.isInteger(progress) && progress >= 0 && progress <= 100;
        const progressAutomation =
          body.status === undefined && canAutomateProgress
            ? this.domain.deriveTaskProgressAutomation(progress, task.status, task.completedAt)
            : null;
        const status = body.status ?? progressAutomation?.status ?? task.status;
        const completedAt =
          status === TaskStatus.DONE
            ? task.completedAt ?? progressAutomation?.completedAt ?? new Date()
            : null;

        const next = await tx.task.update({
          where: { id: task.id },
          data: {
            status,
            assigneeUserId: body.assigneeUserId,
            tags: body.tags,
            progressPercent: progress,
            completedAt,
            version: { increment: 1 },
          },
        });
        updated.push(next);
        await this.domain.appendAuditOutbox({
          tx,
          actor: req.user.sub,
          entityType: 'Task',
          entityId: task.id,
          action: 'task.bulk.updated',
          beforeJson: task,
          afterJson: next,
          correlationId: req.correlationId,
          outboxType: 'task.updated',
          payload: next,
        });
        await this.applyProgressRules(tx, task.id, req.correlationId);
      }
      return { count: updated.length };
    });
  }

  @Post('sections/:sectionId/tasks/reorder')
  async reorder(
    @Param('sectionId') targetSectionId: string,
    @Body() body: ReorderTaskDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id: body.taskId, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);
    if (body.expectedVersion && body.expectedVersion !== task.version) {
      const sectionTasks = await this.prisma.task.findMany({
        where: { projectId: task.projectId, sectionId: targetSectionId, deletedAt: null },
        orderBy: { position: 'asc' },
      });
      throw new ConflictException({ message: 'Version conflict', sectionTasks });
    }

    return this.prisma.$transaction(async (tx) => {
      const siblings = await tx.task.findMany({
        where: { projectId: task.projectId, sectionId: targetSectionId, id: { not: task.id }, deletedAt: null },
        orderBy: { position: 'asc' },
      });
      const before = body.beforeTaskId ? siblings.find((t) => t.id === body.beforeTaskId) : undefined;
      const after = body.afterTaskId ? siblings.find((t) => t.id === body.afterTaskId) : undefined;

      let newPosition: number;
      if (!before && !after) {
        const last = siblings.at(-1);
        newPosition = last ? last.position + 1000 : 1000;
      } else if (!before && after) {
        newPosition = after.position - 1000;
      } else if (before && !after) {
        newPosition = before.position + 1000;
      } else {
        newPosition = Math.floor((before!.position + after!.position) / 2);
      }

      if (siblings.some((t) => t.position === newPosition) || (before && after && before.position + 1 >= after.position)) {
        const rebalance = await tx.task.findMany({
          where: { projectId: task.projectId, sectionId: targetSectionId, id: { not: task.id }, deletedAt: null },
          orderBy: { position: 'asc' },
        });
        for (const [i, item] of rebalance.entries()) {
          await tx.task.update({ where: { id: item.id }, data: { position: (i + 1) * 1000 } });
        }
        const refreshedBefore = body.beforeTaskId
          ? await tx.task.findFirst({ where: { id: body.beforeTaskId, deletedAt: null } })
          : null;
        const refreshedAfter = body.afterTaskId
          ? await tx.task.findFirst({ where: { id: body.afterTaskId, deletedAt: null } })
          : null;
        if (refreshedBefore && refreshedAfter) newPosition = Math.floor((refreshedBefore.position + refreshedAfter.position) / 2);
        else if (refreshedBefore) newPosition = refreshedBefore.position + 1000;
        else if (refreshedAfter) newPosition = refreshedAfter.position - 1000;
        else newPosition = (rebalance.length + 1) * 1000;
      }

      const updated = await tx.task.update({
        where: { id: task.id },
        data: {
          sectionId: targetSectionId,
          position: newPosition,
          version: { increment: 1 },
        },
      });

      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: task.id,
        action: 'task.reordered',
        beforeJson: task,
        afterJson: updated,
        correlationId: req.correlationId,
        outboxType: 'task.reordered',
        payload: { taskId: task.id, fromSectionId: task.sectionId, toSectionId: targetSectionId, position: newPosition },
      });

      const sectionTasks = await tx.task.findMany({
        where: { sectionId: targetSectionId, projectId: task.projectId, deletedAt: null },
        orderBy: { position: 'asc' },
      });
      return { task: updated, sectionTasks };
    });
  }

  // Subtask endpoints
  @Post('tasks/:id/subtasks')
  async createSubtask(@Param('id') parentId: string, @Body() body: CreateSubtaskDto, @CurrentRequest() req: AppRequest) {
    const parentTask = await this.prisma.task.findFirstOrThrow({ where: { id: parentId, deletedAt: null } });
    await this.domain.requireProjectRole(parentTask.projectId, req.user.sub, ProjectRole.MEMBER);
    assertValidDateRange(body.startAt, body.dueAt);

    const topTask = await this.prisma.task.findFirst({
      where: { projectId: parentTask.projectId, sectionId: parentTask.sectionId, deletedAt: null },
      orderBy: { position: 'asc' },
    });
    const position = (topTask?.position ?? 1000) - 1000;

    const taskData = {
      ...body,
      projectId: parentTask.projectId,
      sectionId: parentTask.sectionId,
      position,
      startAt: body.startAt ? new Date(body.startAt) : null,
      dueAt: body.dueAt ? new Date(body.dueAt) : null,
    };
    return this.subtaskService.createSubtask(parentId, taskData);
  }

  @Get('tasks/:id/subtasks')
  async getSubtasks(@Param('id') taskId: string, @CurrentRequest() req: AppRequest) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id: taskId, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.VIEWER);
    return this.subtaskService.getSubtasks(taskId);
  }

  @Get('tasks/:id/subtasks/tree')
  async getSubtaskTree(@Param('id') taskId: string, @CurrentRequest() req: AppRequest) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id: taskId, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.VIEWER);
    return this.subtaskService.getSubtaskTree(taskId);
  }

  @Get('tasks/:id/breadcrumbs')
  async getBreadcrumbs(@Param('id') taskId: string, @CurrentRequest() req: AppRequest) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id: taskId, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.VIEWER);
    return this.subtaskService.getBreadcrumbPath(taskId);
  }

  // Dependency endpoints
  @Post('tasks/:id/dependencies')
  async addDependency(@Param('id') taskId: string, @Body() body: AddDependencyDto, @CurrentRequest() req: AppRequest) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id: taskId, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);
    return this.subtaskService.addDependency(taskId, body.dependsOnId, body.type, req.user.sub, req.correlationId);
  }

  @Delete('tasks/:id/dependencies/:dependsOnId')
  async removeDependency(@Param('id') taskId: string, @Param('dependsOnId') dependsOnId: string, @CurrentRequest() req: AppRequest) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id: taskId, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);
    await this.subtaskService.removeDependencyWithAudit(taskId, dependsOnId, req.user.sub, req.correlationId);
    return { success: true };
  }

  @Get('tasks/:id/dependencies')
  async getDependencies(@Param('id') taskId: string, @CurrentRequest() req: AppRequest) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id: taskId, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.VIEWER);
    return this.subtaskService.getDependencies(taskId);
  }

  @Get('tasks/:id/dependents')
  async getDependents(@Param('id') taskId: string, @CurrentRequest() req: AppRequest) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id: taskId, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.VIEWER);
    return this.subtaskService.getDependents(taskId);
  }

  @Get('tasks/:id/blocked')
  async isBlocked(@Param('id') taskId: string, @CurrentRequest() req: AppRequest) {
    const task = await this.prisma.task.findFirstOrThrow({ where: { id: taskId, deletedAt: null } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.VIEWER);
    const blocked = await this.subtaskService.isBlocked(taskId);
    return { blocked };
  }

  @Get('projects/:id/dependency-graph')
  async getDependencyGraph(@Param('id') projectId: string, @CurrentRequest() req: AppRequest) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.VIEWER);
    return this.subtaskService.getDependencyGraph(projectId);
  }

  private toTaskCustomFieldFilterWhere(filter: TaskCustomFieldFilter): Prisma.TaskWhereInput {
    if (filter.type === 'SELECT') {
      return {
        customFieldValues: {
          some: {
            fieldId: filter.fieldId,
            field: { archivedAt: null, type: CustomFieldType.SELECT },
            optionId: { in: filter.optionIds },
          },
        },
      };
    }
    if (filter.type === 'BOOLEAN') {
      return {
        customFieldValues: {
          some: {
            fieldId: filter.fieldId,
            field: { archivedAt: null, type: CustomFieldType.BOOLEAN },
            valueBoolean: filter.booleanValue,
          },
        },
      };
    }
    if (filter.type === 'NUMBER') {
      return {
        customFieldValues: {
          some: {
            fieldId: filter.fieldId,
            field: { archivedAt: null, type: CustomFieldType.NUMBER },
            valueNumber: {
              gte: filter.numberMin ?? undefined,
              lte: filter.numberMax ?? undefined,
            },
          },
        },
      };
    }
    return {
      customFieldValues: {
        some: {
          fieldId: filter.fieldId,
          field: { archivedAt: null, type: CustomFieldType.DATE },
          valueDate: {
            gte: filter.dateFrom ? new Date(filter.dateFrom) : undefined,
            lte: filter.dateTo ? new Date(filter.dateTo) : undefined,
          },
        },
      },
    };
  }

  private sortHydratedTasksByCustomField(
    tasks: Array<Record<string, unknown> & { id: string; customFieldValues: SerializedTaskCustomFieldValue[] }>,
    fieldId: string,
    order: 'asc' | 'desc',
  ) {
    const direction = order === 'desc' ? -1 : 1;
    const decorated = tasks.map((task, index) => ({
      task,
      index,
      value: this.getCustomFieldComparableValue(task.customFieldValues, fieldId),
    }));
    decorated.sort((left, right) => {
      if (left.value === null && right.value === null) return left.index - right.index;
      if (left.value === null) return 1;
      if (right.value === null) return -1;
      if (left.value < right.value) return -1 * direction;
      if (left.value > right.value) return 1 * direction;
      return left.index - right.index;
    });
    return decorated.map((entry) => entry.task);
  }

  private getCustomFieldComparableValue(values: SerializedTaskCustomFieldValue[], fieldId: string) {
    const value = values.find((entry) => entry.fieldId === fieldId);
    if (!value?.field) return null;
    if (value.field.type === CustomFieldType.NUMBER) return value.valueNumber;
    if (value.field.type === CustomFieldType.DATE) {
      return value.valueDate ? new Date(value.valueDate).getTime() : null;
    }
    if (value.field.type === CustomFieldType.BOOLEAN) {
      if (typeof value.valueBoolean !== 'boolean') return null;
      return value.valueBoolean ? 1 : 0;
    }
    if (value.field.type === CustomFieldType.SELECT) {
      return (value.option?.label ?? value.valueText ?? '').toLowerCase() || null;
    }
    return (value.valueText ?? '').toLowerCase() || null;
  }

  private async hydrateTasksWithCustomFieldValues(
    tasks: Array<Record<string, unknown> & { id: string }>,
  ): Promise<Array<Record<string, unknown> & { id: string; customFieldValues: SerializedTaskCustomFieldValue[] }>> {
    if (!tasks.length) return tasks.map((task) => ({ ...task, customFieldValues: [] }));
    const taskIds = tasks.map((task) => task.id);
    const values = await this.prisma.taskCustomFieldValue.findMany({
      where: {
        taskId: { in: taskIds },
        field: { archivedAt: null },
      },
      include: {
        field: { select: { id: true, name: true, type: true, required: true, archivedAt: true, position: true } },
        option: { select: { id: true, label: true, value: true, color: true, archivedAt: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const byTaskId = new Map<string, SerializedTaskCustomFieldValue[]>();
    for (const value of values) {
      const serialized = this.serializeTaskCustomFieldValue(value);
      const bucket = byTaskId.get(value.taskId);
      if (bucket) {
        bucket.push(serialized);
      } else {
        byTaskId.set(value.taskId, [serialized]);
      }
    }
    for (const bucket of byTaskId.values()) {
      bucket.sort((a, b) => {
        const left = a.field?.position ?? Number.MAX_SAFE_INTEGER;
        const right = b.field?.position ?? Number.MAX_SAFE_INTEGER;
        if (left === right) return a.fieldId.localeCompare(b.fieldId);
        return left - right;
      });
    }
    return tasks.map((task) => ({
      ...task,
      customFieldValues: byTaskId.get(task.id) ?? [],
    }));
  }

  private serializeTaskCustomFieldValue(value: TaskCustomFieldValueWithRelations): SerializedTaskCustomFieldValue {
    return {
      id: value.id,
      taskId: value.taskId,
      fieldId: value.fieldId,
      optionId: value.optionId,
      valueText: value.valueText,
      valueNumber: value.valueNumber === null ? null : Number(value.valueNumber),
      valueDate: value.valueDate,
      valueBoolean: value.valueBoolean,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      field: value.field
        ? {
            id: value.field.id,
            name: value.field.name,
            type: value.field.type,
            required: value.field.required,
            position: value.field.position,
          }
        : null,
      option: value.option
        ? {
            id: value.option.id,
            label: value.option.label,
            value: value.option.value,
            color: value.option.color,
          }
        : null,
    };
  }

  private toCustomFieldStorage(parsed: ParsedCustomFieldValue) {
    if (parsed.type === 'TEXT') {
      return {
        optionId: null,
        valueText: parsed.valueText,
        valueNumber: null,
        valueDate: null,
        valueBoolean: null,
      };
    }
    if (parsed.type === 'NUMBER') {
      return {
        optionId: null,
        valueText: null,
        valueNumber: parsed.valueNumber,
        valueDate: null,
        valueBoolean: null,
      };
    }
    if (parsed.type === 'DATE') {
      return {
        optionId: null,
        valueText: null,
        valueNumber: null,
        valueDate: parsed.valueDate,
        valueBoolean: null,
      };
    }
    if (parsed.type === 'BOOLEAN') {
      return {
        optionId: null,
        valueText: null,
        valueNumber: null,
        valueDate: null,
        valueBoolean: parsed.valueBoolean,
      };
    }
    return {
      optionId: parsed.optionId,
      valueText: parsed.valueText,
      valueNumber: null,
      valueDate: null,
      valueBoolean: null,
    };
  }

  private validateDescriptionDoc(descriptionDoc: Record<string, unknown>) {
    const encoded = JSON.stringify(descriptionDoc);
    if (encoded.length > MAX_DESCRIPTION_DOC_BYTES) {
      throw new ConflictException('descriptionDoc payload too large');
    }
    if (descriptionDoc.type !== 'doc' || !Array.isArray(descriptionDoc.content)) {
      throw new ConflictException('descriptionDoc must be a valid ProseMirror doc');
    }
  }

  private sanitizeFileName(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'upload.bin';
  }

  private extractMentionUserIdsFromComment(body: string) {
    const ids = new Set<string>();
    const regex = /@\[(?<id>[a-zA-Z0-9:_-]+)\|[^\]]+\]/g;
    let match = regex.exec(body);
    while (match) {
      const id = match.groups?.id?.trim();
      if (id) ids.add(id);
      match = regex.exec(body);
    }
    return [...ids];
  }

  private extractMentionUserIdsFromDoc(node: unknown): string[] {
    const ids = new Set<string>();
    const walk = (value: unknown) => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        for (const item of value) walk(item);
        return;
      }
      const item = value as Record<string, unknown>;
      if (item.type === 'mention' && item.attrs && typeof item.attrs === 'object') {
        const mentionId = (item.attrs as Record<string, unknown>).id;
        if (typeof mentionId === 'string' && mentionId.trim()) ids.add(mentionId.trim());
      }
      if (Array.isArray(item.marks)) {
        for (const mark of item.marks) {
          if (
            mark &&
            typeof mark === 'object' &&
            (mark as Record<string, unknown>).type === 'mention' &&
            (mark as Record<string, unknown>).attrs &&
            typeof (mark as Record<string, unknown>).attrs === 'object'
          ) {
            const mentionId = ((mark as Record<string, unknown>).attrs as Record<string, unknown>).id;
            if (typeof mentionId === 'string' && mentionId.trim()) ids.add(mentionId.trim());
          }
        }
      }
      walk(item.content);
    };
    walk(node);
    return [...ids];
  }

  private async syncTaskMentions(
    tx: Prisma.TransactionClient,
    input: { taskId: string; sourceType: 'description' | 'comment'; sourceId: string; mentionedUserIds: string[] },
    req: AppRequest,
  ) {
    const sourceId = input.sourceId ?? '';
    const task = await tx.task.findUniqueOrThrow({ where: { id: input.taskId }, select: { projectId: true } });
    const uniqueIncoming = [...new Set(input.mentionedUserIds)].filter(Boolean);
    const validUsers = uniqueIncoming.length
      ? await tx.projectMembership.findMany({
          where: {
            projectId: task.projectId,
            userId: { in: uniqueIncoming },
          },
          select: { userId: true },
        })
      : [];
    const validUserIds = new Set(validUsers.map((item) => item.userId));
    const finalUserIds = uniqueIncoming.filter((id) => validUserIds.has(id));

    const existing = await tx.taskMention.findMany({
      where: { taskId: input.taskId, sourceType: input.sourceType, sourceId },
    });
    const existingSet = new Set(existing.map((item) => item.mentionedUserId));
    const toCreate = finalUserIds.filter((id) => !existingSet.has(id));
    const toDelete = existing.filter((item) => !finalUserIds.includes(item.mentionedUserId));

    for (const userId of toCreate) {
      const created = await tx.taskMention.create({
        data: { taskId: input.taskId, mentionedUserId: userId, sourceType: input.sourceType, sourceId },
      });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: input.taskId,
        action: 'task.mention.created',
        afterJson: created,
        correlationId: req.correlationId,
        outboxType: 'task.mention.created',
        payload: {
          taskId: input.taskId,
          mentionedUserId: userId,
          sourceType: input.sourceType,
          sourceId,
        },
      });
      await this.notifications.upsertMentionNotification(tx, {
        userId,
        projectId: task.projectId,
        taskId: input.taskId,
        sourceType: input.sourceType,
        sourceId,
        triggeredByUserId: req.user.sub,
        actor: req.user.sub,
        correlationId: req.correlationId,
      });
    }

    for (const mention of toDelete) {
      await tx.taskMention.delete({ where: { id: mention.id } });
      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: input.taskId,
        action: 'task.mention.deleted',
        beforeJson: mention,
        correlationId: req.correlationId,
        outboxType: 'task.mention.deleted',
        payload: {
          taskId: input.taskId,
          mentionedUserId: mention.mentionedUserId,
          sourceType: input.sourceType,
          sourceId,
        },
      });
    }
  }

  private extractPlainTextFromDoc(node: unknown): string {
    if (node === null || node === undefined) return '';
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map((child) => this.extractPlainTextFromDoc(child)).join(' ');
    if (typeof node === 'object') {
      const value = node as Record<string, unknown>;
      const text = typeof value.text === 'string' ? value.text : '';
      const nested = this.extractPlainTextFromDoc(value.content);
      return [text, nested].filter(Boolean).join(' ').trim();
    }
    return '';
  }

  private async collectSubtreeIds(
    tx: Prisma.TransactionClient,
    rootTaskId: string,
    includeDeleted: boolean = false,
  ): Promise<string[]> {
    const queue = [rootTaskId];
    const visited = new Set<string>();
    while (queue.length) {
      const currentId = queue.shift();
      if (!currentId || visited.has(currentId)) continue;
      visited.add(currentId);
      const children = await tx.task.findMany({
        where: includeDeleted
          ? { parentId: currentId }
          : { parentId: currentId, deletedAt: null },
        select: { id: true },
      });
      for (const child of children) queue.push(child.id);
    }
    return [...visited];
  }

  private async removeTasksFromSearch(taskIds: string[]) {
    await Promise.all(taskIds.map((taskId) => this.searchService.removeTask(taskId)));
  }

  private async buildTaskCustomFieldSearchText(taskId: string): Promise<string> {
    const values = await this.prisma.taskCustomFieldValue.findMany({
      where: {
        taskId,
        field: { archivedAt: null },
      },
      include: {
        option: { select: { label: true, value: true } },
      },
    });
    return values
      .map((value) => {
        if (value.option?.label) return value.option.label;
        if (value.option?.value) return value.option.value;
        if (value.valueText) return value.valueText;
        if (value.valueNumber !== null) return String(value.valueNumber);
        if (value.valueDate) return value.valueDate.toISOString();
        if (typeof value.valueBoolean === 'boolean') return value.valueBoolean ? 'true' : 'false';
        return '';
      })
      .filter(Boolean)
      .join(' ');
  }

  private async indexTaskWithCustomFields(task: { id: string }) {
    const indexedTask = await this.prisma.task.findFirst({
      where: { id: task.id, deletedAt: null },
    });
    if (!indexedTask) return;
    const customFieldText = await this.buildTaskCustomFieldSearchText(task.id);
    await this.searchService.indexTask(indexedTask, { customFieldText });
  }

  private async reindexTaskById(taskId: string) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, deletedAt: null } });
    if (!task) return;
    const customFieldText = await this.buildTaskCustomFieldSearchText(task.id);
    await this.searchService.indexTask(task, { customFieldText });
  }

  private async reindexTasks(taskIds: string[]) {
    const uniqueTaskIds = [...new Set(taskIds)];
    for (const taskId of uniqueTaskIds) {
      await this.reindexTaskById(taskId);
    }
  }

  private async applyProgressRules(tx: any, taskId: string, correlationId?: string) {
    const task = await tx.task.findUnique({ where: { id: taskId } });
    if (!task) return;
    const cid = correlationId ?? 'test-correlation-id';
    const customNumberValues = await tx.taskCustomFieldValue.findMany({
      where: {
        taskId,
        field: { archivedAt: null, type: CustomFieldType.NUMBER },
      },
      select: {
        fieldId: true,
        valueNumber: true,
      },
    });
    const customNumberByFieldId = new Map(
      customNumberValues
        .filter((entry: { valueNumber: Prisma.Decimal | null }) => entry.valueNumber !== null)
        .map((entry: { fieldId: string; valueNumber: Prisma.Decimal | null }) => [
          entry.fieldId,
          Number(entry.valueNumber),
        ]),
    );

    const rules = await tx.rule.findMany({ where: { projectId: task.projectId, enabled: true } });
    for (const rule of rules) {
      const cutoff = new Date(Date.now() - rule.cooldownSec * 1000);
      const recentRun = await tx.ruleRun.findFirst({
        where: { ruleId: rule.id, taskId, startedAt: { gte: cutoff } },
        orderBy: { startedAt: 'desc' },
      });
      if (recentRun) continue;

      const definition = this.resolveRuleDefinition(rule);
      const conditionResults = definition.conditions.map((condition) => {
        const value =
          condition.field === 'progressPercent'
            ? task.progressPercent
            : customNumberByFieldId.get(condition.fieldId) ?? null;
        if (value === null || value === undefined) return false;
        if (condition.op === 'between') {
          return value >= Number(condition.min) && value <= Number(condition.max);
        }
        if (condition.op === 'eq') return value === Number(condition.value);
        if (condition.op === 'lt') return value < Number(condition.value);
        if (condition.op === 'lte') return value <= Number(condition.value);
        if (condition.op === 'gt') return value > Number(condition.value);
        if (condition.op === 'gte') return value >= Number(condition.value);
        return false;
      });
      const conditionsMatched =
        conditionResults.length === 0
          ? false
          : definition.logicalOperator === 'OR'
            ? conditionResults.some(Boolean)
            : conditionResults.every(Boolean);

      let patch: any = null;
      if (conditionsMatched) {
        const next: Record<string, unknown> = {};
        for (const action of definition.actions) {
          if (action.type === 'setStatus' && action.status) next.status = action.status;
          if (action.type === 'setCompletedAtNow') next.completedAt = task.completedAt ?? new Date();
          if (action.type === 'setCompletedAtNull') next.completedAt = null;
        }
        if (Object.keys(next).length) {
          const statusUnchanged = next.status === undefined || next.status === task.status;
          const completedUnchanged =
            next.completedAt === undefined || String(next.completedAt) === String(task.completedAt);
          if (!(statusUnchanged && completedUnchanged)) {
            patch = { ...next, version: { increment: 1 } };
          }
        }
      }

      const run = await tx.ruleRun.create({
        data: { ruleId: rule.id, taskId, changed: Boolean(patch), correlationId: cid },
      });

      if (patch) {
        const before = { ...task };
        const updated = await tx.task.update({ where: { id: taskId }, data: patch });
        await this.domain.appendAuditOutbox({
          tx,
          actor: 'rule-engine',
          entityType: 'Task',
          entityId: taskId,
          action: 'rule.applied',
          beforeJson: before,
          afterJson: updated,
          correlationId: cid,
          outboxType: 'rule.applied',
          payload: { ruleId: rule.id, taskId },
        });
      }

      await tx.ruleRun.update({ where: { id: run.id }, data: { finishedAt: new Date() } });
    }
  }

  private parseTimelineGroupBy(value: string): TimelineGroupBy {
    if (TIMELINE_GROUP_BY_VALUES.includes(value as TimelineGroupBy)) {
      return value as TimelineGroupBy;
    }
    throw new BadRequestException(`groupBy must be one of: ${TIMELINE_GROUP_BY_VALUES.join(', ')}`);
  }

  private parseTimelineViewMode(value: string): TimelineViewMode {
    if (TIMELINE_VIEW_MODE_VALUES.includes(value as TimelineViewMode)) {
      return value as TimelineViewMode;
    }
    throw new BadRequestException(`mode must be one of: ${TIMELINE_VIEW_MODE_VALUES.join(', ')}`);
  }

  private normalizeTimelineViewState(mode: TimelineViewMode, body: PutTimelineViewStateDto): Prisma.JsonObject {
    const normalized: Record<string, boolean | string> = {};

    if (body.zoom && TIMELINE_ZOOM_VALUES.includes(body.zoom as (typeof TIMELINE_ZOOM_VALUES)[number])) {
      normalized.zoom = body.zoom;
    }
    if (body.anchorDate) {
      const parsed = new Date(body.anchorDate);
      if (!Number.isNaN(parsed.valueOf())) {
        normalized.anchorDate = parsed.toISOString();
      }
    }

    if (mode === 'timeline') {
      if (body.swimlane && TIMELINE_SWIMLANE_VALUES.includes(body.swimlane as (typeof TIMELINE_SWIMLANE_VALUES)[number])) {
        normalized.swimlane = body.swimlane;
      }
      if (body.sortMode && TIMELINE_SORT_MODE_VALUES.includes(body.sortMode as (typeof TIMELINE_SORT_MODE_VALUES)[number])) {
        normalized.sortMode = body.sortMode;
      }
      if (
        body.scheduleFilter &&
        TIMELINE_SCHEDULE_FILTER_VALUES.includes(body.scheduleFilter as (typeof TIMELINE_SCHEDULE_FILTER_VALUES)[number])
      ) {
        normalized.scheduleFilter = body.scheduleFilter;
      }
    }

    if (mode === 'gantt') {
      if (
        body.ganttRiskFilterMode &&
        GANTT_RISK_FILTER_MODE_VALUES.includes(
          body.ganttRiskFilterMode as (typeof GANTT_RISK_FILTER_MODE_VALUES)[number],
        )
      ) {
        normalized.ganttRiskFilterMode = body.ganttRiskFilterMode;
      }
      if (typeof body.ganttStrictMode === 'boolean') {
        normalized.ganttStrictMode = body.ganttStrictMode;
      }
    }

    if (Object.keys(normalized).length === 0) {
      throw new BadRequestException('At least one valid timeline view state field must be provided');
    }

    return normalized;
  }

  private resolveRuleDefinition(rule: { definition: unknown; templateKey: string }): RuleDefinition {
    if (rule.definition) return parseRuleDefinition(rule.definition);
    return templateDefinition(rule.templateKey);
  }
}
