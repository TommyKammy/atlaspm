'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import TaskDetailDrawer from '@/components/task-detail-drawer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTimelineData } from '@/hooks/use-timeline-data';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { queryKeys } from '@/lib/query-keys';
import type { Task } from '@/lib/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const TASK_NAME_COL_WIDTH = 260;
const TIMELINE_VIEW_STORAGE_PREFIX = 'atlaspm:timeline-view';
const SECTION_ROW_HEIGHT = 32;
const TASK_ROW_HEIGHT = 40;

type TimelineZoom = 'day' | 'week' | 'month';

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

export function ProjectTimelineView({
  projectId,
  search,
  statusFilter,
  priorityFilter,
}: {
  projectId: string;
  search: string;
  statusFilter: 'ALL' | Task['status'];
  priorityFilter: 'ALL' | NonNullable<Task['priority']>;
}) {
  const { t } = useI18n();
  const meQuery = useQuery<{ id: string }>({
    queryKey: queryKeys.me,
    queryFn: () => api('/me'),
  });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<TimelineZoom>('week');
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()));
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);

  const timelineStorageKey = useMemo(
    () => (meQuery.data?.id ? `${TIMELINE_VIEW_STORAGE_PREFIX}:${meQuery.data.id}:${projectId}` : null),
    [meQuery.data?.id, projectId],
  );

  useEffect(() => {
    setPreferencesHydrated(false);
    if (!timelineStorageKey || typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(timelineStorageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { zoom?: TimelineZoom; anchorDate?: string };
        if (parsed.zoom && parsed.zoom in TIMELINE_ZOOM_CONFIG) {
          setZoom(parsed.zoom);
        }
        if (parsed.anchorDate) {
          const parsedDate = new Date(parsed.anchorDate);
          if (!Number.isNaN(parsedDate.valueOf())) {
            setAnchorDate(startOfDay(parsedDate));
          }
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
      }),
    );
  }, [anchorDate, preferencesHydrated, timelineStorageKey, zoom]);

  const zoomConfig = TIMELINE_ZOOM_CONFIG[zoom];

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

  const filteredTasks = useMemo(
    () => timeline.tasks.filter((task) => taskMatchesFilters(task, search, statusFilter, priorityFilter)),
    [priorityFilter, search, statusFilter, timeline.tasks],
  );

  const filteredTaskIds = useMemo(() => new Set(filteredTasks.map((task) => task.id)), [filteredTasks]);
  const filteredBySection = useMemo(() => {
    const next: Record<string, typeof filteredTasks> = {};
    for (const task of filteredTasks) {
      const list = next[task.sectionId] ?? [];
      list.push(task);
      next[task.sectionId] = list;
    }
    return next;
  }, [filteredTasks]);

  const scheduledTasks = filteredTasks.filter((task) => task.hasSchedule && task.inWindow);
  const unscheduledTasks = filteredTasks.filter((task) => !task.hasSchedule);
  const gridWidth = Math.max(1, days.length) * zoomConfig.dayColWidth;
  const timelineLayout = useMemo(() => {
    let cursorY = 0;
    const barsByTaskId: Record<string, { left: number; width: number; y: number }> = {};
    const visibleSections = timeline.sections
      .map((section) => ({ section, tasks: filteredBySection[section.id] ?? [] }))
      .filter((entry) => entry.tasks.length > 0);

    for (const entry of visibleSections) {
      cursorY += SECTION_ROW_HEIGHT;
      for (const task of entry.tasks) {
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
        cursorY += TASK_ROW_HEIGHT;
      }
    }

    return {
      visibleSections,
      barsByTaskId,
      bodyHeight: cursorY,
    };
  }, [filteredBySection, timeline.sections, timeline.window.end, timeline.window.start, zoomConfig.dayColWidth]);

  const connectorEdges = useMemo(
    () =>
      timeline.dependencyEdges.filter((edge) =>
        filteredTaskIds.has(edge.source)
        && filteredTaskIds.has(edge.target)
        && timelineLayout.barsByTaskId[edge.source]
        && timelineLayout.barsByTaskId[edge.target]),
    [filteredTaskIds, timeline.dependencyEdges, timelineLayout.barsByTaskId],
  );

  if (timeline.isLoading) {
    return <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">{t('loadingTimeline')}</div>;
  }

  if (timeline.isError) {
    return <div className="rounded-lg border bg-card p-4 text-sm text-destructive">{t('loadTimelineFailed')}</div>;
  }

  return (
    <div className="space-y-4" data-testid="timeline-view">
      <div className="flex items-center justify-between rounded-lg border bg-card p-3">
        <div className="flex items-center gap-2">
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
          <Badge variant="secondary">{connectorEdges.length}</Badge>
          <span>{t('timelineDependencies')}</span>
        </div>
      </div>

      <div className="overflow-auto rounded-lg border bg-card">
        <div
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
          {timelineLayout.bodyHeight > 0 ? (
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute top-0 z-0"
              style={{ left: `${TASK_NAME_COL_WIDTH}px`, width: `${gridWidth}px`, height: `${timelineLayout.bodyHeight}px` }}
              data-testid="timeline-dependency-layer"
            >
              <defs>
                <marker
                  id="timeline-arrow"
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
                const x1 = from.left + from.width;
                const y1 = from.y;
                const x2 = to.left;
                const y2 = to.y;
                const isForward = x2 >= x1;
                const cx = isForward ? x1 + Math.max(16, (x2 - x1) / 2) : x1 + 16;
                const path = isForward
                  ? `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`
                  : `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
                return (
                  <path
                    key={`${edge.source}-${edge.target}-${edge.type}`}
                    d={path}
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="1.25"
                    markerEnd="url(#timeline-arrow)"
                    opacity={0.7}
                    data-testid={`timeline-connector-${edge.source}-${edge.target}`}
                  />
                );
              })}
            </svg>
          ) : null}

          <div className="relative z-[1]">
            {timelineLayout.visibleSections.map(({ section, tasks: sectionTasks }) => {
          if (!sectionTasks.length) return null;
          return (
            <div key={section.id} className="border-b last:border-b-0">
              <div className="grid h-8 border-b bg-muted/20" style={{ gridTemplateColumns: `${TASK_NAME_COL_WIDTH}px ${gridWidth}px` }}>
                <div className="flex items-center px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.isDefault ? t('tasks') : section.name}
                </div>
                <div className="flex items-center px-2 text-xs text-muted-foreground">
                  {sectionTasks.length} {t('tasks')}
                </div>
              </div>

              {sectionTasks.map((task) => {
                const fallbackName = task.title.trim() || t('untitledTask');
                const visibleStart = task.timelineStart && task.timelineStart < timeline.window.start
                  ? timeline.window.start
                  : task.timelineStart;
                const visibleEnd = task.timelineEnd && task.timelineEnd > timeline.window.end
                  ? timeline.window.end
                  : task.timelineEnd;
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
                    </div>
                    <div className="relative h-full border-l">
                      {task.hasSchedule && task.inWindow && task.timelineStart && task.timelineEnd ? (
                        <button
                          type="button"
                          className="absolute top-1/2 h-6 -translate-y-1/2 rounded bg-primary/20 px-2 text-left text-[11px] text-primary hover:bg-primary/25"
                          style={{
                            left: `${Math.max(0, dayDiff(timeline.window.start, visibleStart ?? task.timelineStart)) * zoomConfig.dayColWidth}px`,
                            width: `${Math.max(1, dayDiff(visibleStart ?? task.timelineStart, visibleEnd ?? task.timelineEnd) + 1) * zoomConfig.dayColWidth}px`,
                          }}
                          onClick={() => setSelectedTaskId(task.id)}
                          data-testid={`timeline-bar-${task.id}`}
                          title={`${task.timelineStart.toLocaleDateString()} - ${task.timelineEnd.toLocaleDateString()}`}
                        >
                          <span className="block truncate">{fallbackName}</span>
                        </button>
                      ) : task.hasSchedule ? (
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 rounded border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground">
                          {t('timelineOutOfWindow')}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="absolute left-2 top-1/2 -translate-y-1/2 rounded border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/40"
                          onClick={() => setSelectedTaskId(task.id)}
                          data-testid={`timeline-unscheduled-${task.id}`}
                        >
                          {t('timelineNoDates')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
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
