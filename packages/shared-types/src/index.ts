export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type ProjectRole = 'ADMIN' | 'MEMBER' | 'VIEWER';

export interface ApiError {
  error: {
    code: string;
    message: string;
    correlationId: string;
    details?: unknown;
  };
}
