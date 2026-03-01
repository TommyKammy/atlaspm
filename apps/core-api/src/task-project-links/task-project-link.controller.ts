import { Controller, Post, Delete, Get, Body, Param, Query, UseGuards, ParseUUIDPipe } from '@nestjs/common';
import { TaskProjectLinkService } from './task-project-link.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequireProjectAccess } from '../auth/project-access.decorator';

class AddTaskToProjectDto {
  taskId: string;
  projectId: string;
}

class RemoveTaskFromProjectDto {
  taskId: string;
  projectId: string;
}

@Controller('task-project-links')
@UseGuards(AuthGuard)
export class TaskProjectLinkController {
  constructor(private readonly linkService: TaskProjectLinkService) {}

  @Post()
  @RequireProjectAccess('projectId', 'ADMIN')
  async addTaskToProject(
    @Body() dto: AddTaskToProjectDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.linkService.addTaskToProject(dto.taskId, dto.projectId, user.userId);
  }

  @Delete()
  @RequireProjectAccess('projectId', 'ADMIN')
  async removeTaskFromProject(
    @Body() dto: RemoveTaskFromProjectDto,
    @CurrentUser() user: { userId: string },
  ) {
    return this.linkService.removeTaskFromProject(dto.taskId, dto.projectId, user.userId);
  }

  @Get('task/:taskId/projects')
  async getProjectsForTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
  ) {
    return this.linkService.getProjectsForTask(taskId);
  }

  @Get('project/:projectId/tasks')
  @RequireProjectAccess('projectId', 'VIEWER')
  async getTasksForProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('includeDeleted') includeDeleted?: string,
  ) {
    return this.linkService.getTasksForProject(
      projectId,
      includeDeleted === 'true',
    );
  }

  @Post('task/:taskId/set-primary-project')
  async setPrimaryProject(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.linkService.setPrimaryProject(taskId, projectId, user.userId);
  }
}
