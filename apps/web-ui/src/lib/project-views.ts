export const PROJECT_VIEW_IDS = ['list', 'board', 'timeline', 'gantt', 'calendar', 'files'] as const;

export type ProjectViewId = (typeof PROJECT_VIEW_IDS)[number];

const PROJECT_VIEW_SET = new Set<string>(PROJECT_VIEW_IDS);

export function resolveProjectView(rawView: string | null | undefined): ProjectViewId {
  const normalized = (rawView ?? 'list').toLowerCase();
  return PROJECT_VIEW_SET.has(normalized) ? (normalized as ProjectViewId) : 'list';
}
