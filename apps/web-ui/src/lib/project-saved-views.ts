import {
  createProjectViewFallbackState,
  normalizeProjectViewState,
  type ProjectViewMode,
  type ProjectViewState,
} from '@atlaspm/domain';
import { stringifyCustomFieldFilters, type CustomFieldFilter } from '@/lib/project-filters';
import type { Task } from '@/lib/types';

export const PROJECT_SAVED_VIEW_PARAM = 'savedView';
export const PROJECT_VIEW_STATE_REQUEST_EVENT = 'atlaspm:project-view-state-request';
export const PROJECT_VIEW_STATE_RESPONSE_EVENT = 'atlaspm:project-view-state-response';
export const PROJECT_VIEW_STATE_APPLY_EVENT = 'atlaspm:project-view-state-apply';

const PROJECT_SAVED_VIEW_MODES = new Set<ProjectViewMode>(['list', 'board', 'timeline', 'gantt']);

export function supportsProjectSavedViewsMode(
  rawView: string | null | undefined,
): rawView is ProjectViewMode {
  return PROJECT_SAVED_VIEW_MODES.has(rawView as ProjectViewMode);
}

export function buildProjectFilterViewState(
  mode: Extract<ProjectViewMode, 'list' | 'board'>,
  statuses: Task['status'][],
  assignees: string[],
  customFieldFilters: CustomFieldFilter[],
): ProjectViewState {
  return normalizeProjectViewState(mode, {
    ...createProjectViewFallbackState(mode),
    filters: {
      ...(statuses.length ? { statusIds: statuses } : {}),
      ...(assignees.length ? { assigneeIds: assignees } : {}),
      ...(customFieldFilters.length ? { customFieldFilters } : {}),
    },
  });
}

export function getProjectSavedViewQueryUpdates(
  state: ProjectViewState,
): Record<'statuses' | 'assignees' | 'cf', string | null> {
  return {
    statuses: state.filters?.statusIds?.length ? state.filters.statusIds.join(',') : null,
    assignees: state.filters?.assigneeIds?.length ? state.filters.assigneeIds.join(',') : null,
    cf: stringifyCustomFieldFilters(state.filters?.customFieldFilters ?? []),
  };
}

export function getProjectViewStorageKeys(
  projectId: string,
  mode: Extract<ProjectViewMode, 'timeline' | 'gantt'>,
  userId?: string | null,
): string[] {
  const keys = [`atlaspm:timeline-view:${projectId}:${mode}`];
  if (userId) {
    keys.push(`atlaspm:timeline-view:${projectId}:${mode}:${userId}`);
  }
  return keys;
}

export function persistProjectViewStateToStorage(
  projectId: string,
  mode: Extract<ProjectViewMode, 'timeline' | 'gantt'>,
  state: ProjectViewState,
  userId?: string | null,
) {
  if (typeof window === 'undefined') return;
  const serialized = JSON.stringify(normalizeProjectViewState(mode, state));
  for (const key of getProjectViewStorageKeys(projectId, mode, userId)) {
    window.localStorage.setItem(key, serialized);
  }
}
