import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DomainService } from '../common/domain.service';
import { WorkspaceRole } from '@prisma/client';
import { CapacityService } from '../capacity/capacity.service';

export interface WorkloadFilters {
  startDate?: Date;
  endDate?: Date;
  projectId?: string;
  viewMode?: 'tasks' | 'effort';
  periodWeeks?: number;
}

export interface WeeklyLoad {
  week: string;
  startDate: Date;
  endDate: Date;
  taskCount: number;
  estimateMinutes: number;
  spentMinutes: number;
  tasks: Array<{
    id: string;
    title: string;
    dueAt: Date | null;
    priority: string | null;
    status: string;
    estimateMinutes: number | null;
    spentMinutes: number;
  }>;
}

export interface OverloadAlert {
  week: string;
  taskCount?: number;
  estimateMinutes: number;
  capacity: number;
  excess: number;
}

export interface UserWorkload {
  userId: string;
  userName: string;
  email: string;
  totalTasks: number;
  totalEstimateMinutes: number;
  totalSpentMinutes: number;
  weeklyBreakdown: WeeklyLoad[];
  overloadAlerts: OverloadAlert[];
}

@Injectable()
export class WorkloadService {
  private readonly DEFAULT_CAPACITY_TASKS = 10;
  private readonly DEFAULT_CAPACITY_HOURS = 40;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
    @Inject(CapacityService) private readonly capacityService: CapacityService,
  ) {}

  async getUserWorkload(
    workspaceId: string,
    targetUserId: string,
    filters: WorkloadFilters,
    actorUserId: string,
  ): Promise<UserWorkload> {
    await this.domain.requireWorkspaceMembership(workspaceId, actorUserId);
    if (actorUserId !== targetUserId) {
      await this.domain.requireWorkspaceRole(workspaceId, actorUserId, WorkspaceRole.WS_ADMIN);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, displayName: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { startDate, endDate, projectId } = this.getDefaultDateRange(filters);

    const tasks = await this.prisma.task.findMany({
      where: {
        assigneeUserId: targetUserId,
        dueAt: {
          gte: startDate,
          lte: endDate,
        },
        status: {
          not: 'DONE',
        },
        deletedAt: null,
        ...(projectId && { projectId }),
      },
      select: {
        id: true,
        title: true,
        dueAt: true,
        priority: true,
        status: true,
        estimateMinutes: true,
        spentMinutes: true,
      },
      orderBy: { dueAt: 'asc' },
    });

    const weeklyBreakdown = this.groupByWeek(tasks, startDate, endDate);
    const overloadAlerts = await this.detectOverload(
      workspaceId,
      targetUserId,
      weeklyBreakdown,
      filters.viewMode || 'effort',
    );

    const totalEstimateMinutes = tasks.reduce((sum, t) => sum + (t.estimateMinutes || 0), 0);
    const totalSpentMinutes = tasks.reduce((sum, t) => sum + t.spentMinutes, 0);

    return {
      userId: user.id,
      userName: user.displayName || user.email || 'Unknown',
      email: user.email || '',
      totalTasks: tasks.length,
      totalEstimateMinutes,
      totalSpentMinutes,
      weeklyBreakdown,
      overloadAlerts,
    };
  }

  async getTeamWorkload(
    workspaceId: string,
    filters: WorkloadFilters,
    actorUserId: string,
  ): Promise<UserWorkload[]> {
    await this.domain.requireWorkspaceMembership(workspaceId, actorUserId);

    const members = await this.prisma.workspaceMembership.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
    });

    const workloads = await Promise.all(
      members.map((member) =>
        this.getUserWorkload(workspaceId, member.user.id, filters, actorUserId).catch(() => null),
      ),
    );

    return workloads.filter((w): w is UserWorkload => w !== null);
  }

  async getProjectWorkload(
    workspaceId: string,
    projectId: string,
    filters: WorkloadFilters,
    actorUserId: string,
  ): Promise<UserWorkload[]> {
    await this.domain.requireWorkspaceMembership(workspaceId, actorUserId);

    const project = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const members = await this.prisma.projectMembership.findMany({
      where: { projectId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
    });

    const projectFilters = { ...filters, projectId };

    const workloads = await Promise.all(
      members.map((member) =>
        this.getUserWorkload(workspaceId, member.user.id, projectFilters, actorUserId).catch(() => null),
      ),
    );

    return workloads.filter((w): w is UserWorkload => w !== null);
  }

  private getDefaultDateRange(filters: WorkloadFilters): { startDate: Date; endDate: Date; projectId?: string } {
    const now = new Date();
    const weeks = filters.periodWeeks || 4;
    const defaultStart = new Date(now);
    defaultStart.setUTCDate(now.getUTCDate() - now.getUTCDay());
    defaultStart.setUTCHours(0, 0, 0, 0);

    const defaultEnd = new Date(defaultStart);
    defaultEnd.setUTCDate(defaultStart.getUTCDate() + (weeks * 7) - 1);
    defaultEnd.setUTCHours(23, 59, 59, 999);

    return {
      startDate: filters.startDate ? this.startOfUtcDay(filters.startDate) : defaultStart,
      endDate: filters.endDate ? this.endOfUtcDay(filters.endDate) : defaultEnd,
      projectId: filters.projectId,
    };
  }

  private groupByWeek(
    tasks: Array<{
      id: string;
      title: string;
      dueAt: Date | null;
      priority: string | null;
      status: string;
      estimateMinutes: number | null;
      spentMinutes: number;
    }>,
    startDate: Date,
    endDate: Date,
  ): WeeklyLoad[] {
    const weeks: WeeklyLoad[] = [];
    const currentWeek = new Date(startDate);

    while (currentWeek <= endDate) {
      const weekEnd = new Date(currentWeek);
      weekEnd.setUTCDate(currentWeek.getUTCDate() + 6);
      weekEnd.setUTCHours(23, 59, 59, 999);

      const weekTasks = tasks.filter((task) => {
        if (!task.dueAt) return false;
        const dueDate = new Date(task.dueAt);
        return dueDate >= currentWeek && dueDate <= weekEnd;
      });

      const estimateMinutes = weekTasks.reduce((sum, t) => sum + (t.estimateMinutes || 0), 0);
      const spentMinutes = weekTasks.reduce((sum, t) => sum + t.spentMinutes, 0);

      weeks.push({
        week: this.formatWeekLabel(currentWeek),
        startDate: new Date(currentWeek),
        endDate: new Date(weekEnd),
        taskCount: weekTasks.length,
        estimateMinutes,
        spentMinutes,
        tasks: weekTasks.map((task) => ({
          id: task.id,
          title: task.title,
          dueAt: task.dueAt,
          priority: task.priority,
          status: task.status,
          estimateMinutes: task.estimateMinutes,
          spentMinutes: task.spentMinutes,
        })),
      });

      currentWeek.setUTCDate(currentWeek.getUTCDate() + 7);
    }

    return weeks;
  }

  private async detectOverload(
    workspaceId: string,
    userId: string,
    weeklyLoad: WeeklyLoad[],
    viewMode: 'tasks' | 'effort',
  ): Promise<OverloadAlert[]> {
    const capacityByWeek = await this.capacityService.resolveWeeklyCapacityMinutesBatch(
      workspaceId,
      userId,
      weeklyLoad.map((week) => ({
        startDate: week.startDate,
        endDate: week.endDate,
      })),
    );

    if (viewMode === 'effort') {
      const weeksWithCapacity = weeklyLoad.map((week, index) => ({
        week,
        capacityMinutes: capacityByWeek[index] ?? this.DEFAULT_CAPACITY_HOURS * 60,
      }));

      return weeksWithCapacity
        .filter(({ week, capacityMinutes }) => week.estimateMinutes > capacityMinutes)
        .map(({ week, capacityMinutes }) => ({
          week: week.week,
          estimateMinutes: week.estimateMinutes,
          capacity: capacityMinutes,
          excess: week.estimateMinutes - capacityMinutes,
        }));
    } else {
      const weeksWithCapacity = weeklyLoad.map((week, index) => ({
        week,
        capacityTasks: Math.max(
          0,
          Math.round(
            (capacityByWeek[index] ?? this.DEFAULT_CAPACITY_HOURS * 60) /
              ((this.DEFAULT_CAPACITY_HOURS * 60) / this.DEFAULT_CAPACITY_TASKS),
          ),
        ),
      }));

      return weeksWithCapacity
        .filter(({ week, capacityTasks }) => week.taskCount > capacityTasks)
        .map(({ week, capacityTasks }) => ({
          week: week.week,
          taskCount: week.taskCount,
          estimateMinutes: week.estimateMinutes,
          capacity: capacityTasks,
          excess: week.taskCount - capacityTasks,
        }));
    }
  }

  private formatWeekLabel(date: Date): string {
    const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const day = date.getUTCDate();
    return `${month} ${day}`;
  }

  private startOfUtcDay(date: Date) {
    const normalized = new Date(date);
    normalized.setUTCHours(0, 0, 0, 0);
    return normalized;
  }

  private endOfUtcDay(date: Date) {
    const normalized = new Date(date);
    normalized.setUTCHours(23, 59, 59, 999);
    return normalized;
  }
}
