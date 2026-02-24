import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import {
  DashboardsService,
  CreateDashboardDto,
  UpdateDashboardDto,
  CreateWidgetDto,
  UpdateWidgetDto,
} from './dashboards.service';
import { IsString, IsOptional, ValidateNested, IsInt, Min, Max, IsEnum, IsObject } from 'class-validator';
import { Type } from 'class-transformer';
import { WidgetType } from '@prisma/client';

class PositionDto {
  @IsInt()
  @Min(0)
  @Max(10000)
  x!: number;

  @IsInt()
  @Min(0)
  @Max(10000)
  y!: number;

  @IsInt()
  @Min(1)
  @Max(10000)
  w!: number;

  @IsInt()
  @Min(1)
  @Max(10000)
  h!: number;
}

class CreateDashboardBody implements CreateDashboardDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsObject()
  layout?: Record<string, unknown>;
}

class UpdateDashboardBody implements UpdateDashboardDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsObject()
  layout?: Record<string, unknown>;
}

class CreateWidgetBody implements CreateWidgetDto {
  @IsEnum(WidgetType)
  type!: WidgetType;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @ValidateNested()
  @Type(() => PositionDto)
  position!: { x: number; y: number; w: number; h: number };
}

class UpdateWidgetBody implements UpdateWidgetDto {
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @ValidateNested()
  @Type(() => PositionDto)
  position?: { x: number; y: number; w: number; h: number };
}

class UpdateLayoutBody {
  @IsObject()
  layout!: Record<string, unknown>;
}

@Controller('dashboards')
@UseGuards(AuthGuard)
export class DashboardsController {
  constructor(private readonly dashboardsService: DashboardsService) {}

  @Post()
  async createDashboard(
    @Body() body: CreateDashboardBody,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.dashboardsService.createDashboard(req.user.sub, body);
  }

  @Get()
  async getDashboards(@CurrentRequest() req: AppRequest) {
    return this.dashboardsService.getDashboards(req.user.sub);
  }

  @Get(':dashboardId')
  async getDashboard(
    @Param('dashboardId') dashboardId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.dashboardsService.getDashboard(req.user.sub, dashboardId);
  }

  @Patch(':dashboardId')
  async updateDashboard(
    @Param('dashboardId') dashboardId: string,
    @Body() body: UpdateDashboardBody,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.dashboardsService.updateDashboard(req.user.sub, dashboardId, body);
  }

  @Delete(':dashboardId')
  async deleteDashboard(
    @Param('dashboardId') dashboardId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.dashboardsService.deleteDashboard(req.user.sub, dashboardId);
  }

  @Post(':dashboardId/widgets')
  async createWidget(
    @Param('dashboardId') dashboardId: string,
    @Body() body: CreateWidgetBody,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.dashboardsService.createWidget(req.user.sub, dashboardId, body);
  }

  @Patch(':dashboardId/widgets/:widgetId')
  async updateWidget(
    @Param('dashboardId') dashboardId: string,
    @Param('widgetId') widgetId: string,
    @Body() body: UpdateWidgetBody,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.dashboardsService.updateWidget(req.user.sub, dashboardId, widgetId, body);
  }

  @Delete(':dashboardId/widgets/:widgetId')
  async deleteWidget(
    @Param('dashboardId') dashboardId: string,
    @Param('widgetId') widgetId: string,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.dashboardsService.deleteWidget(req.user.sub, dashboardId, widgetId);
  }

  @Patch(':dashboardId/layout')
  async updateLayout(
    @Param('dashboardId') dashboardId: string,
    @Body() body: UpdateLayoutBody,
    @CurrentRequest() req: AppRequest,
  ) {
    return this.dashboardsService.updateLayout(req.user.sub, dashboardId, body.layout);
  }
}
