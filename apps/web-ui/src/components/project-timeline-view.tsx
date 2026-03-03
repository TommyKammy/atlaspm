'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import TaskDetailDrawer from '@/components/task-detail-drawer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTimelineData } from '@/hooks/use-timeline-data';
import { useI18n } from '@/lib/i18n';
import type { Task } from '@/lib/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_COL_WIDTH = 36;
const TASK_NAME_COL_WIDTH = 260;

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(base: Date, delta: number): Date {
  return new Date(base.getTime() + (delta * DAY_MS));
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
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [anchorDate, setAnchorDate] = useState(() => startOfDay(new Date()));

  const timelineWindow = useMemo(
    () => ({
      start: addDays(anchorDate, -7),
      end: addDays(anchorDate, 21),
    }),
    [anchorDate],
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
  const gridWidth = Math.max(1, days.length) * DAY_COL_WIDTH;

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
          <Button
            variant="outline"
            size="icon"
            aria-label={t('previousWindow')}
            onClick={() => setAnchorDate((current) => addDays(current, -7))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAnchorDate(startOfDay(new Date()))}
          >
            {t('today')}
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label={t('nextWindow')}
            onClick={() => setAnchorDate((current) => addDays(current, 7))}
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
          <Badge variant="secondary">{timeline.dependencyEdges.filter((edge) => filteredTaskIds.has(edge.source) && filteredTaskIds.has(edge.target)).length}</Badge>
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
          <div className="grid" style={{ gridTemplateColumns: `repeat(${days.length}, ${DAY_COL_WIDTH}px)` }}>
            {days.map((day) => (
              <div key={day.toISOString()} className="border-l px-1 py-1 text-center">
                <p className="text-[10px] text-muted-foreground">{formatWeekday(day)}</p>
                <p className="text-[10px] font-medium">{formatDay(day)}</p>
              </div>
            ))}
          </div>
        </div>

        {timeline.sections.map((section) => {
          const sectionTasks = filteredBySection[section.id] ?? [];
          if (!sectionTasks.length) return null;
          return (
            <div key={section.id} className="border-b last:border-b-0">
              <div className="grid border-b bg-muted/20" style={{ gridTemplateColumns: `${TASK_NAME_COL_WIDTH}px ${gridWidth}px` }}>
                <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.isDefault ? t('tasks') : section.name}
                </div>
                <div className="px-2 py-2 text-xs text-muted-foreground">
                  {sectionTasks.length} {t('tasks').toLowerCase()}
                </div>
              </div>

              {sectionTasks.map((task) => {
                const fallbackName = task.title.trim() || t('untitledTask');
                return (
                  <div
                    key={task.id}
                    className="grid border-b last:border-b-0"
                    style={{ gridTemplateColumns: `${TASK_NAME_COL_WIDTH}px ${gridWidth}px` }}
                  >
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button
                        type="button"
                        className="truncate text-left text-sm hover:underline"
                        onClick={() => setSelectedTaskId(task.id)}
                        data-testid={`timeline-task-${task.id}`}
                      >
                        {fallbackName}
                      </button>
                    </div>
                    <div className="relative h-10 border-l">
                      {task.hasSchedule && task.timelineStart && task.timelineEnd ? (
                        <button
                          type="button"
                          className="absolute top-1/2 h-6 -translate-y-1/2 rounded bg-primary/20 px-2 text-left text-[11px] text-primary hover:bg-primary/25"
                          style={{
                            left: `${Math.max(0, Math.floor((Math.max(task.timelineStart.getTime(), timeline.window.start.getTime()) - timeline.window.start.getTime()) / DAY_MS) * DAY_COL_WIDTH)}px`,
                            width: `${Math.max(1, (Math.floor((Math.min(task.timelineEnd.getTime(), timeline.window.end.getTime()) - Math.max(task.timelineStart.getTime(), timeline.window.start.getTime())) / DAY_MS) + 1) * DAY_COL_WIDTH)}px`,
                          }}
                          onClick={() => setSelectedTaskId(task.id)}
                          data-testid={`timeline-bar-${task.id}`}
                          title={`${task.timelineStart.toLocaleDateString()} - ${task.timelineEnd.toLocaleDateString()}`}
                        >
                          <span className="block truncate">{fallbackName}</span>
                        </button>
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
