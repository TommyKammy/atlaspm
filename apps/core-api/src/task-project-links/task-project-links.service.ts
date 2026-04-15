import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProjectRole } from '@prisma/client';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { AuthorizationService } from '../common/authorization.service';
import { PrismaService } from '../prisma/prisma.service';

type TaskWithProject = {
  id: string;
  projectId: string;
  project: {
    id: string;
    workspaceId: string;
  };
};

@Injectable()
export class TaskProjectLinksService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditOutboxService) private readonly auditOutbox: AuditOutboxService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
  ) {}

  async listTaskProjects(taskId: string, actorUserId: string) {
    const task = await this.requireTaskWithRole(taskId, actorUserId, ProjectRole.VIEWER);
    await this.ensureCanonicalPrimaryLink(task);

    return this.prisma.taskProjectLink.findMany({
      where: { taskId, deletedAt: null },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            workspaceId: true,
          },
        },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async addTaskToProject(taskId: string, projectId: string, actorUserId: string, correlationId: string) {
    const task = await this.requireTaskWithRole(taskId, actorUserId, ProjectRole.MEMBER);
    const targetProject = await this.requireProjectWithRole(projectId, actorUserId, ProjectRole.MEMBER);

    if (targetProject.workspaceId !== task.project.workspaceId) {
      throw new BadRequestException('task and project must be in the same workspace');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await this.ensureCanonicalPrimaryLink(task, tx);

      const existing = await tx.taskProjectLink.findUnique({
        where: { taskId_projectId: { taskId, projectId } },
      });

      if (existing && !existing.deletedAt) {
        throw new ConflictException('task is already linked to this project');
      }

      const link = existing
        ? await tx.taskProjectLink.update({
            where: { id: existing.id },
            data: { deletedAt: null },
          })
        : await tx.taskProjectLink.create({
            data: {
              taskId,
              projectId,
              isPrimary: false,
            },
          });

      await this.auditOutbox.appendAuditOutbox({
        tx,
        actor: actorUserId,
        entityType: 'Task',
        entityId: taskId,
        action: 'task.project_linked',
        beforeJson: existing ?? null,
        afterJson: link,
        correlationId,
        outboxType: 'task.project_linked',
        payload: {
          taskId,
          projectId,
          linkId: link.id,
        },
      });

      return link;
    });

    return result;
  }

  async removeTaskFromProject(taskId: string, projectId: string, actorUserId: string, correlationId: string) {
    await this.requireTaskWithRole(taskId, actorUserId, ProjectRole.MEMBER);
    await this.requireProjectWithRole(projectId, actorUserId, ProjectRole.MEMBER);

    return this.prisma.$transaction(async (tx) => {
      const link = await tx.taskProjectLink.findUnique({
        where: { taskId_projectId: { taskId, projectId } },
      });

      if (!link || link.deletedAt) {
        throw new NotFoundException('task project link not found');
      }

      if (link.isPrimary) {
        throw new ConflictException('cannot remove primary project link');
      }

      const updated = await tx.taskProjectLink.update({
        where: { id: link.id },
        data: { deletedAt: new Date() },
      });

      await this.auditOutbox.appendAuditOutbox({
        tx,
        actor: actorUserId,
        entityType: 'Task',
        entityId: taskId,
        action: 'task.project_unlinked',
        beforeJson: link,
        afterJson: updated,
        correlationId,
        outboxType: 'task.project_unlinked',
        payload: {
          taskId,
          projectId,
          linkId: link.id,
        },
      });

      return updated;
    });
  }

  async setPrimaryProject(taskId: string, projectId: string, actorUserId: string, correlationId: string) {
    const task = await this.requireTaskWithRole(taskId, actorUserId, ProjectRole.MEMBER);
    const targetProject = await this.requireProjectWithRole(projectId, actorUserId, ProjectRole.MEMBER);
    if (targetProject.workspaceId !== task.project.workspaceId) {
      throw new BadRequestException('project must be in the same workspace as the task');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.ensureCanonicalPrimaryLink(task, tx);

      const link = await tx.taskProjectLink.findUnique({
        where: { taskId_projectId: { taskId, projectId } },
      });
      if (!link || link.deletedAt) {
        throw new NotFoundException('task project link not found');
      }

      const beforeTask = await tx.task.findUniqueOrThrow({
        where: { id: taskId },
        select: { id: true, projectId: true },
      });

      await tx.taskProjectLink.updateMany({
        where: { taskId, deletedAt: null },
        data: { isPrimary: false },
      });
      const updatedLink = await tx.taskProjectLink.update({
        where: { id: link.id },
        data: { isPrimary: true },
      });
      const afterTask = await tx.task.update({
        where: { id: taskId },
        data: { projectId },
      });

      await this.auditOutbox.appendAuditOutbox({
        tx,
        actor: actorUserId,
        entityType: 'Task',
        entityId: taskId,
        action: 'task.primary_project_changed',
        beforeJson: beforeTask,
        afterJson: { id: afterTask.id, projectId: afterTask.projectId },
        correlationId,
        outboxType: 'task.primary_project_changed',
        payload: {
          taskId,
          previousProjectId: beforeTask.projectId,
          projectId,
          linkId: updatedLink.id,
        },
      });

      return updatedLink;
    });
  }

  private async requireTaskWithRole(taskId: string, actorUserId: string, minRole: ProjectRole): Promise<TaskWithProject> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: {
        id: true,
        projectId: true,
        project: {
          select: {
            id: true,
            workspaceId: true,
          },
        },
      },
    });

    if (!task) {
      throw new NotFoundException('task not found');
    }

    await this.authorization.requireProjectRole(task.projectId, actorUserId, minRole);
    return task;
  }

  private async requireProjectWithRole(projectId: string, actorUserId: string, minRole: ProjectRole) {
    await this.authorization.requireProjectRole(projectId, actorUserId, minRole);
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, workspaceId: true },
    });
    if (!project) {
      throw new NotFoundException('project not found');
    }
    return project;
  }

  private async ensureCanonicalPrimaryLink(task: TaskWithProject, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const canonical = await client.taskProjectLink.upsert({
      where: { taskId_projectId: { taskId: task.id, projectId: task.projectId } },
      create: {
        taskId: task.id,
        projectId: task.projectId,
        isPrimary: true,
      },
      update: {
        deletedAt: null,
        isPrimary: true,
      },
    });

    await client.taskProjectLink.updateMany({
      where: {
        taskId: task.id,
        deletedAt: null,
        id: { not: canonical.id },
      },
      data: {
        isPrimary: false,
      },
    });
  }
}
