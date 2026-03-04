import { Prisma, TaskStatus } from '@prisma/client';
import {
  assertTaskStatus,
  assertTaskType,
  DomainConflictError,
  DomainNotFoundError,
  type CompleteTaskLifecycleContext,
  type SaveTaskLifecycleStateInput,
  type TaskLifecycleRepository,
  type TaskLifecycleState,
  type UnitOfWork,
} from '@atlaspm/domain';

export class PrismaTaskLifecycleRepository implements TaskLifecycleRepository {
  constructor(private readonly tx: Prisma.TransactionClient) {}

  async findActiveById(taskId: string): Promise<TaskLifecycleState | null> {
    const task = await this.tx.task.findFirst({
      where: { id: taskId, deletedAt: null },
      select: {
        id: true,
        projectId: true,
        type: true,
        status: true,
        progressPercent: true,
        completedAt: true,
        version: true,
      },
    });
    if (!task) return null;

    return {
      id: task.id,
      projectId: task.projectId,
      type: assertTaskType(task.type),
      status: assertTaskStatus(task.status),
      progressPercent: task.progressPercent,
      completedAt: task.completedAt,
      version: task.version,
    };
  }

  async countIncompleteDescendants(taskId: string): Promise<number> {
    const descendantIds = await this.collectDescendantIds(taskId);
    if (!descendantIds.length) return 0;
    return this.tx.task.count({
      where: {
        id: { in: descendantIds },
        deletedAt: null,
        status: { not: TaskStatus.DONE },
      },
    });
  }

  async saveLifecycleState(input: SaveTaskLifecycleStateInput): Promise<TaskLifecycleState> {
    const updated = await this.tx.task.updateMany({
      where: {
        id: input.taskId,
        deletedAt: null,
        version: input.expectedVersion,
      },
      data: {
        status: input.status,
        progressPercent: input.progressPercent,
        completedAt: input.completedAt,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new DomainConflictError('Version conflict', 'VERSION_CONFLICT');
    }

    const task = await this.findActiveById(input.taskId);
    if (!task) {
      throw new DomainNotFoundError('Task not found');
    }
    return task;
  }

  private async collectDescendantIds(taskId: string): Promise<string[]> {
    const descendantIds: string[] = [];
    let frontier: string[] = [taskId];

    while (frontier.length > 0) {
      const children = await this.tx.task.findMany({
        where: {
          parentId: { in: frontier },
          deletedAt: null,
        },
        select: { id: true },
      });
      frontier = children.map((child) => child.id);
      descendantIds.push(...frontier);
    }

    return descendantIds;
  }
}

export function createTaskLifecycleUnitOfWorkFromTx(
  tx: Prisma.TransactionClient,
): UnitOfWork<CompleteTaskLifecycleContext> {
  const repository = new PrismaTaskLifecycleRepository(tx);
  return {
    run<T>(work: (context: CompleteTaskLifecycleContext) => Promise<T>): Promise<T> {
      return work({ taskLifecycleRepository: repository });
    },
  };
}
