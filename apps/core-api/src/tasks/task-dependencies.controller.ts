import { BadRequestException, Body, Controller, Get, Inject, Param, Post, Delete, UseGuards } from '@nestjs/common';
import { IsArray, IsEnum, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';
import { DependencyType, Priority, ProjectRole, TaskStatus } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { assertValidDateRange, toDateOnlyDate } from '../common/date-validation';
import { DomainService } from '../common/domain.service';
import { PrismaService } from '../prisma/prisma.service';
import { SubtaskService } from './subtask.service';

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

@Controller()
@UseGuards(AuthGuard)
export class TaskDependenciesController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
    @Inject(SubtaskService) private readonly subtaskService: SubtaskService,
  ) {}

  @Post('tasks/:id/subtasks')
  async createSubtask(@Param('id') parentId: string, @Body() body: CreateSubtaskDto, @CurrentRequest() req: AppRequest) {
    const parentTask = await this.prisma.task.findFirstOrThrow({ where: { id: parentId, deletedAt: null } });
    await this.domain.requireProjectRole(parentTask.projectId, req.user.sub, ProjectRole.MEMBER);
    if (parentTask.parentId) {
      throw new BadRequestException('Nested subtasks are not supported');
    }
    assertValidDateRange(body.startAt, body.dueAt);
    const startAt = toDateOnlyDate(body.startAt) ?? null;
    const dueAt = toDateOnlyDate(body.dueAt) ?? null;

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
      startAt,
      dueAt,
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
}
