import { BadRequestException, ConflictException, Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CycleDetectionService } from './cycle-detection.service';
import { Prisma, DependencyType, type Task } from '@prisma/client';

export interface SubtaskTreeNode extends Task {
  children: SubtaskTreeNode[];
  depth: number;
}

export interface DependencyInfo {
  id: string;
  taskId: string;
  dependsOnId: string;
  type: DependencyType;
  createdAt: Date;
  dependsOnTask?: {
    id: string;
    title: string;
    status: string;
  };
}

@Injectable()
export class SubtaskService {
  private readonly logger = new Logger(SubtaskService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CycleDetectionService) private readonly cycleDetection: CycleDetectionService,
  ) {}

  /**
   * Create a subtask under a parent task
   */
  async createSubtask(
    parentId: string,
    taskData: Omit<Partial<Task>, 'id' | 'parentId'> & { title: string; projectId: string; sectionId: string },
  ): Promise<Task> {
    // Validate hierarchy depth (max 5 levels)
    await this.cycleDetection.validateHierarchyDepth(parentId, 5);

    const data: Prisma.TaskUncheckedCreateInput = {
      ...taskData as unknown as Prisma.TaskUncheckedCreateInput,
      parentId,
    };
    return this.prisma.task.create({ data });
  }

  /**
   * Get all subtasks for a task (direct children only)
   */
  async getSubtasks(parentId: string): Promise<Task[]> {
    return this.prisma.task.findMany({
      where: { parentId, deletedAt: null },
      orderBy: { position: 'asc' },
    });
  }

  /**
   * Get full subtask tree with depth information
   */
  async getSubtaskTree(taskId: string, maxDepth: number = 5): Promise<SubtaskTreeNode[]> {
    const buildTree = async (parentId: string, currentDepth: number): Promise<SubtaskTreeNode[]> => {
      if (currentDepth > maxDepth) return [];

      const children = await this.prisma.task.findMany({
        where: { parentId, deletedAt: null },
        orderBy: { position: 'asc' },
      });

      const result: SubtaskTreeNode[] = [];
      for (const child of children) {
        const node: SubtaskTreeNode = {
          ...child,
          depth: currentDepth,
          children: await buildTree(child.id, currentDepth + 1),
        };
        result.push(node);
      }

      return result;
    };

    return buildTree(taskId, 1);
  }

  /**
   * Get the root task of a subtask hierarchy
   */
  async getRootTask(taskId: string): Promise<Task | null> {
    let currentId = taskId;
    let currentTask: Task | null = null;

    while (currentId) {
      const task: Task | null = await this.prisma.task.findFirst({
        where: { id: currentId, deletedAt: null },
      });

      if (!task) return null;

      currentTask = task;
      currentId = task.parentId ?? '';
    }

    return currentTask;
  }

  /**
   * Get breadcrumb path from root to task
   */
  async getBreadcrumbPath(taskId: string): Promise<Task[]> {
    const path: Task[] = [];
    let currentId: string | null = taskId;

    while (currentId) {
      const task: Task | null = await this.prisma.task.findFirst({
        where: { id: currentId, deletedAt: null },
      });

      if (!task) break;

      path.unshift(task);
      currentId = task.parentId;
    }

    return path;
  }

  /**
   * Add a dependency between tasks
   * Uses transaction to ensure race condition safety
   */
  async addDependency(
    taskId: string,
    dependsOnId: string,
    type: DependencyType = DependencyType.BLOCKS,
  ): Promise<DependencyInfo> {
    // Self-dependency check (early validation)
    if (taskId === dependsOnId) {
      this.logger.warn(`Self-dependency attempt blocked: ${taskId}`);
      throw new ConflictException({
        code: 'DEPENDENCY_CYCLE_DETECTED',
        message: 'Cannot create dependency: a task cannot depend on itself',
      });
    }

    return await this.prisma.$transaction(async (tx) => {
      // Check if tasks exist and belong to the same project (within transaction)
      const [task, dependsOnTask] = await Promise.all([
        tx.task.findFirst({
          where: { id: taskId, deletedAt: null },
          select: { id: true, projectId: true },
        }),
        tx.task.findFirst({
          where: { id: dependsOnId, deletedAt: null },
          select: { id: true, projectId: true },
        }),
      ]);

      if (!task) {
        throw new BadRequestException({
          code: 'TASK_NOT_FOUND',
          message: `Task ${taskId} not found`,
        });
      }

      if (!dependsOnTask) {
        throw new BadRequestException({
          code: 'DEPENDENCY_TASK_NOT_FOUND',
          message: `Dependency task ${dependsOnId} not found`,
        });
      }

      // Cross-project dependency check
      if (task.projectId !== dependsOnTask.projectId) {
        this.logger.warn(`Cross-project dependency attempt blocked: ${taskId} (project: ${task.projectId}) -> ${dependsOnId} (project: ${dependsOnTask.projectId})`);
        throw new ConflictException({
          code: 'CROSS_PROJECT_DEPENDENCY',
          message: 'Cannot create dependency: tasks must belong to the same project',
        });
      }

      // Check for cycles using transaction-aware cycle detection
      const wouldCreateCycle = await this.cycleDetection.wouldCreateCycleWithTx(tx, taskId, dependsOnId);
      if (wouldCreateCycle) {
        this.logger.warn(`Circular dependency attempt blocked: ${taskId} -> ${dependsOnId}`);
        throw new ConflictException({
          code: 'DEPENDENCY_CYCLE_DETECTED',
          message: 'Cannot create dependency: would create a circular dependency',
        });
      }

      try {
        const dependency = await tx.taskDependency.create({
          data: {
            taskId,
            dependsOnId,
            type,
          },
          include: {
            dependsOn: {
              select: {
                id: true,
                title: true,
                status: true,
              },
            },
          },
        });

        this.logger.log(`Dependency created: ${taskId} -> ${dependsOnId} (type: ${type})`);

        return {
          id: dependency.id,
          taskId: dependency.taskId,
          dependsOnId: dependency.dependsOnId,
          type: dependency.type,
          createdAt: dependency.createdAt,
          dependsOnTask: dependency.dependsOn ?? undefined,
        };
      } catch (error: any) {
        // Handle unique constraint violation (P2002)
        if (error.code === 'P2002') {
          this.logger.warn(`Duplicate dependency attempt: ${taskId} -> ${dependsOnId}`);
          throw new ConflictException({
            code: 'DEPENDENCY_ALREADY_EXISTS',
            message: 'This dependency already exists',
          });
        }
        throw error;
      }
    }, {
      // Transaction options for better isolation
      isolationLevel: 'Serializable',
      maxWait: 5000,
      timeout: 10000,
    });
  }

  /**
   * Remove a dependency
   */
  async removeDependency(taskId: string, dependsOnId: string): Promise<void> {
    await this.prisma.taskDependency.deleteMany({
      where: {
        taskId,
        dependsOnId,
      },
    });
    this.logger.log(`Dependency removed: ${taskId} -> ${dependsOnId}`);
  }

  /**
   * Get all dependencies for a task
   */
  async getDependencies(taskId: string): Promise<DependencyInfo[]> {
    const deps = await this.prisma.taskDependency.findMany({
      where: { taskId, dependsOn: { deletedAt: null } },
      include: {
        dependsOn: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return deps.map((dep) => ({
      id: dep.id,
      taskId: dep.taskId,
      dependsOnId: dep.dependsOnId,
      type: dep.type,
      createdAt: dep.createdAt,
      dependsOnTask: dep.dependsOn,
    }));
  }

  /**
   * Get all tasks that depend on this task
   */
  async getDependents(taskId: string): Promise<DependencyInfo[]> {
    const deps = await this.prisma.taskDependency.findMany({
      where: { dependsOnId: taskId, task: { deletedAt: null } },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return deps.map((dep) => ({
      id: dep.id,
      taskId: dep.taskId,
      dependsOnId: dep.dependsOnId,
      type: dep.type,
      createdAt: dep.createdAt,
      dependsOnTask: dep.task,
    }));
  }

  /**
   * Check if a task is blocked by uncompleted dependencies
   */
  async isBlocked(taskId: string): Promise<boolean> {
    const blockingDeps = await this.prisma.taskDependency.findMany({
      where: {
        taskId,
        type: { in: [DependencyType.BLOCKS, DependencyType.BLOCKED_BY] },
        dependsOn: { deletedAt: null },
      },
      include: {
        dependsOn: {
          select: { status: true },
        },
      },
    });

    return blockingDeps.some((dep) => dep.dependsOn.status !== 'DONE');
  }

  /**
   * Get dependency graph for visualization
   */
  async getDependencyGraph(projectId: string): Promise<{
    nodes: { id: string; title: string; status: string }[];
    links: { source: string; target: string; type: DependencyType }[];
  }> {
    const tasks = await this.prisma.task.findMany({
      where: { projectId, deletedAt: null },
      select: { id: true, title: true, status: true },
    });

    const dependencies = await this.prisma.taskDependency.findMany({
      where: {
        taskId: { in: tasks.map((t) => t.id) },
      },
      select: { taskId: true, dependsOnId: true, type: true },
    });

    return {
      nodes: tasks,
      links: dependencies.map((d) => ({
        source: d.dependsOnId,
        target: d.taskId,
        type: d.type,
      })),
    };
  }
}
