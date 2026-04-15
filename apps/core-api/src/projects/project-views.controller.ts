import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  CustomFieldType,
  Prisma,
  ProjectRole,
  TaskStatus,
  type ProjectSavedView,
  type ProjectViewPreference,
} from '@prisma/client';
import {
  PROJECT_VIEW_MODES,
  normalizeProjectViewState,
  type ProjectViewCustomFieldFilter,
  type ProjectViewMode,
  type ProjectViewState,
} from '@atlaspm/domain';
import { AuthGuard } from '../auth/auth.guard';
import { AuditOutboxService } from '../common/audit-outbox.service';
import { AuthorizationService } from '../common/authorization.service';
import { CurrentRequest } from '../common/current-request';
import type { AppRequest } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

class PutProjectViewDefaultDto {
  @IsObject()
  state!: Record<string, unknown>;
}

class CreateProjectSavedViewDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsString()
  mode!: string;

  @IsObject()
  state!: Record<string, unknown>;
}

class PatchProjectSavedViewDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsObject()
  state?: Record<string, unknown>;
}

type ProjectViewDbClient = Prisma.TransactionClient;
type ProjectViewReadClient = Pick<PrismaService, 'projectMembership' | 'customFieldDefinition'>;
type ProjectViewValidationContext = {
  validAssigneeIds: Set<string>;
  customFieldsById: Map<
    string,
    {
      type: CustomFieldType;
      optionIds: Set<string>;
    }
  >;
};

@Controller()
@UseGuards(AuthGuard)
export class ProjectViewsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditOutboxService) private readonly auditOutbox: AuditOutboxService,
    @Inject(AuthorizationService) private readonly authorization: AuthorizationService,
  ) {}

  @Get('projects/:id/saved-views')
  async list(@Param('id') projectId: string, @CurrentRequest() req: AppRequest) {
    await this.authorization.requireProjectRole(projectId, req.user.sub, ProjectRole.VIEWER);
    return this.buildSavedViewsResponse(projectId, req.user.sub);
  }

  @Put('projects/:id/saved-views/defaults/:mode')
  async putDefault(
    @Param('id') projectId: string,
    @Param('mode') rawMode: string,
    @Body() body: PutProjectViewDefaultDto,
    @CurrentRequest() req: AppRequest,
  ) {
    await this.authorization.requireProjectRole(projectId, req.user.sub, ProjectRole.VIEWER);
    const mode = this.parseProjectViewMode(rawMode);

    await this.prisma.$transaction(async (tx) => {
      const normalizedState = await this.normalizeAndValidateProjectViewState(
        tx,
        projectId,
        mode,
        body.state,
      );
      const before = await tx.projectViewPreference.findUnique({
        where: {
          projectId_userId_mode: {
            projectId,
            userId: req.user.sub,
            mode,
          },
        },
      });
      const updated = await tx.projectViewPreference.upsert({
        where: {
          projectId_userId_mode: {
            projectId,
            userId: req.user.sub,
            mode,
          },
        },
        create: {
          projectId,
          userId: req.user.sub,
          mode,
          state: normalizedState,
        },
        update: {
          state: normalizedState,
        },
      });

      await this.auditOutbox.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'ProjectViewPreference',
        entityId: updated.id,
        action: 'project.view_default.updated',
        beforeJson: before,
        afterJson: updated,
        correlationId: req.correlationId,
        outboxType: 'project.view_default.updated',
        payload: {
          id: updated.id,
          projectId,
          userId: req.user.sub,
          mode,
          state: normalizedState,
        },
      });
    });

    return this.buildSavedViewsResponse(projectId, req.user.sub);
  }

  @Post('projects/:id/saved-views')
  async create(
    @Param('id') projectId: string,
    @Body() body: CreateProjectSavedViewDto,
    @CurrentRequest() req: AppRequest,
  ) {
    await this.authorization.requireProjectRole(projectId, req.user.sub, ProjectRole.VIEWER);
    const mode = this.parseProjectViewMode(body.mode);
    const name = this.normalizeSavedViewName(body.name);

    return this.prisma.$transaction(async (tx) => {
      const normalizedState = await this.normalizeAndValidateProjectViewState(
        tx,
        projectId,
        mode,
        body.state,
      );
      const created = await tx.projectSavedView.create({
        data: {
          projectId,
          userId: req.user.sub,
          name,
          mode,
          state: normalizedState,
        },
      });

      await this.auditOutbox.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'ProjectSavedView',
        entityId: created.id,
        action: 'project.saved_view.created',
        afterJson: created,
        correlationId: req.correlationId,
        outboxType: 'project.saved_view.created',
        payload: created,
      });

      return this.serializeSavedView(created);
    });
  }

  @Patch('saved-views/:id')
  async patch(
    @Param('id') viewId: string,
    @Body() body: PatchProjectSavedViewDto,
    @CurrentRequest() req: AppRequest,
  ) {
    const existing = await this.getOwnedSavedViewOrThrow(viewId, req.user.sub);
    await this.authorization.requireProjectRole(existing.projectId, req.user.sub, ProjectRole.VIEWER);
    const mode = this.parseProjectViewMode(existing.mode);

    return this.prisma.$transaction(async (tx) => {
      const nextName = body.name === undefined ? existing.name : this.normalizeSavedViewName(body.name);
      const nextState =
        body.state === undefined
          ? this.normalizePersistedProjectViewState(mode, existing.state)
          : await this.normalizeAndValidateProjectViewState(tx, existing.projectId, mode, body.state);
      const updated = await tx.projectSavedView.update({
        where: { id: existing.id },
        data: {
          name: nextName,
          state: nextState,
        },
      });

      await this.auditOutbox.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'ProjectSavedView',
        entityId: existing.id,
        action: 'project.saved_view.updated',
        beforeJson: existing,
        afterJson: updated,
        correlationId: req.correlationId,
        outboxType: 'project.saved_view.updated',
        payload: updated,
      });

      return this.serializeSavedView(updated);
    });
  }

  @Delete('saved-views/:id')
  async remove(@Param('id') viewId: string, @CurrentRequest() req: AppRequest) {
    const existing = await this.getOwnedSavedViewOrThrow(viewId, req.user.sub);
    await this.authorization.requireProjectRole(existing.projectId, req.user.sub, ProjectRole.VIEWER);

    return this.prisma.$transaction(async (tx) => {
      await tx.projectSavedView.delete({ where: { id: existing.id } });
      await this.auditOutbox.appendAuditOutbox({
        tx,
        actor: req.user.sub,
        entityType: 'ProjectSavedView',
        entityId: existing.id,
        action: 'project.saved_view.deleted',
        beforeJson: existing,
        correlationId: req.correlationId,
        outboxType: 'project.saved_view.deleted',
        payload: {
          id: existing.id,
          projectId: existing.projectId,
          userId: existing.userId,
          mode: existing.mode,
          name: existing.name,
        },
      });

      return { ok: true };
    });
  }

  private async buildSavedViewsResponse(projectId: string, userId: string) {
    const [preferences, views, validationContext] = await Promise.all([
      this.prisma.projectViewPreference.findMany({
        where: { projectId, userId },
      }),
      this.prisma.projectSavedView.findMany({
        where: { projectId, userId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.loadProjectViewValidationContext(this.prisma, projectId),
    ]);

    return {
      projectId,
      userId,
      defaultsByMode: this.serializeDefaultsByMode(preferences, validationContext),
      views: views.map((view) => this.serializeSavedView(view, validationContext)),
    };
  }

  private serializeDefaultsByMode(
    preferences: ProjectViewPreference[],
    validationContext: ProjectViewValidationContext,
  ) {
    const defaultsByMode: Record<ProjectViewMode, ProjectViewState | null> = {
      list: null,
      board: null,
      timeline: null,
      gantt: null,
    };

    for (const preference of preferences) {
      if (!PROJECT_VIEW_MODES.includes(preference.mode as ProjectViewMode)) {
        continue;
      }
      const mode = preference.mode as ProjectViewMode;
      const state = this.sanitizePersistedProjectViewState(mode, preference.state, validationContext);
      defaultsByMode[mode] = Object.keys(state).length > 0 ? state : null;
    }

    return defaultsByMode;
  }

  private serializeSavedView(view: ProjectSavedView, validationContext?: ProjectViewValidationContext) {
    const mode = this.parseProjectViewMode(view.mode);
    return {
      id: view.id,
      projectId: view.projectId,
      userId: view.userId,
      name: view.name,
      mode,
      state: validationContext
        ? this.sanitizePersistedProjectViewState(mode, view.state, validationContext)
        : this.normalizePersistedProjectViewState(mode, view.state),
      createdAt: view.createdAt,
      updatedAt: view.updatedAt,
    };
  }

  private parseProjectViewMode(rawMode: string): ProjectViewMode {
    if (PROJECT_VIEW_MODES.includes(rawMode as ProjectViewMode)) {
      return rawMode as ProjectViewMode;
    }
    throw new BadRequestException('Invalid project view mode');
  }

  private normalizeSavedViewName(rawName: string): string {
    const name = rawName.trim();
    if (!name) {
      throw new BadRequestException('Saved view name cannot be empty');
    }
    return name;
  }

  private async getOwnedSavedViewOrThrow(viewId: string, userId: string): Promise<ProjectSavedView> {
    const existing = await this.prisma.projectSavedView.findUnique({
      where: { id: viewId },
    });
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Saved view not found');
    }
    return existing;
  }

  private normalizePersistedProjectViewState(
    mode: ProjectViewMode,
    rawState: Prisma.JsonValue,
  ): ProjectViewState {
    if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) {
      return {};
    }

    return normalizeProjectViewState(mode, rawState as Partial<ProjectViewState>);
  }

  private sanitizePersistedProjectViewState(
    mode: ProjectViewMode,
    rawState: Prisma.JsonValue,
    validationContext: ProjectViewValidationContext,
  ): ProjectViewState {
    const normalizedState = this.normalizePersistedProjectViewState(mode, rawState);
    const filters = normalizedState.filters;

    if (!filters) {
      return normalizedState;
    }

    const sanitizedFilters: NonNullable<ProjectViewState['filters']> = { ...filters };

    if (sanitizedFilters.assigneeIds?.length) {
      sanitizedFilters.assigneeIds = sanitizedFilters.assigneeIds.filter((assigneeId) =>
        validationContext.validAssigneeIds.has(assigneeId),
      );
      if (!sanitizedFilters.assigneeIds.length) {
        delete sanitizedFilters.assigneeIds;
      }
    }

    if (sanitizedFilters.customFieldFilters?.length) {
      sanitizedFilters.customFieldFilters = sanitizedFilters.customFieldFilters
        .map((filter) => {
          const field = validationContext.customFieldsById.get(filter.fieldId);
          if (!field || field.type !== (filter.type as CustomFieldType)) {
            return null;
          }

          if (filter.type === 'SELECT') {
            const optionIds = (filter.optionIds ?? []).filter((optionId) => field.optionIds.has(optionId));
            return optionIds.length ? { ...filter, optionIds } : null;
          }

          return filter;
        })
        .filter((filter): filter is ProjectViewCustomFieldFilter => Boolean(filter));

      if (!sanitizedFilters.customFieldFilters.length) {
        delete sanitizedFilters.customFieldFilters;
      }
    }

    const nextState: ProjectViewState = {
      ...normalizedState,
      filters: Object.keys(sanitizedFilters).length > 0 ? sanitizedFilters : undefined,
    };
    if (!nextState.filters) {
      delete nextState.filters;
    }

    return normalizeProjectViewState(mode, nextState);
  }

  private async normalizeAndValidateProjectViewState(
    tx: ProjectViewDbClient,
    projectId: string,
    mode: ProjectViewMode,
    rawState: Record<string, unknown>,
  ): Promise<Prisma.JsonObject> {
    const normalizedState = normalizeProjectViewState(mode, rawState as Partial<ProjectViewState>);
    if (Object.keys(normalizedState).length === 0) {
      throw new BadRequestException('At least one valid saved view state field must be provided');
    }

    await this.validateStatusIds(normalizedState);
    await this.validateAssigneeIds(tx, projectId, normalizedState);
    await this.validateCustomFieldFilters(tx, projectId, normalizedState);

    return normalizedState as Prisma.JsonObject;
  }

  private async loadProjectViewValidationContext(
    client: ProjectViewReadClient,
    projectId: string,
  ): Promise<ProjectViewValidationContext> {
    const [memberships, fields] = await Promise.all([
      client.projectMembership.findMany({
        where: { projectId },
        select: { userId: true },
      }),
      client.customFieldDefinition.findMany({
        where: {
          projectId,
          archivedAt: null,
        },
        include: {
          options: {
            where: { archivedAt: null },
            select: { id: true },
          },
        },
      }),
    ]);

    return {
      validAssigneeIds: new Set(memberships.map((membership) => membership.userId)),
      customFieldsById: new Map(
        fields.map((field) => [
          field.id,
          {
            type: field.type,
            optionIds: new Set(field.options.map((option) => option.id)),
          },
        ]),
      ),
    };
  }

  private async validateStatusIds(state: ProjectViewState) {
    const statusIds = state.filters?.statusIds ?? [];
    if (statusIds.some((status) => !Object.values(TaskStatus).includes(status as TaskStatus))) {
      throw new BadRequestException('Saved view filters must reference valid task statuses');
    }
  }

  private async validateAssigneeIds(
    tx: ProjectViewDbClient,
    projectId: string,
    state: ProjectViewState,
  ) {
    const assigneeIds = state.filters?.assigneeIds ?? [];
    if (!assigneeIds.length) {
      return;
    }

    const memberships = await tx.projectMembership.findMany({
      where: {
        projectId,
        userId: { in: assigneeIds },
      },
      select: { userId: true },
    });
    if (memberships.length !== new Set(assigneeIds).size) {
      throw new BadRequestException('Saved view filters must reference project members');
    }
  }

  private async validateCustomFieldFilters(
    tx: ProjectViewDbClient,
    projectId: string,
    state: ProjectViewState,
  ) {
    const customFieldFilters = state.filters?.customFieldFilters ?? [];
    if (!customFieldFilters.length) {
      return;
    }

    const fieldIds = Array.from(new Set(customFieldFilters.map((filter) => filter.fieldId)));
    const fields = await tx.customFieldDefinition.findMany({
      where: {
        projectId,
        id: { in: fieldIds },
        archivedAt: null,
      },
      include: {
        options: {
          where: { archivedAt: null },
          select: { id: true },
        },
      },
    });
    if (fields.length !== fieldIds.length) {
      throw new BadRequestException('Saved view filters must reference active project custom fields');
    }

    const fieldById = new Map(fields.map((field) => [field.id, field] as const));
    for (const filter of customFieldFilters) {
      const field = fieldById.get(filter.fieldId);
      if (!field) {
        throw new BadRequestException('Saved view filters must reference active project custom fields');
      }

      if (field.type !== (filter.type as CustomFieldType)) {
        throw new BadRequestException('Saved view filter types must match their custom field definitions');
      }

      if (filter.type === 'SELECT') {
        const optionIds = filter.optionIds ?? [];
        const validOptionIds = new Set(field.options.map((option) => option.id));
        if (optionIds.some((optionId) => !validOptionIds.has(optionId))) {
          throw new BadRequestException('Saved view select filters must reference options on the same custom field');
        }
      }
    }
  }
}
