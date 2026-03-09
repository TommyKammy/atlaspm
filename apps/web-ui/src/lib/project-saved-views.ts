import {
  createProjectViewFallbackState,
  normalizeProjectViewState,
  resolveProjectViewState,
  type ProjectViewMode,
  type ProjectViewState,
} from '@atlaspm/domain';
import { stringifyCustomFieldFilters, type CustomFieldFilter } from '@/lib/project-filters';
import type { ProjectSavedView, ProjectSavedViewsResponse, Task } from '@/lib/types';

export const PROJECT_SAVED_VIEW_PARAM = 'savedView';
export const PROJECT_VIEW_STATE_APPLY_EVENT = 'atlaspm:apply-project-view-state';

const TIMELINE_VIEW_STORAGE_PREFIX = 'atlaspm:timeline-view';

export function hasProjectViewState(mode: ProjectViewMode, state: ProjectViewState | null | undefined) {
  return Object.keys(normalizeProjectViewState(mode, state)).length > 0;
}

export function buildListLikeProjectViewState(args: {
  mode: Extract<ProjectViewMode, 'list' | 'board'>;
  statuses: Task['status'][];
  assignees: string[];
  customFieldFilters: CustomFieldFilter[];
}): ProjectViewState {
  return normalizeProjectViewState(args.mode, {
    filters: {
      ...(args.statuses.length ? { statusIds: args.statuses } : {}),
      ...(args.assignees.length ? { assigneeIds: args.assignees } : {}),
      ...(args.customFieldFilters.length ? { customFieldFilters: args.customFieldFilters } : {}),
    },
  });
}

export function buildListLikeProjectViewQueryUpdates(state: ProjectViewState) {
  return {
    statuses: state.filters?.statusIds?.length ? state.filters.statusIds.join(',') : null,
    assignees: state.filters?.assigneeIds?.length ? state.filters.assigneeIds.join(',') : null,
    cf: state.filters?.customFieldFilters?.length
      ? stringifyCustomFieldFilters(state.filters.customFieldFilters)
      : null,
  };
}

export function resolveListLikeProjectViewState(args: {
  mode: Extract<ProjectViewMode, 'list' | 'board'>;
  savedViews: ProjectSavedViewsResponse;
  selectedViewId: string | null;
  workingState: ProjectViewState;
}) {
  const selectedNamedView =
    args.savedViews.views.find((view) => view.id === args.selectedViewId && view.mode === args.mode) ?? null;

  return resolveProjectViewState({
    mode: args.mode,
    fallbackState: createProjectViewFallbackState(args.mode),
    savedDefaultState: args.savedViews.defaultsByMode[args.mode],
    selectedNamedView,
    workingState: args.workingState,
  });
}

export function readTimelineProjectViewState(
  projectId: string,
  mode: Extract<ProjectViewMode, 'timeline' | 'gantt'>,
) {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(`${TIMELINE_VIEW_STORAGE_PREFIX}:${projectId}:${mode}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const normalized = normalizeProjectViewState(mode, parsed as ProjectViewState);
    return hasProjectViewState(mode, normalized) ? normalized : null;
  } catch {
    return null;
  }
}

export function writeTimelineProjectViewState(
  projectId: string,
  mode: Extract<ProjectViewMode, 'timeline' | 'gantt'>,
  state: ProjectViewState,
) {
  if (typeof window === 'undefined') return normalizeProjectViewState(mode, state);
  const normalized = normalizeProjectViewState(mode, state);
  window.localStorage.setItem(`${TIMELINE_VIEW_STORAGE_PREFIX}:${projectId}:${mode}`, JSON.stringify(normalized));
  return normalized;
}

export function dispatchProjectViewStateApply(
  mode: Extract<ProjectViewMode, 'timeline' | 'gantt'>,
  state: ProjectViewState,
) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(PROJECT_VIEW_STATE_APPLY_EVENT, {
      detail: {
        mode,
        state: normalizeProjectViewState(mode, state),
      },
    }),
  );
}

export function getSavedViewDisplayName(view: ProjectSavedView | null) {
  return view?.name ?? '';
}
