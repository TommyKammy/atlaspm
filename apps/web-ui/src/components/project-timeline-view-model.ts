import type { ProjectViewState as SavedProjectViewState } from '@atlaspm/domain';
import { normalizeProjectViewState } from '@atlaspm/domain';
import type { TimelineTask } from '@/hooks/use-timeline-data';
import type { DependencyGraphEdge, SectionTaskGroup, Task } from '@/lib/types';

const DAY_MS = 24 * 60 * 60 * 1000;

export type TimelineZoom = 'day' | 'week' | 'month';
export type TimelineMode = 'timeline' | 'gantt';
export type TimelineSwimlane = 'section' | 'assignee' | 'status';
export type TimelineSortMode = 'manual' | 'startAt' | 'dueAt';
export type TimelineScheduleFilter = 'all' | 'scheduled' | 'unscheduled';
export type GanttRiskFilterMode = 'all' | 'risk';
export type TimelineLaneOrderGroupBy = Extract<TimelineSwimlane, 'section' | 'assignee'>;

export type TimelineManualLaneLayout = {
  orderedTaskIds: string[];
  rowByTaskId?: Record<string, number>;
};

export type TimelineManualLayoutByLane = Record<string, TimelineManualLaneLayout>;

export type TimelineManualLayoutState = Record<TimelineSwimlane, TimelineManualLayoutByLane>;

export type TimelineViewState = {
  zoom?: TimelineZoom;
  anchorDate?: string;
  swimlane?: TimelineSwimlane;
  sortMode?: TimelineSortMode;
  scheduleFilter?: TimelineScheduleFilter;
  workingDaysOnly?: boolean;
  ganttRiskFilterMode?: GanttRiskFilterMode;
  ganttStrictMode?: boolean;
};

export type GanttTaskRisk = {
  isAtRisk: boolean;
  overdue: boolean;
  blockedByOpen: number;
  blockedByLate: number;
};

type BuildTimelineTaskViewModelInput = {
  tasks: TimelineTask[];
  dependencyEdges: DependencyGraphEdge[];
  mode: TimelineMode;
  search: string;
  statusFilter: 'ALL' | Task['status'];
  priorityFilter: 'ALL' | NonNullable<Task['priority']>;
  effectiveScheduleFilter: TimelineScheduleFilter;
  effectiveSortMode: TimelineSortMode;
  ganttRiskFilterMode: GanttRiskFilterMode;
  today: Date;
};

function dayNumber(date: Date): number {
  const localMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor(localMidnight.getTime() / DAY_MS);
}

function dayDiff(from: Date, to: Date): number {
  return dayNumber(to) - dayNumber(from);
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function createEmptyTimelineManualLayoutState(): TimelineManualLayoutState {
  return {
    section: {},
    assignee: {},
    status: {},
  };
}

export function compareTimelineTasks(
  left: TimelineTask,
  right: TimelineTask,
  sortMode: TimelineSortMode,
): number {
  if (sortMode === 'startAt') {
    const leftStart = left.timelineStart ? dayNumber(left.timelineStart) : Number.MAX_SAFE_INTEGER;
    const rightStart = right.timelineStart
      ? dayNumber(right.timelineStart)
      : Number.MAX_SAFE_INTEGER;
    if (leftStart !== rightStart) return leftStart - rightStart;
  } else if (sortMode === 'dueAt') {
    const leftDue = left.timelineEnd ? dayNumber(left.timelineEnd) : Number.MAX_SAFE_INTEGER;
    const rightDue = right.timelineEnd ? dayNumber(right.timelineEnd) : Number.MAX_SAFE_INTEGER;
    if (leftDue !== rightDue) return leftDue - rightDue;
  }

  const sectionDelta = left.section.position - right.section.position;
  if (sectionDelta !== 0) return sectionDelta;
  const positionDelta = left.position - right.position;
  if (positionDelta !== 0) return positionDelta;
  return left.title.localeCompare(right.title);
}

export function baselineVarianceDays(task: TimelineTask): number | null {
  if (!task.baselineEnd || !task.timelineEnd) return null;
  return dayDiff(task.baselineEnd, task.timelineEnd);
}

export function taskMatchesFilters(
  task: Task,
  search: string,
  statusFilter: 'ALL' | Task['status'],
  priorityFilter: 'ALL' | NonNullable<Task['priority']>,
): boolean {
  const bySearch = !search.trim() || task.title.toLowerCase().includes(search.trim().toLowerCase());
  const byStatus = statusFilter === 'ALL' || task.status === statusFilter;
  const byPriority = priorityFilter === 'ALL' || task.priority === priorityFilter;
  return bySearch && byStatus && byPriority;
}

export function buildGanttRiskByTaskId(
  tasks: TimelineTask[],
  dependencyEdges: DependencyGraphEdge[],
  today: Date,
): Map<string, GanttTaskRisk> {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const incomingDependenciesByTarget = new Map<string, TimelineTask[]>();
  for (const edge of dependencyEdges) {
    if (edge.type === 'RELATES_TO') continue;
    const sourceTask = taskById.get(edge.source);
    const targetTask = taskById.get(edge.target);
    if (!sourceTask || !targetTask) continue;
    const list = incomingDependenciesByTarget.get(edge.target) ?? [];
    list.push(sourceTask);
    incomingDependenciesByTarget.set(edge.target, list);
  }

  const todayDay = dayNumber(startOfDay(today));
  const next = new Map<string, GanttTaskRisk>();
  for (const task of tasks) {
    const blockers = incomingDependenciesByTarget.get(task.id) ?? [];
    let blockedByOpen = 0;
    let blockedByLate = 0;
    const taskDueDay = task.timelineEnd ? dayNumber(task.timelineEnd) : null;
    for (const blocker of blockers) {
      if (blocker.status !== 'DONE') {
        blockedByOpen += 1;
      }
      if (taskDueDay !== null && blocker.timelineEnd && dayNumber(blocker.timelineEnd) > taskDueDay) {
        blockedByLate += 1;
      }
    }

    const overdue = Boolean(
      task.timelineEnd && dayNumber(task.timelineEnd) < todayDay && task.status !== 'DONE',
    );
    const isAtRisk = overdue || blockedByOpen > 0 || blockedByLate > 0;
    next.set(task.id, {
      isAtRisk,
      overdue,
      blockedByOpen,
      blockedByLate,
    });
  }

  return next;
}

export function buildTimelineTaskViewModel(input: BuildTimelineTaskViewModelInput) {
  const baseFilteredTasks = input.tasks
    .filter((task) =>
      taskMatchesFilters(task, input.search, input.statusFilter, input.priorityFilter),
    )
    .filter((task) => {
      if (input.effectiveScheduleFilter === 'scheduled') return task.hasSchedule;
      if (input.effectiveScheduleFilter === 'unscheduled') return !task.hasSchedule;
      return true;
    })
    .sort((left, right) => compareTimelineTasks(left, right, input.effectiveSortMode));

  const ganttRiskByTaskId = buildGanttRiskByTaskId(
    input.tasks,
    input.dependencyEdges,
    input.today,
  );

  const filteredTasks =
    input.mode !== 'gantt' || input.ganttRiskFilterMode === 'all'
      ? baseFilteredTasks
      : baseFilteredTasks.filter((task) => ganttRiskByTaskId.get(task.id)?.isAtRisk);

  const scheduledTimelineTasks = filteredTasks.filter((task) => task.hasSchedule);
  const filteredTaskIds = new Set(filteredTasks.map((task) => task.id));
  const ganttRiskTasks = baseFilteredTasks.filter((task) => ganttRiskByTaskId.get(task.id)?.isAtRisk);
  const ganttBlockedTasks = baseFilteredTasks.filter(
    (task) => (ganttRiskByTaskId.get(task.id)?.blockedByOpen ?? 0) > 0,
  );

  const ganttVarianceByTaskId = new Map<string, number>();
  for (const task of baseFilteredTasks) {
    const variance = baselineVarianceDays(task);
    if (variance !== null) ganttVarianceByTaskId.set(task.id, variance);
  }

  const ganttDelayedTasks = baseFilteredTasks.filter(
    (task) => (ganttVarianceByTaskId.get(task.id) ?? 0) > 0,
  );
  const ganttAheadTasks = baseFilteredTasks.filter(
    (task) => (ganttVarianceByTaskId.get(task.id) ?? 0) < 0,
  );
  const totalDependencyEdges = input.dependencyEdges.filter(
    (edge) => filteredTaskIds.has(edge.source) && filteredTaskIds.has(edge.target),
  ).length;

  return {
    baseFilteredTasks,
    filteredTasks,
    scheduledTimelineTasks,
    ganttRiskByTaskId,
    ganttRiskTasks,
    ganttBlockedTasks,
    ganttVarianceByTaskId,
    ganttDelayedTasks,
    ganttAheadTasks,
    filteredTaskIds,
    totalDependencyEdges,
  };
}

export function normalizeTimelineManualLayoutByLane(value: unknown): TimelineManualLayoutByLane {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const next: TimelineManualLayoutByLane = {};
  for (const [laneIdRaw, rawTaskIds] of Object.entries(value as Record<string, unknown>)) {
    const laneId = laneIdRaw.trim();
    if (!laneId) continue;
    const candidate =
      Array.isArray(rawTaskIds)
        ? { orderedTaskIds: rawTaskIds, rowByTaskId: {} as Record<string, unknown> }
        : rawTaskIds && typeof rawTaskIds === 'object' && !Array.isArray(rawTaskIds)
          ? {
              orderedTaskIds: Array.isArray((rawTaskIds as Record<string, unknown>).orderedTaskIds)
                ? ((rawTaskIds as Record<string, unknown>).orderedTaskIds as unknown[])
                : Array.isArray((rawTaskIds as Record<string, unknown>).taskOrder)
                  ? ((rawTaskIds as Record<string, unknown>).taskOrder as unknown[])
                : Array.isArray((rawTaskIds as Record<string, unknown>).taskIds)
                  ? ((rawTaskIds as Record<string, unknown>).taskIds as unknown[])
                  : [],
              rowByTaskId:
                (rawTaskIds as Record<string, unknown>).rowByTaskId &&
                typeof (rawTaskIds as Record<string, unknown>).rowByTaskId === 'object' &&
                !Array.isArray((rawTaskIds as Record<string, unknown>).rowByTaskId)
                  ? ((rawTaskIds as Record<string, unknown>).rowByTaskId as Record<string, unknown>)
                  : (rawTaskIds as Record<string, unknown>).rowHints &&
                      typeof (rawTaskIds as Record<string, unknown>).rowHints === 'object' &&
                      !Array.isArray((rawTaskIds as Record<string, unknown>).rowHints)
                    ? ((rawTaskIds as Record<string, unknown>).rowHints as Record<string, unknown>)
                    : {},
            }
          : null;
    if (!candidate) continue;

    const seenTaskIds = new Set<string>();
    const normalizedTaskIds: string[] = [];
    for (const taskId of candidate.orderedTaskIds) {
      if (typeof taskId !== 'string') continue;
      const trimmedTaskId = taskId.trim();
      if (!trimmedTaskId || seenTaskIds.has(trimmedTaskId)) continue;
      seenTaskIds.add(trimmedTaskId);
      normalizedTaskIds.push(trimmedTaskId);
    }
    if (normalizedTaskIds.length === 0) continue;

    const normalizedTaskIdSet = new Set(normalizedTaskIds);
    const rowByTaskId: Record<string, number> = {};
    const maxRowIndex = Math.max(normalizedTaskIds.length - 1, 0);
    for (const [taskIdRaw, rowIndex] of Object.entries(candidate.rowByTaskId)) {
      const taskId = taskIdRaw.trim();
      if (!taskId || !normalizedTaskIdSet.has(taskId)) continue;
      const numericRowIndex = Number(rowIndex);
      if (!Number.isInteger(numericRowIndex) || numericRowIndex < 0) continue;
      rowByTaskId[taskId] = Math.min(numericRowIndex, maxRowIndex);
    }

    next[laneId] =
      Object.keys(rowByTaskId).length > 0
        ? { orderedTaskIds: normalizedTaskIds, rowByTaskId }
        : { orderedTaskIds: normalizedTaskIds };
  }
  return next;
}

export function normalizeTimelineManualLayoutState(value: unknown): TimelineManualLayoutState {
  const next = createEmptyTimelineManualLayoutState();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return next;
  const candidate = value as Record<string, unknown>;
  next.section = normalizeTimelineManualLayoutByLane(candidate.section);
  next.assignee = normalizeTimelineManualLayoutByLane(candidate.assignee);
  next.status = normalizeTimelineManualLayoutByLane(candidate.status);
  return next;
}

export function hasTimelineManualLayout(layout: TimelineManualLayoutByLane): boolean {
  return Object.values(layout).some((laneTaskOrder) => laneTaskOrder.orderedTaskIds.length > 0);
}

export function mergeTimelineManualLaneTaskOrder(
  existingLaneLayout: TimelineManualLaneLayout | undefined,
  nextTaskOrder: string[],
  nextRowByTaskId?: Record<string, number>,
): TimelineManualLaneLayout {
  const seenTaskIds = new Set(nextTaskOrder);
  const orderedTaskIds = [
    ...nextTaskOrder,
    ...(existingLaneLayout?.orderedTaskIds ?? []).filter((taskId) => !seenTaskIds.has(taskId)),
  ];
  const rowByTaskId = {
    ...(existingLaneLayout?.rowByTaskId ?? {}),
    ...(nextRowByTaskId ?? {}),
  };
  for (const taskId of Object.keys(rowByTaskId)) {
    if (!orderedTaskIds.includes(taskId)) delete rowByTaskId[taskId];
  }
  return Object.keys(rowByTaskId).length > 0 ? { orderedTaskIds, rowByTaskId } : { orderedTaskIds };
}

export function getTimelineManualOrderedTaskIdsByLane(
  layout: TimelineManualLayoutByLane,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(layout)
      .filter(([, laneLayout]) => laneLayout.orderedTaskIds.length > 0)
      .map(([laneId, laneLayout]) => [laneId, laneLayout.orderedTaskIds]),
  );
}

export function getTimelineManualRowByTaskIdByLane(
  layout: TimelineManualLayoutByLane,
): Record<string, Record<string, number>> {
  return Object.fromEntries(
    Object.entries(layout)
      .filter(([, laneLayout]) => Boolean(laneLayout.rowByTaskId && Object.keys(laneLayout.rowByTaskId).length))
      .map(([laneId, laneLayout]) => [laneId, laneLayout.rowByTaskId ?? {}]),
  );
}

export function areSavedProjectViewStatesEqual(
  mode: TimelineMode,
  left: SavedProjectViewState | null | undefined,
  right: SavedProjectViewState,
): boolean {
  return (
    JSON.stringify(normalizeProjectViewState(mode, left)) ===
    JSON.stringify(normalizeProjectViewState(mode, right))
  );
}

export function applyTaskScheduleInGroups(
  groups: SectionTaskGroup[],
  taskId: string,
  next: { startAt: string | null; dueAt: string | null },
) {
  return groups.map((group) => ({
    ...group,
    tasks: group.tasks.map((task) =>
      task.id === taskId
        ? {
            ...task,
            startAt: next.startAt,
            dueAt: next.dueAt,
          }
        : task,
    ),
  }));
}

export function applyTaskSchedulesInGroups(
  groups: SectionTaskGroup[],
  nextByTaskId: Map<string, { startAt: string | null; dueAt: string | null }>,
) {
  return groups.map((group) => ({
    ...group,
    tasks: group.tasks.map((task) => {
      const next = nextByTaskId.get(task.id);
      return next
        ? {
            ...task,
            startAt: next.startAt,
            dueAt: next.dueAt,
          }
        : task;
    }),
  }));
}

export function findTaskInGroups(groups: SectionTaskGroup[], taskId: string): Task | undefined {
  for (const group of groups) {
    const task = group.tasks.find((candidate) => candidate.id === taskId);
    if (task) return task;
  }
  return undefined;
}

export function applyResolvedTaskInGroups(groups: SectionTaskGroup[], resolvedTask: Task) {
  const withoutTask = groups.map((group) => ({
    ...group,
    tasks: group.tasks.filter((task) => task.id !== resolvedTask.id),
  }));

  return withoutTask.map((group) =>
    group.section.id === resolvedTask.sectionId
      ? { ...group, tasks: [...group.tasks, resolvedTask] }
      : group,
  );
}

export function applyResolvedTasksInGroups(groups: SectionTaskGroup[], resolvedTasks: Task[]) {
  return resolvedTasks.reduce(
    (current, resolvedTask) => applyResolvedTaskInGroups(current, resolvedTask),
    groups,
  );
}

export function applyTaskTimelineMoveInGroups(
  groups: SectionTaskGroup[],
  taskId: string,
  next: {
    startAt?: string | null;
    dueAt?: string | null;
    assigneeUserId?: string | null;
    sectionId?: string;
    status?: Task['status'];
  },
) {
  let movedTask: Task | null = null;
  const withoutTask = groups.map((group) => ({
    ...group,
    tasks: group.tasks.filter((task) => {
      if (task.id !== taskId) return true;
      const updatedTask: Task = { ...task };
      if (next.startAt !== undefined) {
        updatedTask.startAt = next.startAt;
      }
      if (next.dueAt !== undefined) {
        updatedTask.dueAt = next.dueAt;
      }
      if (next.assigneeUserId !== undefined) {
        updatedTask.assigneeUserId = next.assigneeUserId;
      }
      if (next.sectionId !== undefined) {
        updatedTask.sectionId = next.sectionId;
      }
      if (next.status !== undefined) {
        updatedTask.status = next.status;
        updatedTask.completedAt =
          next.status === 'DONE' ? (task.completedAt ?? new Date().toISOString()) : null;
      }
      movedTask = updatedTask;
      return false;
    }),
  }));

  if (!movedTask) return groups;
  const finalizedTask: Task = movedTask;
  const targetSectionId = next.sectionId ?? finalizedTask.sectionId;
  return withoutTask.map((group) =>
    group.section.id === targetSectionId
      ? { ...group, tasks: [...group.tasks, finalizedTask] }
      : group,
  );
}
