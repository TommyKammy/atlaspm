'use client';

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Paperclip } from 'lucide-react';
import TaskDetailDrawer from '@/components/task-detail-drawer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, apiBaseUrl } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { ProjectMember, SectionTaskGroup, Task, TaskAttachment } from '@/lib/types';
import { useI18n } from '@/lib/i18n';

function flattenTasks(groups: SectionTaskGroup[]) {
  return groups.flatMap((group) => group.tasks.map((task) => ({ task, section: group.section })));
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

function moveTaskPreview(
  groups: SectionTaskGroup[],
  taskId: string,
  toSectionId: string,
  targetTaskId: string | null,
) {
  const cloned = groups.map((group) => ({ ...group, tasks: [...group.tasks] }));
  let movingTask: Task | null = null;

  for (const group of cloned) {
    const index = group.tasks.findIndex((task) => task.id === taskId);
    if (index >= 0) {
      movingTask = group.tasks[index] ?? null;
      group.tasks.splice(index, 1);
      break;
    }
  }

  if (!movingTask) return groups;

  const destination = cloned.find((group) => group.section.id === toSectionId);
  if (!destination) return groups;

  const insertAt = targetTaskId
    ? Math.max(destination.tasks.findIndex((task) => task.id === targetTaskId), 0)
    : destination.tasks.length;

  destination.tasks.splice(insertAt, 0, { ...movingTask, sectionId: toSectionId });
  return cloned;
}

function BoardTaskCard({
  task,
  onOpen,
}: {
  task: Task;
  onOpen: (taskId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: task.id,
    data: { sectionId: task.sectionId },
  });

  return (
    <button
      ref={setNodeRef as never}
      type="button"
      onClick={() => onOpen(task.id)}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid={`board-task-${task.id}`}
      data-task-title={task.title}
      className="w-full rounded-md border bg-background p-2 text-left transition-colors hover:bg-muted/60"
      {...attributes}
      {...listeners}
    >
      <p className="truncate text-sm font-medium">{task.title}</p>
      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>{task.status}</span>
      </div>
    </button>
  );
}

function BoardColumn({
  sectionId,
  children,
}: {
  sectionId: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `board-column-${sectionId}`,
    data: { sectionId },
  });

  return (
    <section
      ref={setNodeRef}
      data-testid={`board-column-${sectionId}`}
      className={`w-80 shrink-0 rounded-lg border bg-card ${isOver ? 'ring-1 ring-ring' : ''}`}
    >
      {children}
    </section>
  );
}

export function ProjectBoardView({
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
  const sensors = useSensors(useSensor(PointerSensor));
  const queryClient = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const groupsQuery = useQuery<SectionTaskGroup[]>({
    queryKey: queryKeys.projectTasksGrouped(projectId),
    queryFn: () => api(`/projects/${projectId}/tasks?groupBy=section`),
  });

  const createTask = useMutation({
    mutationFn: ({ sectionId, title }: { sectionId: string; title: string }) =>
      api(`/projects/${projectId}/tasks`, { method: 'POST', body: { sectionId, title } }) as Promise<Task>,
    onSuccess: (created) => {
      queryClient.setQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId), (current = []) =>
        current.map((group) =>
          group.section.id === created.sectionId
            ? { ...group, tasks: [created, ...group.tasks].sort((a, b) => a.position - b.position) }
            : group,
        ),
      );
    },
  });

  const reorderTask = useMutation({
    mutationFn: ({ taskId, toSectionId, beforeTaskId, afterTaskId }: { taskId: string; toSectionId: string; beforeTaskId: string | null; afterTaskId: string | null; }) =>
      api(`/sections/${toSectionId}/tasks/reorder`, { method: 'POST', body: { taskId, beforeTaskId, afterTaskId } }),
    onMutate: async ({ taskId, toSectionId, afterTaskId }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
      const previous = queryClient.getQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId));
      queryClient.setQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId), (current = []) =>
        moveTaskPreview(current, taskId, toSectionId, afterTaskId),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.projectTasksGrouped(projectId), context.previous);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
    },
  });

  const [draftBySection, setDraftBySection] = useState<Record<string, string>>({});
  const groups = groupsQuery.data ?? [];
  const filteredGroups = useMemo(
    () =>
      groups.map((group) => ({
        ...group,
        sectionLabel: group.section.isDefault ? t('tasks') : group.section.name,
        tasks: group.tasks.filter((task) => taskMatchesFilters(task, search, statusFilter, priorityFilter)),
      })),
    [groups, search, statusFilter, priorityFilter, t],
  );

  if (groupsQuery.isLoading) {
    return <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">{t('loadingBoard')}</div>;
  }

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeTaskId = String(active.id);
    const allTasks = groups.flatMap((group) => group.tasks);
    const activeTask = allTasks.find((task) => task.id === activeTaskId);
    if (!activeTask) return;

    const activeHasChildren = allTasks.some((task) => task.parentId === activeTaskId);
    if (activeTask.parentId || activeHasChildren) return;

    const overTaskId = String(over.id);
    const droppedOnSection = overTaskId.startsWith('board-column-');
    const overSectionIdFromId = droppedOnSection ? overTaskId.replace('board-column-', '') : '';
    const fallbackSectionId = groups.find((group) => group.tasks.some((task) => task.id === overTaskId))?.section.id ?? '';
    const toSectionId = String(over.data.current?.sectionId ?? overSectionIdFromId ?? fallbackSectionId);
    if (!toSectionId) return;

    const targetGroup = groups.find((group) => group.section.id === toSectionId);
    const targetTasks = targetGroup?.tasks ?? [];
    const overIndex = droppedOnSection ? -1 : targetTasks.findIndex((task) => task.id === overTaskId);
    const beforeTaskId = overIndex > 0 ? targetTasks[overIndex - 1]?.id ?? null : null;
    const afterTaskId = overIndex >= 0 ? targetTasks[overIndex]?.id ?? null : null;
    reorderTask.mutate({ taskId: activeTaskId, toSectionId, beforeTaskId, afterTaskId });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div className="space-y-4">
        <div className="flex gap-3 overflow-x-auto pb-1">
          {filteredGroups.map((group) => (
            <BoardColumn key={group.section.id} sectionId={group.section.id}>
              <header className="flex items-center justify-between border-b px-3 py-2">
                <h3 className="truncate text-sm font-medium">{group.sectionLabel}</h3>
                <Badge variant="secondary">{group.tasks.length}</Badge>
              </header>
              <div className="space-y-2 p-3">
                {group.tasks.length ? (
                  <SortableContext
                    items={group.tasks.map((task) => task.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {group.tasks.map((task) => (
                      <BoardTaskCard key={task.id} task={task} onOpen={setSelectedTaskId} />
                    ))}
                  </SortableContext>
                ) : (
                  <p className="text-xs text-muted-foreground">{t('noTasks')}</p>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <Input
                    placeholder={t('addTask')}
                    value={draftBySection[group.section.id] ?? ''}
                    onChange={(event) =>
                      setDraftBySection((current) => ({ ...current, [group.section.id]: event.target.value }))
                    }
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      const title = (draftBySection[group.section.id] ?? '').trim();
                      if (!title || createTask.isPending) return;
                      void createTask.mutateAsync({ sectionId: group.section.id, title }).then(() => {
                        setDraftBySection((current) => ({ ...current, [group.section.id]: '' }));
                      });
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      const title = (draftBySection[group.section.id] ?? '').trim();
                      if (!title || createTask.isPending) return;
                      void createTask.mutateAsync({ sectionId: group.section.id, title }).then(() => {
                        setDraftBySection((current) => ({ ...current, [group.section.id]: '' }));
                      });
                    }}
                  >
                    {t('add')}
                  </Button>
                </div>
              </div>
            </BoardColumn>
          ))}
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
    </DndContext>
  );
}

export function ProjectCalendarView({
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
  const queryClient = useQueryClient();
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dateField, setDateField] = useState<'dueAt' | 'startAt'>('dueAt');

  const groupsQuery = useQuery<SectionTaskGroup[]>({
    queryKey: queryKeys.projectTasksGrouped(projectId),
    queryFn: () => api(`/projects/${projectId}/tasks?groupBy=section`),
  });

  const patchTaskDate = useMutation({
    mutationFn: ({
      taskId,
      field,
      value,
      version,
    }: {
      taskId: string;
      field: 'dueAt' | 'startAt';
      value: string | null;
      version: number;
    }) =>
      api(`/tasks/${taskId}`, { method: 'PATCH', body: { [field]: value, version } }) as Promise<Task>,
    onMutate: async ({ taskId, field, value }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
      const previous = queryClient.getQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId));
      queryClient.setQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId), (current = []) =>
        current.map((group) => ({
          ...group,
          tasks: group.tasks.map((task) =>
            task.id === taskId ? { ...task, [field]: value, version: task.version + 1 } : task,
          ),
        })),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.projectTasksGrouped(projectId), context.previous);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
    },
  });

  const tasks = useMemo(() => {
    const rows = flattenTasks(groupsQuery.data ?? [])
      .map((row) => row.task)
      .filter((task) => taskMatchesFilters(task, search, statusFilter, priorityFilter));
    return rows;
  }, [groupsQuery.data, search, statusFilter, priorityFilter]);

  const datedTasks = tasks.filter((task) => (dateField === 'dueAt' ? task.dueAt : task.startAt));
  const noDateTasks = tasks.filter((task) => !(dateField === 'dueAt' ? task.dueAt : task.startAt));
  const year = monthAnchor.getFullYear();
  const month = monthAnchor.getMonth();
  const firstDay = new Date(year, month, 1);
  const offset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array.from({ length: 42 }).map((_, index) => {
    const day = index - offset + 1;
    if (day < 1 || day > daysInMonth) return null;
    const isoPrefix = new Date(year, month, day).toISOString().slice(0, 10);
    const dayTasks = datedTasks.filter((task) => {
      const value = dateField === 'dueAt' ? task.dueAt : task.startAt;
      return value ? String(value).slice(0, 10) === isoPrefix : false;
    });
    return { day, tasks: dayTasks, isoPrefix };
  });

  const allTasksById = new Map(tasks.map((task) => [task.id, task]));

  const updateTaskDate = (taskId: string, dateIso: string | null) => {
    const task = allTasksById.get(taskId);
    if (!task) return;
    const currentValue = dateField === 'dueAt' ? task.dueAt : task.startAt;
    const currentDate = currentValue ? String(currentValue).slice(0, 10) : null;
    const nextDate = dateIso ? dateIso.slice(0, 10) : null;
    if (currentDate === nextDate) return;
    patchTaskDate.mutate({
      taskId,
      field: dateField,
      value: dateIso ? `${dateIso}T00:00:00.000Z` : null,
      version: task.version,
    });
  };

  if (groupsQuery.isLoading) {
    return <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">{t('loadingCalendar')}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border bg-card p-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setMonthAnchor((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="text-sm font-semibold">
            {monthAnchor.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })}
          </h3>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setMonthAnchor((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={dateField === 'dueAt' ? 'default' : 'outline'}
            onClick={() => setDateField('dueAt')}
            data-testid="calendar-field-due"
          >
            {t('dueDate')}
          </Button>
          <Button
            size="sm"
            variant={dateField === 'startAt' ? 'default' : 'outline'}
            onClick={() => setDateField('startAt')}
            data-testid="calendar-field-start"
          >
            {t('startDate')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 text-xs text-muted-foreground">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
          <div key={label} className="px-2 py-1 font-medium">
            {label}
          </div>
        ))}
        {cells.map((cell, index) => (
          <div
            key={index}
            className="min-h-24 rounded-md border bg-card p-2"
            data-testid={cell ? `calendar-day-${cell.isoPrefix}` : undefined}
            onDragOver={(event) => {
              if (!cell) return;
              event.preventDefault();
            }}
            onDrop={(event) => {
              if (!cell) return;
              event.preventDefault();
              const taskId = event.dataTransfer.getData('text/task-id') || draggingTaskId;
              if (!taskId) return;
              updateTaskDate(taskId, cell.isoPrefix);
              setDraggingTaskId(null);
            }}
          >
            {cell ? (
              <>
                <p className="mb-1 text-xs font-medium">{cell.day}</p>
                <div className="space-y-1">
                  {cell.tasks.slice(0, 3).map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setSelectedTaskId(task.id)}
                      className="block w-full truncate rounded bg-muted px-1.5 py-1 text-left text-[11px] hover:bg-muted/80"
                      data-testid={`calendar-task-${task.id}`}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/task-id', task.id);
                        setDraggingTaskId(task.id);
                      }}
                      onDragEnd={() => setDraggingTaskId(null)}
                    >
                      {task.title}
                    </button>
                  ))}
                  {cell.tasks.length > 3 ? (
                    <p className="text-[11px] text-muted-foreground">+{cell.tasks.length - 3} more</p>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        ))}
      </div>

      <section
        className="rounded-lg border bg-card p-3"
        data-testid={dateField === 'dueAt' ? 'calendar-no-due' : 'calendar-no-start'}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const taskId = event.dataTransfer.getData('text/task-id') || draggingTaskId;
          if (!taskId) return;
          updateTaskDate(taskId, null);
          setDraggingTaskId(null);
        }}
      >
        <h4 className="mb-2 text-sm font-medium">
          {dateField === 'dueAt' ? t('noDueDate') : t('noStartDate')}
        </h4>
        {!noDateTasks.length ? (
          <p className="text-xs text-muted-foreground">
            {dateField === 'dueAt' ? t('allTasksHaveDueDates') : t('allTasksHaveStartDates')}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {noDateTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => setSelectedTaskId(task.id)}
                className="rounded-full border px-2 py-1 text-xs hover:bg-muted/60"
                draggable
                data-testid={dateField === 'dueAt' ? `calendar-no-due-task-${task.id}` : `calendar-no-start-task-${task.id}`}
                onDragStart={(event) => {
                  event.dataTransfer.setData('text/task-id', task.id);
                  setDraggingTaskId(task.id);
                }}
                onDragEnd={() => setDraggingTaskId(null)}
              >
                {task.title}
              </button>
            ))}
          </div>
        )}
      </section>

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

type AttachmentRow = TaskAttachment & {
  taskId: string;
  taskTitle: string;
  sectionName: string;
  status: Task['status'];
  priority?: Task['priority'] | null;
};

export function ProjectFilesView({
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
  const [mimeFilter, setMimeFilter] = useState<'ALL' | 'IMAGE' | 'OTHER'>('ALL');
  const [uploaderFilter, setUploaderFilter] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'LAST_7_DAYS' | 'LAST_30_DAYS'>('ALL');
  const [showDeleted, setShowDeleted] = useState(false);
  const queryClient = useQueryClient();
  const groupsQuery = useQuery<SectionTaskGroup[]>({
    queryKey: queryKeys.projectTasksGrouped(projectId),
    queryFn: () => api(`/projects/${projectId}/tasks?groupBy=section`),
  });
  const membersQuery = useQuery<ProjectMember[]>({
    queryKey: queryKeys.projectMembers(projectId),
    queryFn: () => api(`/projects/${projectId}/members`),
  });
  const uploaderMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of membersQuery.data ?? []) {
      map.set(member.userId, member.user.displayName || member.user.email || member.user.id);
    }
    return map;
  }, [membersQuery.data]);

  const allTaskRows = useMemo(() => flattenTasks(groupsQuery.data ?? []), [groupsQuery.data]);
  const filteredTaskRows = allTaskRows.filter((row) =>
    taskMatchesFilters(row.task, search, statusFilter, priorityFilter),
  );

  const attachmentQueries = useQueries({
    queries: filteredTaskRows.map((row) => ({
      queryKey: queryKeys.taskAttachments(row.task.id, { includeDeleted: showDeleted }),
      queryFn: () =>
        api(`/tasks/${row.task.id}/attachments${showDeleted ? '?includeDeleted=true' : ''}`) as Promise<TaskAttachment[]>,
      staleTime: 60_000,
    })),
  });

  const refreshAttachments = async () => {
    await queryClient.invalidateQueries({
      predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'task' && query.queryKey[2] === 'attachments',
    });
  };

  const deleteAttachment = useMutation({
    mutationFn: (attachmentId: string) => api(`/attachments/${attachmentId}`, { method: 'DELETE' }),
    onSuccess: refreshAttachments,
  });

  const restoreAttachment = useMutation({
    mutationFn: (attachmentId: string) => api(`/attachments/${attachmentId}/restore`, { method: 'POST' }),
    onSuccess: refreshAttachments,
  });

  const loadingAttachments = attachmentQueries.some((query) => query.isLoading);

  const files = useMemo(() => {
    const rows: AttachmentRow[] = [];
    filteredTaskRows.forEach((row, index) => {
      const attachments = attachmentQueries[index]?.data ?? [];
      attachments.forEach((attachment) => {
        rows.push({
          ...attachment,
          taskId: row.task.id,
          taskTitle: row.task.title,
          sectionName: row.section.isDefault ? t('tasks') : row.section.name,
          status: row.task.status,
          priority: row.task.priority,
        });
      });
    });
    const filtered = rows.filter((file) => {
      if (mimeFilter === 'IMAGE' && !file.mimeType.startsWith('image/')) return false;
      if (mimeFilter === 'OTHER' && file.mimeType.startsWith('image/')) return false;
      if (uploaderFilter !== 'ALL' && file.uploaderUserId !== uploaderFilter) return false;
      if (dateFilter !== 'ALL') {
        const now = Date.now();
        const created = +new Date(file.createdAt);
        const dayMs = 24 * 60 * 60 * 1000;
        const threshold = dateFilter === 'LAST_7_DAYS' ? now - (7 * dayMs) : now - (30 * dayMs);
        if (created < threshold) return false;
      }
      return true;
    });
    return filtered.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [attachmentQueries, filteredTaskRows, t, mimeFilter, uploaderFilter, dateFilter]);

  if (groupsQuery.isLoading || loadingAttachments) {
    return <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">{t('loadingFiles')}</div>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-card">
        <header className="flex items-center justify-between border-b px-4 py-2">
          <h3 className="text-sm font-medium">{t('projectFiles')}</h3>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{files.length}</Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowDeleted((current) => !current)}
              data-testid="files-toggle-deleted"
            >
              {showDeleted ? t('hideDeletedFiles') : t('showDeletedFiles')}
            </Button>
          </div>
        </header>
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
          <select
            className="h-8 rounded-md border bg-background px-2 text-xs"
            value={mimeFilter}
            onChange={(event) => setMimeFilter(event.target.value as 'ALL' | 'IMAGE' | 'OTHER')}
            data-testid="files-mime-filter"
          >
            <option value="ALL">{t('allFiles')}</option>
            <option value="IMAGE">{t('imageFiles')}</option>
            <option value="OTHER">{t('otherFiles')}</option>
          </select>
          <select
            className="h-8 rounded-md border bg-background px-2 text-xs"
            value={uploaderFilter}
            onChange={(event) => setUploaderFilter(event.target.value)}
            data-testid="files-uploader-filter"
          >
            <option value="ALL">{t('allUploaders')}</option>
            {(membersQuery.data ?? []).map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.user.displayName || member.user.email || member.user.id}
              </option>
            ))}
          </select>
          <select
            className="h-8 rounded-md border bg-background px-2 text-xs"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value as 'ALL' | 'LAST_7_DAYS' | 'LAST_30_DAYS')}
            data-testid="files-date-filter"
          >
            <option value="ALL">{t('allDates')}</option>
            <option value="LAST_7_DAYS">{t('last7Days')}</option>
            <option value="LAST_30_DAYS">{t('last30Days')}</option>
          </select>
        </div>
        {!files.length ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            <Paperclip className="mx-auto mb-2 h-5 w-5" />
            {t('noFilesYet')}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('file')}</TableHead>
                <TableHead>{t('task')}</TableHead>
                <TableHead>{t('section')}</TableHead>
                <TableHead>{t('uploader')}</TableHead>
                <TableHead>{t('status')}</TableHead>
                <TableHead>{t('added')}</TableHead>
                <TableHead>{t('actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => (
                <TableRow
                  key={file.id}
                  className={file.deletedAt ? 'opacity-70' : ''}
                  data-testid={`file-row-${file.id}`}
                >
                  <TableCell>
                    <a
                      href={`${apiBaseUrl}${file.url}`}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-sm hover:underline"
                    >
                      {file.fileName}
                    </a>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="truncate text-left text-sm hover:underline"
                      onClick={() => setSelectedTaskId(file.taskId)}
                      data-testid={`file-task-${file.taskId}`}
                    >
                      {file.taskTitle}
                    </button>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{file.sectionName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {uploaderMap.get(file.uploaderUserId) || file.uploaderUserId}
                  </TableCell>
                  <TableCell className="text-sm">{file.deletedAt ? t('fileDeleted') : file.status}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(file.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm">
                    {file.deletedAt ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => restoreAttachment.mutate(file.id)}
                        disabled={restoreAttachment.isPending}
                        data-testid={`file-restore-${file.id}`}
                      >
                        {t('restore')}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => deleteAttachment.mutate(file.id)}
                        disabled={deleteAttachment.isPending}
                        data-testid={`file-delete-${file.id}`}
                      >
                        {t('delete')}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

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
