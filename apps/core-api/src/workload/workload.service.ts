import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DomainService } from '../common/domain.service';

export interface WorkloadFilters {
  startDate?: Date;
  endDate?: Date;
  projectId?: string;
}

export interface WeeklyLoad {
  week: string;
  startDate: Date;
  endDate: Date;
  taskCount: number;
  tasks: Array<{
    id: string;
    title: string;
    dueAt: Date | null;
    priority: string;
    status: string;
  }>;
}

export interface OverloadAlert {
  week: string;
  taskCount: number;
  capacity: number;
  excess: number;
}

export interface UserWorkload {
  userId: string;
  userName: string;
  email: string;
  totalTasks: number;
  weeklyBreakdown: WeeklyLoad[];
  overloadAlerts: OverloadAlert[];
}

@Injectable()
export class WorkloadService {
  private readonly DEFAULT_CAPACITY = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly domain: DomainService,
  ) {}

  async getUserWorkload(
    workspaceId: string,
    userId: string,
    filters: WorkloadFilters,
  ): Promise<UserWorkload> {
    await this.domain.requireWorkspaceMembership(workspaceId, userId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, displayName: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { startDate, endDate, projectId } = this.getDefaultDateRange(filters);

    const tasks = await this.prisma.task.findMany({
      where: {
        assigneeUserId: userId,
        dueAt: {
          gte: startDate,
          lte: endDate,
        },
        status: {
          not: 'DONE',
        },
        ...(projectId && { projectId }),
      },
      select: {
        id: true,
        title: true,
        dueAt: true,
        priority: true,
        status: true,
      },
      orderBy: { dueAt: 'asc' },
    });

    const weeklyBreakdown = this.groupByWeek(tasks, startDate, endDate);
    const overloadAlerts = this.detectOverload(weeklyBreakdown);

    return {
      userId: user.id,
      userName: user.displayName || user.email || 'Unknown',
      email: user.email || '',
      totalTasks: tasks.length,
      weeklyBreakdown,
      overloadAlerts,
    };
  }

  async getTeamWorkload(
    workspaceId: string,
    filters: WorkloadFilters,
  ): Promise<UserWorkload[]> {
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
        this.getUserWorkload(workspaceId, member.user.id, filters).catch(() => null),
      ),
    );

    return workloads.filter((w): w is UserWorkload => w !== null);
  }

  async getProjectWorkload(
    workspaceId: string,
    projectId: string,
    filters: WorkloadFilters,
  ): Promise<UserWorkload[]> {
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
        this.getUserWorkload(workspaceId, member.user.id, projectFilters).catch(() => null),
      ),
    );

    return workloads.filter((w): w is UserWorkload => w !== null);
  }

  private getDefaultDateRange(filters: WorkloadFilters): Required<WorkloadFilters> {
    const now = new Date();
    const defaultStart = new Date(now);
    defaultStart.setDate(now.getDate() - now.getDay());
    defaultStart.setHours(0, 0, 0, 0);

    const defaultEnd = new Date(defaultStart);
    defaultEnd.setDate(defaultStart.getDate() + 27);
    defaultEnd.setHours(23, 59, 59, 999);

    return {
      startDate: filters.startDate || defaultStart,
      endDate: filters.endDate || defaultEnd,
      projectId: filters.projectId,
    };
  }

  private groupByWeek(
    tasks: Array<{
      id: string;
      title: string;
      dueAt: Date | null;
      priority: string;
      status: string;
    }>,
    startDate: Date,
    endDate: Date,
  ): WeeklyLoad[] {
    const weeks: WeeklyLoad[] = [];
    const currentWeek = new Date(startDate);

    while (currentWeek <= endDate) {
      const weekEnd = new Date(currentWeek);
      weekEnd.setDate(currentWeek.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const weekTasks = tasks.filter((task) => {
        if (!task.dueAt) return false;
        const dueDate = new Date(task.dueAt);
        return dueDate >= currentWeek && dueDate <= weekEnd;
      });

      weeks.push({
        week: this.formatWeekLabel(currentWeek),
        startDate: new Date(currentWeek),
        endDate: new Date(weekEnd),
        taskCount: weekTasks.length,
        tasks: weekTasks.map((task) => ({
          id: task.id,
          title: task.title,
          dueAt: task.dueAt,
          priority: task.priority,
          status: task.status,
        })),
      });

      currentWeek.setDate(currentWeek.getDate() + 7);
    }

    return weeks;
  }

  private detectOverload(weeklyLoad: WeeklyLoad[]): OverloadAlert[] {
    return weeklyLoad
      .filter((week) => week.taskCount > this.DEFAULT_CAPACITY)
      .map((week) => ({
        week: week.week,
        taskCount: week.taskCount,
        capacity: this.DEFAULT_CAPACITY,
        excess: week.taskCount - this.DEFAULT_CAPACITY,
      }));
  }

  private formatWeekLabel(date: Date): string {
    const month = date.toLocaleString('en-US', { month: 'short' });
    const day = date.getDate();
    return `${month} ${day}`;
  }
}
