import { Controller, Get, Query, UseGuards, Param } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { WorkloadService, WorkloadFilters } from './workload.service';
import { IsOptional, IsString, IsDateString } from 'class-validator';

class WorkloadQueryDto implements WorkloadFilters {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  projectId?: string;
}

@Controller('workload')
@UseGuards(AuthGuard)
export class WorkloadController {
  constructor(private readonly workloadService: WorkloadService) {}

  @Get('me')
  async getMyWorkload(
    @Query() query: WorkloadQueryDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const workspaceId = req.headers['x-workspace-id'] as string;
    if (!workspaceId) {
      return { error: 'Workspace ID required' };
    }

    const filters: WorkloadFilters = {
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      projectId: query.projectId,
    };

    return this.workloadService.getUserWorkload(workspaceId, req.user.sub, filters);
  }

  @Get('users/:userId')
  async getUserWorkload(
    @Param('userId') userId: string,
    @Query() query: WorkloadQueryDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const workspaceId = req.headers['x-workspace-id'] as string;
    if (!workspaceId) {
      return { error: 'Workspace ID required' };
    }

    const filters: WorkloadFilters = {
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      projectId: query.projectId,
    };

    return this.workloadService.getUserWorkload(workspaceId, userId, filters);
  }

  @Get('team')
  async getTeamWorkload(
    @Query() query: WorkloadQueryDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const workspaceId = req.headers['x-workspace-id'] as string;
    if (!workspaceId) {
      return { error: 'Workspace ID required' };
    }

    const filters: WorkloadFilters = {
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
      projectId: query.projectId,
    };

    return this.workloadService.getTeamWorkload(workspaceId, filters);
  }

  @Get('projects/:projectId')
  async getProjectWorkload(
    @Param('projectId') projectId: string,
    @Query() query: WorkloadQueryDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const workspaceId = req.headers['x-workspace-id'] as string;
    if (!workspaceId) {
      return { error: 'Workspace ID required' };
    }

    const filters: WorkloadFilters = {
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    };

    return this.workloadService.getProjectWorkload(workspaceId, projectId, filters);
  }
}
