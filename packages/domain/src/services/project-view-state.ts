export const PROJECT_VIEW_MODES = ['list', 'board', 'timeline', 'gantt'] as const;
export type ProjectViewMode = (typeof PROJECT_VIEW_MODES)[number];

export const PROJECT_VIEW_GROUPING_FIELDS = ['section', 'assignee', 'status'] as const;
export type ProjectViewGroupingField = (typeof PROJECT_VIEW_GROUPING_FIELDS)[number];

export const PROJECT_VIEW_SORT_FIELDS = [
  'manual',
  'position',
  'title',
  'startAt',
  'dueAt',
  'priority',
  'status',
  'assignee',
] as const;
export type ProjectViewSortField = (typeof PROJECT_VIEW_SORT_FIELDS)[number];

export const PROJECT_VIEW_SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type ProjectViewSortDirection = (typeof PROJECT_VIEW_SORT_DIRECTIONS)[number];

export const PROJECT_VIEW_ZOOM_UNITS = ['day', 'week', 'month'] as const;
export type ProjectViewZoomUnit = (typeof PROJECT_VIEW_ZOOM_UNITS)[number];

export const PROJECT_VIEW_SCHEDULE_FILTERS = ['all', 'scheduled', 'unscheduled'] as const;
export type ProjectViewScheduleFilter = (typeof PROJECT_VIEW_SCHEDULE_FILTERS)[number];

export const PROJECT_VIEW_GANTT_RISK_FILTERS = ['all', 'risk'] as const;
export type ProjectViewGanttRiskFilter = (typeof PROJECT_VIEW_GANTT_RISK_FILTERS)[number];

export const PROJECT_VIEW_CUSTOM_FIELD_FILTER_TYPES = ['SELECT', 'BOOLEAN', 'NUMBER', 'DATE'] as const;
export type ProjectViewCustomFieldFilterType = (typeof PROJECT_VIEW_CUSTOM_FIELD_FILTER_TYPES)[number];

export type ProjectViewCustomFieldFilter = {
  fieldId: string;
  type: ProjectViewCustomFieldFilterType;
  optionIds?: string[];
  booleanValue?: boolean;
  numberMin?: number | null;
  numberMax?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
};

export type ProjectViewState = {
  grouping?: {
    field: ProjectViewGroupingField;
  };
  sorting?: {
    field: ProjectViewSortField;
    direction?: ProjectViewSortDirection;
  };
  filters?: {
    statusIds?: string[];
    assigneeIds?: string[];
    schedule?: ProjectViewScheduleFilter;
    customFieldFilters?: ProjectViewCustomFieldFilter[];
  };
  zoom?: {
    unit: ProjectViewZoomUnit;
    anchorDate?: string;
    workingDaysOnly?: boolean;
    ganttRiskFilterMode?: ProjectViewGanttRiskFilter;
    ganttStrictMode?: boolean;
  };
  visibleFieldIds?: string[];
};

export type NamedProjectViewState = {
  id: string;
  name: string;
  mode: ProjectViewMode;
  state: ProjectViewState;
};

export type ProjectViewStateResolutionSource = {
  layer: 'working' | 'named' | 'default' | 'fallback';
  namedViewId: string | null;
};

export function normalizeProjectViewState(
  mode: ProjectViewMode,
  raw: Partial<ProjectViewState> | null | undefined,
): ProjectViewState {
  const normalized: ProjectViewState = {};

  if (mode !== 'gantt') {
    const groupingField = raw?.grouping?.field;
    if (isProjectViewGroupingField(groupingField)) {
      normalized.grouping = { field: groupingField };
    }
  }

  if (mode !== 'gantt') {
    const sortField = raw?.sorting?.field;
    if (isProjectViewSortField(sortField)) {
      normalized.sorting = {
        field: sortField,
        direction: isProjectViewSortDirection(raw?.sorting?.direction)
          ? raw.sorting?.direction
          : 'asc',
      };
    }
  }

  const filters = normalizeProjectViewFilters(raw?.filters);
  if (filters) {
    normalized.filters = filters;
  }

  if (mode === 'timeline' || mode === 'gantt') {
    const zoom = normalizeProjectViewZoom(mode, raw?.zoom);
    if (zoom) {
      normalized.zoom = zoom;
    }
  }

  if (mode === 'list' || mode === 'board') {
    const visibleFieldIds = normalizeStringList(raw?.visibleFieldIds);
    if (visibleFieldIds.length > 0) {
      normalized.visibleFieldIds = visibleFieldIds;
    }
  }

  return normalized;
}

export function mergeProjectViewStates(
  mode: ProjectViewMode,
  base: Partial<ProjectViewState> | null | undefined,
  override: Partial<ProjectViewState> | null | undefined,
): ProjectViewState {
  const normalizedBase = normalizeProjectViewState(mode, base);
  const normalizedOverride = normalizeProjectViewState(mode, override);

  const merged: ProjectViewState = {
    ...normalizedBase,
    ...normalizedOverride,
  };

  if (normalizedBase.filters || normalizedOverride.filters) {
    merged.filters = {
      ...(normalizedBase.filters ?? {}),
      ...(normalizedOverride.filters ?? {}),
    };
    if (!hasOwnKeys(merged.filters)) {
      delete merged.filters;
    }
  }

  if (normalizedBase.zoom || normalizedOverride.zoom) {
    merged.zoom = {
      ...(normalizedBase.zoom ?? {}),
      ...(normalizedOverride.zoom ?? {}),
    } as NonNullable<ProjectViewState['zoom']>;
    if (!hasOwnKeys(merged.zoom)) {
      delete merged.zoom;
    }
  }

  return normalizeProjectViewState(mode, merged);
}

export function createProjectViewFallbackState(
  mode: ProjectViewMode,
  anchorDate = new Date().toISOString(),
): ProjectViewState {
  if (mode === 'list') {
    return normalizeProjectViewState('list', {
      grouping: { field: 'section' },
      sorting: { field: 'position', direction: 'asc' },
      visibleFieldIds: ['name', 'assignee', 'dueDate', 'status'],
      filters: {
        schedule: 'all',
      },
    });
  }

  if (mode === 'board') {
    return normalizeProjectViewState('board', {
      grouping: { field: 'section' },
      sorting: { field: 'manual', direction: 'asc' },
      visibleFieldIds: ['status'],
      filters: {
        schedule: 'all',
      },
    });
  }

  if (mode === 'timeline') {
    return normalizeProjectViewState('timeline', {
      grouping: { field: 'section' },
      sorting: { field: 'manual', direction: 'asc' },
      filters: {
        schedule: 'all',
      },
      zoom: {
        unit: 'week',
        anchorDate,
        workingDaysOnly: false,
      },
    });
  }

  return normalizeProjectViewState('gantt', {
    filters: {
      schedule: 'all',
    },
    zoom: {
      unit: 'week',
      anchorDate,
      ganttRiskFilterMode: 'all',
      ganttStrictMode: false,
    },
  });
}

export function resolveProjectViewState(args: {
  mode: ProjectViewMode;
  fallbackState?: Partial<ProjectViewState> | null;
  savedDefaultState?: Partial<ProjectViewState> | null;
  selectedNamedView?: NamedProjectViewState | null;
  workingState?: Partial<ProjectViewState> | null;
}): {
  state: ProjectViewState;
  source: ProjectViewStateResolutionSource;
} {
  const fallbackState = normalizeProjectViewState(
    args.mode,
    args.fallbackState ?? createProjectViewFallbackState(args.mode),
  );
  let state = fallbackState;
  let source: ProjectViewStateResolutionSource = {
    layer: 'fallback',
    namedViewId: null,
  };

  const savedDefaultState = normalizeProjectViewState(args.mode, args.savedDefaultState);
  if (hasOwnKeys(savedDefaultState)) {
    state = mergeProjectViewStates(args.mode, state, savedDefaultState);
    source = { layer: 'default', namedViewId: null };
  }

  const selectedNamedView =
    args.selectedNamedView && args.selectedNamedView.mode === args.mode
      ? args.selectedNamedView
      : null;
  if (selectedNamedView) {
    state = mergeProjectViewStates(args.mode, state, selectedNamedView.state);
    source = { layer: 'named', namedViewId: selectedNamedView.id };
  }

  const workingState = normalizeProjectViewState(args.mode, args.workingState);
  if (hasOwnKeys(workingState)) {
    state = mergeProjectViewStates(args.mode, state, workingState);
    source = { layer: 'working', namedViewId: selectedNamedView?.id ?? null };
  }

  return {
    state,
    source,
  };
}

function normalizeProjectViewFilters(
  raw: ProjectViewState['filters'] | null | undefined,
): ProjectViewState['filters'] | undefined {
  if (!raw) return undefined;

  const normalized: NonNullable<ProjectViewState['filters']> = {};
  const statusIds = normalizeStringList(raw.statusIds);
  if (statusIds.length > 0) {
    normalized.statusIds = statusIds;
  }

  const assigneeIds = normalizeStringList(raw.assigneeIds);
  if (assigneeIds.length > 0) {
    normalized.assigneeIds = assigneeIds;
  }

  if (isProjectViewScheduleFilter(raw.schedule)) {
    normalized.schedule = raw.schedule;
  }

  const customFieldFilters = normalizeProjectViewCustomFieldFilters(raw.customFieldFilters);
  if (customFieldFilters.length > 0) {
    normalized.customFieldFilters = customFieldFilters;
  }

  return hasOwnKeys(normalized) ? normalized : undefined;
}

function normalizeProjectViewCustomFieldFilters(
  raw: ProjectViewCustomFieldFilter[] | null | undefined,
): ProjectViewCustomFieldFilter[] {
  if (!Array.isArray(raw)) return [];

  const normalized = raw
    .map((entry) => normalizeProjectViewCustomFieldFilter(entry))
    .filter((entry): entry is ProjectViewCustomFieldFilter => Boolean(entry));
  return [...new Map(normalized.map((entry) => [entry.fieldId, entry])).values()];
}

function normalizeProjectViewCustomFieldFilter(
  raw: ProjectViewCustomFieldFilter | null | undefined,
): ProjectViewCustomFieldFilter | null {
  if (!raw) return null;
  const fieldId = normalizeNonEmptyString(raw.fieldId);
  if (!fieldId || !isProjectViewCustomFieldFilterType(raw.type)) {
    return null;
  }

  if (raw.type === 'SELECT') {
    const optionIds = normalizeStringList(raw.optionIds);
    return optionIds.length > 0 ? { fieldId, type: 'SELECT', optionIds } : null;
  }

  if (raw.type === 'BOOLEAN') {
    return typeof raw.booleanValue === 'boolean'
      ? { fieldId, type: 'BOOLEAN', booleanValue: raw.booleanValue }
      : null;
  }

  if (raw.type === 'NUMBER') {
    const min = normalizeFiniteNumber(raw.numberMin);
    const max = normalizeFiniteNumber(raw.numberMax);
    if (min === null && max === null) return null;
    if (min !== null && max !== null && min > max) {
      return { fieldId, type: 'NUMBER', numberMin: max, numberMax: min };
    }
    return { fieldId, type: 'NUMBER', numberMin: min, numberMax: max };
  }

  const dateFrom = normalizeDateOnly(raw.dateFrom);
  const dateTo = normalizeDateOnly(raw.dateTo);
  if (!dateFrom && !dateTo) return null;
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return { fieldId, type: 'DATE', dateFrom: dateTo, dateTo: dateFrom };
  }
  return { fieldId, type: 'DATE', dateFrom, dateTo };
}

function normalizeProjectViewZoom(
  mode: ProjectViewMode,
  raw: ProjectViewState['zoom'] | null | undefined,
): ProjectViewState['zoom'] | undefined {
  if (!raw || !isProjectViewZoomUnit(raw.unit)) {
    return undefined;
  }

  const normalized: NonNullable<ProjectViewState['zoom']> = {
    unit: raw.unit,
  };

  const anchorDate = normalizeIsoDate(raw.anchorDate);
  if (anchorDate) {
    normalized.anchorDate = anchorDate;
  }

  if (mode === 'timeline' && typeof raw.workingDaysOnly === 'boolean') {
    normalized.workingDaysOnly = raw.workingDaysOnly;
  }

  if (mode === 'gantt') {
    if (isProjectViewGanttRiskFilter(raw.ganttRiskFilterMode)) {
      normalized.ganttRiskFilterMode = raw.ganttRiskFilterMode;
    }
    if (typeof raw.ganttStrictMode === 'boolean') {
      normalized.ganttStrictMode = raw.ganttStrictMode;
    }
  }

  return normalized;
}

function normalizeStringList(raw: string[] | null | undefined): string[] {
  if (!Array.isArray(raw)) return [];
  const normalized = raw
    .map((value) => normalizeNonEmptyString(value))
    .filter((value): value is string => Boolean(value));
  return [...new Set(normalized)];
}

function normalizeNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeDateOnly(value: unknown): string | null {
  const normalized = normalizeNonEmptyString(value);
  if (!normalized) return null;
  const dateOnly = normalized.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateOnly) ? dateOnly : null;
}

function normalizeIsoDate(value: unknown): string | undefined {
  const normalized = normalizeNonEmptyString(value);
  if (!normalized) return undefined;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed.toISOString();
}

function hasOwnKeys(value: object | null | undefined): boolean {
  return Boolean(value && Object.keys(value).length > 0);
}

function isProjectViewGroupingField(value: unknown): value is ProjectViewGroupingField {
  return PROJECT_VIEW_GROUPING_FIELDS.includes(value as ProjectViewGroupingField);
}

function isProjectViewSortField(value: unknown): value is ProjectViewSortField {
  return PROJECT_VIEW_SORT_FIELDS.includes(value as ProjectViewSortField);
}

function isProjectViewSortDirection(value: unknown): value is ProjectViewSortDirection {
  return PROJECT_VIEW_SORT_DIRECTIONS.includes(value as ProjectViewSortDirection);
}

function isProjectViewZoomUnit(value: unknown): value is ProjectViewZoomUnit {
  return PROJECT_VIEW_ZOOM_UNITS.includes(value as ProjectViewZoomUnit);
}

function isProjectViewScheduleFilter(value: unknown): value is ProjectViewScheduleFilter {
  return PROJECT_VIEW_SCHEDULE_FILTERS.includes(value as ProjectViewScheduleFilter);
}

function isProjectViewGanttRiskFilter(value: unknown): value is ProjectViewGanttRiskFilter {
  return PROJECT_VIEW_GANTT_RISK_FILTERS.includes(value as ProjectViewGanttRiskFilter);
}

function isProjectViewCustomFieldFilterType(value: unknown): value is ProjectViewCustomFieldFilterType {
  return PROJECT_VIEW_CUSTOM_FIELD_FILTER_TYPES.includes(value as ProjectViewCustomFieldFilterType);
}
