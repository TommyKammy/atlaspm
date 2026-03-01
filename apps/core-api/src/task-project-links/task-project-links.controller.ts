import { Body, Controller, Delete, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { TaskProjectLinksService } from './task-project-links.service';

class LinkProjectDto {
  @IsString()
  projectId!: string;
}

@Controller('tasks/:taskId/projects')
@UseGuards(AuthGuard)
export class TaskProjectLinksController {
  constructor(
    @Inject(TaskProjectLinksService)
    private readonly linksService: TaskProjectLinksService,
  ) {}

  @Get()
  listTaskProjects(
    @Param('taskId') taskId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.linksService.listTaskProjects(taskId, req.user.sub);
  }

  @Post()
  addTaskToProject(
    @Param('taskId') taskId: string,
    @Body() body: LinkProjectDto,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.linksService.addTaskToProject(taskId, body.projectId, req.user.sub, req.correlationId);
  }

  @Delete(':projectId')
  removeTaskFromProject(
    @Param('taskId') taskId: string,
    @Param('projectId') projectId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.linksService.removeTaskFromProject(taskId, projectId, req.user.sub, req.correlationId);
  }

  @Post(':projectId/primary')
  setPrimaryProject(
    @Param('taskId') taskId: string,
    @Param('projectId') projectId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.linksService.setPrimaryProject(taskId, projectId, req.user.sub, req.correlationId);
  }
}
