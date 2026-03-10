import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GoalStatus, Prisma, ProjectRole, ProjectStatusHealth, WorkspaceRole } from '@prisma/client';
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

type GoalHistoryRecord = {
  action: string;
  status: GoalStatus;
  progressPercent: number;
  actor: string;
  createdAt: Date;
};

const DEFAULT_GOAL_HISTORY_TAKE = 100;

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

  async getGoalHistory(
    goalId: string,
    actorUserId: string,
    take: number | string = DEFAULT_GOAL_HISTORY_TAKE,
  ): Promise<GoalHistoryRecord[]> {
    await this.requireGoal(goalId, actorUserId);
    const boundedTake = this.normalizeHistoryTake(take);
    const events = await this.prisma.auditEvent.findMany({
      where: {
        entityType: 'Goal',
        entityId: goalId,
        action: {
          in: ['goal.created', 'goal.updated', 'goal.status_rollup_updated'],
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: boundedTake,
    });

    return events.flatMap((event) => {
      const snapshot = this.readGoalSnapshot(event.afterJson);
      if (!snapshot) {
        return [];
      }

      const beforeSnapshot = this.readGoalSnapshot(event.beforeJson);
      if (
        event.action === 'goal.updated' &&
        beforeSnapshot &&
        beforeSnapshot.status === snapshot.status &&
        beforeSnapshot.progressPercent === snapshot.progressPercent
      ) {
        return [];
      }

      return [
        {
          action: event.action,
          status: snapshot.status,
          progressPercent: snapshot.progressPercent,
          actor: event.actor,
          createdAt: event.createdAt,
        },
      ];
    });
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

        await this.refreshGoalRollup(goalId, actorUserId, correlationId, tx);

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

      await this.refreshGoalRollup(goalId, actorUserId, correlationId, tx);

      return { ok: true };
    });
  }

  async refreshGoalRollupsForProject(
    projectId: string,
    actorUserId: string,
    correlationId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const linkedGoals = await client.goalProjectLink.findMany({
      where: {
        projectId,
        deletedAt: null,
        goal: {
          archivedAt: null,
        },
      },
      select: {
        goalId: true,
      },
    });

    for (const linkedGoal of linkedGoals) {
      await this.refreshGoalRollup(linkedGoal.goalId, actorUserId, correlationId, client);
    }
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

  private async refreshGoalRollup(
    goalId: string,
    actorUserId: string,
    correlationId: string,
    tx: Prisma.TransactionClient | PrismaService,
  ) {
    const goal = await tx.goal.findUnique({
      where: { id: goalId },
    });
    if (!goal || goal.archivedAt) {
      return;
    }

    const links = await tx.goalProjectLink.findMany({
      where: {
        goalId,
        deletedAt: null,
      },
      select: {
        projectId: true,
      },
    });

    const projectIds = links.map((link) => link.projectId);
    const latestHealthByProject = new Map<string, ProjectStatusHealth>();
    const latestUpdates = await Promise.all(
      projectIds.map((projectId) =>
        tx.projectStatusUpdate.findFirst({
          where: { projectId },
          select: {
            projectId: true,
            health: true,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      ),
    );

    for (const update of latestUpdates) {
      if (update) {
        latestHealthByProject.set(update.projectId, update.health);
      }
    }

    const nextProgressPercent =
      projectIds.length === 0
        ? 0
        : Math.round(
            projectIds.reduce((sum, projectId) => {
              return sum + this.projectHealthToProgress(latestHealthByProject.get(projectId));
            }, 0) / projectIds.length,
          );
    const nextStatus = this.rollupGoalStatus(projectIds, latestHealthByProject);

    if (goal.status === nextStatus && goal.progressPercent === nextProgressPercent) {
      return;
    }

    const updated = await tx.goal.update({
      where: { id: goalId },
      data: {
        status: nextStatus,
        progressPercent: nextProgressPercent,
      },
    });

    await this.domain.appendAuditOutbox({
      tx,
      actor: actorUserId,
      entityType: 'Goal',
      entityId: goalId,
      action: 'goal.status_rollup_updated',
      beforeJson: goal,
      afterJson: updated,
      correlationId,
      outboxType: 'goal.status_rollup_updated',
      payload: {
        id: updated.id,
        workspaceId: updated.workspaceId,
        status: updated.status,
        progressPercent: updated.progressPercent,
      },
    });
  }

  private rollupGoalStatus(
    projectIds: string[],
    latestHealthByProject: Map<string, ProjectStatusHealth>,
  ): GoalStatus {
    if (projectIds.length === 0) {
      return GoalStatus.NOT_STARTED;
    }

    const latestHealths = projectIds
      .map((projectId) => latestHealthByProject.get(projectId))
      .filter((health): health is ProjectStatusHealth => health !== undefined);

    if (latestHealths.includes(ProjectStatusHealth.OFF_TRACK)) {
      return GoalStatus.OFF_TRACK;
    }
    if (latestHealths.includes(ProjectStatusHealth.AT_RISK)) {
      return GoalStatus.AT_RISK;
    }
    if (latestHealths.includes(ProjectStatusHealth.ON_TRACK)) {
      return GoalStatus.ON_TRACK;
    }
    return GoalStatus.NOT_STARTED;
  }

  private projectHealthToProgress(health: ProjectStatusHealth | undefined) {
    switch (health) {
      case ProjectStatusHealth.ON_TRACK:
        return 100;
      case ProjectStatusHealth.AT_RISK:
        return 50;
      case ProjectStatusHealth.OFF_TRACK:
      default:
        return 0;
    }
  }

  private readGoalSnapshot(value: Prisma.JsonValue | null): Pick<GoalHistoryRecord, 'status' | 'progressPercent'> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, Prisma.JsonValue>;
    const status = record.status;
    const progressPercent = record.progressPercent;
    if (!Object.values(GoalStatus).includes(status as GoalStatus) || typeof progressPercent !== 'number') {
      return null;
    }

    return {
      status: status as GoalStatus,
      progressPercent,
    };
  }

  private normalizeHistoryTake(take: number | string) {
    const numericTake = typeof take === 'string' ? Number.parseInt(take, 10) : take;
    if (!Number.isFinite(numericTake)) {
      return DEFAULT_GOAL_HISTORY_TAKE;
    }
    return Math.max(1, Math.min(100, Math.trunc(numericTake)));
  }
}
