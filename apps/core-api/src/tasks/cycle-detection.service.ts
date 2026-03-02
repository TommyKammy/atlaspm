import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CycleDetectionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Check if adding a dependency would create a cycle
   * Uses DFS to detect cycles in the dependency graph
   */
  async wouldCreateCycle(taskId: string, dependsOnId: string): Promise<boolean> {
    // Direct self-dependency check
    if (taskId === dependsOnId) {
      return true;
    }

    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = async (currentId: string): Promise<boolean> => {
      visited.add(currentId);
      recursionStack.add(currentId);

      // Get all tasks that currentId depends on
      const dependencies = await this.prisma.taskDependency.findMany({
        where: { taskId: currentId },
        select: { dependsOnId: true },
      });

      for (const dep of dependencies) {
        // If we haven't visited this dependency yet, recurse
        if (!visited.has(dep.dependsOnId)) {
          if (await hasCycle(dep.dependsOnId)) {
            return true;
          }
        } else if (recursionStack.has(dep.dependsOnId)) {
          // Found a back edge - cycle detected
          return true;
        }
      }

      recursionStack.delete(currentId);
      return false;
    };

    // Temporarily consider the new dependency
    // First check if there's already a path from dependsOnId to taskId
    // which would mean adding taskId -> dependsOnId creates a cycle
    visited.add(taskId);
    recursionStack.add(taskId);

    // Check if dependsOnId can reach taskId (which would create a cycle)
    const dependencies = await this.prisma.taskDependency.findMany({
      where: { taskId: dependsOnId },
      select: { dependsOnId: true },
    });

    for (const dep of dependencies) {
      if (dep.dependsOnId === taskId) {
        return true; // Direct cycle
      }
      if (!visited.has(dep.dependsOnId)) {
        if (await hasCycle(dep.dependsOnId)) {
          return true;
        }
      } else if (recursionStack.has(dep.dependsOnId)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get all dependencies of a task (transitive closure)
   */
  async getAllDependencies(taskId: string): Promise<string[]> {
    const visited = new Set<string>();
    const dependencies: string[] = [];

    const visit = async (currentId: string) => {
      if (visited.has(currentId)) return;
      visited.add(currentId);

      const deps = await this.prisma.taskDependency.findMany({
        where: { taskId: currentId },
        select: { dependsOnId: true },
      });

      for (const dep of deps) {
        if (!visited.has(dep.dependsOnId)) {
          dependencies.push(dep.dependsOnId);
          await visit(dep.dependsOnId);
        }
      }
    };

    await visit(taskId);
    return dependencies;
  }

  /**
   * Get all tasks that depend on a task (reverse transitive closure)
   */
  async getAllDependents(taskId: string): Promise<string[]> {
    const visited = new Set<string>();
    const dependents: string[] = [];

    const visit = async (currentId: string) => {
      if (visited.has(currentId)) return;
      visited.add(currentId);

      const deps = await this.prisma.taskDependency.findMany({
        where: { dependsOnId: currentId },
        select: { taskId: true },
      });

      for (const dep of deps) {
        if (!visited.has(dep.taskId)) {
          dependents.push(dep.taskId);
          await visit(dep.taskId);
        }
      }
    };

    await visit(taskId);
    return dependents;
  }

  /**
   * Validate that a subtask doesn't exceed the max hierarchy depth (5 levels)
   */
  async validateHierarchyDepth(parentId: string, maxDepth: number = 5): Promise<void> {
    let currentId = parentId;
    let depth = 1;

    while (currentId && depth <= maxDepth) {
      const parent = await this.prisma.task.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });

      if (!parent || !parent.parentId) {
        return; // No more parents, depth is valid
      }

      currentId = parent.parentId;
      depth++;
    }

    if (depth > maxDepth) {
      throw new BadRequestException(`Subtask hierarchy cannot exceed ${maxDepth} levels`);
    }
  }
}
