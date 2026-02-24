import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DomainService } from '../common/domain.service';

export interface CreatePortfolioDto {
  name: string;
  description?: string;
  projectIds?: string[];
}

export interface UpdatePortfolioDto {
  name?: string;
  description?: string;
}

export interface PortfolioProgress {
  projectId: string;
  projectName: string;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  todoTasks: number;
  progress: number;
}

@Injectable()
export class PortfoliosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly domain: DomainService,
  ) {}

  async createPortfolio(workspaceId: string, userId: string, dto: CreatePortfolioDto) {
    // Verify user is workspace member
    await this.domain.requireWorkspaceMembership(workspaceId, userId);

    // Validate projectIds belong to workspace
    if (dto.projectIds && dto.projectIds.length > 0) {
      const projects = await this.prisma.project.findMany({
        where: {
          id: { in: dto.projectIds },
          workspaceId,
        },
        select: { id: true },
      });

      if (projects.length !== dto.projectIds.length) {
        throw new ForbiddenException('Some projects do not belong to this workspace');
      }
    }

    const portfolio = await this.prisma.portfolio.create({
      data: {
        workspaceId,
        name: dto.name,
        description: dto.description,
        projects: {
          create: dto.projectIds?.map(projectId => ({
            project: { connect: { id: projectId } },
          })) || [],
        },
      },
      include: {
        projects: {
          include: {
            project: true,
          },
        },
      },
    });

    return portfolio;
  }

  async getPortfolios(workspaceId: string, userId: string) {
    // Verify user is workspace member
    await this.domain.requireWorkspaceMembership(workspaceId, userId);

    const portfolios = await this.prisma.portfolio.findMany({
      where: { workspaceId },
      include: {
        projects: {
          include: {
            project: {
              include: {
                tasks: {
                  select: {
                    id: true,
                    status: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate progress for each portfolio
    return portfolios.map(portfolio => ({
      ...portfolio,
      progress: this.calculatePortfolioProgress(portfolio.projects),
    }));
  }

  async getPortfolio(workspaceId: string, portfolioId: string, userId: string) {
    // Verify user is workspace member
    await this.domain.requireWorkspaceMembership(workspaceId, userId);

    const portfolio = await this.prisma.portfolio.findFirst({
      where: { id: portfolioId, workspaceId },
      include: {
        projects: {
          include: {
            project: {
              include: {
                tasks: {
                  select: {
                    id: true,
                    status: true,
                    title: true,
                    assigneeUserId: true,
                    dueAt: true,
                  },
                },
                memberships: {
                  include: {
                    user: {
                      select: {
                        id: true,
                        email: true,
                        displayName: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!portfolio) {
      throw new NotFoundException('Portfolio not found');
    }

    const progress = this.calculateDetailedProgress(portfolio.projects);

    return {
      ...portfolio,
      progress,
    };
  }

  async updatePortfolio(
    workspaceId: string,
    portfolioId: string,
    userId: string,
    dto: UpdatePortfolioDto,
  ) {
    // Verify user is workspace member
    await this.domain.requireWorkspaceMembership(workspaceId, userId);

    const portfolio = await this.prisma.portfolio.findFirst({
      where: { id: portfolioId, workspaceId },
    });

    if (!portfolio) {
      throw new NotFoundException('Portfolio not found');
    }

    return this.prisma.portfolio.update({
      where: { id: portfolioId },
      data: {
        name: dto.name,
        description: dto.description,
      },
      include: {
        projects: {
          include: {
            project: true,
          },
        },
      },
    });
  }

  async deletePortfolio(workspaceId: string, portfolioId: string, userId: string) {
    // Verify user is workspace member
    await this.domain.requireWorkspaceMembership(workspaceId, userId);

    const portfolio = await this.prisma.portfolio.findFirst({
      where: { id: portfolioId, workspaceId },
    });

    if (!portfolio) {
      throw new NotFoundException('Portfolio not found');
    }

    await this.prisma.portfolio.delete({
      where: { id: portfolioId },
    });

    return { success: true };
  }

  async addProjectToPortfolio(
    workspaceId: string,
    portfolioId: string,
    projectId: string,
    userId: string,
  ) {
    // Verify user is workspace member
    await this.domain.requireWorkspaceMembership(workspaceId, userId);

    // Verify portfolio exists
    const portfolio = await this.prisma.portfolio.findFirst({
      where: { id: portfolioId, workspaceId },
    });

    if (!portfolio) {
      throw new NotFoundException('Portfolio not found');
    }

    // Verify project exists and belongs to workspace
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId },
    });

    if (!project) {
      throw new NotFoundException('Project not found in workspace');
    }

    // Check if already added
    const existing = await this.prisma.portfolioProject.findUnique({
      where: {
        portfolioId_projectId: {
          portfolioId,
          projectId,
        },
      },
    });

    if (existing) {
      throw new ForbiddenException('Project already in portfolio');
    }

    // Check portfolio limit (50 projects max)
    const count = await this.prisma.portfolioProject.count({
      where: { portfolioId },
    });

    if (count >= 50) {
      throw new ForbiddenException('Portfolio cannot contain more than 50 projects');
    }

    return this.prisma.portfolioProject.create({
      data: {
        portfolioId,
        projectId,
      },
      include: {
        project: true,
      },
    });
  }

  async removeProjectFromPortfolio(
    workspaceId: string,
    portfolioId: string,
    projectId: string,
    userId: string,
  ) {
    // Verify user is workspace member
    await this.domain.requireWorkspaceMembership(workspaceId, userId);

    // Verify portfolio exists
    const portfolio = await this.prisma.portfolio.findFirst({
      where: { id: portfolioId, workspaceId },
    });

    if (!portfolio) {
      throw new NotFoundException('Portfolio not found');
    }

    await this.prisma.portfolioProject.delete({
      where: {
        portfolioId_projectId: {
          portfolioId,
          projectId,
        },
      },
    });

    return { success: true };
  }

  private calculatePortfolioProgress(
    portfolioProjects: Array<{
      project: {
        tasks: Array<{ status: string }>;
      };
    }>,
  ): number {
    let totalTasks = 0;
    let completedTasks = 0;

    for (const pp of portfolioProjects) {
      for (const task of pp.project.tasks) {
        totalTasks++;
        if (task.status === 'DONE') {
          completedTasks++;
        }
      }
    }

    return totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  }

  private calculateDetailedProgress(
    portfolioProjects: Array<{
      project: {
        id: string;
        name: string;
        tasks: Array<{ status: string }>;
      };
    }>,
  ): PortfolioProgress[] {
    return portfolioProjects.map(pp => {
      const tasks = pp.project.tasks;
      const totalTasks = tasks.length;
      const completedTasks = tasks.filter(t => t.status === 'DONE').length;
      const inProgressTasks = tasks.filter(t => t.status === 'IN_PROGRESS').length;
      const todoTasks = tasks.filter(t => t.status === 'TODO').length;

      return {
        projectId: pp.project.id,
        projectName: pp.project.name,
        totalTasks,
        completedTasks,
        inProgressTasks,
        todoTasks,
        progress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      };
    });
  }
}
