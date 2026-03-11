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
import { CapacityScheduleSubjectType } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { CapacityService } from './capacity.service';

class CreateCapacityScheduleDto {
  @IsEnum(CapacityScheduleSubjectType)
  subjectType!: CapacityScheduleSubjectType;

  @IsOptional()
  @IsString()
  subjectUserId?: string;

  @IsString()
  name!: string;

  @IsString()
  timeZone!: string;

  @IsInt()
  @Min(1)
  @Max(24)
  hoursPerDay!: number;

  @IsArray()
  @IsInt({ each: true })
  daysOfWeek!: number[];
}

class UpdateCapacityScheduleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  timeZone?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  hoursPerDay?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  daysOfWeek?: number[];
}

class CreateTimeOffDto {
  @IsString()
  userId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate!: string;

  @IsInt()
  @Min(1)
  @Max(1440)
  minutesPerDay!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

class UpdateTimeOffDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  minutesPerDay?: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

@Controller()
@UseGuards(AuthGuard)
export class CapacityController {
  constructor(@Inject(CapacityService) private readonly capacityService: CapacityService) {}

  @Post('workspaces/:workspaceId/capacity-schedules')
  createCapacitySchedule(
    @Param('workspaceId') workspaceId: string,
    @Body() body: CreateCapacityScheduleDto,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.capacityService.createCapacitySchedule(
      workspaceId,
      req.user.sub,
      req.correlationId,
      body,
    );
  }

  @Get('workspaces/:workspaceId/capacity-schedules')
  listCapacitySchedules(
    @Param('workspaceId') workspaceId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.capacityService.listCapacitySchedules(workspaceId, req.user.sub);
  }

  @Patch('capacity-schedules/:id')
  updateCapacitySchedule(
    @Param('id') scheduleId: string,
    @Body() body: UpdateCapacityScheduleDto,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.capacityService.updateCapacitySchedule(
      scheduleId,
      req.user.sub,
      req.correlationId,
      body,
    );
  }

  @Post('workspaces/:workspaceId/time-off')
  createTimeOff(
    @Param('workspaceId') workspaceId: string,
    @Body() body: CreateTimeOffDto,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.capacityService.createTimeOff(workspaceId, req.user.sub, req.correlationId, body);
  }

  @Get('workspaces/:workspaceId/time-off')
  listTimeOff(
    @Param('workspaceId') workspaceId: string,
    @Query('userId') userId: string | undefined,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.capacityService.listTimeOff(workspaceId, req.user.sub, userId);
  }

  @Patch('time-off/:id')
  updateTimeOff(
    @Param('id') timeOffId: string,
    @Body() body: UpdateTimeOffDto,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.capacityService.updateTimeOff(timeOffId, req.user.sub, req.correlationId, body);
  }

  @Delete('time-off/:id')
  deleteTimeOff(@Param('id') timeOffId: string, @CurrentRequest() req: AppRequest) {
    return this.capacityService.deleteTimeOff(timeOffId, req.user.sub, req.correlationId);
  }
}
