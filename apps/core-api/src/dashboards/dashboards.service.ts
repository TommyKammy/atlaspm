import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, WidgetType } from '@prisma/client';

export interface CreateDashboardDto {
  name: string;
  layout?: Record<string, unknown>;
}

export interface UpdateDashboardDto {
  name?: string;
  layout?: Record<string, unknown>;
}

export interface CreateWidgetDto {
  type: WidgetType;
  config?: Record<string, unknown>;
  position: { x: number; y: number; w: number; h: number };
}

export interface UpdateWidgetDto {
  config?: Record<string, unknown>;
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
        layout: (dto.layout || {}) as Prisma.InputJsonValue,
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
    // Atomic update with ownership check to prevent TOCTOU race condition
    const result = await this.prisma.dashboard.updateMany({
      where: { id: dashboardId, userId },
      data: {
        name: dto.name,
        layout: dto.layout as Prisma.InputJsonValue,
      },
    });

    if (result.count === 0) {
      throw new NotFoundException('Dashboard not found');
    }

    return this.prisma.dashboard.findUnique({
      where: { id: dashboardId },
      include: { widgets: true },
    });
  }

  async deleteDashboard(userId: string, dashboardId: string) {
    // Atomic delete with ownership check to prevent TOCTOU race condition
    const result = await this.prisma.dashboard.deleteMany({
      where: { id: dashboardId, userId },
    });

    if (result.count === 0) {
      throw new NotFoundException('Dashboard not found');
    }

    return { success: true };
  }

  async createWidget(userId: string, dashboardId: string, dto: CreateWidgetDto) {
    await this.requireDashboardOwnership(userId, dashboardId);
    this.validateWidgetType(dto.type);

    return this.prisma.widget.create({
      data: {
        dashboardId,
        type: dto.type,
        config: (dto.config || {}) as Prisma.InputJsonValue,
        position: dto.position,
      },
    });
  }

  async updateWidget(
    userId: string,
    dashboardId: string,
    widgetId: string,
    dto: UpdateWidgetDto,
  ) {
    // Atomic update with ownership check via relation filter to prevent TOCTOU
    const result = await this.prisma.widget.updateMany({
      where: {
        id: widgetId,
        dashboardId,
        dashboard: { userId },
      },
      data: {
        config: dto.config as Prisma.InputJsonValue,
        position: dto.position,
      },
    });

    if (result.count === 0) {
      throw new NotFoundException('Widget not found');
    }

    return this.prisma.widget.findUnique({
      where: { id: widgetId },
    });
  }

  async deleteWidget(userId: string, dashboardId: string, widgetId: string) {
    // Atomic delete with ownership check via relation filter to prevent TOCTOU
    const result = await this.prisma.widget.deleteMany({
      where: {
        id: widgetId,
        dashboardId,
        dashboard: { userId },
      },
    });

    if (result.count === 0) {
      throw new NotFoundException('Widget not found');
    }

    return { success: true };
  }

  async updateLayout(userId: string, dashboardId: string, layout: Record<string, unknown>) {
    // Atomic update with ownership check to prevent TOCTOU race condition
    const result = await this.prisma.dashboard.updateMany({
      where: { id: dashboardId, userId },
      data: { layout: layout as Prisma.InputJsonValue },
    });

    if (result.count === 0) {
      throw new NotFoundException('Dashboard not found');
    }

    return this.prisma.dashboard.findUnique({
      where: { id: dashboardId },
      include: { widgets: true },
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

  private validateWidgetType(type: WidgetType) {
    const validTypes: WidgetType[] = [
      'TASK_COMPLETION',
      'PROGRESS_CHART',
      'TEAM_LOAD',
      'OVERDUE_ALERTS',
      'RECENT_ACTIVITY',
    ];
    if (!validTypes.includes(type)) {
      throw new BadRequestException('Invalid widget type');
    }
  }
}
