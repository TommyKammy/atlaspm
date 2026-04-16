export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type ProjectRole = 'ADMIN' | 'MEMBER' | 'VIEWER';
export type WorkloadViewMode = 'tasks' | 'effort';

export interface ApiError {
  error: {
    code: string;
    message: string;
    correlationId: string;
    details?: unknown;
  };
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  followerCount?: number;
  isFollowedByCurrentUser?: boolean;
}

export interface TaskProjectLinkProjectSummary {
  id: string;
  name: string;
  workspaceId: string;
}

export interface TaskProjectLinkMutationResult {
  id: string;
  taskId: string;
  projectId: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TaskProjectLink extends TaskProjectLinkMutationResult {
  project: TaskProjectLinkProjectSummary;
}

export interface WeeklyLoadTask {
  id: string;
  title: string;
  dueAt: string | null;
  priority: string | null;
  status: string;
  estimateMinutes: number | null;
  spentMinutes: number;
}

export interface WeeklyLoad {
  week: string;
  startDate: string;
  endDate: string;
  capacityMinutes: number;
  capacityTasks: number;
  taskCount: number;
  estimateMinutes: number;
  spentMinutes: number;
  tasks: WeeklyLoadTask[];
}

export interface OverloadAlert {
  week: string;
  taskCount?: number;
  estimateMinutes: number;
  capacity: number;
  excess: number;
}

export interface UserWorkload {
  userId: string;
  userName: string;
  email: string;
  totalTasks: number;
  totalEstimateMinutes: number;
  totalSpentMinutes: number;
  weeklyBreakdown: WeeklyLoad[];
  overloadAlerts: OverloadAlert[];
}
