import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { GoalStatus } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  IsUUID,
} from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { GoalsService } from './goals.service';

class CreateGoalDto {
  @IsUUID()
  workspaceId!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  ownerUserId?: string;

  @IsOptional()
  @IsEnum(GoalStatus)
  status?: GoalStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number;
}

class UpdateGoalDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  ownerUserId?: string;

  @IsOptional()
  @IsEnum(GoalStatus)
  status?: GoalStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progressPercent?: number;
}

class LinkProjectDto {
  @IsUUID()
  projectId!: string;
}

@Controller()
@UseGuards(AuthGuard)
export class GoalsController {
  constructor(@Inject(GoalsService) private readonly goalsService: GoalsService) {}

  @Post('goals')
  create(@Body() body: CreateGoalDto, @CurrentRequest() req: AppRequest) {
    return this.goalsService.createGoal(body.workspaceId, req.user.sub, req.correlationId, body);
  }

  @Get('workspaces/:workspaceId/goals')
  list(
    @Param('workspaceId') workspaceId: string,
    @Query('includeArchived') includeArchived: string | undefined,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.goalsService.listGoals(workspaceId, req.user.sub, includeArchived === 'true');
  }

  @Get('goals/:id')
  get(@Param('id') goalId: string, @CurrentRequest() req: AppRequest) {
    return this.goalsService.getGoal(goalId, req.user.sub);
  }

  @Get('goals/:id/history')
  history(@Param('id') goalId: string, @CurrentRequest() req: AppRequest) {
    return this.goalsService.getGoalHistory(goalId, req.user.sub);
  }

  @Patch('goals/:id')
  update(
    @Param('id') goalId: string,
    @Body() body: UpdateGoalDto,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.goalsService.updateGoal(goalId, req.user.sub, req.correlationId, body);
  }

  @Delete('goals/:id')
  archive(@Param('id') goalId: string, @CurrentRequest() req: AppRequest) {
    return this.goalsService.archiveGoal(goalId, req.user.sub, req.correlationId);
  }

  @Get('goals/:id/projects')
  listProjects(@Param('id') goalId: string, @CurrentRequest() req: AppRequest) {
    return this.goalsService.listGoalProjects(goalId, req.user.sub);
  }

  @Post('goals/:id/projects')
  addProject(
    @Param('id') goalId: string,
    @Body() body: LinkProjectDto,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.goalsService.addProjectLink(goalId, body.projectId, req.user.sub, req.correlationId);
  }

  @Delete('goals/:id/projects/:projectId')
  removeProject(
    @Param('id') goalId: string,
    @Param('projectId') projectId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.goalsService.removeProjectLink(goalId, projectId, req.user.sub, req.correlationId);
  }
}
