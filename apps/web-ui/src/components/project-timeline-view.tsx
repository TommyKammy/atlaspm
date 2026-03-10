'use client';

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  buildTimelineLanes,
  buildTimelineLayout,
  buildTimelineTaskOrderByLane,
  createProjectViewFallbackState,
  dateOnlyInputToLocalDate,
  localDateToDateOnlyUtcIso,
  normalizeProjectViewState,
  resolveProjectViewState,
  type ProjectViewState as SavedProjectViewState,
} from '@atlaspm/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import TaskDetailDrawer from '@/components/task-detail-drawer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTimelineData, type TimelineTask } from '@/hooks/use-timeline-data';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { PROJECT_SAVED_VIEW_PARAM, PROJECT_VIEW_STATE_APPLY_EVENT } from '@/lib/project-saved-views';
import { queryKeys } from '@/lib/query-keys';
import type { ProjectSavedViewsResponse, SectionTaskGroup, Task } from '@/lib/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const LEFT_RAIL_COL_WIDTH = 260;
const TIMELINE_VIEW_STORAGE_PREFIX = 'atlaspm:timeline-view';
const TIMELINE_LANE_ORDER_STORAGE_PREFIX = 'atlaspm:timeline-lane-order';
const TIMELINE_MANUAL_LAYOUT_STORAGE_PREFIX = 'atlaspm:timeline-manual-layout';
const SECTION_ROW_HEIGHT = 32;
const TASK_ROW_HEIGHT = 40;
const VIRTUALIZE_ROW_THRESHOLD = 120;
const VIRTUAL_OVERSCAN_PX = 320;
const DRAG_START_THRESHOLD_PX = 6;
const LANE_CHANGE_HORIZONTAL_THRESHOLD_PX = 8;
const UNASSIGNED_LANE_ID = '__unassigned__';
const UNSCHEDULED_TASK_DND_TYPE = 'application/x-atlaspm-unscheduled-task';

type TimelineZoom = 'day' | 'week' | 'month';
type TimelineMode = 'timeline' | 'gantt';
type TimelineSwimlane = 'section' | 'assignee' | 'status';
type TimelineSortMode = 'manual' | 'startAt' | 'dueAt';
type TimelineScheduleFilter = 'all' | 'scheduled' | 'unscheduled';
type GanttRiskFilterMode = 'all' | 'risk';
type TimelineLaneOrderGroupBy = Extract<TimelineSwimlane, 'section' | 'assignee'>;
type TimelineManualLaneLayout = {
  orderedTaskIds: string[];
  rowByTaskId?: Record<string, number>;
};
type TimelineManualLayoutByLane = Record<string, TimelineManualLaneLayout>;
type TimelineManualLayoutState = Record<TimelineSwimlane, TimelineManualLayoutByLane>;
type TimelineLaneSubtaskMeta = {
  visibleTaskIds: string[];
  childIdsByParentId: Record<string, string[]>;
  depthByTaskId: Record<string, number>;
  rowHintByTaskId: Record<string, number>;
};
type TimelineViewState = {
  zoom?: TimelineZoom;
  anchorDate?: string;
  swimlane?: TimelineSwimlane;
  sortMode?: TimelineSortMode;
  scheduleFilter?: TimelineScheduleFilter;
  workingDaysOnly?: boolean;
  ganttRiskFilterMode?: GanttRiskFilterMode;
  ganttStrictMode?: boolean;
};

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
  timelineManualLayout: TimelineManualLayoutState;
  timelineViewState: TimelineViewState | null;
  ganttViewState: TimelineViewState | null;
};

type LocalTimelineViewStateSnapshot = {
  zoom: TimelineZoom;
  anchorDate: Date;
  swimlane: TimelineSwimlane;
  sortMode: TimelineSortMode;
  scheduleFilter: TimelineScheduleFilter;
  workingDaysOnly: boolean;
  ganttRiskFilterMode: GanttRiskFilterMode;
  ganttStrictMode: boolean;
};

type TimelineDependencyDraft = {
  sourceTaskId: string;
  sourceX: number;
  sourceY: number;
  pointerX: number;
  pointerY: number;
  targetTaskId: string | null;
};

type TimelineSelectionDraft = {
  pointerId: number;
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
};

type TimelineTaskMutationResult = Task & {
  subtaskMovePolicy?: Task['subtaskMovePolicy'];
};

type TimelineParentMoveUndoState = {
  taskId: string;
  title: string;
  version: number;
  descendantCount: number;
  previousStartAt: string | null;
  previousDueAt: string | null;
  previousAssigneeUserId: string | null;
  previousSectionId: string;
  previousStatus: Task['status'];
};

function getLegacyTimelineStorageKey(
  mode: TimelineMode,
  userId: string,
  projectId: string,
): string {
  return `atlaspm:timeline-view:${userId}:${projectId}:${mode}`;
}

function createEmptyTimelineManualLayoutState(): TimelineManualLayoutState {
  return {
    section: {},
    assignee: {},
    status: {},
  };
}

const TIMELINE_ZOOM_CONFIG: Record<
  TimelineZoom,
  { beforeDays: number; afterDays: number; stepDays: number; dayColWidth: number }
> = {
  day: { beforeDays: 3, afterDays: 10, stepDays: 1, dayColWidth: 64 },
  week: { beforeDays: 21, afterDays: 42, stepDays: 7, dayColWidth: 36 },
  month: { beforeDays: 62, afterDays: 184, stepDays: 30, dayColWidth: 24 },
};

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function shiftUtcDateOnlyIsoByDays(value: string | null | undefined, days: number): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return null;
  const shifted = new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate() + days, 0, 0, 0, 0),
  );
  return shifted.toISOString();
}

function addDays(base: Date, delta: number): Date {
  const result = startOfDay(base);
  result.setDate(result.getDate() + delta);
  return result;
}

function dayNumber(date: Date): number {
  const localMidnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor(localMidnight.getTime() / DAY_MS);
}

function dayDiff(from: Date, to: Date): number {
  return dayNumber(to) - dayNumber(from);
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function shiftIsoByBusinessDays(
  value: string | null | undefined,
  businessDays: number,
): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return null;
  const normalized = new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 0, 0, 0, 0),
  );
  if (!businessDays) return normalized.toISOString();
  const step = businessDays > 0 ? 1 : -1;
  let remaining = Math.abs(businessDays);
  while (remaining > 0) {
    normalized.setUTCDate(normalized.getUTCDate() + step);
    if (!isWeekend(normalized)) {
      remaining -= 1;
    }
  }
  return normalized.toISOString();
}

function shiftTimelineIso(
  value: string | null | undefined,
  deltaDays: number,
  workingDaysOnly: boolean,
  useCalendarDays: boolean,
): string | null {
  if (!workingDaysOnly || useCalendarDays) {
    return shiftIsoByDays(value, deltaDays);
  }
  return shiftIsoByBusinessDays(value, deltaDays);
}

function resizeTimelineRange(
  task: TimelineTask,
  edge: 'start' | 'end',
  deltaDays: number,
  workingDaysOnly: boolean,
  useCalendarDays: boolean,
): { startAt: string | null; dueAt: string | null } {
  const currentStartAt = task.startAt;
  const currentDueAt = task.dueAt;
  if (!currentStartAt || !currentDueAt) {
    return { startAt: currentStartAt ?? null, dueAt: currentDueAt ?? null };
  }

  if (edge === 'start') {
    const nextStartAt = shiftTimelineIso(
      currentStartAt,
      deltaDays,
      workingDaysOnly,
      useCalendarDays,
    );
    if (!nextStartAt) return { startAt: currentStartAt, dueAt: currentDueAt };
    if (new Date(nextStartAt) > new Date(currentDueAt)) {
      return { startAt: currentDueAt, dueAt: currentDueAt };
    }
    return { startAt: nextStartAt, dueAt: currentDueAt };
  }

  const nextDueAt = shiftTimelineIso(
    currentDueAt,
    deltaDays,
    workingDaysOnly,
    useCalendarDays,
  );
  if (!nextDueAt) return { startAt: currentStartAt, dueAt: currentDueAt };
  if (new Date(nextDueAt) < new Date(currentStartAt)) {
    return { startAt: currentStartAt, dueAt: currentStartAt };
  }
  return { startAt: currentStartAt, dueAt: nextDueAt };
}

function colorFromProjectId(projectId: string): {
  hue: number;
  saturation: number;
  lightness: number;
} {
  let hash = 0;
  for (let index = 0; index < projectId.length; index += 1) {
    hash = (hash * 33 + projectId.charCodeAt(index)) % 360;
  }
  return {
    hue: hash,
    saturation: 68,
    lightness: 54,
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbaFromHex(hex: string, alpha: number): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function resolveTimelineBarStyle(task: TimelineTask, today: Date): CSSProperties {
  const isDone = task.status === 'DONE';
  const isOverdue =
    !isDone && Boolean(task.timelineEnd && dayNumber(task.timelineEnd) < dayNumber(today));
  const optionColor =
    task.customFieldValues?.find((value) => value.option?.color)?.option?.color ?? null;

  if (isOverdue) {
    return {
      backgroundColor: 'rgba(239, 68, 68, 0.16)',
      border: '1px solid rgba(239, 68, 68, 0.3)',
      color: 'rgb(153, 27, 27)',
    };
  }

  if (isDone) {
    return {
      backgroundColor: 'rgba(34, 197, 94, 0.16)',
      border: '1px solid rgba(34, 197, 94, 0.3)',
      color: 'rgb(21, 128, 61)',
    };
  }

  if (task.status === 'BLOCKED') {
    return {
      backgroundColor: 'rgba(245, 158, 11, 0.16)',
      border: '1px solid rgba(245, 158, 11, 0.3)',
      color: 'rgb(180, 83, 9)',
    };
  }

  if (optionColor) {
    return {
      backgroundColor: rgbaFromHex(optionColor, 0.16) ?? 'rgba(59, 130, 246, 0.16)',
      border: `1px solid ${rgbaFromHex(optionColor, 0.32) ?? 'rgba(59, 130, 246, 0.32)'}`,
      color: optionColor,
    };
  }

  const projectColor = colorFromProjectId(task.projectId);
  return {
    backgroundColor: `hsla(${projectColor.hue}, ${projectColor.saturation}%, ${projectColor.lightness}%, 0.16)`,
    border: `1px solid hsla(${projectColor.hue}, ${projectColor.saturation}%, ${projectColor.lightness}%, 0.32)`,
    color: `hsl(${projectColor.hue}, ${projectColor.saturation}%, ${Math.max(28, projectColor.lightness - 16)}%)`,
  };
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

function compareTimelineTasks(
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

function timelineTasksOverlap(left: TimelineTask, right: TimelineTask): boolean {
  if (
    !left.hasSchedule ||
    !right.hasSchedule ||
    !left.timelineStart ||
    !left.timelineEnd ||
    !right.timelineStart ||
    !right.timelineEnd
  ) {
    return false;
  }
  const leftStart = dayNumber(left.timelineStart);
  const leftEnd = dayNumber(left.timelineEnd);
  const rightStart = dayNumber(right.timelineStart);
  const rightEnd = dayNumber(right.timelineEnd);
  return !(leftEnd < rightStart || rightEnd < leftStart);
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
  return shiftUtcDateOnlyIsoByDays(value, days);
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

function applyTaskSchedulesInGroups(
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

function findTaskInGroups(groups: SectionTaskGroup[], taskId: string): Task | undefined {
  for (const group of groups) {
    const task = group.tasks.find((candidate) => candidate.id === taskId);
    if (task) return task;
  }
  return undefined;
}

function applyResolvedTaskInGroups(groups: SectionTaskGroup[], resolvedTask: Task) {
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

function applyResolvedTasksInGroups(groups: SectionTaskGroup[], resolvedTasks: Task[]) {
  return resolvedTasks.reduce(
    (current, resolvedTask) => applyResolvedTaskInGroups(current, resolvedTask),
    groups,
  );
}

function applyTaskTimelineMoveInGroups(
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

function parseAssigneeLaneId(laneId: string): string | null | undefined {
  if (!laneId.startsWith('assignee:')) return undefined;
  const raw = laneId.slice('assignee:'.length);
  return raw === UNASSIGNED_LANE_ID ? null : raw;
}

function deriveLaneIdForTask(task: TimelineTask, swimlane: TimelineSwimlane): string {
  if (swimlane === 'assignee') {
    return `assignee:${task.assigneeUserId ?? UNASSIGNED_LANE_ID}`;
  }
  if (swimlane === 'status') {
    return `status:${task.status}`;
  }
  return `section:${task.sectionId}`;
}

function parseSectionLaneId(laneId: string): string | undefined {
  if (!laneId.startsWith('section:')) return undefined;
  return laneId.slice('section:'.length) || undefined;
}

function parseStatusLaneId(laneId: string): Task['status'] | undefined {
  if (!laneId.startsWith('status:')) return undefined;
  const raw = laneId.slice('status:'.length);
  if (raw === 'TODO' || raw === 'IN_PROGRESS' || raw === 'DONE' || raw === 'BLOCKED') {
    return raw;
  }
  return undefined;
}

function isLaneOrderGroupBy(value: TimelineSwimlane): value is TimelineLaneOrderGroupBy {
  return value === 'section' || value === 'assignee';
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

function applyTimelineViewState(
  parsed: TimelineViewState,
  setters: {
    setZoom: (value: TimelineZoom) => void;
    setAnchorDate: (value: Date) => void;
    setSwimlane: (value: TimelineSwimlane) => void;
    setSortMode: (value: TimelineSortMode) => void;
    setScheduleFilter: (value: TimelineScheduleFilter) => void;
    setWorkingDaysOnly: (value: boolean) => void;
    setGanttRiskFilterMode: (value: GanttRiskFilterMode) => void;
    setGanttStrictMode: (value: boolean) => void;
  },
) {
  if (parsed.zoom && parsed.zoom in TIMELINE_ZOOM_CONFIG) {
    setters.setZoom(parsed.zoom);
  }
  if (parsed.anchorDate) {
    const parsedDate = new Date(parsed.anchorDate);
    if (!Number.isNaN(parsedDate.valueOf())) {
      setters.setAnchorDate(startOfDay(parsedDate));
    }
  }
  if (
    parsed.swimlane === 'section' ||
    parsed.swimlane === 'assignee' ||
    parsed.swimlane === 'status'
  ) {
    setters.setSwimlane(parsed.swimlane);
  }
  if (
    parsed.sortMode === 'manual' ||
    parsed.sortMode === 'startAt' ||
    parsed.sortMode === 'dueAt'
  ) {
    setters.setSortMode(parsed.sortMode);
  }
  if (
    parsed.scheduleFilter === 'all' ||
    parsed.scheduleFilter === 'scheduled' ||
    parsed.scheduleFilter === 'unscheduled'
  ) {
    setters.setScheduleFilter(parsed.scheduleFilter);
  }
  if (typeof parsed.workingDaysOnly === 'boolean') {
    setters.setWorkingDaysOnly(parsed.workingDaysOnly);
  }
  if (parsed.ganttRiskFilterMode === 'all' || parsed.ganttRiskFilterMode === 'risk') {
    setters.setGanttRiskFilterMode(parsed.ganttRiskFilterMode);
  }
  if (typeof parsed.ganttStrictMode === 'boolean') {
    setters.setGanttStrictMode(parsed.ganttStrictMode);
  }
}

function applySavedProjectViewState(
  mode: TimelineMode,
  parsed: SavedProjectViewState,
  setters: {
    setZoom: (value: TimelineZoom) => void;
    setAnchorDate: (value: Date) => void;
    setSwimlane: (value: TimelineSwimlane) => void;
    setSortMode: (value: TimelineSortMode) => void;
    setScheduleFilter: (value: TimelineScheduleFilter) => void;
    setWorkingDaysOnly: (value: boolean) => void;
    setGanttRiskFilterMode: (value: GanttRiskFilterMode) => void;
    setGanttStrictMode: (value: boolean) => void;
  },
) {
  applyTimelineViewState(savedProjectViewStateToTimelineViewState(mode, parsed), setters);
}

function buildViewStateForMode(
  mode: TimelineMode,
  snapshot: LocalTimelineViewStateSnapshot,
): TimelineViewState {
  return mode === 'timeline'
    ? {
        zoom: snapshot.zoom,
        anchorDate: snapshot.anchorDate.toISOString(),
        swimlane: snapshot.swimlane,
        sortMode: snapshot.sortMode,
        scheduleFilter: snapshot.scheduleFilter,
        workingDaysOnly: snapshot.workingDaysOnly,
      }
    : {
        zoom: snapshot.zoom,
        anchorDate: snapshot.anchorDate.toISOString(),
        ganttRiskFilterMode: snapshot.ganttRiskFilterMode,
        ganttStrictMode: snapshot.ganttStrictMode,
      };
}

function buildSavedProjectViewStateForMode(
  mode: TimelineMode,
  snapshot: LocalTimelineViewStateSnapshot,
): SavedProjectViewState {
  return normalizeProjectViewState(mode, {
    ...(mode === 'timeline' ? { grouping: { field: snapshot.swimlane } } : {}),
    ...(mode === 'timeline' ? { sorting: { field: snapshot.sortMode, direction: 'asc' as const } } : {}),
    filters: {
      schedule: mode === 'timeline' ? snapshot.scheduleFilter : 'all',
    },
    zoom: {
      unit: snapshot.zoom,
      anchorDate: snapshot.anchorDate.toISOString(),
      ...(mode === 'timeline' ? { workingDaysOnly: snapshot.workingDaysOnly } : {}),
      ...(mode === 'gantt'
        ? {
            ganttRiskFilterMode: snapshot.ganttRiskFilterMode,
            ganttStrictMode: snapshot.ganttStrictMode,
          }
        : {}),
    },
  });
}

function savedProjectViewStateToTimelineViewState(
  mode: TimelineMode,
  state: SavedProjectViewState,
): TimelineViewState {
  if (mode === 'timeline') {
    return {
      ...(state.zoom?.unit ? { zoom: state.zoom.unit } : {}),
      ...(state.zoom?.anchorDate ? { anchorDate: state.zoom.anchorDate } : {}),
      ...(state.grouping?.field ? { swimlane: state.grouping.field as TimelineSwimlane } : {}),
      ...(state.sorting?.field ? { sortMode: state.sorting.field as TimelineSortMode } : {}),
      ...(state.filters?.schedule ? { scheduleFilter: state.filters.schedule } : {}),
      ...(typeof state.zoom?.workingDaysOnly === 'boolean'
        ? { workingDaysOnly: state.zoom.workingDaysOnly }
        : {}),
    };
  }

  return {
    ...(state.zoom?.unit ? { zoom: state.zoom.unit } : {}),
    ...(state.zoom?.anchorDate ? { anchorDate: state.zoom.anchorDate } : {}),
    ...(state.zoom?.ganttRiskFilterMode
      ? { ganttRiskFilterMode: state.zoom.ganttRiskFilterMode }
      : {}),
    ...(typeof state.zoom?.ganttStrictMode === 'boolean'
      ? { ganttStrictMode: state.zoom.ganttStrictMode }
      : {}),
  };
}

function parseSavedProjectViewState(
  mode: TimelineMode,
  raw: unknown,
): SavedProjectViewState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;

  const normalizedGeneric = normalizeProjectViewState(mode, record as SavedProjectViewState);
  if (Object.keys(normalizedGeneric).length > 0) {
    return normalizedGeneric;
  }

  const legacyState: SavedProjectViewState = {};
  if (
    record.zoom !== undefined ||
    record.anchorDate !== undefined ||
    record.workingDaysOnly !== undefined ||
    record.ganttRiskFilterMode !== undefined ||
    record.ganttStrictMode !== undefined
  ) {
    legacyState.zoom = {
      unit:
        record.zoom === 'day' || record.zoom === 'week' || record.zoom === 'month'
          ? record.zoom
          : 'week',
      ...(typeof record.anchorDate === 'string' ? { anchorDate: record.anchorDate } : {}),
      ...(typeof record.workingDaysOnly === 'boolean'
        ? { workingDaysOnly: record.workingDaysOnly }
        : {}),
      ...(record.ganttRiskFilterMode === 'all' || record.ganttRiskFilterMode === 'risk'
        ? { ganttRiskFilterMode: record.ganttRiskFilterMode }
        : {}),
      ...(typeof record.ganttStrictMode === 'boolean'
        ? { ganttStrictMode: record.ganttStrictMode }
        : {}),
    };
  }
  if (
    record.swimlane === 'section' ||
    record.swimlane === 'assignee' ||
    record.swimlane === 'status'
  ) {
    legacyState.grouping = { field: record.swimlane };
  }
  if (
    record.sortMode === 'manual' ||
    record.sortMode === 'startAt' ||
    record.sortMode === 'dueAt'
  ) {
    legacyState.sorting = { field: record.sortMode, direction: 'asc' };
  }
  if (
    record.scheduleFilter === 'all' ||
    record.scheduleFilter === 'scheduled' ||
    record.scheduleFilter === 'unscheduled'
  ) {
    legacyState.filters = { schedule: record.scheduleFilter };
  }

  const normalizedLegacy = normalizeProjectViewState(mode, legacyState);
  return Object.keys(normalizedLegacy).length > 0 ? normalizedLegacy : null;
}

function areSavedProjectViewStatesEqual(
  mode: TimelineMode,
  left: SavedProjectViewState | null | undefined,
  right: SavedProjectViewState,
): boolean {
  return JSON.stringify(normalizeProjectViewState(mode, left)) === JSON.stringify(normalizeProjectViewState(mode, right));
}

function getTimelineLaneOrderStorageKey(
  projectId: string,
  groupBy: TimelineLaneOrderGroupBy,
  userId?: string | null,
): string {
  return userId
    ? `${TIMELINE_LANE_ORDER_STORAGE_PREFIX}:${projectId}:${groupBy}:${userId}`
    : `${TIMELINE_LANE_ORDER_STORAGE_PREFIX}:${projectId}:${groupBy}`;
}

function getTimelineManualLayoutStorageKey(
  projectId: string,
  groupBy: TimelineSwimlane,
  userId?: string | null,
): string {
  return userId
    ? `${TIMELINE_MANUAL_LAYOUT_STORAGE_PREFIX}:${projectId}:${groupBy}:${userId}`
    : `${TIMELINE_MANUAL_LAYOUT_STORAGE_PREFIX}:${projectId}:${groupBy}`;
}

function normalizeTimelineManualLayoutByLane(value: unknown): TimelineManualLayoutByLane {
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
    if (normalizedTaskIds.length > 0) {
      const rowByTaskId: Record<string, number> = {};
      const maxRowIndex = Math.max(normalizedTaskIds.length - 1, 0);
      for (const [taskIdRaw, rowIndex] of Object.entries(candidate.rowByTaskId)) {
        const taskId = taskIdRaw.trim();
        if (!taskId || !normalizedTaskIds.includes(taskId)) continue;
        const numericRowIndex = Number(rowIndex);
        if (!Number.isInteger(numericRowIndex) || numericRowIndex < 0) continue;
        rowByTaskId[taskId] = Math.min(numericRowIndex, maxRowIndex);
      }
      next[laneId] =
        Object.keys(rowByTaskId).length > 0
          ? { orderedTaskIds: normalizedTaskIds, rowByTaskId }
          : { orderedTaskIds: normalizedTaskIds };
    }
  }
  return next;
}

function normalizeTimelineManualLayoutState(value: unknown): TimelineManualLayoutState {
  const next = createEmptyTimelineManualLayoutState();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return next;
  const candidate = value as Record<string, unknown>;
  next.section = normalizeTimelineManualLayoutByLane(candidate.section);
  next.assignee = normalizeTimelineManualLayoutByLane(candidate.assignee);
  next.status = normalizeTimelineManualLayoutByLane(candidate.status);
  return next;
}

function hasTimelineManualLayout(layout: TimelineManualLayoutByLane): boolean {
  return Object.values(layout).some((laneTaskOrder) => laneTaskOrder.orderedTaskIds.length > 0);
}

function mergeTimelineManualLaneTaskOrder(
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

function getTimelineManualOrderedTaskIdsByLane(layout: TimelineManualLayoutByLane): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(layout)
      .filter(([, laneLayout]) => laneLayout.orderedTaskIds.length > 0)
      .map(([laneId, laneLayout]) => [laneId, laneLayout.orderedTaskIds]),
  );
}

function getTimelineManualRowByTaskIdByLane(
  layout: TimelineManualLayoutByLane,
): Record<string, Record<string, number>> {
  return Object.fromEntries(
    Object.entries(layout)
      .filter(([, laneLayout]) => Boolean(laneLayout.rowByTaskId && Object.keys(laneLayout.rowByTaskId).length))
      .map(([laneId, laneLayout]) => [laneId, laneLayout.rowByTaskId ?? {}]),
  );
}

function buildTimelineLaneSubtaskMeta<TTask extends { id: string; parentId?: string | null }>(
  tasks: TTask[],
  collapsedParentIds: Set<string>,
  baseRowByTaskId?: Record<string, number>,
): TimelineLaneSubtaskMeta {
  const taskById = new Map(tasks.map((task) => [task.id, task] as const));
  const laneTaskIds = new Set(tasks.map((task) => task.id));
  const childIdsByParentId: Record<string, string[]> = {};
  for (const task of tasks) {
    const parentId = task.parentId ?? null;
    if (!parentId || !laneTaskIds.has(parentId)) continue;
    (childIdsByParentId[parentId] ??= []).push(task.id);
  }

  const roots = tasks.filter((task) => !task.parentId || !laneTaskIds.has(task.parentId));
  const visibleTaskIds: string[] = [];
  const depthByTaskId: Record<string, number> = {};
  const rowHintByTaskId: Record<string, number> = {};

  const visit = (taskId: string, depth: number, inheritedRowHint: number) => {
    const task = taskById.get(taskId);
    if (!task) return;
    depthByTaskId[taskId] = depth;
    const ownRowHint = Math.max(baseRowByTaskId?.[taskId] ?? 0, inheritedRowHint);
    rowHintByTaskId[taskId] = ownRowHint;
    visibleTaskIds.push(taskId);
    if (collapsedParentIds.has(taskId)) return;
    const childIds = childIdsByParentId[taskId] ?? [];
    childIds.forEach((childId) => visit(childId, depth + 1, ownRowHint + 1));
  };

  roots.forEach((task) => visit(task.id, 0, baseRowByTaskId?.[task.id] ?? 0));

  return {
    visibleTaskIds,
    childIdsByParentId,
    depthByTaskId,
    rowHintByTaskId,
  };
}

function readStoredTimelineLaneOrder(keys: Array<string | null | undefined>): string[] {
  if (typeof window === 'undefined') return [];
  for (const key of keys) {
    if (!key) continue;
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (value): value is string => typeof value === 'string' && value.trim().length > 0,
        );
      }
    } catch {
      // Ignore malformed local lane-order state.
    }
  }
  return [];
}

function persistTimelineLaneOrder(laneOrder: string[], keys: Array<string | null | undefined>) {
  if (typeof window === 'undefined') return;
  const payload = JSON.stringify(laneOrder);
  for (const key of keys) {
    if (!key) continue;
    window.localStorage.setItem(key, payload);
  }
}

function readStoredTimelineManualLayout(keys: Array<string | null | undefined>): TimelineManualLayoutByLane {
  if (typeof window === 'undefined') return {};
  for (const key of keys) {
    if (!key) continue;
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    try {
      return normalizeTimelineManualLayoutByLane(JSON.parse(raw));
    } catch {
      // Ignore malformed local manual-layout state.
    }
  }
  return {};
}

function persistTimelineManualLayout(
  laneTaskOrder: TimelineManualLayoutByLane,
  keys: Array<string | null | undefined>,
) {
  if (typeof window === 'undefined') return;
  const payload = JSON.stringify(laneTaskOrder);
  for (const key of keys) {
    if (!key) continue;
    window.localStorage.setItem(key, payload);
  }
}

export function ProjectScheduleCanvas({
  projectId,
  search,
  statusFilter,
  priorityFilter,
  mode,
  initialTaskId,
}: {
  projectId: string;
  search: string;
  statusFilter: 'ALL' | Task['status'];
  priorityFilter: 'ALL' | NonNullable<Task['priority']>;
  mode: TimelineMode;
  initialTaskId?: string | null;
}) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const meQuery = useQuery<{ id: string }>({
    queryKey: queryKeys.me,
    queryFn: () => api('/me'),
  });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [today, setToday] = useState(() => startOfDay(new Date()));
  const [zoom, setZoom] = useState<TimelineZoom>('week');
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()));
  const [swimlane, setSwimlane] = useState<TimelineSwimlane>('section');
  const [sortMode, setSortMode] = useState<TimelineSortMode>('manual');
  const [scheduleFilter, setScheduleFilter] = useState<TimelineScheduleFilter>('all');
  const [workingDaysOnly, setWorkingDaysOnly] = useState(false);
  const [ganttRiskFilterMode, setGanttRiskFilterMode] = useState<GanttRiskFilterMode>('all');
  const [ganttStrictMode, setGanttStrictMode] = useState(false);
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === 'undefined' ? 800 : window.innerHeight,
  );
  const [dragState, setDragState] = useState<{
    taskId: string;
    taskIds: string[];
    pointerId: number;
    originX: number;
    originY: number;
    originLaneId: string;
    dropLaneId: string | null;
    dropRowIndex: number | null;
    deltaDays: number;
    useCalendarDays: boolean;
    moved: boolean;
  } | null>(null);
  const dragStateRef = useRef<{
    taskId: string;
    taskIds: string[];
    pointerId: number;
    originX: number;
    originY: number;
    originLaneId: string;
    dropLaneId: string | null;
    dropRowIndex: number | null;
    deltaDays: number;
    useCalendarDays: boolean;
    moved: boolean;
  } | null>(null);
  const dragPointerTargetRef = useRef<HTMLElement | null>(null);
  const [resizeState, setResizeState] = useState<{
    taskId: string;
    pointerId: number;
    originX: number;
    edge: 'start' | 'end';
    deltaDays: number;
    moved: boolean;
    useCalendarDays: boolean;
  } | null>(null);
  const resizeStateRef = useRef<{
    taskId: string;
    pointerId: number;
    originX: number;
    edge: 'start' | 'end';
    deltaDays: number;
    moved: boolean;
    useCalendarDays: boolean;
  } | null>(null);
  const [laneDragState, setLaneDragState] = useState<{
    draggingLaneId: string;
    overLaneId: string | null;
  } | null>(null);
  const laneDragStateRef = useRef<{ draggingLaneId: string; overLaneId: string | null } | null>(
    null,
  );
  const [collapsedLaneIds, setCollapsedLaneIds] = useState<Set<string>>(() => new Set());
  const [unscheduledDragTaskId, setUnscheduledDragTaskId] = useState<string | null>(null);
  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [collapsedTimelineParentIds, setCollapsedTimelineParentIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [dependencyDraft, setDependencyDraft] = useState<TimelineDependencyDraft | null>(null);
  const dependencyDraftRef = useRef<TimelineDependencyDraft | null>(null);
  const [selectedTimelineTaskIds, setSelectedTimelineTaskIds] = useState<string[]>([]);
  const selectedTimelineTaskIdsRef = useRef<string[]>([]);
  const [selectionDraft, setSelectionDraft] = useState<TimelineSelectionDraft | null>(null);
  const selectionDraftRef = useRef<TimelineSelectionDraft | null>(null);
  const selectionPointerTargetRef = useRef<HTMLElement | null>(null);
  const suppressClickTaskIdRef = useRef<string | null>(null);
  const [rescheduleNotice, setRescheduleNotice] = useState<{
    type: 'conflict' | 'error' | 'warning';
    message: string;
  } | null>(null);
  const [timelineParentMoveUndo, setTimelineParentMoveUndo] =
    useState<TimelineParentMoveUndoState | null>(null);
  const timelineParentMoveUndoActionRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (initialTaskId) {
      setSelectedTaskId(initialTaskId);
    }
  }, [initialTaskId]);

  useEffect(() => {
    let timeoutId: number | undefined;

    const scheduleNextMidnightUpdate = () => {
      const now = new Date();
      const nextMidnight = startOfDay(addDays(now, 1));
      const msUntilNextMidnight = Math.max(1000, nextMidnight.getTime() - now.getTime());
      timeoutId = window.setTimeout(() => {
        setToday(startOfDay(new Date()));
        scheduleNextMidnightUpdate();
      }, msUntilNextMidnight);
    };

    scheduleNextMidnightUpdate();

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);
  const rescheduleInFlightTaskIdsRef = useRef(new Set<string>());
  const timelineViewStateRef = useRef<SavedProjectViewState | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const stickyHeaderRef = useRef<HTMLDivElement | null>(null);
  const timelineCanvasRef = useRef<HTMLDivElement | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const markerId = `timeline-arrow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const timelinePreferencesQuery = useQuery<TimelinePreferences>({
    queryKey: queryKeys.projectTimelinePreferences(projectId),
    queryFn: () =>
      api(`/projects/${projectId}/timeline/preferences`) as Promise<TimelinePreferences>,
    enabled: Boolean(projectId),
  });
  const savedViewsQuery = useQuery<ProjectSavedViewsResponse>({
    queryKey: queryKeys.projectSavedViews(projectId),
    queryFn: () => api(`/projects/${projectId}/saved-views`) as Promise<ProjectSavedViewsResponse>,
    enabled: Boolean(projectId),
  });

  const timelineStorageBaseKey = useMemo(
    () => (projectId ? `${TIMELINE_VIEW_STORAGE_PREFIX}:${projectId}:${mode}` : null),
    [mode, projectId],
  );
  const timelineStorageUserKey = useMemo(
    () =>
      meQuery.data?.id && timelineStorageBaseKey
        ? `${timelineStorageBaseKey}:${meQuery.data.id}`
        : null,
    [meQuery.data?.id, timelineStorageBaseKey],
  );
  const fallbackViewState = useMemo(
    () => createProjectViewFallbackState(mode, startOfDay(new Date()).toISOString()),
    [mode],
  );
  const selectedSavedViewId = searchParams.get(PROJECT_SAVED_VIEW_PARAM);
  const legacyPersistedDefaultViewState = useMemo(() => {
    const candidate =
      mode === 'timeline'
        ? timelinePreferencesQuery.data?.timelineViewState
        : timelinePreferencesQuery.data?.ganttViewState;
    return parseSavedProjectViewState(mode, candidate);
  }, [
    mode,
    timelinePreferencesQuery.data?.ganttViewState,
    timelinePreferencesQuery.data?.timelineViewState,
  ]);
  const persistedDefaultViewState = useMemo(
    () => savedViewsQuery.data?.defaultsByMode[mode] ?? legacyPersistedDefaultViewState,
    [legacyPersistedDefaultViewState, mode, savedViewsQuery.data?.defaultsByMode],
  );
  const selectedNamedView = useMemo(
    () =>
      savedViewsQuery.data?.views.find((view) => view.id === selectedSavedViewId && view.mode === mode) ?? null,
    [mode, savedViewsQuery.data?.views, selectedSavedViewId],
  );
  const laneOrderGroupBy = mode === 'timeline' && isLaneOrderGroupBy(swimlane) ? swimlane : null;
  const manualLayoutGroupBy = mode === 'timeline' ? swimlane : null;
  const laneOrderStorageBaseKey = useMemo(
    () =>
      projectId && laneOrderGroupBy
        ? getTimelineLaneOrderStorageKey(projectId, laneOrderGroupBy)
        : null,
    [laneOrderGroupBy, projectId],
  );
  const laneOrderStorageUserKey = useMemo(
    () =>
      projectId && meQuery.data?.id && laneOrderGroupBy
        ? getTimelineLaneOrderStorageKey(projectId, laneOrderGroupBy, meQuery.data.id)
        : null,
    [laneOrderGroupBy, meQuery.data?.id, projectId],
  );
  const manualLayoutStorageBaseKey = useMemo(
    () =>
      projectId && manualLayoutGroupBy
        ? getTimelineManualLayoutStorageKey(projectId, manualLayoutGroupBy)
        : null,
    [manualLayoutGroupBy, projectId],
  );
  const manualLayoutStorageUserKey = useMemo(
    () =>
      projectId && meQuery.data?.id && manualLayoutGroupBy
        ? getTimelineManualLayoutStorageKey(projectId, manualLayoutGroupBy, meQuery.data.id)
        : null,
    [manualLayoutGroupBy, meQuery.data?.id, projectId],
  );
  const hasRestoredTimelinePreferences = useRef(false);

  useEffect(() => {
    hasRestoredTimelinePreferences.current = false;
  }, [timelineStorageBaseKey]);

  useEffect(() => {
    if (hasRestoredTimelinePreferences.current) return;
    if (!timelineStorageBaseKey || !timelinePreferencesQuery.isFetched || !savedViewsQuery.isFetched) return;
    setPreferencesHydrated(false);
    let restoredLocalState: SavedProjectViewState | null = null;
    if (typeof window !== 'undefined') {
      const preferenceKeys = [
        timelineStorageUserKey,
        timelineStorageBaseKey,
        meQuery.data?.id ? getLegacyTimelineStorageKey(mode, meQuery.data.id, projectId) : null,
      ].filter((value): value is string => Boolean(value));
      for (const key of preferenceKeys) {
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        try {
          const parsedLocalState = parseSavedProjectViewState(mode, JSON.parse(raw));
          if (!parsedLocalState) continue;
          restoredLocalState = parsedLocalState;
          break;
        } catch {
          // Ignore malformed local preference state.
        }
      }
    }

    const preferredViewState = resolveProjectViewState({
      mode,
      fallbackState: fallbackViewState,
      savedDefaultState: persistedDefaultViewState,
      selectedNamedView,
      workingState: restoredLocalState,
    }).state;
    applySavedProjectViewState(mode, preferredViewState, {
      setZoom,
      setAnchorDate,
      setSwimlane,
      setSortMode,
      setScheduleFilter,
      setWorkingDaysOnly,
      setGanttRiskFilterMode,
      setGanttStrictMode,
    });
    hasRestoredTimelinePreferences.current = true;
    setPreferencesHydrated(true);
  }, [
    fallbackViewState,
    mode,
    savedViewsQuery.isFetched,
    timelinePreferencesQuery.isFetched,
    persistedDefaultViewState,
    projectId,
    selectedNamedView,
    timelineStorageBaseKey,
    timelineStorageUserKey,
  ]);

  timelineViewStateRef.current = {
    ...buildSavedProjectViewStateForMode(mode, {
      zoom,
      anchorDate,
      swimlane,
      sortMode,
      scheduleFilter,
      workingDaysOnly,
      ganttRiskFilterMode,
      ganttStrictMode,
    }),
  };

  useEffect(() => {
    if (!preferencesHydrated || !timelineStorageBaseKey || typeof window === 'undefined') return;
    const nextState = timelineViewStateRef.current;
    if (!nextState) return;
    window.localStorage.setItem(timelineStorageBaseKey, JSON.stringify(nextState));
    if (timelineStorageUserKey) {
      window.localStorage.setItem(timelineStorageUserKey, JSON.stringify(nextState));
    }
  }, [
    anchorDate,
    ganttRiskFilterMode,
    ganttStrictMode,
    preferencesHydrated,
    scheduleFilter,
    sortMode,
    swimlane,
    timelineStorageBaseKey,
    timelineStorageUserKey,
    workingDaysOnly,
    zoom,
  ]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const persistLatestViewState = () => {
      if (!preferencesHydrated || !timelineStorageBaseKey) return;
      const nextState = timelineViewStateRef.current;
      if (!nextState) return;
      window.localStorage.setItem(timelineStorageBaseKey, JSON.stringify(nextState));
      if (timelineStorageUserKey) {
        window.localStorage.setItem(timelineStorageUserKey, JSON.stringify(nextState));
      }
    };

    window.addEventListener('beforeunload', persistLatestViewState);
    window.addEventListener('pagehide', persistLatestViewState);
    return () => {
      window.removeEventListener('beforeunload', persistLatestViewState);
      window.removeEventListener('pagehide', persistLatestViewState);
    };
  }, [preferencesHydrated, timelineStorageBaseKey, timelineStorageUserKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const applyExternalState = (
      event: Event,
    ) => {
      const detail = (event as CustomEvent<{ mode: TimelineMode; state: SavedProjectViewState }>).detail;
      if (!detail || detail.mode !== mode) return;
      const nextState = normalizeProjectViewState(mode, detail.state);
      applySavedProjectViewState(mode, nextState, {
        setZoom,
        setAnchorDate,
        setSwimlane,
        setSortMode,
        setScheduleFilter,
        setWorkingDaysOnly,
        setGanttRiskFilterMode,
        setGanttStrictMode,
      });
      if (timelineStorageBaseKey) {
        window.localStorage.setItem(timelineStorageBaseKey, JSON.stringify(nextState));
      }
      if (timelineStorageUserKey) {
        window.localStorage.setItem(timelineStorageUserKey, JSON.stringify(nextState));
      }
    };

    window.addEventListener(PROJECT_VIEW_STATE_APPLY_EVENT, applyExternalState as EventListener);
    return () => {
      window.removeEventListener(PROJECT_VIEW_STATE_APPLY_EVENT, applyExternalState as EventListener);
    };
  }, [mode, timelineStorageBaseKey, timelineStorageUserKey]);

  const saveViewStateMutation = useMutation({
    mutationFn: async ({
      nextMode,
      viewState,
      savedViewState,
    }: {
      nextMode: TimelineMode;
      viewState: TimelineViewState;
      savedViewState: SavedProjectViewState;
    }) =>
      (await Promise.all([
        api(`/projects/${projectId}/timeline/preferences/view-state/${nextMode}`, {
          method: 'PUT',
          body: viewState,
        }) as Promise<TimelinePreferences>,
        api(`/projects/${projectId}/saved-views/defaults/${nextMode}`, {
          method: 'PUT',
          body: { state: savedViewState },
        }) as Promise<ProjectSavedViewsResponse>,
      ]))[0],
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.projectTimelinePreferences(projectId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.projectSavedViews(projectId),
        }),
      ]);
    },
    onError: () => {
      setRescheduleNotice({ type: 'error', message: t('timelineViewStateSaveFailed') });
    },
  });

  const currentModeViewState = useMemo(
    () =>
      buildViewStateForMode(mode, {
        zoom,
        anchorDate,
        swimlane,
        sortMode,
        scheduleFilter,
        workingDaysOnly,
        ganttRiskFilterMode,
        ganttStrictMode,
      }),
    [
      anchorDate,
      ganttRiskFilterMode,
      ganttStrictMode,
      mode,
      scheduleFilter,
      sortMode,
      swimlane,
      workingDaysOnly,
      zoom,
    ],
  );
  const currentModeSavedViewState = useMemo(
    () =>
      buildSavedProjectViewStateForMode(mode, {
        zoom,
        anchorDate,
        swimlane,
        sortMode,
        scheduleFilter,
        workingDaysOnly,
        ganttRiskFilterMode,
        ganttStrictMode,
      }),
    [
      anchorDate,
      ganttRiskFilterMode,
      ganttStrictMode,
      mode,
      scheduleFilter,
      sortMode,
      swimlane,
      workingDaysOnly,
      zoom,
    ],
  );
  const viewStateSaveBaseline = persistedDefaultViewState ?? fallbackViewState;
  const hasUnsavedDefaultViewStateChanges =
    preferencesHydrated &&
    !areSavedProjectViewStatesEqual(mode, viewStateSaveBaseline, currentModeSavedViewState);

  const zoomConfig = TIMELINE_ZOOM_CONFIG[zoom];
  const effectiveSwimlane: TimelineSwimlane = mode === 'timeline' ? swimlane : 'section';
  const effectiveSortMode: TimelineSortMode = mode === 'timeline' ? sortMode : 'manual';
  const effectiveScheduleFilter: TimelineScheduleFilter =
    mode === 'timeline' ? scheduleFilter : 'all';
  const showDependencyConnectors = mode === 'timeline' || mode === 'gantt';

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
    for (
      let cursor = timeline.window.start;
      cursor <= timeline.window.end;
      cursor = addDays(cursor, 1)
    ) {
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
  }, [
    effectiveScheduleFilter,
    effectiveSortMode,
    priorityFilter,
    search,
    statusFilter,
    timeline.tasks,
  ]);

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
        if (
          taskDueDay !== null &&
          blocker.timelineEnd &&
          dayNumber(blocker.timelineEnd) > taskDueDay
        ) {
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
  }, [baseFilteredTasks, timeline.dependencyEdges]);

  const describeTaskRisk = (risk: GanttTaskRisk | undefined) => {
    if (!risk?.isAtRisk) return null;
    if (risk.overdue) return t('ganttRiskOverdue');
    if (risk.blockedByOpen > 0) return t('ganttRiskBlocked');
    return t('ganttRiskLateDependency');
  };

  const filteredTasks = useMemo(() => {
    if (mode !== 'gantt' || ganttRiskFilterMode === 'all') return baseFilteredTasks;
    return baseFilteredTasks.filter((task) => ganttRiskByTaskId.get(task.id)?.isAtRisk);
  }, [baseFilteredTasks, ganttRiskByTaskId, ganttRiskFilterMode, mode]);
  const scheduledTimelineTasks = useMemo(
    () => filteredTasks.filter((task) => task.hasSchedule),
    [filteredTasks],
  );
  const preferredLaneOrder = useMemo(() => {
    const storedLaneOrder = readStoredTimelineLaneOrder([
      laneOrderStorageUserKey,
      laneOrderStorageBaseKey,
    ]);
    if (effectiveSwimlane === 'assignee') {
      const serverOrder = timelinePreferencesQuery.data?.laneOrderByAssignee ?? [];
      return serverOrder.length > 0 ? serverOrder : storedLaneOrder;
    }
    if (effectiveSwimlane === 'status') {
      return [];
    }
    const serverOrder = timelinePreferencesQuery.data?.laneOrderBySection ?? [];
    return serverOrder.length > 0 ? serverOrder : storedLaneOrder;
  }, [
    effectiveSwimlane,
    laneOrderStorageBaseKey,
    laneOrderStorageUserKey,
    timelinePreferencesQuery.data?.laneOrderByAssignee,
    timelinePreferencesQuery.data?.laneOrderBySection,
  ]);
  const preferredManualLayout = useMemo(() => {
    const storedLayout = readStoredTimelineManualLayout([
      manualLayoutStorageUserKey,
      manualLayoutStorageBaseKey,
    ]);
    const serverLayout = normalizeTimelineManualLayoutState(
      timelinePreferencesQuery.data?.timelineManualLayout,
    )[effectiveSwimlane];
    return hasTimelineManualLayout(serverLayout) ? serverLayout : storedLayout;
  }, [
    effectiveSwimlane,
    manualLayoutStorageBaseKey,
    manualLayoutStorageUserKey,
    timelinePreferencesQuery.data?.timelineManualLayout,
  ]);
  const hasActiveManualLayout = mode === 'timeline' && sortMode === 'manual'
    ? hasTimelineManualLayout(preferredManualLayout)
    : false;
  const preferredManualTaskOrderByLane = useMemo(
    () => getTimelineManualOrderedTaskIdsByLane(preferredManualLayout),
    [preferredManualLayout],
  );
  const preferredManualRowByTaskIdByLane = useMemo(
    () => getTimelineManualRowByTaskIdByLane(preferredManualLayout),
    [preferredManualLayout],
  );

  const baseTimelineLanes = useMemo(() => {
    const lanes = buildTimelineLanes({
      swimlane: effectiveSwimlane,
      tasks: scheduledTimelineTasks,
      sections: timeline.sections,
      membersById: timeline.membersById,
      preferredLaneOrder,
      ...(hasActiveManualLayout ? { preferredTaskOrderByLane: preferredManualTaskOrderByLane } : {}),
      defaultSectionLabel: t('tasks'),
      unassignedLabel: t('unassigned'),
      statusLabels: {
        TODO: t('statusTodo'),
        IN_PROGRESS: t('statusInProgress'),
        BLOCKED: t('statusBlocked'),
        DONE: t('statusDone'),
      },
      unassignedLaneId: UNASSIGNED_LANE_ID,
    });
    return lanes;
  }, [
    effectiveSwimlane,
    hasActiveManualLayout,
    preferredLaneOrder,
    preferredManualTaskOrderByLane,
    scheduledTimelineTasks,
    t,
    timeline.membersById,
    timeline.sections,
  ]);
  const timelineLanes = baseTimelineLanes;
  const timelineLaneSubtaskMetaById = useMemo(() => {
    const next: Record<string, TimelineLaneSubtaskMeta> = {};
    for (const lane of timelineLanes) {
      next[lane.id] = buildTimelineLaneSubtaskMeta(
        lane.tasks,
        collapsedTimelineParentIds,
        preferredManualRowByTaskIdByLane[lane.id],
      );
    }
    return next;
  }, [collapsedTimelineParentIds, preferredManualRowByTaskIdByLane, timelineLanes]);
  const treeAwareManualRowByTaskIdByLane = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(timelineLaneSubtaskMetaById).map(([laneId, meta]) => [
          laneId,
          Object.keys(meta.rowHintByTaskId).length > 0
            ? {
                ...(preferredManualRowByTaskIdByLane[laneId] ?? {}),
                ...meta.rowHintByTaskId,
              }
            : (preferredManualRowByTaskIdByLane[laneId] ?? {}),
        ]),
      ),
    [preferredManualRowByTaskIdByLane, timelineLaneSubtaskMetaById],
  );
  const treeAwareManualPlacementByLane = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(preferredManualLayout)
          .filter(([, laneLayout]) => laneLayout.orderedTaskIds.length > 0)
          .map(([laneId, laneLayout]) => {
            const rowByTaskId = treeAwareManualRowByTaskIdByLane[laneId];
            return [
              laneId,
              rowByTaskId && Object.keys(rowByTaskId).length > 0
                ? { ...laneLayout, rowByTaskId }
                : laneLayout,
            ];
          }),
      ),
    [preferredManualLayout, treeAwareManualRowByTaskIdByLane],
  );
  const laneTaskCountById = useMemo(
    () => new Map(timelineLanes.map((lane) => [lane.id, lane.tasks.length])),
    [timelineLanes],
  );
  const visibleTimelineLanes = useMemo(
    () =>
      timelineLanes.map((lane) => {
        if (collapsedLaneIds.has(lane.id)) return { ...lane, tasks: [] };
        const subtaskMeta = timelineLaneSubtaskMetaById[lane.id];
        if (!subtaskMeta) return lane;
        const taskById = new Map(lane.tasks.map((task) => [task.id, task] as const));
        return {
          ...lane,
          tasks: subtaskMeta.visibleTaskIds
            .map((taskId) => taskById.get(taskId))
            .filter((task): task is TimelineTask => Boolean(task)),
        };
      }),
    [collapsedLaneIds, timelineLaneSubtaskMetaById, timelineLanes],
  );
  const expandedRowLaneIds = useMemo(() => [] as string[], []);

  useEffect(() => {
    const availableLaneIds = new Set(timelineLanes.map((lane) => lane.id));
    setCollapsedLaneIds((current) => {
      const next = new Set(Array.from(current).filter((laneId) => availableLaneIds.has(laneId)));
      return next.size === current.size ? current : next;
    });
  }, [timelineLanes]);

  const filteredTaskIds = useMemo(
    () => new Set(filteredTasks.map((task) => task.id)),
    [filteredTasks],
  );
  const taskHasSubtasksById = useMemo(() => {
    const next = new Map<string, boolean>();
    for (const task of timeline.tasks) {
      const parentId = task.parentId ?? null;
      if (!parentId) continue;
      next.set(parentId, true);
    }
    return next;
  }, [timeline.tasks]);
  const taskById = useMemo(
    () => new Map(filteredTasks.map((task) => [task.id, task])),
    [filteredTasks],
  );

  const scheduledTasks = filteredTasks.filter((task) => task.hasSchedule && task.inWindow);
  const unscheduledTasks = filteredTasks.filter((task) => !task.hasSchedule);
  const ganttRiskTasks = useMemo(
    () => baseFilteredTasks.filter((task) => ganttRiskByTaskId.get(task.id)?.isAtRisk),
    [baseFilteredTasks, ganttRiskByTaskId],
  );
  const ganttBlockedTasks = useMemo(
    () =>
      baseFilteredTasks.filter((task) => (ganttRiskByTaskId.get(task.id)?.blockedByOpen ?? 0) > 0),
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
      groupBy: TimelineLaneOrderGroupBy;
      laneOrder: string[];
    }) =>
      (await api(`/projects/${projectId}/timeline/preferences/${groupBy}`, {
        method: 'PUT',
        body: { laneOrder },
      })) as TimelinePreferences,
    onMutate: async ({ groupBy, laneOrder }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.projectTimelinePreferences(projectId),
      });
      const previous = queryClient.getQueryData<TimelinePreferences>(
        queryKeys.projectTimelinePreferences(projectId),
      );
      const storageKeys = [
        getTimelineLaneOrderStorageKey(projectId, groupBy, meQuery.data?.id),
        getTimelineLaneOrderStorageKey(projectId, groupBy),
      ];
      const previousStoredLaneOrder = readStoredTimelineLaneOrder(storageKeys);
      persistTimelineLaneOrder(laneOrder, storageKeys);
      queryClient.setQueryData<TimelinePreferences>(
        queryKeys.projectTimelinePreferences(projectId),
        {
          projectId,
          userId: previous?.userId ?? meQuery.data?.id ?? '',
          laneOrderBySection:
            groupBy === 'section' ? laneOrder : (previous?.laneOrderBySection ?? []),
          laneOrderByAssignee:
            groupBy === 'assignee' ? laneOrder : (previous?.laneOrderByAssignee ?? []),
          timelineManualLayout:
            normalizeTimelineManualLayoutState(previous?.timelineManualLayout),
          timelineViewState: previous?.timelineViewState ?? null,
          ganttViewState: previous?.ganttViewState ?? null,
        },
      );
      return { previous, previousStoredLaneOrder, storageKeys };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData<TimelinePreferences>(
          queryKeys.projectTimelinePreferences(projectId),
          context.previous,
        );
      }
      if (context?.storageKeys) {
        persistTimelineLaneOrder(context.previousStoredLaneOrder ?? [], context.storageKeys);
      }
      setRescheduleNotice({ type: 'error', message: t('timelineLaneOrderSaveFailed') });
    },
    onSuccess: (result, variables) => {
      const confirmedLaneOrder =
        variables.groupBy === 'assignee' ? result.laneOrderByAssignee : result.laneOrderBySection;
      persistTimelineLaneOrder(confirmedLaneOrder, [
        getTimelineLaneOrderStorageKey(projectId, variables.groupBy, meQuery.data?.id),
        getTimelineLaneOrderStorageKey(projectId, variables.groupBy),
      ]);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.projectTimelinePreferences(projectId),
      });
    },
  });

  const saveManualLayoutMutation = useMutation({
    mutationFn: async ({
      groupBy,
      laneTaskOrder,
    }: {
      groupBy: TimelineSwimlane;
      laneTaskOrder: TimelineManualLayoutByLane;
    }) =>
      (await api(`/projects/${projectId}/timeline/preferences/manual-layout/${groupBy}`, {
        method: 'PUT',
        body: { laneTaskOrder },
      })) as TimelinePreferences,
    onMutate: async ({ groupBy, laneTaskOrder }) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.projectTimelinePreferences(projectId),
      });
      const previous = queryClient.getQueryData<TimelinePreferences>(
        queryKeys.projectTimelinePreferences(projectId),
      );
      const storageKeys = [
        getTimelineManualLayoutStorageKey(projectId, groupBy, meQuery.data?.id),
        getTimelineManualLayoutStorageKey(projectId, groupBy),
      ];
      const previousStoredManualLayout = readStoredTimelineManualLayout(storageKeys);
      persistTimelineManualLayout(laneTaskOrder, storageKeys);
      const nextManualLayout = normalizeTimelineManualLayoutState(previous?.timelineManualLayout);
      nextManualLayout[groupBy] = laneTaskOrder;
      queryClient.setQueryData<TimelinePreferences>(
        queryKeys.projectTimelinePreferences(projectId),
        {
          projectId,
          userId: previous?.userId ?? meQuery.data?.id ?? '',
          laneOrderBySection: previous?.laneOrderBySection ?? [],
          laneOrderByAssignee: previous?.laneOrderByAssignee ?? [],
          timelineManualLayout: nextManualLayout,
          timelineViewState: previous?.timelineViewState ?? null,
          ganttViewState: previous?.ganttViewState ?? null,
        },
      );
      return { previous, previousStoredManualLayout, storageKeys };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData<TimelinePreferences>(
          queryKeys.projectTimelinePreferences(projectId),
          context.previous,
        );
      }
      if (context?.storageKeys) {
        persistTimelineManualLayout(
          context.previousStoredManualLayout ?? {},
          context.storageKeys,
        );
      }
      setRescheduleNotice({ type: 'error', message: t('timelineManualLayoutSaveFailed') });
    },
    onSuccess: (result, variables) => {
      persistTimelineManualLayout(
        normalizeTimelineManualLayoutState(result.timelineManualLayout)[variables.groupBy],
        [
          getTimelineManualLayoutStorageKey(projectId, variables.groupBy, meQuery.data?.id),
          getTimelineManualLayoutStorageKey(projectId, variables.groupBy),
        ],
      );
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.projectTimelinePreferences(projectId),
      });
    },
  });

  const handleParentMovePolicy = (
    result: TimelineTaskMutationResult,
    previousTask: Task | undefined,
    skipSubtaskNotice: boolean = false,
  ) => {
    if (skipSubtaskNotice) return;
    const policy = result.subtaskMovePolicy;
    if (!policy || policy.descendantCount <= 0 || !previousTask) return;
    const message = t('timelineParentMoveWarning').replace(
      '{count}',
      String(policy.descendantCount),
    );
    if (policy.largeImpact) {
      setTimelineParentMoveUndo({
        taskId: result.id,
        title: result.title,
        version: result.version,
        descendantCount: policy.descendantCount,
        previousStartAt: previousTask.startAt ?? null,
        previousDueAt: previousTask.dueAt ?? null,
        previousAssigneeUserId: previousTask.assigneeUserId ?? null,
        previousSectionId: previousTask.sectionId,
        previousStatus: previousTask.status,
      });
      return;
    }
    setRescheduleNotice({ type: 'warning', message });
  };

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
      })) as TimelineTaskMutationResult,
    onMutate: async ({ taskId, startAt, dueAt }) => {
      setRescheduleNotice(null);
      setTimelineParentMoveUndo(null);
      await queryClient.cancelQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.taskDetail(taskId) });
      const previous = queryClient.getQueryData<SectionTaskGroup[]>(
        queryKeys.projectTasksGrouped(projectId),
      );
      const previousTaskDetail = queryClient.getQueryData<Task>(queryKeys.taskDetail(taskId));
      const previousTaskSnapshot = previousTaskDetail ?? (previous ? findTaskInGroups(previous, taskId) : undefined);
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
      return { previous, previousTaskDetail, previousTaskSnapshot };
    },
    onSuccess: (result, variables, context) => {
      queryClient.setQueryData<SectionTaskGroup[] | undefined>(
        queryKeys.projectTasksGrouped(projectId),
        (current) => (current ? applyResolvedTaskInGroups(current, result) : current),
      );
      queryClient.setQueryData<Task>(queryKeys.taskDetail(variables.taskId), result);
      handleParentMovePolicy(result, context?.previousTaskSnapshot);
    },
    onError: (error, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData<SectionTaskGroup[]>(
          queryKeys.projectTasksGrouped(projectId),
          context.previous,
        );
      }
      if (context?.previousTaskDetail) {
        queryClient.setQueryData<Task>(
          queryKeys.taskDetail(variables.taskId),
          context.previousTaskDetail,
        );
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

  const batchRescheduleTasks = useMutation({
    mutationFn: async ({
      tasks,
    }: {
      tasks: Array<{
        taskId: string;
        startAt: string | null;
        dueAt: string | null;
        version: number;
      }>;
    }) =>
      Promise.all(
        tasks.map(
          (task) =>
            api(`/tasks/${task.taskId}/reschedule`, {
              method: 'PATCH',
              body: {
                startAt: task.startAt,
                dueAt: task.dueAt,
                version: task.version,
              },
            }) as Promise<Task>,
        ),
      ),
    onMutate: async ({ tasks }) => {
      setRescheduleNotice(null);
      await queryClient.cancelQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
      await Promise.all(
        tasks.map((task) =>
          queryClient.cancelQueries({ queryKey: queryKeys.taskDetail(task.taskId) }),
        ),
      );
      const previous = queryClient.getQueryData<SectionTaskGroup[]>(
        queryKeys.projectTasksGrouped(projectId),
      );
      const previousTaskDetails = new Map<string, Task | undefined>(
        tasks.map((task) => [
          task.taskId,
          queryClient.getQueryData<Task>(queryKeys.taskDetail(task.taskId)),
        ]),
      );
      if (previous) {
        const nextByTaskId = new Map(
          tasks.map((task) => [task.taskId, { startAt: task.startAt, dueAt: task.dueAt }]),
        );
        queryClient.setQueryData<SectionTaskGroup[]>(
          queryKeys.projectTasksGrouped(projectId),
          applyTaskSchedulesInGroups(previous, nextByTaskId),
        );
      }
      for (const task of tasks) {
        const previousTaskDetail = previousTaskDetails.get(task.taskId);
        if (previousTaskDetail) {
          queryClient.setQueryData<Task>(queryKeys.taskDetail(task.taskId), {
            ...previousTaskDetail,
            startAt: task.startAt,
            dueAt: task.dueAt,
          });
        }
      }
      return { previous, previousTaskDetails };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData<SectionTaskGroup[]>(
          queryKeys.projectTasksGrouped(projectId),
          context.previous,
        );
      }
      for (const [taskId, previousTaskDetail] of context?.previousTaskDetails ?? []) {
        if (previousTaskDetail) {
          queryClient.setQueryData<Task>(queryKeys.taskDetail(taskId), previousTaskDetail);
        }
      }
      if (isApiConflictError(error)) {
        setRescheduleNotice({ type: 'conflict', message: t('timelineRescheduleConflict') });
      } else {
        setRescheduleNotice({ type: 'error', message: t('timelineRescheduleFailed') });
      }
    },
    onSuccess: (result, variables) => {
      queryClient.setQueryData<SectionTaskGroup[] | undefined>(
        queryKeys.projectTasksGrouped(projectId),
        (current) => (current ? applyResolvedTasksInGroups(current, result) : current),
      );
      result.forEach((task, index) => {
        const taskId = variables.tasks[index]?.taskId ?? task.id;
        queryClient.setQueryData<Task>(queryKeys.taskDetail(taskId), task);
      });
    },
    onSettled: async (_result, _error, variables) => {
      for (const task of variables.tasks) {
        rescheduleInFlightTaskIdsRef.current.delete(task.taskId);
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
      await Promise.all(
        variables.tasks.map((task) =>
          queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(task.taskId) }),
        ),
      );
    },
  });

  const timelineMoveTask = useMutation({
    mutationFn: async ({
      taskId,
      assigneeUserId,
      sectionId,
      status,
      startAt,
      dueAt,
      version,
    }: {
      taskId: string;
      assigneeUserId?: string | null;
      sectionId?: string;
      status?: Task['status'];
      startAt?: string | null;
      dueAt?: string | null;
      version: number;
      skipSubtaskNotice?: boolean;
    }) =>
      (await api(`/tasks/${taskId}/timeline-move`, {
        method: 'PATCH',
        body: { assigneeUserId, sectionId, status, startAt, dueAt, version },
      })) as TimelineTaskMutationResult,
    onMutate: async ({ taskId, assigneeUserId, sectionId, status, startAt, dueAt }) => {
      setRescheduleNotice(null);
      setTimelineParentMoveUndo(null);
      await queryClient.cancelQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.taskDetail(taskId) });
      const previous = queryClient.getQueryData<SectionTaskGroup[]>(
        queryKeys.projectTasksGrouped(projectId),
      );
      const previousTaskDetail = queryClient.getQueryData<Task>(queryKeys.taskDetail(taskId));
      const previousTaskSnapshot =
        previousTaskDetail ??
        (previous ? findTaskInGroups(previous, taskId) : undefined) ??
        taskById.get(taskId);
      if (previous) {
        const optimisticMove: {
          startAt?: string | null;
          dueAt?: string | null;
          assigneeUserId?: string | null;
          sectionId?: string;
          status?: Task['status'];
        } = {};
        if (assigneeUserId !== undefined) optimisticMove.assigneeUserId = assigneeUserId;
        if (sectionId !== undefined) optimisticMove.sectionId = sectionId;
        if (status !== undefined) optimisticMove.status = status;
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
        if (sectionId !== undefined) {
          optimisticTaskDetail.sectionId = sectionId;
        }
        if (status !== undefined) {
          optimisticTaskDetail.status = status;
          optimisticTaskDetail.completedAt =
            status === 'DONE' ? (previousTaskDetail.completedAt ?? new Date().toISOString()) : null;
        }
        if (startAt !== undefined) {
          optimisticTaskDetail.startAt = startAt;
        }
        if (dueAt !== undefined) {
          optimisticTaskDetail.dueAt = dueAt;
        }
        queryClient.setQueryData<Task>(queryKeys.taskDetail(taskId), optimisticTaskDetail);
      }
      return { previous, previousTaskDetail, previousTaskSnapshot };
    },
    onSuccess: (result, variables, context) => {
      queryClient.setQueryData<SectionTaskGroup[] | undefined>(
        queryKeys.projectTasksGrouped(projectId),
        (current) => (current ? applyResolvedTaskInGroups(current, result) : current),
      );
      queryClient.setQueryData<Task>(queryKeys.taskDetail(variables.taskId), result);
      handleParentMovePolicy(result, context?.previousTaskSnapshot, variables.skipSubtaskNotice);
    },
    onError: (error, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData<SectionTaskGroup[]>(
          queryKeys.projectTasksGrouped(projectId),
          context.previous,
        );
      }
      if (context?.previousTaskDetail) {
        queryClient.setQueryData<Task>(
          queryKeys.taskDetail(variables.taskId),
          context.previousTaskDetail,
        );
      }
      const isDateChange = variables.startAt !== undefined || variables.dueAt !== undefined;
      const isLaneChange =
        variables.assigneeUserId !== undefined ||
        variables.sectionId !== undefined ||
        variables.status !== undefined;
      const conflictKey =
        isDateChange && !isLaneChange
          ? 'timelineRescheduleConflict'
          : isLaneChange && !isDateChange
            ? 'timelineMoveConflict'
            : 'timelineMoveAndRescheduleConflict';
      const failedKey =
        isDateChange && !isLaneChange
          ? 'timelineRescheduleFailed'
          : isLaneChange && !isDateChange
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

  const createTimelineDependency = useMutation({
    mutationFn: async ({
      sourceTaskId,
      targetTaskId,
    }: {
      sourceTaskId: string;
      targetTaskId: string;
    }) =>
      api(`/tasks/${targetTaskId}/dependencies`, {
        method: 'POST',
        body: { dependsOnId: sourceTaskId, type: 'BLOCKS' },
      }),
    onSuccess: async (_result, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.projectDependencyGraph(projectId) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.taskDependencies(variables.targetTaskId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.taskDependents(variables.sourceTaskId),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.taskBlocked(variables.targetTaskId) }),
      ]);
    },
    onError: () => {
      setRescheduleNotice({ type: 'error', message: t('timelineDependencyCreateFailed') });
    },
  });

  useEffect(() => {
    if (!rescheduleNotice) return;
    const timer = window.setTimeout(() => setRescheduleNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [rescheduleNotice]);

  useEffect(() => {
    if (!timelineParentMoveUndo) return;
    timelineParentMoveUndoActionRef.current?.focus();
    const timer = window.setTimeout(() => setTimelineParentMoveUndo(null), 8000);
    return () => window.clearTimeout(timer);
  }, [timelineParentMoveUndo]);

  const replaceDependencyDraft = (nextDependencyDraft: TimelineDependencyDraft | null) => {
    dependencyDraftRef.current = nextDependencyDraft;
    setDependencyDraft(nextDependencyDraft);
  };

  useEffect(() => {
    const resolveDependencyDraftTarget = (
      clientX: number,
      clientY: number,
      sourceTaskId: string,
    ) => {
      if (typeof document === 'undefined') return null;
      const taskNodes = Array.from(
        document.querySelectorAll<HTMLElement>('[data-timeline-task-id]'),
      );
      for (const taskNode of taskNodes) {
        const taskId = taskNode.dataset.timelineTaskId;
        if (!taskId || taskId === sourceTaskId) continue;
        const rect = taskNode.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          return taskId;
        }
      }
      return null;
    };

    const updateDraftTarget = (clientX: number, clientY: number) => {
      const current = dependencyDraftRef.current;
      if (!current) return;
      const nextTargetTaskId = resolveDependencyDraftTarget(
        clientX,
        clientY,
        current.sourceTaskId,
      );
      replaceDependencyDraft({
        ...current,
        pointerX: clientX,
        pointerY: clientY,
        targetTaskId: nextTargetTaskId,
      });
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!dependencyDraftRef.current) return;
      updateDraftTarget(event.clientX, event.clientY);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const current = dependencyDraftRef.current;
      if (!current) return;
      const nextTargetTaskId =
        current.targetTaskId ??
        resolveDependencyDraftTarget(event.clientX, event.clientY, current.sourceTaskId);
      if (nextTargetTaskId) {
        createTimelineDependency.mutate({
          sourceTaskId: current.sourceTaskId,
          targetTaskId: nextTargetTaskId,
        });
      }
      replaceDependencyDraft(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [createTimelineDependency]);

  useEffect(() => {
    const updateSelection = (clientX: number, clientY: number) => {
      const current = selectionDraftRef.current;
      if (!current) return;
      const next = { ...current, currentX: clientX, currentY: clientY };
      selectTimelineTasksInRect({
        left: Math.min(next.originX, next.currentX),
        top: Math.min(next.originY, next.currentY),
        right: Math.max(next.originX, next.currentX),
        bottom: Math.max(next.originY, next.currentY),
      });
      replaceSelectionDraft(next);
    };

    const handlePointerMove = (event: PointerEvent) => {
      updateSelection(event.clientX, event.clientY);
    };

    const handlePointerUp = (event: PointerEvent) => {
      updateSelection(event.clientX, event.clientY);
      finalizeSelectionDraft(selectionDraftRef.current);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [selectTimelineTasksInRect]);

  const selectionRect = useMemo(() => {
    if (!selectionDraft) return null;
    const left = Math.min(selectionDraft.originX, selectionDraft.currentX);
    const top = Math.min(selectionDraft.originY, selectionDraft.currentY);
    const right = Math.max(selectionDraft.originX, selectionDraft.currentX);
    const bottom = Math.max(selectionDraft.originY, selectionDraft.currentY);
    return {
      left,
      top,
      width: right - left,
      height: bottom - top,
      right,
      bottom,
    };
  }, [selectionDraft]);

  function selectTimelineTasksInRect(nextRect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  }) {
    const nextSelected = taskIdsInSelectionRect(nextRect);
    const current = selectedTimelineTaskIdsRef.current;
    if (
      current.length === nextSelected.length &&
      current.every((taskId, index) => taskId === nextSelected[index])
    ) {
      return;
    }
    replaceSelectedTimelineTaskIds(nextSelected);
  }

  const timelineLayout = useMemo(() => {
    return buildTimelineLayout({
      lanes: visibleTimelineLanes,
      windowStart: timeline.window.start,
      windowEnd: timeline.window.end,
      dayColumnWidth: zoomConfig.dayColWidth,
      sectionRowHeight: SECTION_ROW_HEIGHT,
      taskRowHeight: TASK_ROW_HEIGHT,
      laneFooterHeight: mode === 'timeline' ? TASK_ROW_HEIGHT : 0,
      compactRows: mode === 'timeline',
      ...(hasActiveManualLayout ? { manualPlacementByLane: treeAwareManualPlacementByLane } : {}),
      expandedRowLaneIds: mode === 'timeline' ? expandedRowLaneIds : [],
      dependencyEdges: timeline.dependencyEdges,
    });
  }, [
    expandedRowLaneIds,
    hasActiveManualLayout,
    mode,
    treeAwareManualPlacementByLane,
    timeline.dependencyEdges,
    timeline.window.end,
    timeline.window.start,
    visibleTimelineLanes,
    zoomConfig.dayColWidth,
  ]);

  const dragOverlay = useMemo(() => {
    if (mode !== 'timeline' || !dragState?.moved) return null;
    const primaryTask = taskById.get(dragState.taskId);
    if (
      !primaryTask ||
      !primaryTask.hasSchedule ||
      !primaryTask.inWindow ||
      !primaryTask.timelineStart ||
      !primaryTask.timelineEnd
    ) {
      return null;
    }
    const baseBar = timelineLayout.barsByTaskId[primaryTask.id];
    if (!baseBar) return null;
    const targetLaneId = dragState.dropLaneId ?? dragState.originLaneId;
    const targetLane = timelineLayout.lanesWithRows.find(({ lane }) => lane.id === targetLaneId);
    if (!targetLane) return null;
    const previewStartAt = shiftTimelineIso(
      primaryTask.startAt,
      dragState.deltaDays,
      workingDaysOnly,
      dragState.useCalendarDays,
    );
    const previewDueAt = shiftTimelineIso(
      primaryTask.dueAt,
      dragState.deltaDays,
      workingDaysOnly,
      dragState.useCalendarDays,
    );
    const previewStartDate = dateOnlyInputToLocalDate(previewStartAt);
    const previewDueDate = dateOnlyInputToLocalDate(previewDueAt);
    const previewDeltaDays =
      previewStartDate && primaryTask.timelineStart
        ? dayDiff(primaryTask.timelineStart, previewStartDate)
        : dragState.deltaDays;
    const left = Math.max(
      LEFT_RAIL_COL_WIDTH,
      LEFT_RAIL_COL_WIDTH + baseBar.left + previewDeltaDays * zoomConfig.dayColWidth,
    );
    const width =
      previewStartDate && previewDueDate
        ? Math.max(1, dayDiff(previewStartDate, previewDueDate) + 1) * zoomConfig.dayColWidth
        : baseBar.width;
    const fallbackRowIndex =
      targetLane.rows.find((row) => row.tasks.some((task) => task.id === primaryTask.id))?.index ?? 0;
    const rowIndex = Math.max(0, dragState.dropRowIndex ?? fallbackRowIndex);
    const top =
      targetLane.top + SECTION_ROW_HEIGHT + rowIndex * TASK_ROW_HEIGHT + TASK_ROW_HEIGHT / 2;
    return {
      task: primaryTask,
      left,
      width,
      top,
      style: resolveTimelineBarStyle(primaryTask, today),
      extraCount: Math.max(0, dragState.taskIds.length - 1),
      isMilestone:
        primaryTask.type === 'MILESTONE' ||
        dayDiff(primaryTask.timelineStart, primaryTask.timelineEnd) === 0,
    };
  }, [dragState, mode, taskById, timelineLayout, today, workingDaysOnly, zoomConfig.dayColWidth]);

  const alignTimeline = () => {
    if (mode !== 'timeline') return;
    const expandedTimelineLanes = timelineLanes.filter((lane) => !collapsedLaneIds.has(lane.id));
    if (!expandedTimelineLanes.length) return;

    const alignedLaneTaskOrder = buildTimelineTaskOrderByLane({
      lanes: expandedTimelineLanes,
      windowStart: timeline.window.start,
      windowEnd: timeline.window.end,
      dayColumnWidth: zoomConfig.dayColWidth,
      sectionRowHeight: SECTION_ROW_HEIGHT,
      taskRowHeight: TASK_ROW_HEIGHT,
      compactRows: true,
      expandedRowLaneIds,
      dependencyAwarePacking: true,
      dependencyEdges: timeline.dependencyEdges,
    });

    const nextManualLayout = { ...preferredManualLayout };
    for (const lane of expandedTimelineLanes) {
      const alignedTaskOrder = alignedLaneTaskOrder[lane.id];
      if (!alignedTaskOrder?.length) continue;
      nextManualLayout[lane.id] = mergeTimelineManualLaneTaskOrder(
        preferredManualLayout[lane.id],
        alignedTaskOrder,
      );
      const alignedLaneLayout = nextManualLayout[lane.id];
      if (alignedLaneLayout) {
        delete alignedLaneLayout.rowByTaskId;
      }
    }

    if (JSON.stringify(nextManualLayout) === JSON.stringify(preferredManualLayout)) {
      return;
    }

    saveManualLayoutMutation.mutate({
      groupBy: effectiveSwimlane,
      laneTaskOrder: nextManualLayout,
    });
  };

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
  }, [
    filteredTaskIds,
    timelineLayout.taskRowsById,
    visibleRange.end,
    visibleRange.start,
    virtualizationEnabled,
  ]);
  const laneIdByTaskId = useMemo(() => {
    const next = new Map<string, string>();
    for (const lane of visibleTimelineLanes) {
      for (const task of lane.tasks) {
        next.set(task.id, lane.id);
      }
    }
    return next;
  }, [visibleTimelineLanes]);
  const activeConnectorTaskId =
    hoveredTaskId ??
    focusedTaskId ??
    dependencyDraft?.sourceTaskId ??
    dependencyDraft?.targetTaskId ??
    null;

  const connectorEdges = useMemo(
    () =>
      timeline.dependencyEdges.filter(
        (edge) =>
          visibleTaskIds.has(edge.source) &&
          visibleTaskIds.has(edge.target) &&
          timelineLayout.barsByTaskId[edge.source] &&
          timelineLayout.barsByTaskId[edge.target],
      ).map((edge) => ({
        ...edge,
        sourceLaneId: laneIdByTaskId.get(edge.source) ?? null,
        targetLaneId: laneIdByTaskId.get(edge.target) ?? null,
      })),
    [laneIdByTaskId, timeline.dependencyEdges, timelineLayout.barsByTaskId, visibleTaskIds],
  );

  const dependencyDraftPreview = useMemo(() => {
    if (!dependencyDraft) return null;
    let targetX = dependencyDraft.pointerX;
    let targetY = dependencyDraft.pointerY;
    if (dependencyDraft.targetTaskId && typeof document !== 'undefined') {
      const targetElement = document.querySelector<HTMLElement>(
        `[data-testid="timeline-bar-${dependencyDraft.targetTaskId}"]`,
      );
      const rect = targetElement?.getBoundingClientRect();
      if (rect) {
        targetX = rect.left;
        targetY = rect.top + rect.height / 2;
      }
    }

    const x1 = dependencyDraft.sourceX;
    const y1 = dependencyDraft.sourceY;
    const x2 = targetX;
    const y2 = targetY;
    const cx = x2 >= x1 ? x1 + Math.max(16, (x2 - x1) / 2) : x1 + 16;

    return {
      path: `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`,
    };
  }, [dependencyDraft]);

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

  useEffect(() => {
    if (mode !== 'timeline') {
      selectedTimelineTaskIdsRef.current = [];
      setSelectedTimelineTaskIds([]);
      replaceSelectionDraft(null);
    }
  }, [mode, projectId]);

  const replaceSelectedTimelineTaskIds = (nextSelectedTaskIds: string[]) => {
    selectedTimelineTaskIdsRef.current = nextSelectedTaskIds;
    setSelectedTimelineTaskIds(nextSelectedTaskIds);
  };

  const replaceLaneDragState = (
    nextLaneDragState: { draggingLaneId: string; overLaneId: string | null } | null,
  ) => {
    laneDragStateRef.current = nextLaneDragState;
    setLaneDragState(nextLaneDragState);
  };

  const toggleLaneCollapsed = (laneId: string) => {
    setCollapsedLaneIds((current) => {
      const next = new Set(current);
      if (next.has(laneId)) {
        next.delete(laneId);
      } else {
        next.add(laneId);
      }
      return next;
    });
  };

  const toggleTimelineParentCollapsed = (taskId: string) => {
    setCollapsedTimelineParentIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const replaceSelectionDraft = (nextSelectionDraft: TimelineSelectionDraft | null) => {
    selectionDraftRef.current = nextSelectionDraft;
    setSelectionDraft(nextSelectionDraft);
  };

  const updateSelectionDraft = (pointerId: number, clientX: number, clientY: number) => {
    const current = selectionDraftRef.current;
    if (!current || current.pointerId !== pointerId) return;
    const next = { ...current, currentX: clientX, currentY: clientY };
    selectTimelineTasksInRect({
      left: Math.min(next.originX, next.currentX),
      top: Math.min(next.originY, next.currentY),
      right: Math.max(next.originX, next.currentX),
      bottom: Math.max(next.originY, next.currentY),
    });
    replaceSelectionDraft(next);
  };

  const taskIdsInSelectionRect = (nextRect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  }) =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-timeline-task-id]'))
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        return !(
          rect.right < nextRect.left ||
          rect.left > nextRect.right ||
          rect.bottom < nextRect.top ||
          rect.top > nextRect.bottom
        );
      })
      .map((node) => node.dataset.timelineTaskId)
      .filter((taskId): taskId is string => Boolean(taskId))
      .sort();

  const finalizeSelectionDraft = (current: TimelineSelectionDraft | null) => {
    if (!current) return;
    replaceSelectedTimelineTaskIds(
      taskIdsInSelectionRect({
        left: Math.min(current.originX, current.currentX),
        top: Math.min(current.originY, current.currentY),
        right: Math.max(current.originX, current.currentX),
        bottom: Math.max(current.originY, current.currentY),
      }),
    );
    replaceSelectionDraft(null);
  };

  const finishSelectionDraft = (pointerId: number, clientX?: number, clientY?: number) => {
    const current = selectionDraftRef.current;
    if (!current || current.pointerId !== pointerId) return;
    const selectionPointerTarget = selectionPointerTargetRef.current;
    selectionPointerTargetRef.current = null;
    try {
      if (selectionPointerTarget?.hasPointerCapture(pointerId)) {
        selectionPointerTarget.releasePointerCapture(pointerId);
      }
    } catch {
      // Ignore release failures if the selection surface unmounted mid-selection.
    }
    const next =
      clientX !== undefined && clientY !== undefined
        ? { ...current, currentX: clientX, currentY: clientY }
        : current;
    finalizeSelectionDraft(next);
  };

  const toggleTimelineTaskSelection = (taskId: string) => {
    const current = selectedTimelineTaskIdsRef.current;
    const next = current.includes(taskId)
      ? current.filter((currentTaskId) => currentTaskId !== taskId)
      : [...current, taskId].sort();
    replaceSelectedTimelineTaskIds(next);
  };

  const laneIdFromTestId = (testId: string): string | null => {
    if (testId.startsWith('timeline-lane-header-')) {
      return laneIdFromTestId(testId.replace('timeline-lane-header-', 'timeline-lane-'));
    }
    if (testId.startsWith('timeline-lane-section-')) {
      return `section:${testId.slice('timeline-lane-section-'.length)}`;
    }
    if (testId.startsWith('timeline-lane-assignee-')) {
      return `assignee:${testId.slice('timeline-lane-assignee-'.length)}`;
    }
    if (testId.startsWith('timeline-lane-status-')) {
      return `status:${testId.slice('timeline-lane-status-'.length)}`;
    }
    return null;
  };

  const resolveLaneIdAtClientPosition = (clientX: number, clientY: number): string | null => {
    if (typeof document !== 'undefined') {
      const laneElements = Array.from(
        document.querySelectorAll<HTMLElement>('[data-timeline-lane-id]'),
      );
      for (const laneElement of laneElements) {
        const rect = laneElement.getBoundingClientRect();
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          const explicitLaneId = laneElement.dataset.timelineLaneId;
          if (explicitLaneId) return explicitLaneId;
        }
      }
      const hoveredElements = document.elementsFromPoint(clientX, clientY);
      for (const element of hoveredElements) {
        if (!(element instanceof HTMLElement)) continue;
        const laneHost = element.closest<HTMLElement>(
          '[data-timeline-lane-id], [data-testid^="timeline-lane-"]',
        );
        if (!laneHost) continue;
        const explicitLaneId = laneHost.dataset.timelineLaneId;
        if (explicitLaneId) return explicitLaneId;
        const testId = laneHost.dataset.testid ?? '';
        const resolvedLaneId = laneIdFromTestId(testId);
        if (resolvedLaneId) return resolvedLaneId;
      }
    }

    const container = scrollContainerRef.current;
    if (!container) return null;
    const stickyHeaderHeight = stickyHeaderRef.current?.offsetHeight ?? 0;
    const bounds = container.getBoundingClientRect();
    const relativeY = clientY - bounds.top + container.scrollTop - stickyHeaderHeight;
    const lane = timelineLayout.lanesWithRows.find(
      (entry) => relativeY >= entry.top && relativeY < entry.bottom,
    );
    return lane?.lane.id ?? null;
  };

  const resolveLaneRowIndexAtClientPosition = (
    laneId: string,
    clientY: number,
  ): number | null => {
    const container = scrollContainerRef.current;
    const layoutLane = timelineLayout.lanesWithRows.find((entry) => entry.lane.id === laneId);
    if (!container || !layoutLane) return null;
    const stickyHeaderHeight = stickyHeaderRef.current?.offsetHeight ?? 0;
    const bounds = container.getBoundingClientRect();
    const relativeY = clientY - bounds.top + container.scrollTop - stickyHeaderHeight;
    const laneRowsTop = layoutLane.top + SECTION_ROW_HEIGHT;
    const slotCount = Math.max(1, layoutLane.rows.length + 1);
    const slotCenters = Array.from({ length: slotCount }, (_, rowIndex) => ({
      rowIndex,
      centerY: laneRowsTop + rowIndex * TASK_ROW_HEIGHT + TASK_ROW_HEIGHT / 2,
    }));
    let bestRowIndex = slotCenters[0]?.rowIndex ?? 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const slot of slotCenters) {
      const distance = Math.abs(relativeY - slot.centerY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestRowIndex = slot.rowIndex;
      }
    }
    return bestRowIndex;
  };

  const buildNextManualLaneTaskOrder = (
    laneId: string,
    taskId: string,
    clientY: number,
    explicitTargetRowIndex?: number | null,
  ): TimelineManualLayoutByLane | null => {
    if (mode !== 'timeline' || sortMode !== 'manual') return null;
    const lane = timelineLanes.find((entry) => entry.id === laneId);
    const layoutLane = timelineLayout.lanesWithRows.find((entry) => entry.lane.id === laneId);
    const container = scrollContainerRef.current;
    if (!lane || !layoutLane || !container || lane.tasks.length < 2) return null;

    const currentOrder = lane.tasks.map((task) => task.id);
    const currentRows = layoutLane.rows.map((row) => row.tasks.map((task) => task.id));
    const currentRowByTaskId = Object.fromEntries(
      layoutLane.rows.flatMap((row) => row.tasks.map((task) => [task.id, row.index] as const)),
    );
    if (currentOrder.length !== lane.tasks.length) {
      return null;
    }
    if (!currentOrder.includes(taskId)) return null;
    const movingTask = taskById.get(taskId);
    if (!movingTask) return null;

    const stickyHeaderHeight = stickyHeaderRef.current?.offsetHeight ?? 0;
    const bounds = container.getBoundingClientRect();
    const relativeY = clientY - bounds.top + container.scrollTop - stickyHeaderHeight;
    const laneRowsTop = layoutLane.top + SECTION_ROW_HEIGHT;
    const laneRowsBottom = laneRowsTop + layoutLane.rows.length * TASK_ROW_HEIGHT;
    const targetRowIndex =
      explicitTargetRowIndex ??
      (relativeY >= laneRowsBottom
        ? layoutLane.rows.length
        : Math.max(
            0,
            Math.min(
              layoutLane.rows.length - 1,
              Math.floor((relativeY - laneRowsTop) / TASK_ROW_HEIGHT),
            ),
          ));
    const currentRowIndex = currentRowByTaskId[taskId] ?? 0;
    const rowsWithoutTask = currentRows
      .map((row) => row.filter((currentTaskId) => currentTaskId !== taskId))
      .filter((row) => row.length > 0);
    const insertionRowIndex = Math.max(0, Math.min(targetRowIndex, rowsWithoutTask.length));
    const destinationRow = rowsWithoutTask[insertionRowIndex] ?? [];
    const shouldSplitIntoDedicatedRow =
      insertionRowIndex >= rowsWithoutTask.length ||
      destinationRow.some((existingTaskId) => {
        const existingTask = taskById.get(existingTaskId);
        return existingTask ? timelineTasksOverlap(movingTask, existingTask) : false;
      });

    if (shouldSplitIntoDedicatedRow) {
      rowsWithoutTask.splice(insertionRowIndex, 0, [taskId]);
    } else {
      const nextDestinationRow = [...destinationRow, taskId].sort((leftTaskId, rightTaskId) => {
        const leftTask = taskById.get(leftTaskId);
        const rightTask = taskById.get(rightTaskId);
        if (!leftTask || !rightTask) return leftTaskId.localeCompare(rightTaskId);
        return compareTimelineTasks(leftTask, rightTask, 'startAt');
      });
      rowsWithoutTask[insertionRowIndex] = nextDestinationRow;
    }

    const nextOrderedTaskIds = rowsWithoutTask.flat();
    const nextRowByTaskId = Object.fromEntries(
      rowsWithoutTask.flatMap((rowTaskIds, rowIndex) =>
        rowTaskIds.map((rowTaskId) => [rowTaskId, rowIndex] as const),
      ),
    );
    const nextLaneLayout = mergeTimelineManualLaneTaskOrder(
      preferredManualLayout[laneId],
      nextOrderedTaskIds,
      nextRowByTaskId,
    );
    if (
      currentRowIndex === targetRowIndex &&
      JSON.stringify(nextLaneLayout) ===
        JSON.stringify(preferredManualLayout[laneId] ?? { orderedTaskIds: currentOrder })
    ) {
      return null;
    }

    return {
      ...preferredManualLayout,
      [laneId]: nextLaneLayout,
    };
  };

  const commitTimelineDrag = (
    taskId: string,
    taskIds: string[],
    deltaDays: number,
    useCalendarDays: boolean,
    originLaneId: string,
    dropLaneId: string | null,
  ) => {
    const task = taskById.get(taskId);
    if (!task) return;
    if (taskIds.some((selectedTaskId) => rescheduleInFlightTaskIdsRef.current.has(selectedTaskId)))
      return;

    const startAt = shiftTimelineIso(task.startAt, deltaDays, workingDaysOnly, useCalendarDays);
    const dueAt = shiftTimelineIso(task.dueAt, deltaDays, workingDaysOnly, useCalendarDays);
    const hasScheduleMove = Boolean(deltaDays) && Boolean(startAt || dueAt);
    if (taskIds.length > 1) {
      if (!hasScheduleMove) return;
      const tasksToReschedule = taskIds
        .map((selectedTaskId) => {
          const selectedTask = taskById.get(selectedTaskId);
          if (!selectedTask) return null;
          return {
            taskId: selectedTaskId,
            startAt: shiftTimelineIso(
              selectedTask.startAt,
              deltaDays,
              workingDaysOnly,
              useCalendarDays,
            ),
            dueAt: shiftTimelineIso(
              selectedTask.dueAt,
              deltaDays,
              workingDaysOnly,
              useCalendarDays,
            ),
            version: selectedTask.version,
          };
        })
        .filter(
          (
            entry,
          ): entry is {
            taskId: string;
            startAt: string | null;
            dueAt: string | null;
            version: number;
          } => Boolean(entry && (entry.startAt || entry.dueAt)),
        );
      if (!tasksToReschedule.length) return;
      for (const taskToReschedule of tasksToReschedule) {
        rescheduleInFlightTaskIdsRef.current.add(taskToReschedule.taskId);
      }
      batchRescheduleTasks.mutate({ tasks: tasksToReschedule });
      return;
    }

    const laneChanged = Boolean(dropLaneId && dropLaneId !== originLaneId);
    if (!hasScheduleMove && !laneChanged) return;

    const assigneeUserId =
      effectiveSwimlane === 'assignee' && laneChanged && dropLaneId
        ? parseAssigneeLaneId(dropLaneId)
        : undefined;
    const sectionId =
      effectiveSwimlane === 'section' && laneChanged && dropLaneId
        ? parseSectionLaneId(dropLaneId)
        : undefined;
    const status =
      effectiveSwimlane === 'status' && laneChanged && dropLaneId
        ? parseStatusLaneId(dropLaneId)
        : undefined;
    const hasAssigneeMove = assigneeUserId !== undefined && assigneeUserId !== task.assigneeUserId;
    const hasSectionMove = sectionId !== undefined && sectionId !== task.sectionId;
    const hasStatusMove = status !== undefined && status !== task.status;
    if ((task.parentId || taskHasSubtasksById.get(taskId)) && (hasAssigneeMove || hasSectionMove || hasStatusMove)) {
      rescheduleInFlightTaskIdsRef.current.delete(taskId);
      setRescheduleNotice({ type: 'warning', message: t('timelineSubtaskLaneMoveBlocked') });
      return;
    }
    if (!hasScheduleMove && !hasAssigneeMove && !hasSectionMove && !hasStatusMove) return;

    rescheduleInFlightTaskIdsRef.current.add(taskId);
    if (hasAssigneeMove || hasSectionMove || hasStatusMove) {
      const timelineMovePayload: {
        taskId: string;
        assigneeUserId?: string | null;
        sectionId?: string;
        status?: Task['status'];
        startAt?: string | null;
        dueAt?: string | null;
        version: number;
      } = {
        taskId,
        version: task.version,
      };
      if (assigneeUserId !== undefined) timelineMovePayload.assigneeUserId = assigneeUserId;
      if (sectionId !== undefined) timelineMovePayload.sectionId = sectionId;
      if (status !== undefined) timelineMovePayload.status = status;
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

  const commitUnscheduledDrop = (
    taskId: string,
    fallbackLaneId: string,
    clientX: number,
    clientY: number,
  ) => {
    if (rescheduleInFlightTaskIdsRef.current.has(taskId)) return;
    const task = taskById.get(taskId);
    const container = scrollContainerRef.current;
    if (!task || !container || !days.length) return;

    const containerBounds = container.getBoundingClientRect();
    const gridRelativeX =
      clientX - containerBounds.left + container.scrollLeft - LEFT_RAIL_COL_WIDTH;
    const clampedDayIndex = Math.max(
      0,
      Math.min(days.length - 1, Math.floor(gridRelativeX / zoomConfig.dayColWidth)),
    );
    const targetDay = days[clampedDayIndex];
    if (!targetDay) return;

    const startDate = startOfDay(targetDay);
    const dropLaneId = resolveLaneIdAtClientPosition(clientX, clientY) ?? fallbackLaneId;
    const assigneeUserId =
      effectiveSwimlane === 'assignee' ? parseAssigneeLaneId(dropLaneId) : undefined;
    const sectionId = effectiveSwimlane === 'section' ? parseSectionLaneId(dropLaneId) : undefined;
    const status = effectiveSwimlane === 'status' ? parseStatusLaneId(dropLaneId) : undefined;
    const durationDays =
      task.startAt && task.dueAt
        ? Math.max(
            0,
            dayDiff(
              dateOnlyInputToLocalDate(task.startAt) ?? new Date(task.startAt),
              dateOnlyInputToLocalDate(task.dueAt) ?? new Date(task.dueAt),
            ),
          )
        : 0;

    const timelineMovePayload: {
      taskId: string;
      assigneeUserId?: string | null;
      sectionId?: string;
      status?: Task['status'];
      startAt?: string | null;
      dueAt?: string | null;
      version: number;
    } = {
      taskId,
      startAt: localDateToDateOnlyUtcIso(startDate),
      dueAt: localDateToDateOnlyUtcIso(addDays(startDate, durationDays)),
      version: task.version,
    };
    if (assigneeUserId !== undefined) {
      timelineMovePayload.assigneeUserId = assigneeUserId;
    }
    if (sectionId !== undefined) {
      timelineMovePayload.sectionId = sectionId;
    }
    if (status !== undefined) {
      timelineMovePayload.status = status;
    }

    rescheduleInFlightTaskIdsRef.current.add(taskId);
    timelineMoveTask.mutate(timelineMovePayload);
  };

  const beginBarDrag = (
    taskId: string,
    pointerId: number,
    originX: number,
    originY: number,
    originLaneId: string,
    useCalendarDays: boolean,
  ) => {
    const taskIds =
      selectedTimelineTaskIdsRef.current.includes(taskId) &&
      selectedTimelineTaskIdsRef.current.length > 1
        ? selectedTimelineTaskIdsRef.current
        : [taskId];
    const next = {
      taskId,
      taskIds,
      pointerId,
      originX,
      originY,
      originLaneId,
      dropLaneId: originLaneId,
      dropRowIndex: null,
      deltaDays: 0,
      useCalendarDays,
      moved: false,
    };
    dragStateRef.current = next;
    setDragState(next);
  };

  const beginBarResize = (
    taskId: string,
    pointerId: number,
    originX: number,
    edge: 'start' | 'end',
    useCalendarDays: boolean,
  ) => {
    const next = {
      taskId,
      pointerId,
      originX,
      edge,
      deltaDays: 0,
      moved: false,
      useCalendarDays,
    };
    resizeStateRef.current = next;
    setResizeState(next);
  };

  const updateBarDrag = (
    pointerId: number,
    clientX: number,
    clientY: number,
    useCalendarDays: boolean,
  ) => {
    const current = dragStateRef.current;
    if (!current || current.pointerId !== pointerId) return;
    const deltaPx = clientX - current.originX;
    const deltaY = clientY - current.originY;
    const deltaDays = Math.round(deltaPx / zoomConfig.dayColWidth);
    const moved =
      current.moved ||
      Math.abs(deltaPx) >= DRAG_START_THRESHOLD_PX ||
      Math.abs(deltaY) >= DRAG_START_THRESHOLD_PX;
    let dropLaneId = current.dropLaneId;
    let dropRowIndex = current.dropRowIndex;
    if (moved) {
      const resolvedLaneId = resolveLaneIdAtClientPosition(clientX, clientY);
      const preferOriginLane =
        resolvedLaneId &&
        resolvedLaneId !== current.originLaneId &&
        Math.abs(clientX - current.originX) < LANE_CHANGE_HORIZONTAL_THRESHOLD_PX;
      const effectiveLaneId = preferOriginLane ? current.originLaneId : resolvedLaneId;
      if (effectiveLaneId) {
        dropLaneId = effectiveLaneId;
        dropRowIndex = resolveLaneRowIndexAtClientPosition(effectiveLaneId, clientY);
      }
    }
    if (
      deltaDays === current.deltaDays &&
      moved === current.moved &&
      dropLaneId === current.dropLaneId &&
      dropRowIndex === current.dropRowIndex &&
      useCalendarDays === current.useCalendarDays
    )
      return;
    const next = { ...current, deltaDays, moved, dropLaneId, dropRowIndex, useCalendarDays };
    dragStateRef.current = next;
    setDragState(next);
  };

  const finishBarDrag = (
    pointerId: number,
    clientX?: number,
    clientY?: number,
    useCalendarDays?: boolean,
  ) => {
    const current = dragStateRef.current;
    if (!current || current.pointerId !== pointerId) return;
    const dragPointerTarget = dragPointerTargetRef.current;
    dragPointerTargetRef.current = null;
    try {
      if (dragPointerTarget?.hasPointerCapture(pointerId)) {
        dragPointerTarget.releasePointerCapture(pointerId);
      }
    } catch {
      // Ignore release failures if the target unmounted mid-drag.
    }
    const resolvedDropLaneId =
      clientX !== undefined && clientY !== undefined
        ? resolveLaneIdAtClientPosition(clientX, clientY)
        : null;
    const preferOriginLaneOnDrop =
      resolvedDropLaneId &&
      resolvedDropLaneId !== current.originLaneId &&
      clientX !== undefined &&
      Math.abs(clientX - current.originX) < LANE_CHANGE_HORIZONTAL_THRESHOLD_PX;
    const effectiveResolvedDropLaneId = preferOriginLaneOnDrop
      ? current.originLaneId
      : resolvedDropLaneId;
    const finalDropLaneId =
      current.dropLaneId ?? effectiveResolvedDropLaneId ?? current.originLaneId;
    const finalDropRowIndex =
      current.dropRowIndex ??
      (clientY !== undefined
        ? resolveLaneRowIndexAtClientPosition(finalDropLaneId, clientY)
        : null);
    dragStateRef.current = null;
    setDragState(null);
    if (!current.moved) return;
    suppressClickTaskIdRef.current = current.taskId;
    if (
      clientY !== undefined &&
      current.taskIds.length === 1 &&
      current.deltaDays === 0 &&
      finalDropLaneId &&
      finalDropLaneId === current.originLaneId
    ) {
      const nextManualLayout = buildNextManualLaneTaskOrder(
        current.originLaneId,
        current.taskId,
        clientY,
        finalDropRowIndex,
      );
      if (nextManualLayout) {
        saveManualLayoutMutation.mutate({
          groupBy: effectiveSwimlane,
          laneTaskOrder: nextManualLayout,
        });
        return;
      }
    }
    commitTimelineDrag(
      current.taskId,
      current.taskIds,
      current.deltaDays,
      useCalendarDays ?? current.useCalendarDays,
      current.originLaneId,
      current.taskIds.length > 1 ? current.originLaneId : finalDropLaneId,
    );
  };

  const updateBarResize = (
    pointerId: number,
    clientX: number,
    useCalendarDays: boolean,
  ) => {
    const current = resizeStateRef.current;
    if (!current || current.pointerId !== pointerId) return;
    const deltaPx = clientX - current.originX;
    const deltaDays = Math.round(deltaPx / zoomConfig.dayColWidth);
    const moved = current.moved || Math.abs(deltaPx) >= DRAG_START_THRESHOLD_PX;
    if (
      deltaDays === current.deltaDays &&
      moved === current.moved &&
      useCalendarDays === current.useCalendarDays
    ) {
      return;
    }
    const next = { ...current, deltaDays, moved, useCalendarDays };
    resizeStateRef.current = next;
    setResizeState(next);
  };

  const finishBarResize = (pointerId: number, useCalendarDays?: boolean) => {
    const current = resizeStateRef.current;
    if (!current || current.pointerId !== pointerId) return;
    resizeStateRef.current = null;
    setResizeState(null);
    if (!current.moved || current.deltaDays === 0) return;
    const task = taskById.get(current.taskId);
    if (!task) return;
    const nextRange = resizeTimelineRange(
      task,
      current.edge,
      current.deltaDays,
      workingDaysOnly,
      useCalendarDays ?? current.useCalendarDays,
    );
    if (nextRange.startAt === task.startAt && nextRange.dueAt === task.dueAt) return;
    rescheduleInFlightTaskIdsRef.current.add(current.taskId);
    rescheduleTask.mutate({
      taskId: current.taskId,
      startAt: nextRange.startAt,
      dueAt: nextRange.dueAt,
      version: task.version,
    });
  };

  const updateBarDragRef = useRef(updateBarDrag);
  const finishBarDragRef = useRef(finishBarDrag);
  const updateBarResizeRef = useRef(updateBarResize);
  const finishBarResizeRef = useRef(finishBarResize);
  const updateSelectionDraftRef = useRef(updateSelectionDraft);
  const finishSelectionDraftRef = useRef(finishSelectionDraft);

  useEffect(() => {
    updateBarDragRef.current = updateBarDrag;
    finishBarDragRef.current = finishBarDrag;
    updateBarResizeRef.current = updateBarResize;
    finishBarResizeRef.current = finishBarResize;
    updateSelectionDraftRef.current = updateSelectionDraft;
    finishSelectionDraftRef.current = finishSelectionDraft;
  });

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      updateSelectionDraftRef.current(event.pointerId, event.clientX, event.clientY);
      updateBarDragRef.current(event.pointerId, event.clientX, event.clientY, event.altKey);
      updateBarResizeRef.current(event.pointerId, event.clientX, event.altKey);
    };

    const handlePointerUp = (event: PointerEvent) => {
      finishSelectionDraftRef.current(event.pointerId, event.clientX, event.clientY);
      finishBarDragRef.current(event.pointerId, event.clientX, event.clientY, event.altKey);
      finishBarResizeRef.current(event.pointerId, event.altKey);
    };

    const handlePointerCancel = (event: PointerEvent) => {
      finishSelectionDraftRef.current(event.pointerId, event.clientX, event.clientY);
      finishBarDragRef.current(event.pointerId, event.clientX, event.clientY, event.altKey);
      finishBarResizeRef.current(event.pointerId, event.altKey);
    };

    window.addEventListener('pointermove', handlePointerMove, { capture: true });
    window.addEventListener('pointerup', handlePointerUp, { capture: true });
    window.addEventListener('pointercancel', handlePointerCancel, { capture: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove, { capture: true });
      window.removeEventListener('pointerup', handlePointerUp, { capture: true });
      window.removeEventListener('pointercancel', handlePointerCancel, { capture: true });
    };
  }, []);

  const handleLaneDrop = (draggingLaneId: string, overLaneId: string) => {
    const laneIds = timelineLanes.map((lane) => lane.id);
    const nextLaneOrder = reorderLaneIds(laneIds, draggingLaneId, overLaneId);
    if (nextLaneOrder.join('|') === laneIds.join('|')) return;
    if (!isLaneOrderGroupBy(effectiveSwimlane)) return;
    saveLaneOrderMutation.mutate({
      groupBy: effectiveSwimlane,
      laneOrder: nextLaneOrder,
    });
  };

  if (timeline.isLoading) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        {t('loadingTimeline')}
      </div>
    );
  }

  if (timeline.isError) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-destructive">
        {t('loadTimelineFailed')}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="timeline-view" data-view-mode={mode}>
      {rescheduleNotice ? (
        <div
          className={`rounded-md border px-3 py-2 text-xs ${
            rescheduleNotice.type === 'conflict'
              ? 'border-warning/40 bg-warning/10 text-foreground'
              : rescheduleNotice.type === 'warning'
                ? 'border-warning/40 bg-warning/10 text-foreground'
                : 'border-destructive/40 bg-destructive/10 text-foreground'
          }`}
          data-testid={
            rescheduleNotice.type === 'conflict'
              ? 'timeline-reschedule-conflict-banner'
              : rescheduleNotice.type === 'warning'
                ? 'timeline-parent-move-warning-banner'
                : 'timeline-reschedule-error-banner'
          }
          role={rescheduleNotice.type === 'error' ? 'alert' : 'status'}
          aria-live={rescheduleNotice.type === 'error' ? 'assertive' : 'polite'}
        >
          {rescheduleNotice.message}
        </div>
      ) : null}
      {timelineParentMoveUndo ? (
        <div
          className="fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm shadow-md"
          data-testid="timeline-parent-move-undo-banner"
          role="alert"
          aria-live="assertive"
        >
          <span>
            {t('timelineParentMoveWarning').replace(
              '{count}',
              String(timelineParentMoveUndo.descendantCount),
            )}
          </span>
          <Button
            ref={timelineParentMoveUndoActionRef}
            size="sm"
            variant="outline"
            data-testid="timeline-parent-move-undo-action"
            disabled={timelineMoveTask.isPending}
            onClick={() => {
              const latest =
                queryClient.getQueryData<Task>(
                  queryKeys.taskDetail(timelineParentMoveUndo.taskId),
                ) ?? taskById.get(timelineParentMoveUndo.taskId);
              const undoPayload: {
                taskId: string;
                startAt: string | null;
                dueAt: string | null;
                assigneeUserId?: string | null;
                sectionId?: string;
                status?: Task['status'];
                version: number;
                skipSubtaskNotice: true;
              } = {
                taskId: timelineParentMoveUndo.taskId,
                startAt: timelineParentMoveUndo.previousStartAt,
                dueAt: timelineParentMoveUndo.previousDueAt,
                version: latest?.version ?? timelineParentMoveUndo.version,
                skipSubtaskNotice: true,
              };
              if ((latest?.assigneeUserId ?? null) !== timelineParentMoveUndo.previousAssigneeUserId) {
                undoPayload.assigneeUserId = timelineParentMoveUndo.previousAssigneeUserId;
              }
              if (latest?.sectionId !== timelineParentMoveUndo.previousSectionId) {
                undoPayload.sectionId = timelineParentMoveUndo.previousSectionId;
              }
              if (latest?.status !== timelineParentMoveUndo.previousStatus) {
                undoPayload.status = timelineParentMoveUndo.previousStatus;
              }
              timelineMoveTask.mutate(undoPayload);
              setTimelineParentMoveUndo(null);
            }}
          >
            {timelineMoveTask.isPending ? t('restoring') : t('undo')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            data-testid="timeline-parent-move-undo-dismiss"
            onClick={() => setTimelineParentMoveUndo(null)}
          >
            {t('dismiss')}
          </Button>
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
                  {zoomOption === 'day'
                    ? t('timelineZoomDay')
                    : zoomOption === 'week'
                      ? t('timelineZoomWeek')
                      : t('timelineZoomMonth')}
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
              {timeline.window.start.toLocaleDateString()} -{' '}
              {timeline.window.end.toLocaleDateString()}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs"
              data-testid="timeline-save-default"
              disabled={!hasUnsavedDefaultViewStateChanges || saveViewStateMutation.isPending}
              onClick={() =>
                saveViewStateMutation.mutate({
                  nextMode: mode,
                  viewState: currentModeViewState,
                  savedViewState: currentModeSavedViewState,
                })
              }
            >
              {saveViewStateMutation.isPending ? t('saving') : t('timelineSaveDefault')}
            </Button>
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
              </>
            ) : null}
            {mode === 'gantt' ? (
              <>
                <Badge variant={ganttRiskTasks.length ? 'destructive' : 'secondary'}>
                  {ganttRiskTasks.length}
                </Badge>
                <span>{t('ganttAtRisk')}</span>
                <Badge
                  variant={ganttDelayedTasks.length ? 'destructive' : 'secondary'}
                  data-testid="gantt-delayed-count"
                >
                  {ganttDelayedTasks.length}
                </Badge>
                <span>{t('ganttDelayed')}</span>
                <Badge
                  variant={ganttAheadTasks.length ? 'default' : 'secondary'}
                  data-testid="gantt-ahead-count"
                >
                  {ganttAheadTasks.length}
                </Badge>
                <span>{t('ganttAhead')}</span>
              </>
            ) : null}
          </div>
        </div>
        {mode === 'timeline' ? (
          <div className="flex flex-wrap items-center gap-3 border-t pt-2">
            <div
              className="inline-flex items-center rounded-md border bg-background/60 p-0.5"
              data-testid="timeline-swimlane-toggle"
            >
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
              <Button
                type="button"
                size="sm"
                variant={effectiveSwimlane === 'status' ? 'default' : 'ghost'}
                className="h-7 px-2 text-xs"
                data-testid="timeline-swimlane-status"
                data-active={effectiveSwimlane === 'status' ? 'true' : 'false'}
                onClick={() => setSwimlane('status')}
              >
                {t('timelineSwimlaneStatus')}
              </Button>
            </div>

            <div
              className="inline-flex items-center rounded-md border bg-background/60 p-0.5"
              data-testid="timeline-sort-toggle"
            >
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

            <div
              className="inline-flex items-center rounded-md border bg-background/60 p-0.5"
              data-testid="timeline-schedule-filter-toggle"
            >
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

            <Button
              type="button"
              size="sm"
              variant={workingDaysOnly ? 'default' : 'outline'}
              className="h-7 px-2 text-xs"
              data-testid="timeline-working-days-toggle"
              data-active={workingDaysOnly ? 'true' : 'false'}
              onClick={() => setWorkingDaysOnly((current) => !current)}
              title={t('timelineWorkingDaysHint')}
            >
              {t('timelineWorkingDays')}
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              data-testid="timeline-align-toggle"
              data-active="false"
              onClick={alignTimeline}
              disabled={saveManualLayoutMutation.isPending}
              title={t('timelineAlignHint')}
            >
              {t('timelineAlign')}
            </Button>

            <p className="text-xs text-muted-foreground" data-testid="timeline-drag-hint">
              {workingDaysOnly ? t('timelineDragWorkingDaysHint') : t('timelineDragHint')}
            </p>
            {selectedTimelineTaskIds.length > 0 ? (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" data-testid="timeline-selection-count">
                  {t('timelineSelectionCount').replace(
                    '{count}',
                    String(selectedTimelineTaskIds.length),
                  )}
                </Badge>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => replaceSelectedTimelineTaskIds([])}
                  data-testid="timeline-selection-clear"
                >
                  {t('clear')}
                </Button>
              </div>
            ) : null}
          </div>
        ) : mode === 'gantt' ? (
          <div className="flex flex-wrap items-center gap-3 border-t pt-2">
            <div
              className="inline-flex items-center rounded-md border bg-background/60 p-0.5"
              data-testid="gantt-risk-filter-toggle"
            >
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
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('ganttRiskPanelTitle')}
          </p>
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
          style={{ gridTemplateColumns: `${LEFT_RAIL_COL_WIDTH}px ${gridWidth}px` }}
        >
          <div aria-hidden="true" className="border-r bg-muted/10" />
          <div
            className="grid"
            style={{ gridTemplateColumns: `repeat(${days.length}, ${zoomConfig.dayColWidth}px)` }}
          >
            {days.map((day) => (
              <div key={day.toISOString()} className="border-l px-1 py-1 text-center">
                <p className="text-[10px] text-muted-foreground">{formatWeekday(day)}</p>
                <p className="text-[10px] font-medium">{formatDay(day)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative" ref={timelineCanvasRef}>
          {timelineLayout.bodyHeight > 0 && showDependencyConnectors ? (
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute top-0 z-0"
              style={{
                left: `${LEFT_RAIL_COL_WIDTH}px`,
                width: `${gridWidth}px`,
                height: `${timelineLayout.bodyHeight}px`,
              }}
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
                const isCrossGroup =
                  edge.sourceLaneId !== null &&
                  edge.targetLaneId !== null &&
                  edge.sourceLaneId !== edge.targetLaneId;
                const isEmphasized =
                  activeConnectorTaskId !== null &&
                  (edge.source === activeConnectorTaskId || edge.target === activeConnectorTaskId);
                const x1 = from.left + from.width;
                const y1 = from.y;
                const x2 = to.left;
                const y2 = to.y;
                const cx = x2 >= x1 ? x1 + Math.max(16, (x2 - x1) / 2) : x1 + 16;
                const path = `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
                const stroke =
                  targetRisk?.isAtRisk && mode === 'gantt'
                    ? 'hsl(var(--destructive))'
                    : 'hsl(var(--primary))';
                const strokeWidth =
                  targetRisk?.isAtRisk && mode === 'gantt'
                    ? 1.75
                    : isEmphasized
                      ? 1.75
                      : isCrossGroup && mode === 'timeline'
                        ? 1.5
                        : 1.25;
                const opacity =
                  activeConnectorTaskId !== null
                    ? isEmphasized
                      ? 0.95
                      : mode === 'timeline'
                        ? 0.16
                        : 0.28
                    : mode === 'timeline'
                      ? isCrossGroup
                        ? 0.52
                        : 0.34
                      : targetRisk?.isAtRisk
                        ? 0.9
                        : 0.7;
                return (
                  <path
                    key={`${edge.source}-${edge.target}-${edge.type}`}
                    d={path}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    strokeDasharray={isCrossGroup && mode === 'timeline' ? '6 4' : undefined}
                    markerEnd={`url(#${markerId})`}
                    opacity={opacity}
                    data-testid={`timeline-connector-${edge.source}-${edge.target}`}
                  />
                );
              })}
            </svg>
          ) : null}
          {mode === 'timeline' && dependencyDraftPreview ? (
            <svg
              aria-hidden="true"
              className="pointer-events-none fixed inset-0 z-50"
              data-testid="timeline-dependency-preview"
            >
              <path
                d={dependencyDraftPreview.path}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="1.75"
                strokeDasharray="4 4"
                opacity="0.9"
              />
            </svg>
          ) : null}

          <div
            className="relative z-[1]"
            data-testid="timeline-selection-surface"
            style={{ width: `${LEFT_RAIL_COL_WIDTH + gridWidth}px` }}
            onPointerDown={(event) => {
              if (mode !== 'timeline' || event.button !== 0) return;
              const target = event.target as HTMLElement | null;
              if (
                target?.closest(
                  '[data-timeline-task-id], [data-testid^="timeline-dependency-handle-"]',
                )
              ) {
                return;
              }
              const containerBounds = scrollContainerRef.current?.getBoundingClientRect();
              if (!containerBounds || event.clientX < containerBounds.left + LEFT_RAIL_COL_WIDTH) {
                replaceSelectedTimelineTaskIds([]);
                return;
              }
              setSelectedTaskId(null);
              replaceSelectionDraft({
                pointerId: event.pointerId,
                originX: event.clientX,
                originY: event.clientY,
                currentX: event.clientX,
                currentY: event.clientY,
              });
              try {
                event.currentTarget.setPointerCapture(event.pointerId);
                selectionPointerTargetRef.current = event.currentTarget;
              } catch {
                selectionPointerTargetRef.current = null;
              }
            }}
            onPointerMove={(event) => {
              updateSelectionDraft(event.pointerId, event.clientX, event.clientY);
            }}
            onPointerUp={(event) => {
              finishSelectionDraft(event.pointerId, event.clientX, event.clientY);
            }}
            onPointerCancel={(event) => {
              finishSelectionDraft(event.pointerId, event.clientX, event.clientY);
            }}
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
                const parsed = JSON.parse(raw) as { taskId?: string };
                if (!parsed.taskId) return;
                const fallbackTask = taskById.get(parsed.taskId);
                if (!fallbackTask) return;
                const fallbackLaneId = deriveLaneIdForTask(fallbackTask, effectiveSwimlane);
                commitUnscheduledDrop(parsed.taskId, fallbackLaneId, event.clientX, event.clientY);
              } catch {
                // ignore malformed drag payload
              }
            }}
          >
            {mode === 'timeline' && selectionRect ? (
              <div
                className="pointer-events-none fixed z-[60] rounded border border-primary/60 bg-primary/10"
                style={{
                  left: `${selectionRect.left}px`,
                  top: `${selectionRect.top}px`,
                  width: `${selectionRect.width}px`,
                  height: `${selectionRect.height}px`,
                }}
                data-testid="timeline-selection-box"
              />
            ) : null}
            {mode === 'timeline' && dragOverlay ? (
              <div
                className="pointer-events-none absolute z-[70]"
                style={{
                  left: `${dragOverlay.left}px`,
                  top: `${dragOverlay.top}px`,
                  width: dragOverlay.isMilestone ? '14px' : `${dragOverlay.width}px`,
                  height: dragOverlay.isMilestone ? '14px' : '20px',
                  transform: dragOverlay.isMilestone
                    ? 'translate(-50%, -50%) rotate(45deg) scale(1.01)'
                    : 'translateY(-50%) scale(1.01)',
                  opacity: 0.72,
                  boxShadow: '0 12px 28px rgba(0, 0, 0, 0.18)',
                  ...dragOverlay.style,
                }}
                data-testid="timeline-drag-overlay"
              >
                {!dragOverlay.isMilestone ? (
                  <div className="flex h-full items-center overflow-hidden rounded px-2 text-[11px] text-current">
                    <span className="truncate">
                      {dragOverlay.task.title.trim() || t('untitledTask')}
                    </span>
                    {dragOverlay.extraCount > 0 ? (
                      <span className="ml-2 inline-flex h-4 shrink-0 items-center rounded-full bg-background/85 px-1 text-[10px] text-foreground shadow-sm">
                        +{dragOverlay.extraCount}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
            {timelineLayout.lanesWithRows.map(({ lane, top, rows, footerHeight }) => {
              const sectionVisible =
                !virtualizationEnabled ||
                (top + SECTION_ROW_HEIGHT >= visibleRange.start && top <= visibleRange.end);
              const visibleRows = virtualizationEnabled
                ? rows.filter(
                    (entry) =>
                      entry.top + TASK_ROW_HEIGHT >= visibleRange.start &&
                      entry.top <= visibleRange.end,
                  )
                : rows;
              if (!sectionVisible && visibleRows.length === 0) return null;
              const isLaneCollapsed = collapsedLaneIds.has(lane.id);
              const laneTaskCount = laneTaskCountById.get(lane.id) ?? 0;
              const laneSubtaskMeta = timelineLaneSubtaskMetaById[lane.id];
              const laneContentId = `timeline-lane-content-${normalizeTestIdSegment(lane.id)}`;
              const laneRowsTop = top + SECTION_ROW_HEIGHT;
              const laneRowsBottom = top + SECTION_ROW_HEIGHT + rows.length * TASK_ROW_HEIGHT;
              const laneContentBottom = laneRowsBottom + footerHeight;
              const topSpacer = visibleRows.length
                ? Math.max(0, visibleRows[0]!.top - laneRowsTop)
                : 0;
              const bottomSpacer = visibleRows.length
                ? Math.max(
                    0,
                    laneContentBottom - (visibleRows[visibleRows.length - 1]!.top + TASK_ROW_HEIGHT),
                  )
                : rows.length * TASK_ROW_HEIGHT + footerHeight;
              const laneDropActive =
                mode === 'timeline' && dragState?.moved && dragState.dropLaneId === lane.id;
              const footerDropActive =
                laneDropActive && (dragState?.dropRowIndex ?? -1) >= rows.length;

              return (
                <div
                  key={lane.id}
                  className="grid border-b last:border-b-0"
                  style={{ gridTemplateColumns: `${LEFT_RAIL_COL_WIDTH}px ${gridWidth}px` }}
                  data-testid={`timeline-lane-${normalizeTestIdSegment(lane.id)}`}
                  data-timeline-lane-id={lane.id}
                >
                  <div className="relative self-start">
                    <div
                      className="w-full border-r bg-muted/10"
                      data-testid={`timeline-lane-rail-${normalizeTestIdSegment(lane.id)}`}
                      data-header-only="true"
                    >
                      {/* Timeline lanes keep task interaction on the canvas; the rail only shows lane headers. */}
                      <div
                        className={`flex h-8 items-center gap-2 border-b px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${
                          laneDragState?.overLaneId === lane.id
                            ? 'ring-1 ring-inset ring-primary/40'
                            : ''
                        }`}
                        data-testid={`timeline-lane-header-${normalizeTestIdSegment(lane.id)}`}
                        draggable={mode === 'timeline' && effectiveSwimlane !== 'status'}
                        onDragStart={(event) => {
                          if (mode !== 'timeline' || effectiveSwimlane === 'status') return;
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', lane.id);
                          replaceLaneDragState({ draggingLaneId: lane.id, overLaneId: lane.id });
                        }}
                        onDragOver={(event) => {
                          const dragTypes = Array.from(event.dataTransfer.types);
                          const isUnscheduledDrop = dragTypes.includes(UNSCHEDULED_TASK_DND_TYPE);
                          const isLaneReorderDrop =
                            dragTypes.includes('text/plain') ||
                            Boolean(laneDragStateRef.current?.draggingLaneId);
                          if (
                            !isUnscheduledDrop &&
                            (mode !== 'timeline' ||
                              effectiveSwimlane === 'status' ||
                              !isLaneReorderDrop)
                          ) {
                            return;
                          }
                          event.preventDefault();
                          if (isUnscheduledDrop) return;
                          if (laneDragState?.overLaneId !== lane.id) {
                            replaceLaneDragState(
                              laneDragStateRef.current
                                ? { ...laneDragStateRef.current, overLaneId: lane.id }
                                : laneDragStateRef.current,
                            );
                          }
                        }}
                        onDrop={(event) => {
                          if (
                            Array.from(event.dataTransfer.types).includes(UNSCHEDULED_TASK_DND_TYPE)
                          ) {
                            const raw = event.dataTransfer.getData(UNSCHEDULED_TASK_DND_TYPE);
                            if (!raw) return;
                            event.preventDefault();
                            setUnscheduledDragTaskId(null);
                            try {
                              const parsed = JSON.parse(raw) as { taskId?: string };
                              if (!parsed.taskId) return;
                              commitUnscheduledDrop(
                                parsed.taskId,
                                lane.id,
                                event.clientX,
                                event.clientY,
                              );
                            } catch {
                              // ignore malformed drag payload
                            }
                            return;
                          }
                          if (mode !== 'timeline' || effectiveSwimlane === 'status') return;
                          event.preventDefault();
                          const draggingLaneId =
                            laneDragStateRef.current?.draggingLaneId ??
                            event.dataTransfer.getData('text/plain');
                          if (draggingLaneId) {
                            handleLaneDrop(draggingLaneId, lane.id);
                          }
                          replaceLaneDragState(null);
                        }}
                        onDragEnd={() => {
                          replaceLaneDragState(null);
                        }}
                      >
                        <button
                          type="button"
                          className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleLaneCollapsed(lane.id);
                          }}
                          aria-label={
                            isLaneCollapsed ? t('timelineExpandGroup') : t('timelineCollapseGroup')
                          }
                          aria-controls={laneContentId}
                          aria-expanded={!isLaneCollapsed}
                          data-testid={`timeline-lane-toggle-${normalizeTestIdSegment(lane.id)}`}
                        >
                          {isLaneCollapsed ? (
                            <ChevronRight className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <div className="min-w-0 flex-1 truncate">{lane.label}</div>
                        {laneTaskCount > 0 ? (
                          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                            {laneTaskCount}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div id={laneContentId} className="min-w-0">
                    {sectionVisible ? (
                      <div
                        className={`h-8 border-b bg-muted/20 ${laneDragState?.overLaneId === lane.id ? 'ring-1 ring-inset ring-primary/40' : ''} ${laneDropActive ? 'bg-primary/[0.06]' : ''}`}
                      />
                    ) : (
                      <div style={{ height: `${SECTION_ROW_HEIGHT}px` }} />
                    )}

                    {!isLaneCollapsed && topSpacer > 0 ? (
                      <div style={{ height: `${topSpacer}px` }} />
                    ) : null}

                    {!isLaneCollapsed
                      ? visibleRows.map((row) => {
                          const primaryTask = row.tasks[0];
                          if (!primaryTask) return null;
                          return (
                            <div
                              key={`${lane.id}-row-${row.top}`}
                              className={`h-10 border-b last:border-b-0 ${laneDropActive && dragState?.dropRowIndex === row.index ? 'bg-primary/[0.06] outline outline-1 outline-dashed outline-primary/35' : ''}`}
                              data-testid={`timeline-row-${normalizeTestIdSegment(lane.id)}-${row.index}`}
                            >
                              <div
                                className={`relative h-full border-l ${laneDropActive && dragState?.dropRowIndex === row.index ? 'bg-primary/[0.03]' : ''}`}
                              >
                                <div className="pointer-events-none absolute right-2 top-1/2 z-[3] flex -translate-y-1/2 items-center gap-2">
                                  {mode === 'gantt' &&
                                  row.tasks.length === 1 &&
                                  (ganttVarianceByTaskId.get(primaryTask.id) ?? null) !== null ? (
                                    <Badge
                                      variant={
                                        (ganttVarianceByTaskId.get(primaryTask.id) ?? 0) > 0
                                          ? 'destructive'
                                          : 'secondary'
                                      }
                                      className="h-5 px-1.5 text-[10px]"
                                      data-testid={`gantt-variance-${primaryTask.id}`}
                                    >
                                      {(ganttVarianceByTaskId.get(primaryTask.id) ?? 0) > 0
                                        ? `+${ganttVarianceByTaskId.get(primaryTask.id)}d`
                                        : `${ganttVarianceByTaskId.get(primaryTask.id)}d`}
                                    </Badge>
                                  ) : null}
                                  {mode === 'gantt' &&
                                  row.tasks.length === 1 &&
                                  ganttRiskByTaskId.get(primaryTask.id)?.isAtRisk ? (
                                    <Badge
                                      variant="destructive"
                                      className="h-5 px-1.5 text-[10px]"
                                      data-testid={`gantt-risk-badge-${primaryTask.id}`}
                                    >
                                      {ganttRiskByTaskId.get(primaryTask.id)?.overdue
                                        ? t('ganttRiskOverdue')
                                        : (ganttRiskByTaskId.get(primaryTask.id)?.blockedByOpen ??
                                              0) > 0
                                          ? t('ganttRiskBlocked')
                                          : t('ganttRiskLateDependency')}
                                    </Badge>
                                  ) : null}
                                </div>
                                {row.tasks.map((task) => {
                                  const fallbackTaskName = task.title.trim() || t('untitledTask');
                                  const timelineBarStyle = resolveTimelineBarStyle(task, today);
                                  const isCompleted = task.status === 'DONE';
                                  const taskRisk = ganttRiskByTaskId.get(task.id);
                                  const taskRiskLabel = describeTaskRisk(taskRisk);
                                  const taskDepth = laneSubtaskMeta?.depthByTaskId[task.id] ?? 0;
                                  const childTaskIds = laneSubtaskMeta?.childIdsByParentId[task.id] ?? [];
                                  const hasVisibleChildren = childTaskIds.length > 0;
                                  const isTaskCollapsed = collapsedTimelineParentIds.has(task.id);
                                  const isSelectedTimelineTask = selectedTimelineTaskIds.includes(
                                    task.id,
                                  );
                                  const barLayout = timelineLayout.barsByTaskId[task.id];
                                  const visibleBaselineStart =
                                    task.baselineStart && task.baselineStart < timeline.window.start
                                      ? timeline.window.start
                                      : task.baselineStart;
                                  const visibleBaselineEnd =
                                    task.baselineEnd && task.baselineEnd > timeline.window.end
                                      ? timeline.window.end
                                      : task.baselineEnd;
                                  if (
                                    task.hasSchedule &&
                                    task.inWindow &&
                                    task.timelineStart &&
                                    task.timelineEnd
                                  ) {
                                    if (!barLayout) return null;
                                    const resizePreview =
                                      resizeState?.taskId === task.id
                                        ? resizeTimelineRange(
                                            task,
                                            resizeState.edge,
                                            resizeState.deltaDays,
                                            workingDaysOnly,
                                            resizeState.useCalendarDays,
                                          )
                                        : null;
                                    const previewStartAt =
                                      resizePreview?.startAt ??
                                      shiftTimelineIso(
                                        task.startAt,
                                        dragState?.taskIds.includes(task.id)
                                          ? dragState.deltaDays
                                          : 0,
                                        workingDaysOnly,
                                        dragState?.useCalendarDays ?? false,
                                      );
                                    const previewDueAt =
                                      resizePreview?.dueAt ??
                                      shiftTimelineIso(
                                        task.dueAt,
                                        dragState?.taskIds.includes(task.id)
                                          ? dragState.deltaDays
                                          : 0,
                                        workingDaysOnly,
                                        dragState?.useCalendarDays ?? false,
                                      );
                                    const previewStartDate = dateOnlyInputToLocalDate(previewStartAt);
                                    const previewDueDate = dateOnlyInputToLocalDate(previewDueAt);
                                    const previewDeltaDays =
                                      previewStartDate && task.timelineStart
                                        ? dayDiff(task.timelineStart, previewStartDate)
                                        : dragState?.taskIds.includes(task.id)
                                          ? dragState.deltaDays
                                          : 0;
                                    const taskLeft = Math.max(
                                      0,
                                      barLayout.left + previewDeltaDays * zoomConfig.dayColWidth,
                                    );
                                    const taskWidth =
                                      previewStartDate && previewDueDate
                                        ? Math.max(
                                            1,
                                            dayDiff(previewStartDate, previewDueDate) + 1,
                                          ) * zoomConfig.dayColWidth
                                        : barLayout.width;
                                    const isMilestone =
                                      task.type === 'MILESTONE' ||
                                      dayDiff(task.timelineStart, task.timelineEnd) === 0;
                                    const usesExternalLabel = !isMilestone && taskWidth < 88;
                                    const clampedProgress = Math.max(
                                      0,
                                      Math.min(100, task.progressPercent ?? 0),
                                    );
                                    const barBoxShadow =
                                      [
                                        mode === 'timeline' && taskRisk?.isAtRisk
                                          ? 'inset 3px 0 0 hsl(var(--destructive))'
                                          : null,
                                        mode === 'timeline' && isSelectedTimelineTask
                                          ? '0 0 0 2px hsl(var(--ring))'
                                          : null,
                                        dependencyDraft?.targetTaskId === task.id
                                          ? '0 0 0 2px hsl(var(--primary))'
                                          : null,
                                      ]
                                        .filter(Boolean)
                                        .join(', ') || undefined;
                                    return (
                                      <div
                                        key={task.id}
                                        className="group/timeline-bar"
                                        onFocusCapture={() => setFocusedTaskId(task.id)}
                                        onBlurCapture={(event) => {
                                          if (
                                            event.currentTarget.contains(
                                              event.relatedTarget as Node | null,
                                            )
                                          ) {
                                            return;
                                          }
                                          setFocusedTaskId((current) =>
                                            current === task.id ? null : current,
                                          );
                                        }}
                                      >
                                        {mode === 'gantt' &&
                                        task.hasBaseline &&
                                        task.baselineStart &&
                                        task.baselineEnd ? (
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
                                          className={`absolute top-1/2 text-left text-[11px] shadow-sm transition-[background-color,border-color,color,opacity,transform,box-shadow] ${
                                            isMilestone
                                              ? 'h-3.5 w-3.5 -translate-y-1/2 rotate-45 rounded-[2px]'
                                              : 'h-6 -translate-y-1/2 overflow-hidden rounded px-2'
                                          } ${
                                            dragState?.taskIds.includes(task.id)
                                              ? 'cursor-grabbing opacity-25 ring-1 ring-primary/30 shadow-md'
                                              : 'cursor-grab'
                                          } ${dragState?.taskIds.includes(task.id) ? 'scale-[0.98]' : ''}`}
                                          style={
                                            isMilestone
                                              ? {
                                                  left: `${Math.max(0, taskLeft + taskWidth / 2 - 7)}px`,
                                                  width: '14px',
                                                  height: '14px',
                                                  opacity: isCompleted ? 0.56 : 1,
                                                  boxShadow: barBoxShadow,
                                                  ...timelineBarStyle,
                                                }
                                              : {
                                                  left: `${taskLeft}px`,
                                                  width: `${taskWidth}px`,
                                                  opacity: isCompleted ? 0.56 : 1,
                                                  boxShadow: barBoxShadow,
                                                  ...timelineBarStyle,
                                                }
                                          }
                                          onClick={(event) => {
                                            if (event.shiftKey) {
                                              event.preventDefault();
                                              return;
                                            }
                                            if (suppressClickTaskIdRef.current === task.id) {
                                              suppressClickTaskIdRef.current = null;
                                              return;
                                            }
                                            setSelectedTaskId(task.id);
                                          }}
                                          onPointerDown={(event) => {
                                            if (event.button !== 0) return;
                                            if (event.shiftKey) {
                                              event.preventDefault();
                                              event.stopPropagation();
                                              toggleTimelineTaskSelection(task.id);
                                              return;
                                            }
                                            if (
                                              (selectedTimelineTaskIdsRef.current.includes(task.id)
                                                ? selectedTimelineTaskIdsRef.current
                                                : [task.id]
                                              ).some((selectedTaskId) =>
                                                rescheduleInFlightTaskIdsRef.current.has(
                                                  selectedTaskId,
                                                ),
                                              )
                                            )
                                              return;
                                            event.preventDefault();
                                            event.stopPropagation();
                                            if (
                                              !selectedTimelineTaskIdsRef.current.includes(task.id)
                                            ) {
                                              replaceSelectedTimelineTaskIds([task.id]);
                                            }
                                            beginBarDrag(
                                              task.id,
                                              event.pointerId,
                                              event.clientX,
                                              event.clientY,
                                              lane.id,
                                              event.altKey,
                                            );
                                            try {
                                              event.currentTarget.setPointerCapture(event.pointerId);
                                              dragPointerTargetRef.current = event.currentTarget;
                                            } catch {
                                              dragPointerTargetRef.current = null;
                                            }
                                          }}
                                          onMouseEnter={() => setHoveredTaskId(task.id)}
                                          onMouseLeave={() =>
                                            setHoveredTaskId((current) =>
                                              current === task.id ? null : current,
                                            )
                                          }
                                          data-testid={`timeline-bar-${task.id}`}
                                          data-timeline-task-id={task.id}
                                          data-selected={isSelectedTimelineTask ? 'true' : 'false'}
                                          data-at-risk={taskRisk?.isAtRisk ? 'true' : 'false'}
                                          data-risk-kind={taskRiskLabel ?? 'none'}
                                          data-connection-target={
                                            dependencyDraft?.targetTaskId === task.id
                                              ? 'true'
                                              : 'false'
                                          }
                                          title={`${task.timelineStart.toLocaleDateString()} - ${task.timelineEnd.toLocaleDateString()}${taskRiskLabel ? ` • ${taskRiskLabel}` : ''}`}
                                        >
                                          {!isMilestone ? (
                                            <span
                                              className="pointer-events-none absolute inset-y-0 left-0 rounded-l bg-current opacity-15"
                                              style={{ width: `${clampedProgress}%` }}
                                            />
                                          ) : null}
                                          {isMilestone ? (
                                            <span className="sr-only">{fallbackTaskName}</span>
                                          ) : null}
                                          {!isMilestone ? (
                                            <span
                                              className={`relative z-[1] flex items-center gap-1 truncate ${isCompleted ? 'line-through' : ''}`}
                                            >
                                              {hasVisibleChildren ? (
                                                <span
                                                  className="inline-flex shrink-0"
                                                  onPointerDown={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                  }}
                                                  onClick={(event) => {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    toggleTimelineParentCollapsed(task.id);
                                                  }}
                                                  data-testid={`timeline-subtask-toggle-${task.id}`}
                                                >
                                                  {isTaskCollapsed ? (
                                                    <ChevronRight className="h-3 w-3" />
                                                  ) : (
                                                    <ChevronDown className="h-3 w-3" />
                                                  )}
                                                </span>
                                              ) : taskDepth > 0 ? (
                                                <span
                                                  className="inline-flex h-3 w-3 shrink-0 items-center justify-center text-[10px] text-muted-foreground/80"
                                                  aria-hidden="true"
                                                >
                                                  ↳
                                                </span>
                                              ) : null}
                                              <span className={usesExternalLabel ? 'sr-only' : 'truncate'}>
                                                {fallbackTaskName}
                                              </span>
                                            </span>
                                          ) : null}
                                        </button>
                                        {taskDepth > 0 ? (
                                          <div
                                            className="pointer-events-none absolute top-1/2 z-[1] -translate-y-1/2"
                                            style={{
                                              left: `${Math.max(0, taskLeft - 10)}px`,
                                              width: '10px',
                                              height: `${TASK_ROW_HEIGHT}px`,
                                            }}
                                          >
                                            <div className="absolute left-1 top-0 h-1/2 w-px bg-border/70" />
                                            <div className="absolute left-1 top-1/2 h-px w-3 bg-border/70" />
                                          </div>
                                        ) : null}
                                        {mode === 'timeline' && !isMilestone ? (
                                          <>
                                            <button
                                              type="button"
                                              className="absolute top-1/2 z-[5] h-6 w-2 -translate-y-1/2 rounded-full bg-background/85 opacity-0 shadow-sm ring-1 ring-border transition group-hover/timeline-bar:opacity-100"
                                              style={{ left: `${Math.max(0, taskLeft - 4)}px` }}
                                              onPointerDown={(event) => {
                                                if (event.button !== 0) return;
                                                event.preventDefault();
                                                event.stopPropagation();
                                                if (rescheduleInFlightTaskIdsRef.current.has(task.id))
                                                  return;
                                                beginBarResize(
                                                  task.id,
                                                  event.pointerId,
                                                  event.clientX,
                                                  'start',
                                                  event.altKey,
                                                );
                                              }}
                                              data-testid={`timeline-resize-start-${task.id}`}
                                              title={t('startDate')}
                                            />
                                            <button
                                              type="button"
                                              className="absolute top-1/2 z-[5] h-6 w-2 -translate-y-1/2 rounded-full bg-background/85 opacity-0 shadow-sm ring-1 ring-border transition group-hover/timeline-bar:opacity-100"
                                              style={{
                                                left: `${Math.max(0, taskLeft + taskWidth - 4)}px`,
                                              }}
                                              onPointerDown={(event) => {
                                                if (event.button !== 0) return;
                                                event.preventDefault();
                                                event.stopPropagation();
                                                if (rescheduleInFlightTaskIdsRef.current.has(task.id))
                                                  return;
                                                beginBarResize(
                                                  task.id,
                                                  event.pointerId,
                                                  event.clientX,
                                                  'end',
                                                  event.altKey,
                                                );
                                              }}
                                              data-testid={`timeline-resize-end-${task.id}`}
                                              title={t('dueDate')}
                                            />
                                          </>
                                        ) : null}
                                        {mode === 'timeline' ? (
                                          <button
                                            type="button"
                                            className={`absolute top-1/2 z-[2] h-3.5 w-3.5 -translate-y-1/2 rounded-full border border-primary/50 bg-background shadow-sm transition ${
                                              hoveredTaskId === task.id ||
                                              focusedTaskId === task.id ||
                                              dependencyDraft?.sourceTaskId === task.id
                                                ? 'opacity-100'
                                                : 'opacity-0 group-hover/timeline-bar:opacity-100'
                                            }`}
                                            style={{
                                              left: `${Math.max(0, taskLeft + taskWidth - 7)}px`,
                                            }}
                                            onPointerDown={(event) => {
                                              event.preventDefault();
                                              event.stopPropagation();
                                              const rect =
                                                event.currentTarget.getBoundingClientRect();
                                              replaceDependencyDraft({
                                                sourceTaskId: task.id,
                                                sourceX: rect.left + rect.width / 2,
                                                sourceY: rect.top + rect.height / 2,
                                                pointerX: event.clientX,
                                                pointerY: event.clientY,
                                                targetTaskId: null,
                                              });
                                            }}
                                            data-testid={`timeline-dependency-handle-${task.id}`}
                                            title={t('addDependency')}
                                          >
                                            <span className="block h-full w-full rounded-full bg-primary/20" />
                                          </button>
                                        ) : null}
                                        {isMilestone || usesExternalLabel ? (
                                          <button
                                            type="button"
                                            className={`absolute top-1/2 -translate-y-1/2 text-left text-[11px] text-foreground ${isCompleted ? 'line-through opacity-60' : ''}`}
                                            style={{
                                              left: `${Math.max(0, taskLeft + taskWidth + (isMilestone ? -taskWidth / 2 + 10 : 8))}px`,
                                            }}
                                            onClick={(event) => {
                                              if (event.shiftKey) {
                                                event.preventDefault();
                                                return;
                                              }
                                              if (suppressClickTaskIdRef.current === task.id) {
                                                suppressClickTaskIdRef.current = null;
                                                return;
                                              }
                                              setSelectedTaskId(task.id);
                                            }}
                                          >
                                            {fallbackTaskName}
                                          </button>
                                        ) : null}
                                      </div>
                                    );
                                  }
                                  if (task.hasSchedule) {
                                    return (
                                      <span
                                        key={task.id}
                                        className="absolute left-2 top-1/2 -translate-y-1/2 rounded border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground"
                                      >
                                        {t('timelineOutOfWindow')}
                                      </span>
                                    );
                                  }
                                  return null;
                                })}
                              </div>
                            </div>
                          );
                        })
                      : null}

                    {!isLaneCollapsed && bottomSpacer > 0 ? (
                      <div
                        className={`${footerDropActive ? 'bg-primary/[0.08] outline outline-1 outline-dashed outline-primary/35' : ''}`}
                        style={{ height: `${bottomSpacer}px` }}
                        data-testid={`timeline-footer-row-${normalizeTestIdSegment(lane.id)}`}
                      />
                    ) : null}
                  </div>
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

      {mode === 'timeline' && unscheduledTasks.length ? (
        <div
          className="rounded-lg border border-dashed bg-card/70 p-3"
          data-testid="timeline-unscheduled-tray"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{t('timelineUnscheduled')}</p>
              <p className="text-xs text-muted-foreground">{t('timelineUnscheduledTrayHint')}</p>
            </div>
            <Badge variant="secondary">{unscheduledTasks.length}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {unscheduledTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                className={`rounded-md border border-dashed px-3 py-2 text-left text-xs text-muted-foreground transition hover:border-primary/40 hover:bg-muted/40 hover:text-foreground ${
                  unscheduledDragTaskId === task.id ? 'opacity-60' : ''
                }`}
                onClick={() => setSelectedTaskId(task.id)}
                draggable={mode === 'timeline'}
                onDragStart={(event) => {
                  if (mode !== 'timeline') return;
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData(
                    UNSCHEDULED_TASK_DND_TYPE,
                    JSON.stringify({
                      taskId: task.id,
                    }),
                  );
                  setUnscheduledDragTaskId(task.id);
                }}
                onDragEnd={() => {
                  setUnscheduledDragTaskId(null);
                }}
                data-testid={`timeline-unscheduled-${task.id}`}
              >
                <span className="block truncate text-foreground">
                  {task.title.trim() || t('untitledTask')}
                </span>
                <span className="mt-1 block">{t('timelineNoDates')}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
