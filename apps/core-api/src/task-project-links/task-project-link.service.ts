import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class TaskProjectLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async addTaskToProject(taskId: string, projectId: string, userId: string) {
    // Check if task exists
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
    });
    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    // Check if project exists
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    // Check if link already exists
    const existingLink = await this.prisma.taskProjectLink.findUnique({
      where: {
        taskId_projectId: {
          taskId,
          projectId,
        },
      },
    });

    if (existingLink) {
      if (existingLink.deletedAt) {
        // Restore soft-deleted link
        const link = await this.prisma.taskProjectLink.update({
          where: { id: existingLink.id },
          data: {
            deletedAt: null,
          },
        });

        await this.audit.log({
          action: 'TASK_PROJECT_LINK_RESTORED',
          actor: userId,
          entityType: 'TaskProjectLink',
          entityId: link.id,
          afterJson: { taskId, projectId },
        });

        return link;
      }
      throw new ConflictException('Task is already linked to this project');
    }

    // Check if this is the first link (make it primary)
    const existingLinks = await this.prisma.taskProjectLink.count({
      where: {
        taskId,
        deletedAt: null,
      },
    });

    const link = await this.prisma.taskProjectLink.create({
      data: {
        taskId,
        projectId,
        isPrimary: existingLinks === 0, // First link becomes primary
      },
    });

    await this.audit.log({
      action: 'TASK_PROJECT_LINK_CREATED',
      actor: userId,
      entityType: 'TaskProjectLink',
      entityId: link.id,
      afterJson: { taskId, projectId, isPrimary: existingLinks === 0 },
    });

    return link;
  }

  async removeTaskFromProject(taskId: string, projectId: string, userId: string) {
    const link = await this.prisma.taskProjectLink.findUnique({
      where: {
        taskId_projectId: {
          taskId,
          projectId,
        },
      },
    });

    if (!link || link.deletedAt) {
      throw new NotFoundException('Task project link not found');
    }

    // Check if this is the primary project and there are other links
    if (link.isPrimary) {
      const otherLinks = await this.prisma.taskProjectLink.count({
        where: {
          taskId,
          deletedAt: null,
          id: { not: link.id },
        },
      });

      if (otherLinks > 0) {
        throw new ForbiddenException(
          'Cannot remove primary project. Set another project as primary first.',
        );
      }
    }

    // Soft delete
    const updatedLink = await this.prisma.taskProjectLink.update({
      where: { id: link.id },
      data: {
        deletedAt: new Date(),
      },
    });

    await this.audit.log({
      action: 'TASK_PROJECT_LINK_DELETED',
      actor: userId,
      entityType: 'TaskProjectLink',
      entityId: link.id,
      beforeJson: { taskId, projectId },
    });

    return updatedLink;
  }

  async getProjectsForTask(taskId: string) {
    const links = await this.prisma.taskProjectLink.findMany({
      where: {
        taskId,
        deletedAt: null,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            workspaceId: true,
          },
        },
      },
      orderBy: {
        isPrimary: 'desc',
      },
    });

    return links;
  }

  async getTasksForProject(projectId: string, includeDeleted = false) {
    const whereClause: any = {
      projectId,
    };

    if (!includeDeleted) {
      whereClause.deletedAt = null;
    }

    const links = await this.prisma.taskProjectLink.findMany({
      where: whereClause,
      include: {
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
            assigneeUserId: true,
            dueAt: true,
            completedAt: true,
          },
        },
      },
    });

    return links;
  }

  async setPrimaryProject(taskId: string, projectId: string, userId: string) {
    // Check if link exists
    const link = await this.prisma.taskProjectLink.findUnique({
      where: {
        taskId_projectId: {
          taskId,
          projectId,
        },
      },
    });

    if (!link || link.deletedAt) {
      throw new NotFoundException('Task project link not found');
    }

    // Use transaction to update primary status
    await this.prisma.$transaction([
      // Unset all primary flags for this task
      this.prisma.taskProjectLink.updateMany({
        where: {
          taskId,
          deletedAt: null,
        },
        data: {
          isPrimary: false,
        },
      }),
      // Set the new primary
      this.prisma.taskProjectLink.update({
        where: { id: link.id },
        data: {
          isPrimary: true,
        },
      }),
    ]);

    await this.audit.log({
      action: 'TASK_PRIMARY_PROJECT_CHANGED',
      actor: userId,
      entityType: 'Task',
      entityId: taskId,
      afterJson: { primaryProjectId: projectId },
    });

    return this.prisma.taskProjectLink.findUnique({
      where: { id: link.id },
    });
  }

  // Migration helper: Create initial links for existing tasks
  async migrateExistingTasks() {
    const tasks = await this.prisma.task.findMany({
      where: {
        deletedAt: null,
      },
      select: {
        id: true,
        projectId: true,
        createdAt: true,
      },
    });

    const createdLinks = [];
    for (const task of tasks) {
      const existingLink = await this.prisma.taskProjectLink.findUnique({
        where: {
          taskId_projectId: {
            taskId: task.id,
            projectId: task.projectId,
          },
        },
      });

      if (!existingLink) {
        const link = await this.prisma.taskProjectLink.create({
          data: {
            taskId: task.id,
            projectId: task.projectId,
            isPrimary: true,
            createdAt: task.createdAt,
          },
        });
        createdLinks.push(link);
      }
    }

    return {
      totalTasks: tasks.length,
      createdLinks: createdLinks.length,
    };
  }
}
