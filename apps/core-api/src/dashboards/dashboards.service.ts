import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, WidgetType } from '@prisma/client';

export interface CreateDashboardDto {
  name: string;
  layout?: Prisma.InputJsonValue;
}

export interface UpdateDashboardDto {
  name?: string;
  layout?: Prisma.InputJsonValue;
}

export interface CreateWidgetDto {
  type: string;
  config?: Prisma.InputJsonValue;
  position: { x: number; y: number; w: number; h: number };
}

export interface UpdateWidgetDto {
  config?: Prisma.InputJsonValue;
  position?: { x: number; y: number; w: number; h: number };
}

@Injectable()
export class DashboardsService {
  constructor(private readonly prisma: PrismaService) {}

  async createDashboard(userId: string, dto: CreateDashboardDto) {
    return this.prisma.dashboard.create({
      data: {
        userId,
        name: dto.name,
        layout: dto.layout || {},
      },
      include: {
        widgets: true,
      },
    });
  }

  async getDashboards(userId: string) {
    return this.prisma.dashboard.findMany({
      where: { userId },
      include: {
        widgets: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDashboard(userId: string, dashboardId: string) {
    const dashboard = await this.prisma.dashboard.findFirst({
      where: { id: dashboardId, userId },
      include: {
        widgets: true,
      },
    });

    if (!dashboard) {
      throw new NotFoundException('Dashboard not found');
    }

    return dashboard;
  }

  async updateDashboard(userId: string, dashboardId: string, dto: UpdateDashboardDto) {
    const dashboard = await this.prisma.dashboard.findFirst({
      where: { id: dashboardId, userId },
    });

    if (!dashboard) {
      throw new NotFoundException('Dashboard not found');
    }

    return this.prisma.dashboard.update({
      where: { id: dashboardId },
      data: {
        name: dto.name,
        layout: dto.layout,
      },
      include: {
        widgets: true,
      },
    });
  }

  async deleteDashboard(userId: string, dashboardId: string) {
    const dashboard = await this.prisma.dashboard.findFirst({
      where: { id: dashboardId, userId },
    });

    if (!dashboard) {
      throw new NotFoundException('Dashboard not found');
    }

    await this.prisma.dashboard.delete({
      where: { id: dashboardId },
    });

    return { success: true };
  }

  async createWidget(userId: string, dashboardId: string, dto: CreateWidgetDto) {
    await this.requireDashboardOwnership(userId, dashboardId);
    this.validateWidgetType(dto.type);

    return this.prisma.widget.create({
      data: {
        dashboardId,
        type: dto.type as WidgetType,
        config: dto.config || {},
        position: dto.position,
      },
    });
  }

  async updateWidget(userId: string, dashboardId: string, widgetId: string, dto: UpdateWidgetDto) {
    await this.requireDashboardOwnership(userId, dashboardId);
    await this.requireWidgetExists(widgetId, dashboardId);

    return this.prisma.widget.update({
      where: { id: widgetId },
      data: {
        config: dto.config,
        position: dto.position,
      },
    });
  }

  async deleteWidget(userId: string, dashboardId: string, widgetId: string) {
    await this.requireDashboardOwnership(userId, dashboardId);
    await this.requireWidgetExists(widgetId, dashboardId);

    await this.prisma.widget.delete({
      where: { id: widgetId },
    });

    return { success: true };
  }

  async updateLayout(userId: string, dashboardId: string, layout: Prisma.InputJsonValue) {
    await this.requireDashboardOwnership(userId, dashboardId);

    return this.prisma.dashboard.update({
      where: { id: dashboardId },
      data: { layout },
    });
  }

  private async requireDashboardOwnership(userId: string, dashboardId: string) {
    const dashboard = await this.prisma.dashboard.findFirst({
      where: { id: dashboardId, userId },
    });

    if (!dashboard) {
      throw new NotFoundException('Dashboard not found');
    }
  }

  private async requireWidgetExists(widgetId: string, dashboardId: string) {
    const widget = await this.prisma.widget.findFirst({
      where: { id: widgetId, dashboardId },
    });

    if (!widget) {
      throw new NotFoundException('Widget not found');
    }
  }

  private validateWidgetType(type: string) {
    const validTypes = ['TASK_COMPLETION', 'PROGRESS_CHART', 'TEAM_LOAD', 'OVERDUE_ALERTS', 'RECENT_ACTIVITY'];
    if (!validTypes.includes(type)) {
      throw new ForbiddenException('Invalid widget type');
    }
  }
}
