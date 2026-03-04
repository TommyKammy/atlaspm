import type { Task } from '../entities/task.js';

export interface SaveTaskOptions {
  expectedVersion?: number;
}

export interface TaskRepository {
  findById(taskId: string): Promise<Task | null>;
  save(task: Task, options?: SaveTaskOptions): Promise<void>;
}
