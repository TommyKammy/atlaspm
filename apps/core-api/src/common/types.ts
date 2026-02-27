import type { Request } from 'express';
import type { ProjectRole, WorkspaceRole } from '@prisma/client';

export interface AuthUser {
  sub: string;
  email?: string;
  name?: string;
}

export type AppRequest = Request & {
  user: AuthUser;
  correlationId: string;
  projectRole?: ProjectRole;
  workspaceRole?: WorkspaceRole;
};
