import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, NotFoundException, Inject } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { DomainService } from '../common/domain.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, ProjectRole } from '@prisma/client';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

class CreateTimeLogDto {
  @IsInt()
  @Min(1)
  minutes!: number;

  @IsOptional()
  @IsString()
  description?: string;
}

class UpdateTimeLogDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  minutes?: number;

  @IsOptional()
  @IsString()
  description?: string;
}

class UpdateEstimateDto {
  @IsInt()
  @Min(0)
  estimateMinutes!: number;
}

@Controller()
@UseGuards(AuthGuard)
export class TaskTimeTrackingController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
  ) {}

  @Get('tasks/:id/time-logs')
  async getTimeLogs(
    @Param('id') taskId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.VIEWER);

    return this.prisma.taskTimeLog.findMany({
      where: { taskId },
      include: { user: { select: { id: true, displayName: true } } },
      orderBy: { loggedAt: 'desc' },
    });
  }

  @Post('tasks/:id/time-logs')
  async createTimeLog(
    @Param('id') taskId: string,
    @Body() body: CreateTimeLogDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const timeLog = await tx.taskTimeLog.create({
        data: {
          taskId,
          userId: req.user.sub,
          minutes: body.minutes,
          description: body.description?.trim() || null,
        },
        include: { user: { select: { id: true, displayName: true } } },
      });

      await tx.task.update({
        where: { id: taskId },
        data: { spentMinutes: { increment: body.minutes } },
      });

      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'TaskTimeLog',
        entityId: timeLog.id,
        action: 'time_log.created',
        afterJson: timeLog,
        correlationId: req.correlationId,
        outboxType: 'time_log.created',
        payload: { taskId, timeLogId: timeLog.id, minutes: body.minutes },
      });

      return timeLog;
    });
  }

  @Patch('time-logs/:id')
  async updateTimeLog(
    @Param('id') id: string,
    @Body() body: UpdateTimeLogDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const timeLog = await this.prisma.taskTimeLog.findFirst({
      where: {
        id,
        task: { deletedAt: null },
      },
      include: { task: true, user: { select: { id: true, displayName: true } } },
    });

    if (!timeLog) {
      throw new NotFoundException('Time log not found');
    }

    const requiredRole = timeLog.userId === req.user.sub ? ProjectRole.MEMBER : ProjectRole.ADMIN;
    await this.domain.requireProjectRole(timeLog.task.projectId, req.user.sub, requiredRole);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const minutesDiff = (body.minutes ?? timeLog.minutes) - timeLog.minutes;

      const updated = await tx.taskTimeLog.update({
        where: { id },
        data: {
          minutes: body.minutes,
          description: body.description === undefined ? undefined : body.description.trim() || null,
        },
        include: { user: { select: { id: true, displayName: true } } },
      });

      if (minutesDiff !== 0) {
        await tx.task.update({
          where: { id: timeLog.taskId },
          data: { spentMinutes: { increment: minutesDiff } },
        });
      }

      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'TaskTimeLog',
        entityId: id,
        action: 'time_log.updated',
        beforeJson: timeLog,
        afterJson: updated,
        correlationId: req.correlationId,
        outboxType: 'time_log.updated',
        payload: { taskId: timeLog.taskId, timeLogId: id, minutesDiff },
      });

      return updated;
    });
  }

  @Delete('time-logs/:id')
  async deleteTimeLog(
    @Param('id') id: string,
    @CurrentRequest() req: AppRequest,
  ) {
    const timeLog = await this.prisma.taskTimeLog.findFirst({
      where: {
        id,
        task: { deletedAt: null },
      },
      include: { task: true, user: { select: { id: true, displayName: true } } },
    });

    if (!timeLog) {
      throw new NotFoundException('Time log not found');
    }

    const requiredRole = timeLog.userId === req.user.sub ? ProjectRole.MEMBER : ProjectRole.ADMIN;
    await this.domain.requireProjectRole(timeLog.task.projectId, req.user.sub, requiredRole);

    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.taskTimeLog.delete({ where: { id } });

      await tx.task.update({
        where: { id: timeLog.taskId },
        data: { spentMinutes: { decrement: timeLog.minutes } },
      });

      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'TaskTimeLog',
        entityId: id,
        action: 'time_log.deleted',
        beforeJson: timeLog,
        afterJson: null,
        correlationId: req.correlationId,
        outboxType: 'time_log.deleted',
        payload: { taskId: timeLog.taskId, timeLogId: id, minutes: timeLog.minutes },
      });
    });

    return { success: true };
  }

  @Patch('tasks/:id/estimate')
  async updateEstimate(
    @Param('id') taskId: string,
    @Body() body: UpdateEstimateDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    await this.domain.requireProjectRole(task.projectId, req.user.sub, ProjectRole.MEMBER);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.task.update({
        where: { id: taskId },
        data: { estimateMinutes: body.estimateMinutes },
      });

      await this.domain.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'Task',
        entityId: taskId,
        action: 'task.estimate.updated',
        beforeJson: { estimateMinutes: task.estimateMinutes },
        afterJson: { estimateMinutes: updated.estimateMinutes },
        correlationId: req.correlationId,
        outboxType: 'task.estimate.updated',
        payload: { taskId, estimateMinutes: updated.estimateMinutes },
      });

      return updated;
    });
  }

  @Get('projects/:id/time-tracking/aggregation')
  async getProjectAggregation(
    @Param('id') projectId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    await this.domain.requireProjectRole(projectId, req.user.sub, ProjectRole.VIEWER);

    const [taskAgg, userAgg] = await Promise.all([
      this.prisma.taskTimeLog.groupBy({
        by: ['taskId'],
        where: { task: { projectId, deletedAt: null } },
        _sum: { minutes: true },
        _count: { id: true },
      }),
      this.prisma.taskTimeLog.groupBy({
        by: ['userId'],
        where: { task: { projectId, deletedAt: null } },
        _sum: { minutes: true },
        _count: { id: true },
      }),
    ]);

    const totalEstimate = await this.prisma.task.aggregate({
      where: { projectId, deletedAt: null },
      _sum: { estimateMinutes: true },
    });

    const totalSpent = await this.prisma.task.aggregate({
      where: { projectId, deletedAt: null },
      _sum: { spentMinutes: true },
    });

    return {
      totalEstimateMinutes: totalEstimate._sum.estimateMinutes || 0,
      totalSpentMinutes: totalSpent._sum.spentMinutes || 0,
      byTask: taskAgg.map((item) => ({
        taskId: item.taskId,
        totalMinutes: item._sum.minutes || 0,
        entryCount: item._count.id,
      })),
      byUser: userAgg.map((item) => ({
        userId: item.userId,
        totalMinutes: item._sum.minutes || 0,
        entryCount: item._count.id,
      })),
    };
  }
}
