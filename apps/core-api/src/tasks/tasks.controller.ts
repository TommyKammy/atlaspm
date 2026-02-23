import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ConflictException,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DomainService } from '../common/domain.service';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { Priority, ProjectRole, TaskStatus } from '@prisma/client';

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
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsUUID()
  sectionId?: string;

  @IsOptional()
  @IsInt()
  version?: number;
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

@Controller()
@UseGuards(AuthGuard)
export class TasksController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
  ) {}

  @Get('projects/:id/tasks')
  async list(@Param('id') projectId: string, @Query() query: TaskQuery, @CurrentRequest() req: AppRequest) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.VIEWER);

    const where: any = { projectId };
    if (query.status) where.status = query.status;
    if (query.assignee) where.assigneeUserId = query.assignee;
    if (query.dueFrom || query.dueTo) {
      where.dueAt = {
        gte: query.dueFrom ? new Date(query.dueFrom) : undefined,
        lte: query.dueTo ? new Date(query.dueTo) : undefined,
      };
    }
    if (query.tag) where.tags = { has: query.tag };
    if (query.q) where.OR = [{ title: { contains: query.q, mode: 'insensitive' } }, { description: { contains: query.q, mode: 'insensitive' } }];

    const orderBy = query.sortBy
      ? { [query.sortBy]: query.sortOrder ?? 'asc' }
      : [{ sectionId: 'asc' as const }, { position: 'asc' as const }];

    const tasks = await this.prisma.task.findMany({ where, orderBy });
    if (query.groupBy === 'section') {
      const sections = await this.prisma.section.findMany({ where: { projectId }, orderBy: { position: 'asc' } });
      return sections.map((section) => ({
        section,
        tasks: tasks.filter((t) => t.sectionId === section.id).sort((a, b) => (query.sortBy ? 0 : a.position - b.position)),
      }));
    }
    return tasks;
  }

  @Post('projects/:id/tasks')
  async create(@Param('id') projectId: string, @Body() body: CreateTaskDto, @CurrentRequest() req: AppRequest) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.MEMBER);

    let sectionId = body.sectionId;
    if (!sectionId) {
      const defaultSection = await this.prisma.section.findFirst({ where: { projectId, isDefault: true } });
      if (!defaultSection) throw new NotFoundException('Default section missing');
      sectionId = defaultSection.id;
    }

    const topTask = await this.prisma.task.findFirst({ where: { projectId, sectionId }, orderBy: { position: 'asc' } });
    const position = (topTask?.position ?? 1000) - 1000;
    const progress = body.progressPercent ?? 0;
    const status = this.domain.deriveStatusForProgress(progress, body.status ?? TaskStatus.TODO);
    const completedAt = status === TaskStatus.DONE ? new Date() : null;

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          projectId,
          sectionId,
          title: body.title,
          description: body.description,
          status,
          progressPercent: progress,
          priority: body.priority,
          assigneeUserId: body.assigneeUserId,
          startAt: body.startAt ? new Date(body.startAt) : null,
          dueAt: body.dueAt ? new Date(body.dueAt) : null,
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
    });
  }

  @Patch('tasks/:id')
  async patch(@Param('id') id: string, @Body() body: PatchTaskDto, @CurrentRequest() req: AppRequest) {
    const task = await this.prisma.task.findUniqueOrThrow({ where: { id } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);
    if (body.version && body.version !== task.version) throw new ConflictException('Version conflict');

    const progress = body.progressPercent ?? task.progressPercent;
    const status = body.status ?? this.domain.deriveStatusForProgress(progress, task.status);
    const completedAt = status === TaskStatus.DONE ? task.completedAt ?? new Date() : null;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.task.update({
        where: { id },
        data: {
          title: body.title,
          description: body.description,
          status,
          progressPercent: body.progressPercent,
          priority: body.priority,
          assigneeUserId: body.assigneeUserId,
          startAt: body.startAt ? new Date(body.startAt) : body.startAt === null ? null : undefined,
          dueAt: body.dueAt ? new Date(body.dueAt) : body.dueAt === null ? null : undefined,
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
      return updated;
    });
  }

  @Post('tasks/bulk')
  async bulk(@Body() body: BulkTaskDto, @CurrentRequest() req: AppRequest) {
    const tasks = await this.prisma.task.findMany({ where: { id: { in: body.taskIds } } });
    if (!tasks.length) return { count: 0 };
    const firstTask = tasks[0];
    if (!firstTask) return { count: 0 };
    const projectId = firstTask.projectId;
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.MEMBER);

    return this.prisma.$transaction(async (tx) => {
      const updated = [] as unknown[];
      for (const task of tasks) {
        const progress = body.progressPercent ?? task.progressPercent;
        const status = body.status ?? this.domain.deriveStatusForProgress(progress, task.status);
        const completedAt = status === TaskStatus.DONE ? task.completedAt ?? new Date() : null;

        const next = await tx.task.update({
          where: { id: task.id },
          data: {
            status,
            assigneeUserId: body.assigneeUserId,
            tags: body.tags,
            progressPercent: body.progressPercent,
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
    const task = await this.prisma.task.findUniqueOrThrow({ where: { id: body.taskId } });
    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);
    if (body.expectedVersion && body.expectedVersion !== task.version) {
      const sectionTasks = await this.prisma.task.findMany({
        where: { projectId: task.projectId, sectionId: targetSectionId },
        orderBy: { position: 'asc' },
      });
      throw new ConflictException({ message: 'Version conflict', sectionTasks });
    }

    return this.prisma.$transaction(async (tx) => {
      const siblings = await tx.task.findMany({
        where: { projectId: task.projectId, sectionId: targetSectionId, id: { not: task.id } },
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
          where: { projectId: task.projectId, sectionId: targetSectionId, id: { not: task.id } },
          orderBy: { position: 'asc' },
        });
        for (const [i, item] of rebalance.entries()) {
          await tx.task.update({ where: { id: item.id }, data: { position: (i + 1) * 1000 } });
        }
        const refreshedBefore = body.beforeTaskId
          ? await tx.task.findUnique({ where: { id: body.beforeTaskId } })
          : null;
        const refreshedAfter = body.afterTaskId ? await tx.task.findUnique({ where: { id: body.afterTaskId } }) : null;
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
        where: { sectionId: targetSectionId, projectId: task.projectId },
        orderBy: { position: 'asc' },
      });
      return { task: updated, sectionTasks };
    });
  }

  private async applyProgressRules(tx: any, taskId: string, correlationId?: string) {
    const task = await tx.task.findUnique({ where: { id: taskId } });
    if (!task) return;
    const cid = correlationId ?? 'test-correlation-id';

    const rules = await tx.rule.findMany({ where: { projectId: task.projectId, enabled: true } });
    for (const rule of rules) {
      const cutoff = new Date(Date.now() - rule.cooldownSec * 1000);
      const recentRun = await tx.ruleRun.findFirst({
        where: { ruleId: rule.id, taskId, startedAt: { gte: cutoff } },
        orderBy: { startedAt: 'desc' },
      });
      if (recentRun) continue;

      let patch: any = null;
      if (rule.templateKey === 'progress_to_done' && task.progressPercent === 100) {
        if (!(task.status === TaskStatus.DONE && task.completedAt)) {
          patch = { status: TaskStatus.DONE, completedAt: task.completedAt ?? new Date(), version: { increment: 1 } };
        }
      }
      if (rule.templateKey === 'progress_to_in_progress' && task.progressPercent >= 0 && task.progressPercent < 100) {
        if (!(task.status === TaskStatus.IN_PROGRESS && task.completedAt === null)) {
          patch = { status: TaskStatus.IN_PROGRESS, completedAt: null, version: { increment: 1 } };
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
}
