'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import TaskDetailDrawer from '@/components/task-detail-drawer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTimelineData, type TimelineTask } from '@/hooks/use-timeline-data';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { queryKeys } from '@/lib/query-keys';
import type { SectionTaskGroup, Task } from '@/lib/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const TASK_NAME_COL_WIDTH = 260;
const VIEW_STORAGE_PREFIX: Record<TimelineMode, string> = {
  timeline: 'atlaspm:timeline-shell',
  gantt: 'atlaspm:gantt-shell',
};
const SECTION_ROW_HEIGHT = 32;
const TASK_ROW_HEIGHT = 40;
const VIRTUALIZE_ROW_THRESHOLD = 120;
const VIRTUAL_OVERSCAN_PX = 320;
const DRAG_START_THRESHOLD_PX = 6;
const UNASSIGNED_LANE_ID = '__unassigned__';
const UNSCHEDULED_TASK_DND_TYPE = 'application/x-atlaspm-unscheduled-task';

type TimelineZoom = 'day' | 'week' | 'month';
type TimelineMode = 'timeline' | 'gantt';
type TimelineSwimlane = 'section' | 'assignee';
type TimelineSortMode = 'manual' | 'startAt' | 'dueAt';
type TimelineScheduleFilter = 'all' | 'scheduled' | 'unscheduled';
type GanttRiskFilterMode = 'all' | 'risk';

type GanttTaskRisk = {
  isAtRisk: boolean;
  overdue: boolean;
  blockedByOpen: number;
  blockedByLate: number;
};

type TimelinePreferences = {
  projectId: string;
  userId: string;
  laneOrderBySection: string[];
  laneOrderByAssignee: string[];
};

const TIMELINE_ZOOM_CONFIG: Record<TimelineZoom, { beforeDays: number; afterDays: number; stepDays: number; dayColWidth: number }> = {
  day: { beforeDays: 1, afterDays: 5, stepDays: 1, dayColWidth: 64 },
  week: { beforeDays: 7, afterDays: 21, stepDays: 7, dayColWidth: 36 },
  month: { beforeDays: 31, afterDays: 92, stepDays: 30, dayColWidth: 24 },
};

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(base: Date, delta: number): Date {
  const result = startOfDay(base);
  result.setDate(result.getDate() + delta);
  return result;
}

function dayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}

function dayDiff(from: Date, to: Date): number {
  return dayNumber(to) - dayNumber(from);
}

function formatDay(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
}

function formatWeekday(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short' });
}

function normalizeTestIdSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function compareTimelineTasks(left: TimelineTask, right: TimelineTask, sortMode: TimelineSortMode): number {
  if (sortMode === 'startAt') {
    const leftStart = left.timelineStart ? dayNumber(left.timelineStart) : Number.MAX_SAFE_INTEGER;
    const rightStart = right.timelineStart ? dayNumber(right.timelineStart) : Number.MAX_SAFE_INTEGER;
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

function baselineVarianceDays(task: TimelineTask): number | null {
  if (!task.baselineEnd || !task.timelineEnd) return null;
  return dayDiff(task.baselineEnd, task.timelineEnd);
}

function taskMatchesFilters(
  task: Task,
  search: string,
  statusFilter: 'ALL' | Task['status'],
  priorityFilter: 'ALL' | NonNullable<Task['priority']>,
) {
  const bySearch = !search.trim() || task.title.toLowerCase().includes(search.trim().toLowerCase());
  const byStatus = statusFilter === 'ALL' || task.status === statusFilter;
  const byPriority = priorityFilter === 'ALL' || task.priority === priorityFilter;
  return bySearch && byStatus && byPriority;
}

function isApiConflictError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /^API 409:/.test(error.message);
}

function shiftIsoByDays(value: string | null | undefined, days: number): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return null;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString();
}

function applyTaskScheduleInGroups(
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

function applyTaskTimelineMoveInGroups(
  groups: SectionTaskGroup[],
  taskId: string,
  next: { startAt?: string | null; dueAt?: string | null; assigneeUserId?: string | null },
) {
  return groups.map((group) => ({
    ...group,
    tasks: group.tasks.map((task) => {
      if (task.id !== taskId) return task;
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
      return updatedTask;
    }),
  }));
}

function parseAssigneeLaneId(laneId: string): string | null | undefined {
  if (!laneId.startsWith('assignee:')) return undefined;
  const raw = laneId.slice('assignee:'.length);
  return raw === UNASSIGNED_LANE_ID ? null : raw;
}

function reorderLaneIds(laneIds: string[], draggingLaneId: string, overLaneId: string): string[] {
  const fromIndex = laneIds.indexOf(draggingLaneId);
  const toIndex = laneIds.indexOf(overLaneId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return laneIds;
  const next = [...laneIds];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return laneIds;
  next.splice(toIndex, 0, moved);
  return next;
}

function applyLaneOrder<T extends { id: string }>(lanes: T[], preferredOrder: string[]): T[] {
  if (!preferredOrder.length) return lanes;
  const indexById = new Map(preferredOrder.map((laneId, index) => [laneId, index]));
  return [...lanes].sort((left, right) => {
    const leftRank = indexById.get(left.id);
    const rightRank = indexById.get(right.id);
    if (leftRank === undefined && rightRank === undefined) return 0;
    if (leftRank === undefined) return 1;
    if (rightRank === undefined) return -1;
    return leftRank - rightRank;
  });
}

export function ProjectScheduleCanvas({
  projectId,
  search,
  statusFilter,
  priorityFilter,
  mode,
}: {
  projectId: string;
  search: string;
  statusFilter: 'ALL' | Task['status'];
  priorityFilter: 'ALL' | NonNullable<Task['priority']>;
  mode: TimelineMode;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const meQuery = useQuery<{ id: string }>({
    queryKey: queryKeys.me,
    queryFn: () => api('/me'),
  });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<TimelineZoom>('week');
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()));
  const [swimlane, setSwimlane] = useState<TimelineSwimlane>('section');
  const [sortMode, setSortMode] = useState<TimelineSortMode>('manual');
  const [scheduleFilter, setScheduleFilter] = useState<TimelineScheduleFilter>('all');
  const [ganttRiskFilterMode, setGanttRiskFilterMode] = useState<GanttRiskFilterMode>('all');
  const [ganttStrictMode, setGanttStrictMode] = useState(false);
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight));
  const [dragState, setDragState] = useState<{
    taskId: string;
    pointerId: number;
    originX: number;
    originY: number;
    originLaneId: string;
    dropLaneId: string | null;
    deltaDays: number;
    moved: boolean;
  } | null>(null);
  const dragStateRef = useRef<{
    taskId: string;
    pointerId: number;
    originX: number;
    originY: number;
    originLaneId: string;
    dropLaneId: string | null;
    deltaDays: number;
    moved: boolean;
  } | null>(null);
  const [laneDragState, setLaneDragState] = useState<{ draggingLaneId: string; overLaneId: string | null } | null>(null);
  const [unscheduledDragTaskId, setUnscheduledDragTaskId] = useState<string | null>(null);
  const suppressClickTaskIdRef = useRef<string | null>(null);
  const [rescheduleNotice, setRescheduleNotice] = useState<{ type: 'conflict' | 'error'; message: string } | null>(null);
  const rescheduleInFlightTaskIdsRef = useRef(new Set<string>());
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const stickyHeaderRef = useRef<HTMLDivElement | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const markerId = `timeline-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const timelinePreferencesQuery = useQuery<TimelinePreferences>({
    queryKey: queryKeys.projectTimelinePreferences(projectId),
    queryFn: () => api(`/projects/${projectId}/timeline/preferences`) as Promise<TimelinePreferences>,
    enabled: Boolean(projectId),
  });

  const timelineStorageKey = useMemo(
    () => (meQuery.data?.id ? `${VIEW_STORAGE_PREFIX[mode]}:${meQuery.data.id}:${projectId}` : null),
    [meQuery.data?.id, mode, projectId],
  );

  useEffect(() => {
    setPreferencesHydrated(false);
    if (!timelineStorageKey || typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(timelineStorageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as {
          zoom?: TimelineZoom;
          anchorDate?: string;
          swimlane?: TimelineSwimlane;
          sortMode?: TimelineSortMode;
          scheduleFilter?: TimelineScheduleFilter;
          ganttRiskFilterMode?: GanttRiskFilterMode;
          ganttStrictMode?: boolean;
        };
        if (parsed.zoom && parsed.zoom in TIMELINE_ZOOM_CONFIG) {
          setZoom(parsed.zoom);
        }
        if (parsed.anchorDate) {
          const parsedDate = new Date(parsed.anchorDate);
          if (!Number.isNaN(parsedDate.valueOf())) {
            setAnchorDate(startOfDay(parsedDate));
          }
        }
        if (parsed.swimlane === 'section' || parsed.swimlane === 'assignee') {
          setSwimlane(parsed.swimlane);
        }
        if (parsed.sortMode === 'manual' || parsed.sortMode === 'startAt' || parsed.sortMode === 'dueAt') {
          setSortMode(parsed.sortMode);
        }
        if (parsed.scheduleFilter === 'all' || parsed.scheduleFilter === 'scheduled' || parsed.scheduleFilter === 'unscheduled') {
          setScheduleFilter(parsed.scheduleFilter);
        }
        if (parsed.ganttRiskFilterMode === 'all' || parsed.ganttRiskFilterMode === 'risk') {
          setGanttRiskFilterMode(parsed.ganttRiskFilterMode);
        }
        if (typeof parsed.ganttStrictMode === 'boolean') {
          setGanttStrictMode(parsed.ganttStrictMode);
        }
      } catch {
        // Ignore malformed local preference state.
      }
    }
    setPreferencesHydrated(true);
  }, [timelineStorageKey]);

  useEffect(() => {
    if (!timelineStorageKey || !preferencesHydrated || typeof window === 'undefined') return;
    window.localStorage.setItem(
      timelineStorageKey,
      JSON.stringify({
        zoom,
        anchorDate: anchorDate.toISOString(),
        swimlane,
        sortMode,
        scheduleFilter,
        ganttRiskFilterMode,
        ganttStrictMode,
      }),
    );
  }, [anchorDate, ganttRiskFilterMode, ganttStrictMode, preferencesHydrated, scheduleFilter, sortMode, swimlane, timelineStorageKey, zoom]);

  const zoomConfig = TIMELINE_ZOOM_CONFIG[zoom];
  const effectiveSwimlane: TimelineSwimlane = mode === 'timeline' ? swimlane : 'section';
  const effectiveSortMode: TimelineSortMode = mode === 'timeline' ? sortMode : 'manual';
  const effectiveScheduleFilter: TimelineScheduleFilter = mode === 'timeline' ? scheduleFilter : 'all';
  const showDependencyConnectors = mode === 'gantt';

  const timelineWindow = useMemo(
    () => ({
      start: addDays(anchorDate, -zoomConfig.beforeDays),
      end: addDays(anchorDate, zoomConfig.afterDays),
    }),
    [anchorDate, zoomConfig.afterDays, zoomConfig.beforeDays],
  );

  const timeline = useTimelineData(projectId, timelineWindow);
  const days = useMemo(() => {
    const list: Date[] = [];
    for (let cursor = timeline.window.start; cursor <= timeline.window.end; cursor = addDays(cursor, 1)) {
      list.push(cursor);
    }
    return list;
  }, [timeline.window.end, timeline.window.start]);

  const baseFilteredTasks = useMemo(() => {
    return timeline.tasks
      .filter((task) => taskMatchesFilters(task, search, statusFilter, priorityFilter))
      .filter((task) => {
        if (effectiveScheduleFilter === 'scheduled') return task.hasSchedule;
        if (effectiveScheduleFilter === 'unscheduled') return !task.hasSchedule;
        return true;
      })
      .sort((left, right) => compareTimelineTasks(left, right, effectiveSortMode));
  }, [effectiveScheduleFilter, effectiveSortMode, priorityFilter, search, statusFilter, timeline.tasks]);

  const ganttRiskByTaskId = useMemo(() => {
    const taskById = new Map(baseFilteredTasks.map((task) => [task.id, task]));
    const incomingDependenciesByTarget = new Map<string, TimelineTask[]>();
    for (const edge of timeline.dependencyEdges) {
      if (edge.type === 'RELATES_TO') continue;
      const sourceTask = taskById.get(edge.source);
      const targetTask = taskById.get(edge.target);
      if (!sourceTask || !targetTask) continue;
      const list = incomingDependenciesByTarget.get(edge.target) ?? [];
      list.push(sourceTask);
      incomingDependenciesByTarget.set(edge.target, list);
    }

    const today = startOfDay(new Date());
    const todayDay = dayNumber(today);
    const next = new Map<string, GanttTaskRisk>();
    for (const task of baseFilteredTasks) {
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

      const overdue = Boolean(task.timelineEnd && dayNumber(task.timelineEnd) < todayDay && task.status !== 'DONE');
      const isAtRisk = overdue || blockedByOpen > 0 || blockedByLate > 0;
      next.set(task.id, {
        isAtRisk,
        overdue,
        blockedByOpen,
        blockedByLate,
      });
    }
    return next;
  }, [baseFilteredTasks, timeline.dependencyEdges]);

  const filteredTasks = useMemo(() => {
    if (mode !== 'gantt' || ganttRiskFilterMode === 'all') return baseFilteredTasks;
    return baseFilteredTasks.filter((task) => ganttRiskByTaskId.get(task.id)?.isAtRisk);
  }, [baseFilteredTasks, ganttRiskByTaskId, ganttRiskFilterMode, mode]);

  const preferredLaneOrder = useMemo(
    () =>
      effectiveSwimlane === 'assignee'
        ? timelinePreferencesQuery.data?.laneOrderByAssignee ?? []
        : timelinePreferencesQuery.data?.laneOrderBySection ?? [],
    [effectiveSwimlane, timelinePreferencesQuery.data?.laneOrderByAssignee, timelinePreferencesQuery.data?.laneOrderBySection],
  );

  const timelineLanes = useMemo(() => {
    if (effectiveSwimlane === 'assignee') {
      const grouped = new Map<string, TimelineTask[]>();
      for (const task of filteredTasks) {
        const laneId = task.assigneeUserId ?? UNASSIGNED_LANE_ID;
        const list = grouped.get(laneId) ?? [];
        list.push(task);
        grouped.set(laneId, list);
      }

      const lanes = [...grouped.entries()]
        .map(([laneId, tasks]) => {
          const label = laneId === UNASSIGNED_LANE_ID
            ? t('unassigned')
            : timeline.membersById[laneId]?.displayName
              || timeline.membersById[laneId]?.email
              || laneId;
          return {
            id: `assignee:${laneId}`,
            label,
            tasks,
          };
        })
        .sort((left, right) => {
          const leftUnassigned = left.id === `assignee:${UNASSIGNED_LANE_ID}`;
          const rightUnassigned = right.id === `assignee:${UNASSIGNED_LANE_ID}`;
          if (leftUnassigned && !rightUnassigned) return 1;
          if (!leftUnassigned && rightUnassigned) return -1;
          return left.label.localeCompare(right.label);
        });

      return applyLaneOrder(lanes, preferredLaneOrder);
    }

    const bySection = new Map<string, TimelineTask[]>();
    for (const task of filteredTasks) {
      const list = bySection.get(task.sectionId) ?? [];
      list.push(task);
      bySection.set(task.sectionId, list);
    }

    const lanes = timeline.sections
      .map((section) => ({
        id: `section:${section.id}`,
        label: section.isDefault ? t('tasks') : section.name,
        tasks: bySection.get(section.id) ?? [],
      }))
      .filter((lane) => lane.tasks.length > 0);

    return applyLaneOrder(lanes, preferredLaneOrder);
  }, [effectiveSwimlane, filteredTasks, preferredLaneOrder, t, timeline.membersById, timeline.sections]);

  const filteredTaskIds = useMemo(() => new Set(filteredTasks.map((task) => task.id)), [filteredTasks]);
  const taskById = useMemo(() => new Map(filteredTasks.map((task) => [task.id, task])), [filteredTasks]);

  const scheduledTasks = filteredTasks.filter((task) => task.hasSchedule && task.inWindow);
  const unscheduledTasks = filteredTasks.filter((task) => !task.hasSchedule);
  const ganttRiskTasks = useMemo(
    () => baseFilteredTasks.filter((task) => ganttRiskByTaskId.get(task.id)?.isAtRisk),
    [baseFilteredTasks, ganttRiskByTaskId],
  );
  const ganttBlockedTasks = useMemo(
    () => baseFilteredTasks.filter((task) => (ganttRiskByTaskId.get(task.id)?.blockedByOpen ?? 0) > 0),
    [baseFilteredTasks, ganttRiskByTaskId],
  );
  const ganttVarianceByTaskId = useMemo(() => {
    const next = new Map<string, number>();
    for (const task of baseFilteredTasks) {
      const variance = baselineVarianceDays(task);
      if (variance !== null) next.set(task.id, variance);
    }
    return next;
  }, [baseFilteredTasks]);
  const ganttDelayedTasks = useMemo(
    () => baseFilteredTasks.filter((task) => (ganttVarianceByTaskId.get(task.id) ?? 0) > 0),
    [baseFilteredTasks, ganttVarianceByTaskId],
  );
  const ganttAheadTasks = useMemo(
    () => baseFilteredTasks.filter((task) => (ganttVarianceByTaskId.get(task.id) ?? 0) < 0),
    [baseFilteredTasks, ganttVarianceByTaskId],
  );
  const gridWidth = Math.max(1, days.length) * zoomConfig.dayColWidth;

  const totalDependencyEdges = useMemo(
    () =>
      timeline.dependencyEdges.filter(
        (edge) => filteredTaskIds.has(edge.source) && filteredTaskIds.has(edge.target),
      ).length,
    [filteredTaskIds, timeline.dependencyEdges],
  );

  const saveLaneOrderMutation = useMutation({
    mutationFn: async ({
      groupBy,
      laneOrder,
    }: {
      groupBy: TimelineSwimlane;
      laneOrder: string[];
    }) =>
      (await api(`/projects/${projectId}/timeline/preferences/${groupBy}`, {
        method: 'PUT',
        body: { laneOrder },
      })) as TimelinePreferences,
    onMutate: async ({ groupBy, laneOrder }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.projectTimelinePreferences(projectId) });
      const previous = queryClient.getQueryData<TimelinePreferences>(queryKeys.projectTimelinePreferences(projectId));
      queryClient.setQueryData<TimelinePreferences>(queryKeys.projectTimelinePreferences(projectId), {
        projectId,
        userId: previous?.userId ?? meQuery.data?.id ?? '',
        laneOrderBySection: groupBy === 'section' ? laneOrder : previous?.laneOrderBySection ?? [],
        laneOrderByAssignee: groupBy === 'assignee' ? laneOrder : previous?.laneOrderByAssignee ?? [],
      });
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData<TimelinePreferences>(queryKeys.projectTimelinePreferences(projectId), context.previous);
      }
      setRescheduleNotice({ type: 'error', message: t('timelineLaneOrderSaveFailed') });
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTimelinePreferences(projectId) });
    },
  });

  const rescheduleTask = useMutation({
    mutationFn: async ({
      taskId,
      startAt,
      dueAt,
      version,
    }: {
      taskId: string;
      startAt: string | null;
      dueAt: string | null;
      version: number;
    }) =>
      (await api(`/tasks/${taskId}/reschedule`, {
        method: 'PATCH',
        body: { startAt, dueAt, version },
      })) as Task,
    onMutate: async ({ taskId, startAt, dueAt }) => {
      setRescheduleNotice(null);
      await queryClient.cancelQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.taskDetail(taskId) });
      const previous = queryClient.getQueryData<SectionTaskGroup[]>(
        queryKeys.projectTasksGrouped(projectId),
      );
      const previousTaskDetail = queryClient.getQueryData<Task>(queryKeys.taskDetail(taskId));
      if (previous) {
        queryClient.setQueryData<SectionTaskGroup[]>(
          queryKeys.projectTasksGrouped(projectId),
          applyTaskScheduleInGroups(previous, taskId, { startAt, dueAt }),
        );
      }
      if (previousTaskDetail) {
        queryClient.setQueryData<Task>(queryKeys.taskDetail(taskId), {
          ...previousTaskDetail,
          startAt,
          dueAt,
        });
      }
      return { previous, previousTaskDetail };
    },
    onError: (error, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId), context.previous);
      }
      if (context?.previousTaskDetail) {
        queryClient.setQueryData<Task>(queryKeys.taskDetail(variables.taskId), context.previousTaskDetail);
      }
      if (isApiConflictError(error)) {
        setRescheduleNotice({ type: 'conflict', message: t('timelineRescheduleConflict') });
      } else {
        setRescheduleNotice({ type: 'error', message: t('timelineRescheduleFailed') });
      }
    },
    onSettled: async (_result, _error, variables) => {
      rescheduleInFlightTaskIdsRef.current.delete(variables.taskId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(variables.taskId) });
    },
  });

  const timelineMoveTask = useMutation({
    mutationFn: async ({
      taskId,
      assigneeUserId,
      startAt,
      dueAt,
      version,
    }: {
      taskId: string;
      assigneeUserId?: string | null;
      startAt?: string | null;
      dueAt?: string | null;
      version: number;
    }) =>
      (await api(`/tasks/${taskId}/timeline-move`, {
        method: 'PATCH',
        body: { assigneeUserId, startAt, dueAt, version },
      })) as Task,
    onMutate: async ({ taskId, assigneeUserId, startAt, dueAt }) => {
      setRescheduleNotice(null);
      await queryClient.cancelQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.taskDetail(taskId) });
      const previous = queryClient.getQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId));
      const previousTaskDetail = queryClient.getQueryData<Task>(queryKeys.taskDetail(taskId));
      if (previous) {
        const optimisticMove: { startAt?: string | null; dueAt?: string | null; assigneeUserId?: string | null } = {};
        if (assigneeUserId !== undefined) optimisticMove.assigneeUserId = assigneeUserId;
        if (startAt !== undefined) optimisticMove.startAt = startAt;
        if (dueAt !== undefined) optimisticMove.dueAt = dueAt;
        queryClient.setQueryData<SectionTaskGroup[]>(
          queryKeys.projectTasksGrouped(projectId),
          applyTaskTimelineMoveInGroups(previous, taskId, optimisticMove),
        );
      }
      if (previousTaskDetail) {
        const optimisticTaskDetail: Task = { ...previousTaskDetail };
        if (assigneeUserId !== undefined) {
          optimisticTaskDetail.assigneeUserId = assigneeUserId;
        }
        if (startAt !== undefined) {
          optimisticTaskDetail.startAt = startAt;
        }
        if (dueAt !== undefined) {
          optimisticTaskDetail.dueAt = dueAt;
        }
        queryClient.setQueryData<Task>(queryKeys.taskDetail(taskId), optimisticTaskDetail);
      }
      return { previous, previousTaskDetail };
    },
    onError: (error, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId), context.previous);
      }
      if (context?.previousTaskDetail) {
        queryClient.setQueryData<Task>(queryKeys.taskDetail(variables.taskId), context.previousTaskDetail);
      }
      const isDateChange = variables.startAt !== undefined || variables.dueAt !== undefined;
      const isAssigneeChange = variables.assigneeUserId !== undefined;
      const conflictKey = isDateChange && !isAssigneeChange
        ? 'timelineRescheduleConflict'
        : isAssigneeChange && !isDateChange
          ? 'timelineMoveConflict'
          : 'timelineMoveAndRescheduleConflict';
      const failedKey = isDateChange && !isAssigneeChange
        ? 'timelineRescheduleFailed'
        : isAssigneeChange && !isDateChange
          ? 'timelineMoveFailed'
          : 'timelineMoveAndRescheduleFailed';
      if (isApiConflictError(error)) {
        setRescheduleNotice({ type: 'conflict', message: t(conflictKey) });
      } else {
        setRescheduleNotice({ type: 'error', message: t(failedKey) });
      }
    },
    onSettled: async (_result, _error, variables) => {
      rescheduleInFlightTaskIdsRef.current.delete(variables.taskId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(variables.taskId) });
    },
  });

  useEffect(() => {
    if (!rescheduleNotice) return;
    const timer = window.setTimeout(() => setRescheduleNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [rescheduleNotice]);

  const timelineLayout = useMemo(() => {
    let cursorY = 0;
    const barsByTaskId: Record<string, { left: number; width: number; y: number }> = {};
    const taskRowsById: Record<string, { top: number; height: number }> = {};
    const lanesWithRows: Array<{
      lane: (typeof timelineLanes)[number];
      tasks: (typeof timelineLanes)[number]['tasks'];
      top: number;
      bottom: number;
      taskRows: Array<{
        task: (typeof timelineLanes)[number]['tasks'][number];
        top: number;
      }>;
    }> = [];

    for (const lane of timelineLanes) {
      const laneTop = cursorY;
      cursorY += SECTION_ROW_HEIGHT;
      const taskRows: Array<{
        task: (typeof lane)['tasks'][number];
        top: number;
      }> = [];

      for (const task of lane.tasks) {
        const rowTop = cursorY;
        taskRowsById[task.id] = { top: rowTop, height: TASK_ROW_HEIGHT };
        const visibleStart = task.timelineStart && task.timelineStart < timeline.window.start
          ? timeline.window.start
          : task.timelineStart;
        const visibleEnd = task.timelineEnd && task.timelineEnd > timeline.window.end
          ? timeline.window.end
          : task.timelineEnd;

        if (task.hasSchedule && task.inWindow && task.timelineStart && task.timelineEnd) {
          barsByTaskId[task.id] = {
            left: Math.max(0, dayDiff(timeline.window.start, visibleStart ?? task.timelineStart)) * zoomConfig.dayColWidth,
            width: Math.max(1, dayDiff(visibleStart ?? task.timelineStart, visibleEnd ?? task.timelineEnd) + 1) * zoomConfig.dayColWidth,
            y: cursorY + TASK_ROW_HEIGHT / 2,
          };
        }
        taskRows.push({ task, top: rowTop });
        cursorY += TASK_ROW_HEIGHT;
      }
      lanesWithRows.push({
        lane,
        tasks: lane.tasks,
        top: laneTop,
        bottom: cursorY,
        taskRows,
      });
    }

    return {
      lanesWithRows,
      barsByTaskId,
      taskRowsById,
      bodyHeight: cursorY,
      totalRowCount: timelineLanes.length + filteredTasks.length,
    };
  }, [filteredTasks.length, timeline.window.end, timeline.window.start, timelineLanes, zoomConfig.dayColWidth]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const updateMeasurements = () => {
      setScrollTop(container.scrollTop);
      setViewportHeight(container.clientHeight);
    };
    updateMeasurements();
    const observer = new ResizeObserver(updateMeasurements);
    observer.observe(container);
    return () => {
      observer.disconnect();
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [projectId, zoom]);

  const virtualizationEnabled = timelineLayout.totalRowCount > VIRTUALIZE_ROW_THRESHOLD;
  const visibleRange = useMemo(() => {
    if (!virtualizationEnabled) {
      return { start: 0, end: timelineLayout.bodyHeight };
    }
    return {
      start: Math.max(0, scrollTop - VIRTUAL_OVERSCAN_PX),
      end: scrollTop + Math.max(viewportHeight, 1) + VIRTUAL_OVERSCAN_PX,
    };
  }, [scrollTop, timelineLayout.bodyHeight, viewportHeight, virtualizationEnabled]);

  const visibleTaskIds = useMemo(() => {
    if (!virtualizationEnabled) return filteredTaskIds;
    const next = new Set<string>();
    for (const [taskId, row] of Object.entries(timelineLayout.taskRowsById)) {
      if (row.top + row.height >= visibleRange.start && row.top <= visibleRange.end) {
        next.add(taskId);
      }
    }
    return next;
  }, [filteredTaskIds, timelineLayout.taskRowsById, visibleRange.end, visibleRange.start, virtualizationEnabled]);

  const connectorEdges = useMemo(
    () =>
      timeline.dependencyEdges.filter((edge) =>
        visibleTaskIds.has(edge.source)
        && visibleTaskIds.has(edge.target)
        && timelineLayout.barsByTaskId[edge.source]
        && timelineLayout.barsByTaskId[edge.target]),
    [timeline.dependencyEdges, timelineLayout.barsByTaskId, visibleTaskIds],
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    // Lightweight render-budget signal for timeline tuning under larger datasets.
    console.debug('[timeline:perf]', {
      projectId,
      mode,
      zoom,
      totalRows: timelineLayout.totalRowCount,
      taskRows: filteredTasks.length,
      dependencyEdges: timeline.dependencyEdges.length,
      connectorsDrawn: connectorEdges.length,
      virtualized: virtualizationEnabled,
    });
  }, [
    connectorEdges.length,
    filteredTasks.length,
    mode,
    projectId,
    timeline.dependencyEdges.length,
    timelineLayout.totalRowCount,
    virtualizationEnabled,
    zoom,
  ]);

  const resolveLaneIdAtClientY = (clientY: number): string | null => {
    const container = scrollContainerRef.current;
    if (!container) return null;
    const stickyHeaderHeight = stickyHeaderRef.current?.offsetHeight ?? 0;
    const bounds = container.getBoundingClientRect();
    const relativeY = clientY - bounds.top + container.scrollTop - stickyHeaderHeight;
    const lane = timelineLayout.lanesWithRows.find((entry) => relativeY >= entry.top && relativeY < entry.bottom);
    return lane?.lane.id ?? null;
  };

  const commitTimelineDrag = (
    taskId: string,
    deltaDays: number,
    originLaneId: string,
    dropLaneId: string | null,
  ) => {
    if (rescheduleInFlightTaskIdsRef.current.has(taskId)) return;
    const task = taskById.get(taskId);
    if (!task) return;

    const startAt = shiftIsoByDays(task.startAt, deltaDays);
    const dueAt = shiftIsoByDays(task.dueAt, deltaDays);
    const hasScheduleMove = Boolean(deltaDays) && Boolean(startAt || dueAt);
    const laneChanged = Boolean(dropLaneId && dropLaneId !== originLaneId);
    if (!hasScheduleMove && !laneChanged) return;

    const assigneeUserId =
      effectiveSwimlane === 'assignee' && laneChanged && dropLaneId
        ? parseAssigneeLaneId(dropLaneId)
        : undefined;
    const hasAssigneeMove = assigneeUserId !== undefined && assigneeUserId !== task.assigneeUserId;
    if (!hasScheduleMove && !hasAssigneeMove) return;

    rescheduleInFlightTaskIdsRef.current.add(taskId);
    if (hasAssigneeMove) {
      const timelineMovePayload: {
        taskId: string;
        assigneeUserId?: string | null;
        startAt?: string | null;
        dueAt?: string | null;
        version: number;
      } = {
        taskId,
        version: task.version,
      };
      if (assigneeUserId !== undefined) timelineMovePayload.assigneeUserId = assigneeUserId;
      if (hasScheduleMove) {
        timelineMovePayload.startAt = startAt;
        timelineMovePayload.dueAt = dueAt;
      }
      timelineMoveTask.mutate(timelineMovePayload);
      return;
    }
    if (hasScheduleMove) {
      rescheduleTask.mutate({
        taskId,
        startAt,
        dueAt,
        version: task.version,
      });
    }
  };

  const commitUnscheduledDrop = (taskId: string, originLaneId: string, clientX: number, clientY: number) => {
    if (rescheduleInFlightTaskIdsRef.current.has(taskId)) return;
    const task = taskById.get(taskId);
    const container = scrollContainerRef.current;
    if (!task || !container || !days.length) return;

    const containerBounds = container.getBoundingClientRect();
    const gridRelativeX = clientX - containerBounds.left + container.scrollLeft - TASK_NAME_COL_WIDTH;
    const clampedDayIndex = Math.max(0, Math.min(days.length - 1, Math.floor(gridRelativeX / zoomConfig.dayColWidth)));
    const targetDay = days[clampedDayIndex];
    if (!targetDay) return;

    const startDate = startOfDay(targetDay);
    const dropLaneId = resolveLaneIdAtClientY(clientY) ?? originLaneId;
    const assigneeUserId = effectiveSwimlane === 'assignee' ? parseAssigneeLaneId(dropLaneId) : undefined;
    const durationDays =
      task.startAt && task.dueAt
        ? Math.max(0, dayDiff(startOfDay(new Date(task.startAt)), startOfDay(new Date(task.dueAt))))
        : 0;

    const timelineMovePayload: {
      taskId: string;
      assigneeUserId?: string | null;
      startAt?: string | null;
      dueAt?: string | null;
      version: number;
    } = {
      taskId,
      startAt: startDate.toISOString(),
      dueAt: addDays(startDate, durationDays).toISOString(),
      version: task.version,
    };
    if (assigneeUserId !== undefined) {
      timelineMovePayload.assigneeUserId = assigneeUserId;
    }

    rescheduleInFlightTaskIdsRef.current.add(taskId);
    timelineMoveTask.mutate(timelineMovePayload);
  };

  const beginBarDrag = (taskId: string, pointerId: number, originX: number, originY: number, originLaneId: string) => {
    const next = {
      taskId,
      pointerId,
      originX,
      originY,
      originLaneId,
      dropLaneId: originLaneId,
      deltaDays: 0,
      moved: false,
    };
    dragStateRef.current = next;
    setDragState(next);
  };

  const updateBarDrag = (pointerId: number, clientX: number, clientY: number) => {
    const current = dragStateRef.current;
    if (!current || current.pointerId !== pointerId) return;
    const deltaPx = clientX - current.originX;
    const deltaY = clientY - current.originY;
    const deltaDays = Math.round(deltaPx / zoomConfig.dayColWidth);
    const moved = current.moved
      || Math.abs(deltaPx) >= DRAG_START_THRESHOLD_PX
      || Math.abs(deltaY) >= DRAG_START_THRESHOLD_PX;
    const dropLaneId = resolveLaneIdAtClientY(clientY) ?? current.dropLaneId;
    if (deltaDays === current.deltaDays && moved === current.moved && dropLaneId === current.dropLaneId) return;
    const next = { ...current, deltaDays, moved, dropLaneId };
    dragStateRef.current = next;
    setDragState(next);
  };

  const finishBarDrag = (pointerId: number) => {
    const current = dragStateRef.current;
    if (!current || current.pointerId !== pointerId) return;
    dragStateRef.current = null;
    setDragState(null);
    if (!current.moved) return;
    suppressClickTaskIdRef.current = current.taskId;
    commitTimelineDrag(current.taskId, current.deltaDays, current.originLaneId, current.dropLaneId);
  };

  const handleLaneDrop = (draggingLaneId: string, overLaneId: string) => {
    const laneIds = timelineLanes.map((lane) => lane.id);
    const nextLaneOrder = reorderLaneIds(laneIds, draggingLaneId, overLaneId);
    if (nextLaneOrder.join('|') === laneIds.join('|')) return;
    saveLaneOrderMutation.mutate({
      groupBy: effectiveSwimlane,
      laneOrder: nextLaneOrder,
    });
  };

  if (timeline.isLoading) {
    return <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">{t('loadingTimeline')}</div>;
  }

  if (timeline.isError) {
    return <div className="rounded-lg border bg-card p-4 text-sm text-destructive">{t('loadTimelineFailed')}</div>;
  }

  return (
    <div className="space-y-4" data-testid="timeline-view" data-view-mode={mode}>
      {rescheduleNotice ? (
        <div
          className={`rounded-md border px-3 py-2 text-xs ${
            rescheduleNotice.type === 'conflict'
              ? 'border-warning/40 bg-warning/10 text-foreground'
              : 'border-destructive/40 bg-destructive/10 text-foreground'
          }`}
          data-testid={
            rescheduleNotice.type === 'conflict'
              ? 'timeline-reschedule-conflict-banner'
              : 'timeline-reschedule-error-banner'
          }
        >
          {rescheduleNotice.message}
        </div>
      ) : null}
      <div className="space-y-3 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-md border bg-background/60 p-0.5">
            {(['day', 'week', 'month'] as TimelineZoom[]).map((zoomOption) => (
              <Button
                key={zoomOption}
                type="button"
                size="sm"
                variant={zoomOption === zoom ? 'default' : 'ghost'}
                className="h-7 px-2 text-xs"
                onClick={() => setZoom(zoomOption)}
                data-testid={`timeline-zoom-${zoomOption}`}
                data-active={zoomOption === zoom ? 'true' : 'false'}
              >
                {zoomOption === 'day' ? t('timelineZoomDay') : zoomOption === 'week' ? t('timelineZoomWeek') : t('timelineZoomMonth')}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="icon"
            aria-label={t('previousWindow')}
            onClick={() => setAnchorDate((current) => addDays(current, -zoomConfig.stepDays))}
            data-testid="timeline-prev-window"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAnchorDate(startOfDay(new Date()))}
            data-testid="timeline-today"
          >
            {t('today')}
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={t('nextWindow')}
            onClick={() => setAnchorDate((current) => addDays(current, zoomConfig.stepDays))}
            data-testid="timeline-next-window"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <p className="text-sm font-medium" data-testid="timeline-window-label">
            {timeline.window.start.toLocaleDateString()} - {timeline.window.end.toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{scheduledTasks.length}</Badge>
          <span>{t('timelineScheduledTasks')}</span>
          <Badge variant="secondary">{unscheduledTasks.length}</Badge>
          <span>{t('timelineUnscheduled')}</span>
          {showDependencyConnectors ? (
            <>
              <Badge variant="secondary">{totalDependencyEdges}</Badge>
              <span>{t('timelineDependencies')}</span>
              <Badge variant={ganttRiskTasks.length ? 'destructive' : 'secondary'}>
                {ganttRiskTasks.length}
              </Badge>
              <span>{t('ganttAtRisk')}</span>
              <Badge variant={ganttDelayedTasks.length ? 'destructive' : 'secondary'} data-testid="gantt-delayed-count">
                {ganttDelayedTasks.length}
              </Badge>
              <span>{t('ganttDelayed')}</span>
              <Badge variant={ganttAheadTasks.length ? 'default' : 'secondary'} data-testid="gantt-ahead-count">
                {ganttAheadTasks.length}
              </Badge>
              <span>{t('ganttAhead')}</span>
            </>
          ) : null}
        </div>
      </div>
        {mode === 'timeline' ? (
          <div className="flex flex-wrap items-center gap-3 border-t pt-2">
            <div className="inline-flex items-center rounded-md border bg-background/60 p-0.5" data-testid="timeline-swimlane-toggle">
              <Button
                type="button"
                size="sm"
                variant={effectiveSwimlane === 'section' ? 'default' : 'ghost'}
                className="h-7 px-2 text-xs"
                data-testid="timeline-swimlane-section"
                data-active={effectiveSwimlane === 'section' ? 'true' : 'false'}
                onClick={() => setSwimlane('section')}
              >
                {t('timelineSwimlaneSection')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={effectiveSwimlane === 'assignee' ? 'default' : 'ghost'}
                className="h-7 px-2 text-xs"
                data-testid="timeline-swimlane-assignee"
                data-active={effectiveSwimlane === 'assignee' ? 'true' : 'false'}
                onClick={() => setSwimlane('assignee')}
              >
                {t('timelineSwimlaneAssignee')}
              </Button>
            </div>

            <div className="inline-flex items-center rounded-md border bg-background/60 p-0.5" data-testid="timeline-sort-toggle">
              <Button
                type="button"
                size="sm"
                variant={effectiveSortMode === 'manual' ? 'default' : 'ghost'}
                className="h-7 px-2 text-xs"
                data-testid="timeline-sort-manual"
                data-active={effectiveSortMode === 'manual' ? 'true' : 'false'}
                onClick={() => setSortMode('manual')}
              >
                {t('timelineSortManual')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={effectiveSortMode === 'startAt' ? 'default' : 'ghost'}
                className="h-7 px-2 text-xs"
                data-testid="timeline-sort-start"
                data-active={effectiveSortMode === 'startAt' ? 'true' : 'false'}
                onClick={() => setSortMode('startAt')}
              >
                {t('timelineSortStart')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={effectiveSortMode === 'dueAt' ? 'default' : 'ghost'}
                className="h-7 px-2 text-xs"
                data-testid="timeline-sort-due"
                data-active={effectiveSortMode === 'dueAt' ? 'true' : 'false'}
                onClick={() => setSortMode('dueAt')}
              >
                {t('timelineSortDue')}
              </Button>
            </div>

            <div className="inline-flex items-center rounded-md border bg-background/60 p-0.5" data-testid="timeline-schedule-filter-toggle">
              <Button
                type="button"
                size="sm"
                variant={effectiveScheduleFilter === 'all' ? 'default' : 'ghost'}
                className="h-7 px-2 text-xs"
                data-testid="timeline-filter-all"
                data-active={effectiveScheduleFilter === 'all' ? 'true' : 'false'}
                onClick={() => setScheduleFilter('all')}
              >
                {t('timelineFilterAll')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={effectiveScheduleFilter === 'scheduled' ? 'default' : 'ghost'}
                className="h-7 px-2 text-xs"
                data-testid="timeline-filter-scheduled"
                data-active={effectiveScheduleFilter === 'scheduled' ? 'true' : 'false'}
                onClick={() => setScheduleFilter('scheduled')}
              >
                {t('timelineFilterScheduled')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={effectiveScheduleFilter === 'unscheduled' ? 'default' : 'ghost'}
                className="h-7 px-2 text-xs"
                data-testid="timeline-filter-unscheduled"
                data-active={effectiveScheduleFilter === 'unscheduled' ? 'true' : 'false'}
                onClick={() => setScheduleFilter('unscheduled')}
              >
                {t('timelineFilterUnscheduled')}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground" data-testid="timeline-drag-hint">
              {t('timelineDragHint')}
            </p>
          </div>
        ) : mode === 'gantt' ? (
          <div className="flex flex-wrap items-center gap-3 border-t pt-2">
            <div className="inline-flex items-center rounded-md border bg-background/60 p-0.5" data-testid="gantt-risk-filter-toggle">
              <Button
                type="button"
                size="sm"
                variant={ganttRiskFilterMode === 'all' ? 'default' : 'ghost'}
                className="h-7 px-2 text-xs"
                data-testid="gantt-filter-all"
                data-active={ganttRiskFilterMode === 'all' ? 'true' : 'false'}
                onClick={() => setGanttRiskFilterMode('all')}
              >
                {t('ganttAllTasks')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={ganttRiskFilterMode === 'risk' ? 'default' : 'ghost'}
                className="h-7 px-2 text-xs"
                data-testid="gantt-filter-risk"
                data-active={ganttRiskFilterMode === 'risk' ? 'true' : 'false'}
                onClick={() => setGanttRiskFilterMode('risk')}
              >
                {t('ganttRiskOnly')}
              </Button>
            </div>
            <Button
              type="button"
              size="sm"
              variant={ganttStrictMode ? 'default' : 'outline'}
              className={`h-7 px-2 text-xs ${ganttStrictMode ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}`}
              data-testid="gantt-strict-mode"
              data-active={ganttStrictMode ? 'true' : 'false'}
              onClick={() => setGanttStrictMode((current) => !current)}
            >
              {t('ganttStrictMode')}
            </Button>
            <div className="text-xs text-muted-foreground">
              {ganttBlockedTasks.length} {t('ganttBlockedTasks')}
            </div>
          </div>
        ) : null}
      </div>

      {mode === 'gantt' && ganttStrictMode && ganttRiskTasks.length > 0 ? (
        <div
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-foreground"
          data-testid="gantt-strict-warning-banner"
        >
          {t('ganttStrictWarning')} ({ganttRiskTasks.length})
        </div>
      ) : null}

      {mode === 'gantt' && ganttRiskTasks.length > 0 ? (
        <div className="rounded-lg border bg-card p-3" data-testid="gantt-risk-panel">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('ganttRiskPanelTitle')}</p>
          <div className="mt-2 space-y-1">
            {ganttRiskTasks.slice(0, 6).map((task) => {
              const risk = ganttRiskByTaskId.get(task.id);
              if (!risk) return null;
              return (
                <button
                  key={task.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-muted/40"
                  data-testid={`gantt-risk-item-${task.id}`}
                  onClick={() => setSelectedTaskId(task.id)}
                >
                  <span className="truncate pr-2">{task.title || t('untitledTask')}</span>
                  <span className="text-muted-foreground">
                    {risk.overdue
                      ? t('ganttRiskOverdue')
                      : risk.blockedByOpen > 0
                        ? `${risk.blockedByOpen} ${t('ganttRiskBlocked')}`
                        : `${risk.blockedByLate} ${t('ganttRiskLateDependency')}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div
        ref={scrollContainerRef}
        onScroll={(event) => {
          const nextScrollTop = (event.currentTarget as HTMLDivElement).scrollTop;
          if (scrollRafRef.current !== null) {
            cancelAnimationFrame(scrollRafRef.current);
          }
          scrollRafRef.current = requestAnimationFrame(() => {
            setScrollTop(nextScrollTop);
            scrollRafRef.current = null;
          });
        }}
        className="overflow-auto rounded-lg border bg-card"
      >
        <div
          ref={stickyHeaderRef}
          className="sticky top-0 z-[1] grid border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/75"
          style={{ gridTemplateColumns: `${TASK_NAME_COL_WIDTH}px ${gridWidth}px` }}
        >
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('taskName')}
          </div>
          <div className="grid" style={{ gridTemplateColumns: `repeat(${days.length}, ${zoomConfig.dayColWidth}px)` }}>
            {days.map((day) => (
              <div key={day.toISOString()} className="border-l px-1 py-1 text-center">
                <p className="text-[10px] text-muted-foreground">{formatWeekday(day)}</p>
                <p className="text-[10px] font-medium">{formatDay(day)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          {timelineLayout.bodyHeight > 0 && showDependencyConnectors ? (
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute top-0 z-0"
              style={{ left: `${TASK_NAME_COL_WIDTH}px`, width: `${gridWidth}px`, height: `${timelineLayout.bodyHeight}px` }}
              data-testid="timeline-dependency-layer"
            >
              <defs>
                <marker
                  id={markerId}
                  markerWidth="6"
                  markerHeight="6"
                  refX="5"
                  refY="3"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M0,0 L6,3 L0,6 Z" fill="hsl(var(--primary))" />
                </marker>
              </defs>
              {connectorEdges.map((edge) => {
                const from = timelineLayout.barsByTaskId[edge.source];
                const to = timelineLayout.barsByTaskId[edge.target];
                if (!from || !to) return null;
                const targetRisk = ganttRiskByTaskId.get(edge.target);
                const x1 = from.left + from.width;
                const y1 = from.y;
                const x2 = to.left;
                const y2 = to.y;
                const cx = x2 >= x1 ? x1 + Math.max(16, (x2 - x1) / 2) : x1 + 16;
                const path = `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
                return (
                  <path
                    key={`${edge.source}-${edge.target}-${edge.type}`}
                    d={path}
                    fill="none"
                    stroke={targetRisk?.isAtRisk ? 'hsl(var(--destructive))' : 'hsl(var(--primary))'}
                    strokeWidth={targetRisk?.isAtRisk ? 1.75 : 1.25}
                    markerEnd={`url(#${markerId})`}
                    opacity={targetRisk?.isAtRisk ? 0.9 : 0.7}
                    data-testid={`timeline-connector-${edge.source}-${edge.target}`}
                  />
                );
              })}
            </svg>
          ) : null}

          <div
            className="relative z-[1]"
            onDragOver={(event) => {
              if (!Array.from(event.dataTransfer.types).includes(UNSCHEDULED_TASK_DND_TYPE)) return;
              event.preventDefault();
            }}
            onDrop={(event) => {
              const raw = event.dataTransfer.getData(UNSCHEDULED_TASK_DND_TYPE);
              if (!raw) return;
              event.preventDefault();
              setUnscheduledDragTaskId(null);
              try {
                const parsed = JSON.parse(raw) as { taskId?: string; originLaneId?: string };
                if (!parsed.taskId || !parsed.originLaneId) return;
                commitUnscheduledDrop(parsed.taskId, parsed.originLaneId, event.clientX, event.clientY);
              } catch {
                // ignore malformed drag payload
              }
            }}
          >
            {timelineLayout.lanesWithRows.map(({ lane, tasks: laneTasks, top, taskRows }) => {
              if (!laneTasks.length) return null;
              const sectionVisible = !virtualizationEnabled
                || (top + SECTION_ROW_HEIGHT >= visibleRange.start && top <= visibleRange.end);
              const visibleTaskRows = virtualizationEnabled
                ? taskRows.filter((entry) => entry.top + TASK_ROW_HEIGHT >= visibleRange.start && entry.top <= visibleRange.end)
                : taskRows;
              if (!sectionVisible && visibleTaskRows.length === 0) return null;
              const firstVisibleIndex = visibleTaskRows.length
                ? taskRows.findIndex((entry) => entry.task.id === visibleTaskRows[0]?.task.id)
                : -1;
              const lastVisibleIndex = visibleTaskRows.length
                ? taskRows.findIndex((entry) => entry.task.id === visibleTaskRows[visibleTaskRows.length - 1]?.task.id)
                : -1;
              const topSpacer = firstVisibleIndex > 0 ? firstVisibleIndex * TASK_ROW_HEIGHT : 0;
              const bottomSpacer = lastVisibleIndex >= 0
                ? Math.max(0, (taskRows.length - lastVisibleIndex - 1) * TASK_ROW_HEIGHT)
                : taskRows.length * TASK_ROW_HEIGHT;

              return (
                <div key={lane.id} className="border-b last:border-b-0">
                  {sectionVisible ? (
                    <div
                      className={`grid h-8 border-b bg-muted/20 ${
                        laneDragState?.overLaneId === lane.id ? 'ring-1 ring-primary/40' : ''
                      }`}
                      style={{ gridTemplateColumns: `${TASK_NAME_COL_WIDTH}px ${gridWidth}px` }}
                      data-testid={`timeline-lane-${normalizeTestIdSegment(lane.id)}`}
                      draggable={mode === 'timeline'}
                      onDragStart={(event) => {
                        if (mode !== 'timeline') return;
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', lane.id);
                        setLaneDragState({ draggingLaneId: lane.id, overLaneId: lane.id });
                      }}
                      onDragOver={(event) => {
                        if (mode !== 'timeline' || !laneDragState?.draggingLaneId) return;
                        event.preventDefault();
                        if (laneDragState.overLaneId !== lane.id) {
                          setLaneDragState((current) => (current ? { ...current, overLaneId: lane.id } : current));
                        }
                      }}
                      onDrop={(event) => {
                        if (mode !== 'timeline') return;
                        event.preventDefault();
                        const draggingLaneId = laneDragState?.draggingLaneId ?? event.dataTransfer.getData('text/plain');
                        if (draggingLaneId) {
                          handleLaneDrop(draggingLaneId, lane.id);
                        }
                        setLaneDragState(null);
                      }}
                      onDragEnd={() => {
                        setLaneDragState(null);
                      }}
                    >
                      <div className="flex items-center px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {lane.label}
                      </div>
                      <div className="flex items-center px-2 text-xs text-muted-foreground">
                        {laneTasks.length} {t('tasks')}
                      </div>
                    </div>
                  ) : (
                    <div style={{ height: `${SECTION_ROW_HEIGHT}px` }} />
                  )}

                  {topSpacer > 0 ? <div style={{ height: `${topSpacer}px` }} /> : null}

                  {visibleTaskRows.map(({ task }) => {
                    const fallbackName = task.title.trim() || t('untitledTask');
                    const ganttTaskRisk = mode === 'gantt' ? ganttRiskByTaskId.get(task.id) : null;
                    const ganttVariance = mode === 'gantt' ? ganttVarianceByTaskId.get(task.id) ?? null : null;
                    const visibleStart = task.timelineStart && task.timelineStart < timeline.window.start
                      ? timeline.window.start
                      : task.timelineStart;
                    const visibleEnd = task.timelineEnd && task.timelineEnd > timeline.window.end
                      ? timeline.window.end
                      : task.timelineEnd;
                    const visibleBaselineStart = task.baselineStart && task.baselineStart < timeline.window.start
                      ? timeline.window.start
                      : task.baselineStart;
                    const visibleBaselineEnd = task.baselineEnd && task.baselineEnd > timeline.window.end
                      ? timeline.window.end
                      : task.baselineEnd;
                    return (
                      <div key={task.id} className="grid h-10 border-b last:border-b-0" style={{ gridTemplateColumns: `${TASK_NAME_COL_WIDTH}px ${gridWidth}px` }}>
                        <div className="flex h-full items-center gap-2 px-3">
                          <button
                            type="button"
                            className="truncate text-left text-sm hover:underline"
                            onClick={() => setSelectedTaskId(task.id)}
                            data-testid={`timeline-task-${task.id}`}
                          >
                            {fallbackName}
                          </button>
                          {mode === 'gantt' && ganttVariance !== null ? (
                            <Badge
                              variant={ganttVariance > 0 ? 'destructive' : 'secondary'}
                              className="h-5 px-1.5 text-[10px]"
                              data-testid={`gantt-variance-${task.id}`}
                            >
                              {ganttVariance > 0 ? `+${ganttVariance}d` : `${ganttVariance}d`}
                            </Badge>
                          ) : null}
                          {mode === 'gantt' && ganttTaskRisk?.isAtRisk ? (
                            <Badge
                              variant="destructive"
                              className="h-5 px-1.5 text-[10px]"
                              data-testid={`gantt-risk-badge-${task.id}`}
                            >
                              {ganttTaskRisk.overdue
                                ? t('ganttRiskOverdue')
                                : ganttTaskRisk.blockedByOpen > 0
                                  ? t('ganttRiskBlocked')
                                  : t('ganttRiskLateDependency')}
                            </Badge>
                          ) : null}
                        </div>
                        <div className="relative h-full border-l">
                          {task.hasSchedule && task.inWindow && task.timelineStart && task.timelineEnd ? (
                            <>
                              {mode === 'gantt' && task.hasBaseline && task.baselineStart && task.baselineEnd ? (
                                <div
                                  className="pointer-events-none absolute top-1/2 h-2 -translate-y-1/2 rounded border border-dashed border-muted-foreground/40 bg-muted/50"
                                  style={{
                                    left: `${Math.max(0, dayDiff(timeline.window.start, visibleBaselineStart ?? task.baselineStart)) * zoomConfig.dayColWidth}px`,
                                    width: `${Math.max(1, dayDiff(visibleBaselineStart ?? task.baselineStart, visibleBaselineEnd ?? task.baselineEnd) + 1) * zoomConfig.dayColWidth}px`,
                                  }}
                                  data-testid={`gantt-baseline-${task.id}`}
                                />
                              ) : null}
                              <button
                                type="button"
                                className={`absolute top-1/2 h-6 -translate-y-1/2 rounded bg-primary/20 px-2 text-left text-[11px] text-primary hover:bg-primary/25 ${
                                  dragState?.taskId === task.id && dragState.moved ? 'cursor-grabbing opacity-90' : 'cursor-grab'
                                }`}
                                style={{
                                  left: `${Math.max(
                                    0,
                                    Math.max(0, dayDiff(timeline.window.start, visibleStart ?? task.timelineStart)) * zoomConfig.dayColWidth
                                      + (dragState?.taskId === task.id ? dragState.deltaDays * zoomConfig.dayColWidth : 0),
                                  )}px`,
                                  width: `${Math.max(1, dayDiff(visibleStart ?? task.timelineStart, visibleEnd ?? task.timelineEnd) + 1) * zoomConfig.dayColWidth}px`,
                                }}
                                onClick={() => {
                                  if (suppressClickTaskIdRef.current === task.id) {
                                    suppressClickTaskIdRef.current = null;
                                    return;
                                  }
                                  setSelectedTaskId(task.id);
                                }}
                                onPointerDown={(event) => {
                                  if (event.button !== 0) return;
                                  if (rescheduleInFlightTaskIdsRef.current.has(task.id)) return;
                                  event.preventDefault();
                                  beginBarDrag(task.id, event.pointerId, event.clientX, event.clientY, lane.id);
                                  event.currentTarget.setPointerCapture(event.pointerId);
                                }}
                                onPointerMove={(event) => {
                                  updateBarDrag(event.pointerId, event.clientX, event.clientY);
                                }}
                                onPointerUp={(event) => {
                                  finishBarDrag(event.pointerId);
                                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                                    event.currentTarget.releasePointerCapture(event.pointerId);
                                  }
                                }}
                                onPointerCancel={(event) => {
                                  finishBarDrag(event.pointerId);
                                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                                    event.currentTarget.releasePointerCapture(event.pointerId);
                                  }
                                }}
                                data-testid={`timeline-bar-${task.id}`}
                                title={`${task.timelineStart.toLocaleDateString()} - ${task.timelineEnd.toLocaleDateString()}`}
                              >
                                <span className="block truncate">{fallbackName}</span>
                              </button>
                            </>
                          ) : task.hasSchedule ? (
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 rounded border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground">
                              {t('timelineOutOfWindow')}
                            </span>
                          ) : (
                            <button
                              type="button"
                              className={`absolute left-2 top-1/2 -translate-y-1/2 rounded border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/40 ${
                                unscheduledDragTaskId === task.id ? 'opacity-60' : ''
                              }`}
                              onClick={() => setSelectedTaskId(task.id)}
                              draggable={mode === 'timeline'}
                              onDragStart={(event) => {
                                if (mode !== 'timeline') return;
                                event.dataTransfer.effectAllowed = 'move';
                                event.dataTransfer.setData(
                                  UNSCHEDULED_TASK_DND_TYPE,
                                  JSON.stringify({ taskId: task.id, originLaneId: lane.id }),
                                );
                                setUnscheduledDragTaskId(task.id);
                              }}
                              onDragEnd={() => {
                                setUnscheduledDragTaskId(null);
                              }}
                              data-testid={`timeline-unscheduled-${task.id}`}
                            >
                              {t('timelineNoDates')}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {bottomSpacer > 0 ? <div style={{ height: `${bottomSpacer}px` }} /> : null}
                </div>
              );
            })}
          </div>
        </div>

        {!filteredTasks.length ? (
          <div className="p-6 text-sm text-muted-foreground">{t('timelineNoTasks')}</div>
        ) : null}
      </div>

      <TaskDetailDrawer
        taskId={selectedTaskId}
        open={Boolean(selectedTaskId)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setSelectedTaskId(null);
        }}
        projectId={projectId}
      />
    </div>
  );
}
