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
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronRight, Plus, Trash2, User } from 'lucide-react';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { ProjectMember, SectionTaskGroup, Task } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import TaskDetailDrawer from '@/components/task-detail-drawer';
import { useI18n } from '@/lib/i18n';

function sortByPosition(tasks: Task[]) {
  return [...tasks].sort((a, b) => a.position - b.position);
}

function removeTaskFromGroups(groups: SectionTaskGroup[], taskId: string) {
  return groups.map((group) => ({
    ...group,
    tasks: group.tasks.filter((task) => task.id !== taskId),
  }));
}

function upsertTaskInSection(groups: SectionTaskGroup[], sectionId: string, task: Task) {
  return groups.map((group) => {
    if (group.section.id !== sectionId) return group;
    const nextTasks = sortByPosition([task, ...group.tasks.filter((item) => item.id !== task.id)]);
    return { ...group, tasks: nextTasks };
  });
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

function resolveAssigneeLabel(task: Task, members: ProjectMember[]) {
  if (!task.assigneeUserId) return 'unassigned';
  const member = members.find((item) => item.userId === task.assigneeUserId);
  if (!member) return task.assigneeUserId;
  return member.user.displayName || member.user.email || member.userId;
}

function initials(label: string) {
  const pieces = label.trim().split(/\s+/).slice(0, 2);
  return pieces.map((piece) => piece.charAt(0).toUpperCase()).join('') || 'U';
}

type TaskTreeNode = {
  task: Task;
  children: TaskTreeNode[];
};

type UndoDeleteState = {
  taskId: string;
  title: string;
};

type DeleteTaskResponse = {
  success: boolean;
  deletedCount: number;
  taskIds: string[];
};

function buildSectionTaskTree(tasks: Task[]): TaskTreeNode[] {
  const byId = new Map<string, TaskTreeNode>();
  for (const task of tasks) byId.set(task.id, { task, children: [] });

  const roots: TaskTreeNode[] = [];
  for (const task of tasks) {
    const node = byId.get(task.id);
    if (!node) continue;
    const parentId = task.parentId;
    if (!parentId) {
      roots.push(node);
      continue;
    }
    const parentNode = byId.get(parentId);
    if (!parentNode) {
      roots.push(node);
      continue;
    }
    parentNode.children.push(node);
  }

  const sortNodes = (nodes: TaskTreeNode[]) => {
    nodes.sort((a, b) => a.task.position - b.task.position);
    for (const node of nodes) sortNodes(node.children);
  };
  sortNodes(roots);
  return roots;
}

function flattenVisibleTasks(nodes: TaskTreeNode[], collapsedTaskIds: Set<string>, depth = 0): Array<{ task: Task; depth: number; hasChildren: boolean }> {
  const rows: Array<{ task: Task; depth: number; hasChildren: boolean }> = [];
  for (const node of nodes) {
    const hasChildren = node.children.length > 0;
    rows.push({ task: node.task, depth, hasChildren });
    if (hasChildren && !collapsedTaskIds.has(node.task.id)) {
      rows.push(...flattenVisibleTasks(node.children, collapsedTaskIds, depth + 1));
    }
  }
  return rows;
}

function ProgressBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="w-full space-y-1">
      <div className="h-1 w-full overflow-hidden rounded bg-muted">
        <div
          className={cn('h-full rounded transition-all', clamped >= 100 ? 'bg-green-500' : 'bg-primary')}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">{clamped}%</p>
    </div>
  );
}

function AssigneeCombobox({
  task,
  members,
  onSelect,
}: {
  task: Task;
  members: ProjectMember[];
  onSelect: (assigneeUserId: string | null) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const selected = resolveAssigneeLabel(task, members);
  const selectedLabel = selected === 'unassigned' ? t('unassigned') : selected;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                data-testid={`assignee-trigger-${task.id}`}
                className="h-6 w-6 rounded-full border"
              >
                {selected === 'unassigned' ? <Plus className="h-3 w-3" /> : <span className="text-[10px]">{initials(selectedLabel)}</span>}
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{selectedLabel}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={`${t('assignee')}...`} data-testid={`assignee-search-${task.id}`} />
          <CommandList>
            <CommandEmpty>No members found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="unassigned"
                onSelect={() => {
                  onSelect(null);
                  setOpen(false);
                }}
              >
                <User className="h-4 w-4" />
                <span>{t('unassigned')}</span>
              </CommandItem>
              {members.map((member) => {
                const label = member.user.displayName || member.user.email || member.user.id;
                return (
                  <CommandItem
                    key={member.id}
                    value={`${label} ${member.user.email ?? ''}`}
                    data-testid={`assignee-option-${task.id}-${member.userId}`}
                    onSelect={() => {
                      onSelect(member.userId);
                      setOpen(false);
                    }}
                  >
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px]">
                      {initials(label)}
                    </span>
                    <span className="flex-1 truncate">{label}</span>
                    {task.assigneeUserId === member.userId ? <Check className="h-4 w-4" /> : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function TaskRow({
  task,
  sectionId,
  onEdit,
  members,
  onOpen,
  projectName,
  depth,
  hasChildren,
  collapsed,
  onToggleCollapse,
  draggable,
  onDelete,
}: {
  task: Task;
  sectionId: string;
  onEdit: (taskId: string, patch: Partial<Task> & { version: number }) => void;
  members: ProjectMember[];
  onOpen: (taskId: string) => void;
  projectName: string;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
  onToggleCollapse: (taskId: string) => void;
  draggable: boolean;
  onDelete: (taskId: string) => void;
}) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: task.id,
    data: { sectionId },
    disabled: !draggable,
  });

  return (
    <tr
      ref={setNodeRef as never}
      style={{ transform: CSS.Transform.toString(transform), transition: transition || 'transform 150ms ease' }}
      className="h-11 border-b transition-colors hover:bg-muted/60"
      data-testid={`task-${task.id}`}
      data-task-title={task.title}
    >
      <TableCell>
        <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 16}px` }}>
          <button
            type="button"
            className={cn(
              'inline-flex h-6 w-6 items-center justify-center rounded border text-muted-foreground',
              hasChildren ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            onClick={(event) => {
              event.stopPropagation();
              if (hasChildren) onToggleCollapse(task.id);
            }}
            aria-label={collapsed ? `Expand ${task.title}` : `Collapse ${task.title}`}
            data-testid={`task-collapse-${task.id}`}
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <button
            className={cn(
              'rounded-sm border px-1.5 py-0.5 text-[11px] text-muted-foreground',
              draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-not-allowed opacity-50',
            )}
            data-testid={`drag-handle-${task.id}`}
            aria-label={`Drag ${task.title}`}
            type="button"
            {...(draggable ? attributes : {})}
            {...(draggable ? listeners : {})}
            title={draggable ? t('dragToReorder') : t('nestedTasksCannotBeDragged')}
          >
            Drag
          </button>
          <button
            type="button"
            className="truncate text-left text-sm hover:underline"
            onClick={() => onOpen(task.id)}
            data-testid={`open-task-${task.id}`}
          >
            {task.title.trim() || t('untitledTask')}
          </button>
        </div>
      </TableCell>
      <TableCell>
        <AssigneeCombobox
          task={task}
          members={members}
          onSelect={(assigneeUserId) => onEdit(task.id, { assigneeUserId, version: task.version })}
        />
      </TableCell>
      <TableCell>
        <Input
          type="date"
          value={task.dueAt ? String(task.dueAt).slice(0, 10) : ''}
          onChange={(e) =>
            onEdit(task.id, {
              dueAt: e.target.value ? new Date(e.target.value).toISOString() : null,
              version: task.version,
            })
          }
          className="h-8"
        />
      </TableCell>
      <TableCell>
        <div className="space-y-1">
          <Input
            type="number"
            min={0}
            max={100}
            value={task.progressPercent}
            onChange={(e) => onEdit(task.id, { progressPercent: Number(e.target.value), version: task.version })}
            className="h-8"
          />
          <ProgressBar value={task.progressPercent} />
        </div>
      </TableCell>
      <TableCell>
        <select
          className="h-8 w-full rounded-md border bg-background px-2 text-xs"
          value={task.status}
          onChange={(e) => onEdit(task.id, { status: e.target.value as Task['status'], version: task.version })}
        >
          <option value="TODO">TODO</option>
          <option value="IN_PROGRESS">IN_PROGRESS</option>
          <option value="DONE">DONE</option>
          <option value="BLOCKED">BLOCKED</option>
        </select>
      </TableCell>
      <TableCell>
        <Badge variant="secondary" className="max-w-40 truncate">
          {projectName}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">-</TableCell>
      <TableCell className="text-xs text-muted-foreground">{t('private')}</TableCell>
      <TableCell>
        {task.assigneeUserId ? (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border text-[10px]">
            {initials(resolveAssigneeLabel(task, members))}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          data-testid={`delete-task-${task.id}`}
          onClick={(event) => {
            event.stopPropagation();
            onDelete(task.id);
          }}
          aria-label={t('deleteTask')}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </tr>
  );
}

function QuickAddTask({
  sectionId,
  onCreate,
}: {
  sectionId: string;
  onCreate: (sectionId: string, title: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    await onCreate(sectionId, trimmed);
    setTitle('');
    inputRef.current?.focus();
  };

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        data-testid={`quick-add-open-${sectionId}`}
        className="justify-start px-0 text-muted-foreground"
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        + {t('addTask')}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 py-2">
      <Input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void submit();
          }
          if (e.key === 'Escape') {
            setOpen(false);
            setTitle('');
          }
        }}
        placeholder={t('taskName')}
        data-testid={`quick-add-input-${sectionId}`}
      />
      <Button size="sm" data-testid={`quick-add-submit-${sectionId}`} onClick={() => void submit()}>
        {t('add')}
      </Button>
    </div>
  );
}

function SectionDropTarget({
  sectionId,
  children,
  frameless = false,
}: {
  sectionId: string;
  children: ReactNode;
  frameless?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `section-drop-${sectionId}`, data: { sectionId } });

  return (
    <section
      ref={setNodeRef}
      data-testid={`section-${sectionId}`}
      className={cn(
        frameless ? 'bg-transparent' : 'rounded-lg border bg-card',
        isOver && 'ring-1 ring-ring',
      )}
    >
      {children}
    </section>
  );
}

function SectionDropZone({ sectionId }: { sectionId: string }) {
  const { t } = useI18n();
  const { setNodeRef, isOver } = useDroppable({ id: `section-drop-zone-${sectionId}`, data: { sectionId } });

  return (
    <div
      ref={setNodeRef}
      data-testid={`section-drop-zone-${sectionId}`}
      className={cn('rounded-md border border-dashed px-2 py-1 text-[11px] text-muted-foreground', isOver && 'border-ring text-foreground')}
    >
      {t('dropTasksHere')}
    </div>
  );
}

export default function ProjectBoard({
  projectId,
  projectName = 'Project',
  search,
  statusFilter,
  priorityFilter,
}: {
  projectId: string;
  projectName?: string;
  search: string;
  statusFilter: 'ALL' | Task['status'];
  priorityFilter: 'ALL' | NonNullable<Task['priority']>;
}) {
  const { t } = useI18n();
  const sensors = useSensors(useSensor(PointerSensor));
  const queryClient = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(new Set());
  const [undoDelete, setUndoDelete] = useState<UndoDeleteState | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  const groupsQuery = useQuery<SectionTaskGroup[]>({
    queryKey: queryKeys.projectTasksGrouped(projectId),
    queryFn: () => api(`/projects/${projectId}/tasks?groupBy=section`),
  });

  const membersQuery = useQuery<ProjectMember[]>({
    queryKey: queryKeys.projectMembers(projectId),
    queryFn: () => api(`/projects/${projectId}/members`),
  });

  const patchTask = useMutation({
    mutationFn: ({ taskId, patch }: { taskId: string; patch: Partial<Task> & { version: number } }) =>
      api(`/tasks/${taskId}`, { method: 'PATCH', body: patch }) as Promise<Task>,
    onMutate: async ({ taskId, patch }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
      const previous = queryClient.getQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId));
      queryClient.setQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId), (current = []) =>
        current.map((group) => ({
          ...group,
          tasks: group.tasks.map((task) =>
            task.id === taskId ? { ...task, ...patch, version: task.version + 1 } : task,
          ),
        })),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.projectTasksGrouped(projectId), context.previous);
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId), (current = []) => {
        const removed = removeTaskFromGroups(current, updated.id);
        return upsertTaskInSection(removed, updated.sectionId, updated);
      });
    },
  });

  const createTask = useMutation({
    mutationFn: ({ sectionId, title }: { sectionId: string; title: string }) =>
      api(`/projects/${projectId}/tasks`, { method: 'POST', body: { sectionId, title } }) as Promise<Task>,
    onSuccess: (created) => {
      queryClient.setQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId), (current = []) => {
        const removed = removeTaskFromGroups(current, created.id);
        return upsertTaskInSection(removed, created.sectionId, created);
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.projectSections(projectId) });
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

  const deleteTask = useMutation({
    mutationFn: (taskId: string) => api(`/tasks/${taskId}`, { method: 'DELETE' }) as Promise<DeleteTaskResponse>,
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
      const previous = queryClient.getQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId));
      const deletedTask =
        previous?.flatMap((group) => group.tasks).find((task) => task.id === taskId) ?? null;
      queryClient.setQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId), (current = []) =>
        current.map((group) => ({
          ...group,
          tasks: group.tasks.filter((task) => task.id !== taskId),
        })),
      );
      if (selectedTaskId === taskId) setSelectedTaskId(null);
      return { previous, deletedTask };
    },
    onError: (_error, _taskId, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.projectTasksGrouped(projectId), context.previous);
    },
    onSuccess: (_result, taskId, context) => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
      setUndoDelete({
        taskId,
        title: context?.deletedTask?.title.trim() || t('untitledTask'),
      });
      undoTimerRef.current = setTimeout(() => {
        setUndoDelete(null);
      }, 10000);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksDeletedGrouped(projectId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectSections(projectId) });
    },
  });

  const restoreTask = useMutation({
    mutationFn: (taskId: string) => api(`/tasks/${taskId}/restore`, { method: 'POST' }) as Promise<Task>,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksDeletedGrouped(projectId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectSections(projectId) });
      setUndoDelete(null);
    },
  });

  const groups = groupsQuery.data ?? [];
  const members = membersQuery.data ?? [];

  const filteredGroups = useMemo(() => {
    return groups.map((group) => ({
      ...group,
      tasks: group.tasks.filter((task) => {
        const bySearch = !search.trim() || task.title.toLowerCase().includes(search.trim().toLowerCase());
        const byStatus = statusFilter === 'ALL' || task.status === statusFilter;
        const byPriority = priorityFilter === 'ALL' || task.priority === priorityFilter;
        return bySearch && byStatus && byPriority;
      }),
    }));
  }, [groups, search, statusFilter, priorityFilter]);

  const groupedVisibleRows = useMemo(() => {
    return filteredGroups.map((group) => {
      const tree = buildSectionTaskTree(group.tasks);
      const rows = flattenVisibleTasks(tree, collapsedTaskIds);
      return { group, rows };
    });
  }, [filteredGroups, collapsedTaskIds]);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeTaskId = String(active.id);
    const activeTask = groups.flatMap((group) => group.tasks).find((task) => task.id === activeTaskId);
    if (!activeTask) return;
    const activeHasChildren = groups.some((group) => group.tasks.some((task) => task.parentId === activeTaskId));
    if (activeTask.parentId || activeHasChildren) return;

    const overTaskId = String(over.id);
    const droppedOnSection = overTaskId.startsWith('section-drop-') || overTaskId.startsWith('section-drop-zone-');
    const overSectionIdFromId = overTaskId.startsWith('section-drop-zone-')
      ? overTaskId.replace('section-drop-zone-', '')
      : overTaskId.startsWith('section-drop-')
        ? overTaskId.replace('section-drop-', '')
        : '';
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

  const onEdit = (taskId: string, patch: Partial<Task> & { version: number }) => {
    const groupsSnapshot = queryClient.getQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId)) ?? [];
    const cachedTask = groupsSnapshot.flatMap((group) => group.tasks).find((task) => task.id === taskId);
    const nextPatch = { ...patch, version: cachedTask?.version ?? patch.version };
    patchTask.mutate({ taskId, patch: nextPatch });
  };

  if (groupsQuery.isLoading) {
    return <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">{t('loadingTasks')}</div>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div className="space-y-4">
        {groupedVisibleRows.map(({ group, rows }) => {
          const isNoSection = group.section.isDefault || group.section.name.toLowerCase() === 'no section';
          return (
          <SectionDropTarget key={group.section.id} sectionId={group.section.id} frameless={isNoSection}>
            {!isNoSection ? (
              <header className="flex items-center justify-between border-b px-4 py-2">
                <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground">{group.section.name}</h3>
                <Badge>{group.tasks.length}</Badge>
              </header>
            ) : null}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('name')}</TableHead>
                  <TableHead>{t('assignee')}</TableHead>
                  <TableHead>{t('dueDate')}</TableHead>
                  <TableHead>{t('progress')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead>{t('projects')}</TableHead>
                  <TableHead>{t('dependencies')}</TableHead>
                  <TableHead>{t('visibility')}</TableHead>
                  <TableHead>{t('collaborators')}</TableHead>
                  <TableHead>{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <SortableContext items={rows.map((row) => row.task.id)} strategy={verticalListSortingStrategy}>
                  {rows.map((row) => (
                    <TaskRow
                      key={row.task.id}
                      task={row.task}
                      sectionId={group.section.id}
                      onEdit={onEdit}
                      members={members}
                      onOpen={setSelectedTaskId}
                      projectName={projectName}
                      depth={row.depth}
                      hasChildren={row.hasChildren}
                      collapsed={collapsedTaskIds.has(row.task.id)}
                      draggable={!row.task.parentId && !row.hasChildren}
                      onDelete={(taskId) => deleteTask.mutate(taskId)}
                      onToggleCollapse={(taskId) => {
                        setCollapsedTaskIds((current) => {
                          const next = new Set(current);
                          if (next.has(taskId)) next.delete(taskId);
                          else next.add(taskId);
                          return next;
                        });
                      }}
                    />
                  ))}
                </SortableContext>
              </TableBody>
            </Table>

            {!group.tasks.length ? (
              <div className="px-4 py-3 text-sm text-muted-foreground" data-testid={`empty-section-${group.section.id}`}>
                {t('noTasksInSection')}
              </div>
            ) : null}

            <div className={cn('space-y-2 px-4 py-2', !isNoSection && 'border-t')}>
              <SectionDropZone sectionId={group.section.id} />
              <QuickAddTask
                sectionId={group.section.id}
                onCreate={async (sectionId, title) => {
                  await createTask.mutateAsync({ sectionId, title });
                }}
              />
            </div>
          </SectionDropTarget>
        )})}

        {!filteredGroups.length ? (
          <div className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
            {t('noSectionsYet')}
          </div>
        ) : null}

        {undoDelete ? (
          <div
            className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm shadow-md"
            data-testid="delete-undo-banner"
          >
            <span>
              {t('taskDeletedLabel')}: {undoDelete.title}
            </span>
            <Button
              size="sm"
              variant="outline"
              data-testid="delete-undo-action"
              disabled={restoreTask.isPending}
              onClick={() => {
                if (undoTimerRef.current) {
                  clearTimeout(undoTimerRef.current);
                }
                restoreTask.mutate(undoDelete.taskId);
              }}
            >
              {restoreTask.isPending ? t('restoring') : t('undo')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              data-testid="delete-undo-dismiss"
              onClick={() => {
                if (undoTimerRef.current) {
                  clearTimeout(undoTimerRef.current);
                }
                setUndoDelete(null);
              }}
            >
              {t('dismiss')}
            </Button>
          </div>
        ) : null}

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
