import { Injectable } from '@nestjs/common';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly cycleDetection: CycleDetectionService,
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
      where: { parentId },
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
        where: { parentId },
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
      const task: Task | null = await this.prisma.task.findUnique({
        where: { id: currentId },
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
      const task: Task | null = await this.prisma.task.findUnique({
        where: { id: currentId },
      });

      if (!task) break;

      path.unshift(task);
      currentId = task.parentId;
    }

    return path;
  }

  /**
   * Add a dependency between tasks
   */
  async addDependency(
    taskId: string,
    dependsOnId: string,
    type: DependencyType = DependencyType.BLOCKS,
  ): Promise<DependencyInfo> {
    // Check for cycles
    const wouldCreateCycle = await this.cycleDetection.wouldCreateCycle(taskId, dependsOnId);
    if (wouldCreateCycle) {
      throw new Error('Cannot create dependency: would create a circular dependency');
    }

    const dependency = await this.prisma.taskDependency.create({
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

    return {
      id: dependency.id,
      taskId: dependency.taskId,
      dependsOnId: dependency.dependsOnId,
      type: dependency.type,
      createdAt: dependency.createdAt,
      dependsOnTask: dependency.dependsOn,
    };
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
  }

  /**
   * Get all dependencies for a task
   */
  async getDependencies(taskId: string): Promise<DependencyInfo[]> {
    const deps = await this.prisma.taskDependency.findMany({
      where: { taskId },
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
      where: { dependsOnId: taskId },
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
      where: { projectId },
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
