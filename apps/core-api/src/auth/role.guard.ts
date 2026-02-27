import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ProjectRole, WorkspaceRole } from '@prisma/client';
import { DomainService } from '../common/domain.service';
import type { AppRequest } from '../common/types';

type Source = 'params' | 'body' | 'query';
type IdSelector = {
  source: Source;
  key: string;
};

type ProjectRoleRequirement = {
  minRole: ProjectRole;
  projectId: IdSelector;
};

type WorkspaceRoleRequirement = {
  minRole: WorkspaceRole;
  workspaceId: IdSelector;
};

const PROJECT_ROLE_REQUIREMENT = 'project-role-requirement';
const WORKSPACE_ROLE_REQUIREMENT = 'workspace-role-requirement';

const DEFAULT_PROJECT_SELECTOR: IdSelector = { source: 'params', key: 'id' };
const DEFAULT_WORKSPACE_SELECTOR: IdSelector = { source: 'params', key: 'id' };

export function RequireProjectRole(minRole: ProjectRole, projectId: IdSelector = DEFAULT_PROJECT_SELECTOR) {
  return SetMetadata(PROJECT_ROLE_REQUIREMENT, { minRole, projectId } satisfies ProjectRoleRequirement);
}

export function RequireWorkspaceRole(
  minRole: WorkspaceRole,
  workspaceId: IdSelector = DEFAULT_WORKSPACE_SELECTOR,
) {
  return SetMetadata(WORKSPACE_ROLE_REQUIREMENT, { minRole, workspaceId } satisfies WorkspaceRoleRequirement);
}

function resolveTargetId(req: AppRequest, selector: IdSelector): string | undefined {
  const source = req[selector.source];
  const value = source?.[selector.key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

@Injectable()
export class ProjectRoleGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(DomainService) private readonly domain: DomainService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const requirement = this.reflector.getAllAndOverride<ProjectRoleRequirement>(
      PROJECT_ROLE_REQUIREMENT,
      [context.getHandler(), context.getClass()],
    );
    if (!requirement) return true;

    const req = context.switchToHttp().getRequest<AppRequest>();
    const projectId = resolveTargetId(req, requirement.projectId);
    if (!projectId) {
      throw new BadRequestException(`Missing project id: ${requirement.projectId.source}.${requirement.projectId.key}`);
    }
    const membership = await this.domain.requireProjectRole(projectId, req.user.sub, requirement.minRole);
    req.projectRole = membership.role;
    return true;
  }
}

@Injectable()
export class WorkspaceRoleGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(DomainService) private readonly domain: DomainService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const requirement = this.reflector.getAllAndOverride<WorkspaceRoleRequirement>(
      WORKSPACE_ROLE_REQUIREMENT,
      [context.getHandler(), context.getClass()],
    );
    if (!requirement) return true;

    const req = context.switchToHttp().getRequest<AppRequest>();
    const workspaceId = resolveTargetId(req, requirement.workspaceId);
    if (!workspaceId) {
      throw new BadRequestException(
        `Missing workspace id: ${requirement.workspaceId.source}.${requirement.workspaceId.key}`,
      );
    }
    const membership = await this.domain.requireWorkspaceRole(workspaceId, req.user.sub, requirement.minRole);
    req.workspaceRole = membership.role;
    return true;
  }
}
