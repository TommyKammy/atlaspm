import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GoalStatus, Prisma, ProjectRole, WorkspaceRole } from '@prisma/client';
import { DomainService } from '../common/domain.service';
import { PrismaService } from '../prisma/prisma.service';

type GoalRecord = {
  id: string;
  workspaceId: string;
  ownerUserId: string;
  title: string;
  description: string | null;
  status: GoalStatus;
  progressPercent: number;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class GoalsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DomainService) private readonly domain: DomainService,
  ) {}

  async createGoal(
    workspaceId: string,
    actorUserId: string,
    correlationId: string,
    input: {
      title: string;
      description?: string | null;
      ownerUserId?: string;
      status?: GoalStatus;
      progressPercent?: number;
    },
  ) {
    await this.domain.requireWorkspaceRole(workspaceId, actorUserId, WorkspaceRole.WS_MEMBER);
    const ownerUserId = input.ownerUserId ?? actorUserId;
    await this.requireWorkspaceOwner(workspaceId, ownerUserId);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.goal.create({
        data: {
          workspaceId,
          ownerUserId,
          title: input.title,
          description: input.description ?? null,
          status: input.status ?? GoalStatus.NOT_STARTED,
          progressPercent: input.progressPercent ?? 0,
        },
      });

      await this.domain.appendAuditOutbox({
        tx,
        actor: actorUserId,
        entityType: 'Goal',
        entityId: created.id,
        action: 'goal.created',
        afterJson: created,
        correlationId,
        outboxType: 'goal.created',
        payload: created,
      });

      return this.serializeGoal(created);
    });
  }

  async listGoals(workspaceId: string, actorUserId: string, includeArchived: boolean) {
    await this.domain.requireWorkspaceMembership(workspaceId, actorUserId);
    const goals = await this.prisma.goal.findMany({
      where: {
        workspaceId,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: [{ createdAt: 'asc' }],
    });
    return goals.map((goal) => this.serializeGoal(goal));
  }

  async getGoal(goalId: string, actorUserId: string) {
    const goal = await this.requireGoal(goalId, actorUserId);
    return this.serializeGoal(goal);
  }

  async updateGoal(
    goalId: string,
    actorUserId: string,
    correlationId: string,
    input: {
      title?: string;
      description?: string | null;
      ownerUserId?: string;
      status?: GoalStatus;
      progressPercent?: number;
    },
  ) {
    const existing = await this.requireGoal(goalId, actorUserId, { requireActive: true, minRole: WorkspaceRole.WS_MEMBER });
    if (input.ownerUserId) {
      await this.requireWorkspaceOwner(existing.workspaceId, input.ownerUserId);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.goal.update({
        where: { id: goalId },
        data: {
          ...(input.title === undefined ? {} : { title: input.title }),
          ...(input.description === undefined ? {} : { description: input.description ?? null }),
          ...(input.ownerUserId === undefined ? {} : { ownerUserId: input.ownerUserId }),
          ...(input.status === undefined ? {} : { status: input.status }),
          ...(input.progressPercent === undefined ? {} : { progressPercent: input.progressPercent }),
        },
      });

      await this.domain.appendAuditOutbox({
        tx,
        actor: actorUserId,
        entityType: 'Goal',
        entityId: goalId,
        action: 'goal.updated',
        beforeJson: existing,
        afterJson: updated,
        correlationId,
        outboxType: 'goal.updated',
        payload: updated,
      });

      return this.serializeGoal(updated);
    });
  }

  async archiveGoal(goalId: string, actorUserId: string, correlationId: string) {
    const existing = await this.requireGoal(goalId, actorUserId, { minRole: WorkspaceRole.WS_MEMBER });
    if (existing.archivedAt) {
      return { ok: true };
    }

    await this.prisma.$transaction(async (tx) => {
      const archived = await tx.goal.update({
        where: { id: goalId },
        data: { archivedAt: new Date() },
      });
      await tx.goalProjectLink.updateMany({
        where: { goalId, deletedAt: null },
        data: { deletedAt: new Date() },
      });

      await this.domain.appendAuditOutbox({
        tx,
        actor: actorUserId,
        entityType: 'Goal',
        entityId: goalId,
        action: 'goal.archived',
        beforeJson: existing,
        afterJson: archived,
        correlationId,
        outboxType: 'goal.archived',
        payload: archived,
      });
    });

    return { ok: true };
  }

  async listGoalProjects(goalId: string, actorUserId: string) {
    await this.requireGoal(goalId, actorUserId);
    const memberships = await this.prisma.projectMembership.findMany({
      where: { userId: actorUserId },
      select: { projectId: true },
    });
    const accessibleProjectIds = memberships.map((membership) => membership.projectId);

    const links = await this.prisma.goalProjectLink.findMany({
      where: {
        goalId,
        deletedAt: null,
        ...(accessibleProjectIds.length > 0 ? { projectId: { in: accessibleProjectIds } } : { projectId: '__none__' }),
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
      orderBy: [{ createdAt: 'asc' }],
    });

    return links.map((link) => ({
      id: link.id,
      goalId: link.goalId,
      projectId: link.projectId,
      project: link.project,
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
      deletedAt: link.deletedAt,
    }));
  }

  async addProjectLink(goalId: string, projectId: string, actorUserId: string, correlationId: string) {
    const goal = await this.requireGoal(goalId, actorUserId, { requireActive: true, minRole: WorkspaceRole.WS_MEMBER });
    const project = await this.requireProject(projectId, actorUserId, ProjectRole.MEMBER);
    if (project.workspaceId !== goal.workspaceId) {
      throw new BadRequestException('goal and project must be in the same workspace');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.goalProjectLink.findUnique({
          where: { goalId_projectId: { goalId, projectId } },
        });

        if (existing && !existing.deletedAt) {
          throw new ConflictException('goal is already linked to this project');
        }

        const link = existing
          ? await tx.goalProjectLink.update({
              where: { id: existing.id },
              data: { deletedAt: null },
            })
          : await tx.goalProjectLink.create({
              data: { goalId, projectId },
            });

        await this.domain.appendAuditOutbox({
          tx,
          actor: actorUserId,
          entityType: 'GoalProjectLink',
          entityId: link.id,
          action: 'goal.project_linked',
          beforeJson: existing ?? null,
          afterJson: link,
          correlationId,
          outboxType: 'goal.project_linked',
          payload: {
            goalId,
            projectId,
            workspaceId: goal.workspaceId,
            linkId: link.id,
          },
        });

        return {
          id: link.id,
          goalId: link.goalId,
          projectId: link.projectId,
          createdAt: link.createdAt,
          updatedAt: link.updatedAt,
          deletedAt: link.deletedAt,
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('goal is already linked to this project');
      }
      throw error;
    }
  }

  async removeProjectLink(goalId: string, projectId: string, actorUserId: string, correlationId: string) {
    await this.requireGoal(goalId, actorUserId, { minRole: WorkspaceRole.WS_MEMBER });
    await this.requireProject(projectId, actorUserId, ProjectRole.MEMBER);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.goalProjectLink.findUnique({
        where: { goalId_projectId: { goalId, projectId } },
      });
      if (!existing || existing.deletedAt) {
        throw new NotFoundException('goal project link not found');
      }

      const updated = await tx.goalProjectLink.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      });

      await this.domain.appendAuditOutbox({
        tx,
        actor: actorUserId,
        entityType: 'GoalProjectLink',
        entityId: existing.id,
        action: 'goal.project_unlinked',
        beforeJson: existing,
        afterJson: updated,
        correlationId,
        outboxType: 'goal.project_unlinked',
        payload: {
          goalId,
          projectId,
          linkId: existing.id,
        },
      });

      return { ok: true };
    });
  }

  private async requireGoal(
    goalId: string,
    actorUserId: string,
    options?: { requireActive?: boolean; minRole?: WorkspaceRole },
  ): Promise<GoalRecord> {
    const goal = await this.prisma.goal.findUnique({
      where: { id: goalId },
    });
    if (!goal) {
      throw new NotFoundException('goal not found');
    }
    await this.domain.requireWorkspaceRole(goal.workspaceId, actorUserId, options?.minRole ?? WorkspaceRole.WS_MEMBER);
    if (options?.requireActive && goal.archivedAt) {
      throw new ConflictException('goal is archived');
    }
    return goal;
  }

  private async requireWorkspaceOwner(workspaceId: string, ownerUserId: string) {
    try {
      await this.domain.requireWorkspaceMembership(workspaceId, ownerUserId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new BadRequestException('goal owner must be a workspace member');
      }
      throw error;
    }
  }

  private async requireProject(projectId: string, actorUserId: string, minRole: ProjectRole) {
    await this.domain.requireProjectRole(projectId, actorUserId, minRole);
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, workspaceId: true },
    });
    if (!project) {
      throw new NotFoundException('project not found');
    }
    return project;
  }

  private serializeGoal(goal: GoalRecord) {
    return {
      id: goal.id,
      workspaceId: goal.workspaceId,
      ownerUserId: goal.ownerUserId,
      title: goal.title,
      description: goal.description,
      status: goal.status,
      progressPercent: goal.progressPercent,
      archivedAt: goal.archivedAt,
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt,
    };
  }
}
