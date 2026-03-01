import { Controller, Get, Query, UseGuards, Param, Inject, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { WorkloadService, WorkloadFilters } from './workload.service';
import { IsOptional, IsString, IsDateString, IsInt, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

class WorkloadQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsIn(['tasks', 'effort'])
  viewMode?: 'tasks' | 'effort';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([2, 4, 8, 12])
  periodWeeks?: number;
}

@Controller('workload')
@UseGuards(AuthGuard)
export class WorkloadController {
  constructor(
    @Inject(WorkloadService) private readonly workloadService: WorkloadService,
  ) {}

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
      viewMode: this.resolveViewMode(query.viewMode),
      periodWeeks: this.resolvePeriodWeeks(query.periodWeeks),
    };

    return this.workloadService.getUserWorkload(workspaceId, req.user.sub, filters, req.user.sub);
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
      viewMode: this.resolveViewMode(query.viewMode),
      periodWeeks: this.resolvePeriodWeeks(query.periodWeeks),
    };

    return this.workloadService.getUserWorkload(workspaceId, userId, filters, req.user.sub);
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
      viewMode: this.resolveViewMode(query.viewMode),
      periodWeeks: this.resolvePeriodWeeks(query.periodWeeks),
    };

    return this.workloadService.getTeamWorkload(workspaceId, filters, req.user.sub);
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
      viewMode: this.resolveViewMode(query.viewMode),
      periodWeeks: this.resolvePeriodWeeks(query.periodWeeks),
    };

    return this.workloadService.getProjectWorkload(workspaceId, projectId, filters, req.user.sub);
  }

  private resolveViewMode(input: unknown): 'tasks' | 'effort' | undefined {
    if (input == null || input === '') return undefined;
    if (input === 'tasks' || input === 'effort') return input;
    throw new BadRequestException('viewMode must be one of: tasks, effort');
  }

  private resolvePeriodWeeks(input: unknown): number | undefined {
    if (input == null || input === '') return undefined;
    const periodWeeks = typeof input === 'number' ? input : Number(input);
    if (!Number.isInteger(periodWeeks)) {
      throw new BadRequestException('periodWeeks must be an integer');
    }
    if (![2, 4, 8, 12].includes(periodWeeks)) {
      throw new BadRequestException('periodWeeks must be one of: 2, 4, 8, 12');
    }
    return periodWeeks;
  }
}
