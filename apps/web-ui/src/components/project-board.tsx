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
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Calendar, Check, ChevronDown, ChevronRight, Circle, ExternalLink, Plus, Trash2, User } from 'lucide-react';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { ProjectMember, Section, SectionTaskGroup, Task } from '@/lib/types';
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
    <div className="w-full">
      <div className="h-[3px] w-full overflow-hidden rounded bg-muted">
        <div
          className={cn('h-full rounded transition-all', clamped >= 100 ? 'bg-green-500' : 'bg-primary')}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

const statusBadgeClass: Record<Task['status'], string> = {
  TODO: 'bg-slate-100/80 text-slate-600',
  IN_PROGRESS: 'bg-sky-100/70 text-sky-700',
  DONE: 'bg-emerald-100/80 text-emerald-700',
  BLOCKED: 'bg-rose-100/80 text-rose-700',
};

const BOARD_COLUMNS = [
  { key: 'name', defaultWidth: 420, minWidth: 260 },
  { key: 'assignee', defaultWidth: 220, minWidth: 150 },
  { key: 'dueDate', defaultWidth: 240, minWidth: 180 },
  { key: 'progress', defaultWidth: 190, minWidth: 140 },
  { key: 'status', defaultWidth: 200, minWidth: 140 },
  { key: 'projects', defaultWidth: 130, minWidth: 100 },
  { key: 'dependencies', defaultWidth: 110, minWidth: 90 },
  { key: 'visibility', defaultWidth: 130, minWidth: 100 },
  { key: 'collaborators', defaultWidth: 130, minWidth: 100 },
  { key: 'actions', defaultWidth: 88, minWidth: 72 },
] as const;

type BoardColumnKey = (typeof BOARD_COLUMNS)[number]['key'];
type BoardColumnWidths = Record<BoardColumnKey, number>;

const BOARD_DEFAULT_COLUMN_WIDTHS: BoardColumnWidths = BOARD_COLUMNS.reduce((acc, column) => {
  acc[column.key] = column.defaultWidth;
  return acc;
}, {} as BoardColumnWidths);

const BOARD_MIN_COLUMN_WIDTHS: BoardColumnWidths = BOARD_COLUMNS.reduce((acc, column) => {
  acc[column.key] = column.minWidth;
  return acc;
}, {} as BoardColumnWidths);

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
                data-testid={`assignee-trigger-${task.id}`}
                className="h-7 max-w-full justify-start gap-2 rounded-md border-0 px-1.5 hover:bg-muted/40"
              >
                {selected === 'unassigned' ? (
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-dashed text-[10px] text-muted-foreground">
                    <Plus className="h-3 w-3" />
                  </span>
                ) : (
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px]">
                    {initials(selectedLabel)}
                  </span>
                )}
                <span className="truncate text-xs">{selectedLabel}</span>
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

function toDateInputValue(value?: string | null) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function toIsoDateValue(value: string) {
  if (!value) return null;
  return `${value}T00:00:00.000Z`;
}

function formatCompactDate(value: string, currentYear: number) {
  if (!value) return '';
  const [year, month, day] = value.split('-').map((part) => Number(part));
  if (!year || !month || !day) return value;
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return year === currentYear ? `${mm}/${dd}` : `${year}/${mm}/${dd}`;
}

function CompactDateField({
  value,
  onCommit,
  testId,
  ariaLabel,
}: {
  value?: string | null | undefined;
  onCommit: (next: string | null) => void;
  testId: string;
  ariaLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dateValue = toDateInputValue(value);
  const displayValue = formatCompactDate(dateValue, new Date().getFullYear());

  useEffect(() => {
    if (!editing) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.showPicker?.();
  }, [editing]);

  if (editing) {
    return (
      <Input
        ref={inputRef}
        type="date"
        value={dateValue}
        data-no-dnd="true"
        onPointerDown={(event) => event.stopPropagation()}
        onChange={(event) => {
          onCommit(toIsoDateValue(event.target.value));
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' || event.key === 'Enter') {
            event.preventDefault();
            setEditing(false);
          }
        }}
        className="h-7 border-0 bg-transparent px-2 text-[11px] shadow-none hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-0"
        aria-label={ariaLabel}
        data-testid={testId}
      />
    );
  }

  return (
    <button
      type="button"
      data-no-dnd="true"
      data-testid={testId}
      aria-label={ariaLabel}
      className={cn(
        'flex h-7 w-full items-center rounded px-2 text-left text-[11px] hover:bg-muted/40',
        displayValue ? 'justify-between gap-1' : 'justify-center',
      )}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        setEditing(true);
      }}
    >
      {displayValue ? <span className="truncate">{displayValue}</span> : null}
      <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </button>
  );
}

function TaskRow({
  task,
  sectionId,
  onEdit,
  onToggleDone,
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
  onToggleDone: (task: Task) => void;
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
  const isDone = task.status === 'DONE';
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);

  useEffect(() => {
    if (!isEditingTitle) {
      setTitleDraft(task.title);
    }
  }, [isEditingTitle, task.title]);

  const saveTitle = () => {
    const next = titleDraft;
    if (next === task.title) {
      setIsEditingTitle(false);
      return;
    }
    onEdit(task.id, { title: next, version: task.version });
    setIsEditingTitle(false);
  };

  return (
    <tr
      ref={setNodeRef as never}
      style={{ transform: CSS.Transform.toString(transform), transition: transition || 'transform 150ms ease' }}
      className={cn(
        'group h-9 border-b border-[#f0f0f0] transition-colors hover:bg-muted/35 dark:border-border/40',
        draggable && 'cursor-grab active:cursor-grabbing',
        isDone && 'opacity-50',
      )}
      data-testid={`task-${task.id}`}
      data-task-title={task.title}
      {...(draggable ? attributes : {})}
      {...(draggable ? listeners : {})}
      onPointerDownCapture={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('button,input,select,textarea,a,[data-no-dnd="true"]')) {
          event.stopPropagation();
        }
      }}
    >
      <TableCell>
        <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 16}px` }}>
          <button
            type="button"
            className={cn(
              'inline-flex h-5 w-5 items-center justify-center rounded border text-muted-foreground',
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
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className={cn(
                'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                isDone ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-muted-foreground/40 text-muted-foreground',
              )}
              data-testid={`task-complete-${task.id}`}
              aria-label={isDone ? `Reopen ${task.title}` : `Complete ${task.title}`}
              onClick={() => onToggleDone(task)}
            >
              {isDone ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
            </button>
            {isEditingTitle ? (
            <Input
              autoFocus
              value={titleDraft}
              data-no-dnd="true"
              data-testid={`task-title-input-${task.id}`}
              className={cn(
                'h-7 border-0 bg-transparent px-1 text-sm font-medium shadow-none hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-0',
                isDone && 'line-through',
              )}
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={saveTitle}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  saveTitle();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  setTitleDraft(task.title);
                  setIsEditingTitle(false);
                }
              }}
            />
            ) : (
              <button
                type="button"
                data-no-dnd="true"
                className={cn(
                  'truncate text-left text-sm font-medium hover:underline',
                  isDone && 'line-through',
                )}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  setIsEditingTitle(true);
                }}
                data-testid={`task-title-label-${task.id}`}
              >
                {task.title.trim() || t('untitledTask')}
              </button>
            )}
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            data-no-dnd="true"
            className="h-6 w-6 opacity-60 transition-opacity hover:opacity-100"
            data-testid={`open-task-${task.id}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onOpen(task.id);
            }}
            aria-label={t('openTask')}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
      <TableCell className="border-l border-[#f0f0f0] dark:border-border/40">
        <AssigneeCombobox
          task={task}
          members={members}
          onSelect={(assigneeUserId) => onEdit(task.id, { assigneeUserId, version: task.version })}
        />
      </TableCell>
      <TableCell className="border-l border-[#f0f0f0] dark:border-border/40">
        <div className="grid grid-cols-2 gap-1">
          <CompactDateField
            value={task.startAt}
            ariaLabel={`${t('startDate')} ${task.title}`}
            testId={`task-start-date-${task.id}`}
            onCommit={(startAt) =>
              onEdit(task.id, {
                startAt,
                version: task.version,
              })
            }
          />
          <CompactDateField
            value={task.dueAt}
            ariaLabel={`${t('endDate')} ${task.title}`}
            testId={`task-end-date-${task.id}`}
            onCommit={(dueAt) =>
              onEdit(task.id, {
                dueAt,
                version: task.version,
              })
            }
          />
        </div>
      </TableCell>
      <TableCell className="border-l border-[#f0f0f0] dark:border-border/40">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={100}
              value={task.progressPercent}
              onChange={(e) => onEdit(task.id, { progressPercent: Number(e.target.value), version: task.version })}
              className="h-6 w-14 border-0 bg-transparent px-1 shadow-none hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-0"
            />
            <span className="text-[11px] text-muted-foreground">{task.progressPercent}%</span>
          </div>
          <ProgressBar value={task.progressPercent} />
        </div>
      </TableCell>
      <TableCell className="border-l border-[#f0f0f0] dark:border-border/40">
        <select
          className={cn(
            'h-7 w-full rounded-full border-0 bg-transparent px-2 text-[11px] font-medium',
            'hover:bg-muted/40 focus:bg-muted/40',
            statusBadgeClass[task.status],
          )}
          value={task.status}
          onChange={(e) => onEdit(task.id, { status: e.target.value as Task['status'], version: task.version })}
        >
          <option value="TODO">TODO</option>
          <option value="IN_PROGRESS">IN_PROGRESS</option>
          <option value="DONE">DONE</option>
          <option value="BLOCKED">BLOCKED</option>
        </select>
      </TableCell>
      <TableCell className="border-l border-[#f0f0f0] text-[11px] text-muted-foreground dark:border-border/40">{projectName}</TableCell>
      <TableCell className="border-l border-[#f0f0f0] text-[11px] text-muted-foreground dark:border-border/40">-</TableCell>
      <TableCell className="border-l border-[#f0f0f0] text-[11px] text-muted-foreground dark:border-border/40">{t('private')}</TableCell>
      <TableCell className="border-l border-[#f0f0f0] dark:border-border/40">
        {task.assigneeUserId ? (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border text-[10px]">
            {initials(resolveAssigneeLabel(task, members))}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell className="border-l border-[#f0f0f0] dark:border-border/40">
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
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
  openSignal,
  onOpenSignalHandled,
  showClosedTrigger = true,
}: {
  sectionId: string;
  onCreate: (sectionId: string, title: string) => Promise<void>;
  openSignal?: number | null;
  onOpenSignalHandled?: (signal: number) => void;
  showClosedTrigger?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const ignoreNextBlurRef = useRef(false);

  useEffect(() => {
    if (openSignal === null || openSignal === undefined) return;
    setOpen(true);
    ignoreNextBlurRef.current = true;
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 120);
    onOpenSignalHandled?.(openSignal);
  }, [onOpenSignalHandled, openSignal]);

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    await onCreate(sectionId, trimmed);
    setTitle('');
    inputRef.current?.focus();
  };

  if (!open) {
    if (!showClosedTrigger) return null;
    return (
      <button
        type="button"
        data-testid={`quick-add-open-${sectionId}`}
        className="flex h-8 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        <Plus className="h-3.5 w-3.5" />
        <span>{t('addTaskInline')}</span>
      </button>
    );
  }

  return (
    <div className="py-1">
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
        onBlur={() => {
          if (ignoreNextBlurRef.current) {
            ignoreNextBlurRef.current = false;
            return;
          }
          if (!title.trim()) {
            setOpen(false);
            setTitle('');
          }
        }}
        placeholder={t('addTaskInline')}
        data-testid={`quick-add-input-${sectionId}`}
        className="h-8 border-0 border-b border-border/60 rounded-none bg-transparent px-0 shadow-none focus-visible:ring-0"
      />
    </div>
  );
}

function SectionDropTarget({
  sectionId,
  children,
  frameless = true,
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
        frameless ? 'bg-transparent' : 'rounded-lg bg-card',
        isOver && 'ring-1 ring-ring',
      )}
    >
      {children}
    </section>
  );
}

export default function ProjectBoard({
  projectId,
  projectName = 'Project',
  search,
  statusFilter,
  priorityFilter,
  statusFilters = [],
  assigneeFilters = [],
  initialTaskId,
  quickAddIntent,
  onQuickAddIntentHandled,
}: {
  projectId: string;
  projectName?: string;
  search: string;
  statusFilter: 'ALL' | Task['status'];
  priorityFilter: 'ALL' | NonNullable<Task['priority']>;
  statusFilters?: Task['status'][];
  assigneeFilters?: string[];
  initialTaskId?: string | null;
  quickAddIntent?: { sectionId: string; nonce: number } | null;
  onQuickAddIntentHandled?: (nonce: number) => void;
}) {
  const { t } = useI18n();
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );
  const queryClient = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(new Set());
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<Set<string>>(new Set());
  const [undoDelete, setUndoDelete] = useState<UndoDeleteState | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionNameDraft, setSectionNameDraft] = useState('');
  const [columnWidths, setColumnWidths] = useState<BoardColumnWidths>(BOARD_DEFAULT_COLUMN_WIDTHS);
  const [columnWidthsLoaded, setColumnWidthsLoaded] = useState(false);
  const [hasStoredColumnWidths, setHasStoredColumnWidths] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeStateRef = useRef<{ key: BoardColumnKey; startX: number; startWidth: number } | null>(null);
  const scrollSyncLockRef = useRef(false);
  const headerScrollRef = useRef<HTMLDivElement | null>(null);
  const sectionScrollRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const autoSizedColumnsRef = useRef(false);
  const textMeasureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const columnStorageKey = useMemo(
    () => `atlaspm:project-board-column-widths:${projectId}`,
    [projectId],
  );

  const boardColumnLabels = useMemo(
    () => ({
      name: t('name'),
      assignee: t('assignee'),
      dueDate: `${t('startDate')} / ${t('endDate')}`,
      progress: t('progress'),
      status: t('status'),
      projects: t('projects'),
      dependencies: t('dependencies'),
      visibility: t('visibility'),
      collaborators: t('collaborators'),
      actions: t('actions'),
    }),
    [t],
  );

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setColumnWidthsLoaded(false);
    setHasStoredColumnWidths(false);
    autoSizedColumnsRef.current = false;
    const raw = window.localStorage.getItem(columnStorageKey);
    if (!raw) {
      setColumnWidthsLoaded(true);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<BoardColumnWidths>;
      setColumnWidths(
        BOARD_COLUMNS.reduce((acc, column) => {
          const value = Number(parsed[column.key]);
          const normalized = Number.isFinite(value) ? value : column.defaultWidth;
          acc[column.key] = Math.max(column.minWidth, Math.round(normalized));
          return acc;
        }, {} as BoardColumnWidths),
      );
      setHasStoredColumnWidths(true);
    } catch {
      setColumnWidths(BOARD_DEFAULT_COLUMN_WIDTHS);
      setHasStoredColumnWidths(false);
    }
    setColumnWidthsLoaded(true);
  }, [columnStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined' || !columnWidthsLoaded) return;
    window.localStorage.setItem(columnStorageKey, JSON.stringify(columnWidths));
  }, [columnStorageKey, columnWidths, columnWidthsLoaded]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) return;
      const delta = event.clientX - resizeState.startX;
      const minWidth = BOARD_MIN_COLUMN_WIDTHS[resizeState.key];
      setColumnWidths((current) => ({
        ...current,
        [resizeState.key]: Math.max(minWidth, Math.round(resizeState.startWidth + delta)),
      }));
    };

    const handlePointerUp = () => {
      if (!resizeStateRef.current) return;
      resizeStateRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  const beginColumnResize = (key: BoardColumnKey, startX: number) => {
    resizeStateRef.current = {
      key,
      startX,
      startWidth: columnWidths[key],
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const startColumnResize = (key: BoardColumnKey, event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    beginColumnResize(key, event.clientX);
  };

  const syncHorizontalScroll = useCallback((source: HTMLDivElement) => {
    if (scrollSyncLockRef.current) return;
    scrollSyncLockRef.current = true;
    const nextLeft = source.scrollLeft;

    const containers: HTMLDivElement[] = [];
    if (headerScrollRef.current) containers.push(headerScrollRef.current);
    sectionScrollRefs.current.forEach((container) => containers.push(container));

    containers.forEach((container) => {
      if (container !== source && container.scrollLeft !== nextLeft) {
        container.scrollLeft = nextLeft;
      }
    });

    requestAnimationFrame(() => {
      scrollSyncLockRef.current = false;
    });
  }, []);

  const registerSectionScrollRef = useCallback(
    (sectionId: string) => (node: HTMLDivElement | null) => {
      if (!node) {
        sectionScrollRefs.current.delete(sectionId);
        return;
      }
      sectionScrollRefs.current.set(sectionId, node);
      if (headerScrollRef.current) {
        node.scrollLeft = headerScrollRef.current.scrollLeft;
      }
    },
    [],
  );

  useEffect(() => {
    if (!initialTaskId) return;
    setSelectedTaskId(initialTaskId);
  }, [initialTaskId]);

  useEffect(() => {
    const sectionId = quickAddIntent?.sectionId;
    if (!sectionId) return;
    setCollapsedSectionIds((current) => {
      if (!current.has(sectionId)) return current;
      const next = new Set(current);
      next.delete(sectionId);
      return next;
    });
  }, [quickAddIntent]);

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

  const completeTask = useMutation({
    mutationFn: ({ taskId, done, version }: { taskId: string; done: boolean; version: number }) =>
      api(`/tasks/${taskId}/complete`, {
        method: 'POST',
        body: { done, version },
      }) as Promise<Task>,
    onMutate: async ({ taskId, done }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
      const previous = queryClient.getQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId));
      queryClient.setQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId), (current = []) =>
        current.map((group) => ({
          ...group,
          tasks: group.tasks.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  status: done ? 'DONE' : 'IN_PROGRESS',
                  progressPercent: done ? 100 : 0,
                  completedAt: done ? new Date().toISOString() : null,
                  version: task.version + 1,
                }
              : task,
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

  const patchSection = useMutation({
    mutationFn: ({ sectionId, name }: { sectionId: string; name: string }) =>
      api(`/sections/${sectionId}`, { method: 'PATCH', body: { name } }) as Promise<{ id: string; name: string }>,
    onMutate: async ({ sectionId, name }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.projectSections(projectId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
      const previousSections = queryClient.getQueryData<Section[]>(queryKeys.projectSections(projectId));
      const previousGroups = queryClient.getQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId));

      queryClient.setQueryData<Section[]>(queryKeys.projectSections(projectId), (current = []) =>
        current.map((section) => (section.id === sectionId ? { ...section, name } : section)),
      );
      queryClient.setQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId), (current = []) =>
        current.map((group) =>
          group.section.id === sectionId ? { ...group, section: { ...group.section, name } } : group,
        ),
      );

      return { previousSections, previousGroups };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousSections) {
        queryClient.setQueryData(queryKeys.projectSections(projectId), context.previousSections);
      }
      if (context?.previousGroups) {
        queryClient.setQueryData(queryKeys.projectTasksGrouped(projectId), context.previousGroups);
      }
    },
    onSuccess: () => {
      setEditingSectionId(null);
      setSectionNameDraft('');
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectSections(projectId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
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

  const measureTextWidth = useCallback((text: string, font: string = '500 12px Inter, system-ui, sans-serif') => {
    if (typeof document === 'undefined') return text.length * 7;
    if (!textMeasureCanvasRef.current) {
      textMeasureCanvasRef.current = document.createElement('canvas');
    }
    const context = textMeasureCanvasRef.current.getContext('2d');
    if (!context) return text.length * 7;
    context.font = font;
    return Math.ceil(context.measureText(text).width);
  }, []);

  const computeAutoColumnWidths = useCallback(
    (groupsValue: SectionTaskGroup[], membersValue: ProjectMember[]): BoardColumnWidths => {
      const allTasks = groupsValue.flatMap((group) => group.tasks);
      const currentYear = new Date().getFullYear();
      const clamp = (key: BoardColumnKey, value: number) => {
        const maxWidthByKey: Partial<Record<BoardColumnKey, number>> = {
          name: 760,
          assignee: 360,
          dueDate: 360,
          progress: 280,
          status: 260,
          projects: 280,
          dependencies: 220,
          visibility: 220,
          collaborators: 220,
          actions: 96,
        };
        const min = BOARD_MIN_COLUMN_WIDTHS[key];
        const max = maxWidthByKey[key] ?? 420;
        return Math.max(min, Math.min(max, Math.round(value)));
      };
      const maxText = (values: string[], font?: string) => {
        const measured = values.map((value) => measureTextWidth(value || '', font));
        return measured.length ? Math.max(...measured) : 0;
      };

      const nameValues = allTasks.map((task) => task.title.trim() || t('untitledTask'));
      const assigneeValues = allTasks.map((task) => {
        if (!task.assigneeUserId) return t('unassigned');
        const member = membersValue.find((item) => item.userId === task.assigneeUserId);
        return member?.user.displayName || member?.user.email || member?.userId || task.assigneeUserId;
      });
      const startValues = allTasks.map((task) => {
        const date = toDateInputValue(task.startAt);
        return date ? formatCompactDate(date, currentYear) : '';
      });
      const endValues = allTasks.map((task) => {
        const date = toDateInputValue(task.dueAt);
        return date ? formatCompactDate(date, currentYear) : '';
      });
      const statusValues = [t('statusTodo'), t('statusInProgress'), t('statusDone'), t('statusBlocked')];

      const next: BoardColumnWidths = {
        name: clamp('name', Math.max(
          measureTextWidth(boardColumnLabels.name),
          maxText(nameValues, '600 14px Inter, system-ui, sans-serif'),
        ) + 120),
        assignee: clamp('assignee', Math.max(
          measureTextWidth(boardColumnLabels.assignee),
          maxText(assigneeValues, '500 12px Inter, system-ui, sans-serif'),
        ) + 58),
        dueDate: clamp(
          'dueDate',
          Math.max(
            measureTextWidth(boardColumnLabels.dueDate),
            maxText(startValues, '500 11px Inter, system-ui, sans-serif') +
              maxText(endValues, '500 11px Inter, system-ui, sans-serif') +
              64,
          ),
        ),
        progress: clamp('progress', Math.max(measureTextWidth(boardColumnLabels.progress), measureTextWidth('100%')) + 140),
        status: clamp('status', Math.max(measureTextWidth(boardColumnLabels.status), maxText(statusValues)) + 58),
        projects: clamp('projects', Math.max(measureTextWidth(boardColumnLabels.projects), measureTextWidth(projectName)) + 28),
        dependencies: clamp('dependencies', Math.max(measureTextWidth(boardColumnLabels.dependencies), measureTextWidth('-')) + 28),
        visibility: clamp('visibility', Math.max(measureTextWidth(boardColumnLabels.visibility), measureTextWidth(t('private'))) + 28),
        collaborators: clamp('collaborators', Math.max(measureTextWidth(boardColumnLabels.collaborators), measureTextWidth('DD')) + 28),
        actions: clamp('actions', Math.max(measureTextWidth(boardColumnLabels.actions), 36) + 26),
      };

      return next;
    },
    [boardColumnLabels, measureTextWidth, projectName, t],
  );

  useEffect(() => {
    if (!columnWidthsLoaded || hasStoredColumnWidths || autoSizedColumnsRef.current) return;
    if (groupsQuery.isLoading || membersQuery.isLoading) return;
    const autoWidths = computeAutoColumnWidths(groups, members);
    setColumnWidths(autoWidths);
    autoSizedColumnsRef.current = true;
  }, [
    columnWidthsLoaded,
    hasStoredColumnWidths,
    groupsQuery.isLoading,
    membersQuery.isLoading,
    groups,
    members,
    computeAutoColumnWidths,
  ]);

  const filteredGroups = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const normalizedProjectName = projectName.trim().toLowerCase();
    return groups.map((group) => ({
      ...group,
      tasks: group.tasks.filter((task) => {
        const sectionMatches = Boolean(normalizedSearch) && group.section.name.toLowerCase().includes(normalizedSearch);
        const titleMatches = task.title.toLowerCase().includes(normalizedSearch);
        const projectMatches = Boolean(normalizedSearch) && normalizedProjectName.includes(normalizedSearch);
        const bySearch =
          !normalizedSearch || sectionMatches || titleMatches || projectMatches;
        const byStatus =
          (statusFilter === 'ALL' || task.status === statusFilter) &&
          (statusFilters.length === 0 || statusFilters.includes(task.status));
        const byPriority = priorityFilter === 'ALL' || task.priority === priorityFilter;
        const byAssignee =
          assigneeFilters.length === 0 ||
          assigneeFilters.some((assignee) =>
            assignee === 'UNASSIGNED' ? !task.assigneeUserId : task.assigneeUserId === assignee,
          );
        return bySearch && byStatus && byPriority && byAssignee;
      }),
    }));
  }, [assigneeFilters, groups, priorityFilter, projectName, search, statusFilter, statusFilters]);

  const groupedVisibleRows = useMemo(() => {
    return filteredGroups.map((group) => {
      const sectionCollapsed = collapsedSectionIds.has(group.section.id);
      const tree = buildSectionTaskTree(group.tasks);
      const rows = sectionCollapsed ? [] : flattenVisibleTasks(tree, collapsedTaskIds);
      return { group, rows, sectionCollapsed };
    });
  }, [collapsedSectionIds, filteredGroups, collapsedTaskIds]);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeTaskId = String(active.id);
    const activeTask = groups.flatMap((group) => group.tasks).find((task) => task.id === activeTaskId);
    if (!activeTask) return;
    const activeHasChildren = groups.some((group) => group.tasks.some((task) => task.parentId === activeTaskId));
    if (activeTask.parentId || activeHasChildren) return;

    const overTaskId = String(over.id);
    const droppedOnSection = overTaskId.startsWith('section-drop-');
    const overSectionIdFromId = overTaskId.startsWith('section-drop-')
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

  const renderColumnGroup = () => (
    <colgroup>
      {BOARD_COLUMNS.map((column) => (
        <col key={column.key} style={{ width: `${columnWidths[column.key]}px` }} />
      ))}
    </colgroup>
  );

  if (groupsQuery.isLoading) {
    return <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">{t('loadingTasks')}</div>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div className="space-y-4">
        <Table
          className="w-max min-w-full table-fixed"
          containerRef={headerScrollRef}
          onContainerScroll={(event) => syncHorizontalScroll(event.currentTarget)}
        >
          {renderColumnGroup()}
          <TableHeader className="border-b border-[#f0f0f0] bg-transparent dark:border-border/40">
            <TableRow className="h-11 hover:bg-transparent">
              {BOARD_COLUMNS.map((column, index) => (
                <TableHead
                  key={column.key}
                  className={cn(
                    'relative px-3 text-[11px] font-medium normal-case tracking-normal text-[#6d6e6f] dark:text-muted-foreground',
                    index > 0 && 'border-l border-[#f0f0f0] dark:border-border/40',
                  )}
                  onPointerDown={(event) => {
                    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                    if (rect.right - event.clientX <= 12) {
                      startColumnResize(column.key, event);
                    }
                  }}
                >
                  <span>{boardColumnLabels[column.key]}</span>
                  {index < BOARD_COLUMNS.length - 1 ? (
                    <button
                      type="button"
                      className="absolute right-0 top-0 h-full w-3 touch-none cursor-col-resize bg-transparent transition-colors hover:bg-muted/35"
                      onPointerDown={(event) => startColumnResize(column.key, event)}
                      aria-label={`Resize ${boardColumnLabels[column.key]} column`}
                      data-testid={`column-resize-${column.key}`}
                    >
                      <span className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-[#e4e7eb] dark:bg-border/60" />
                    </button>
                  ) : null}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
        </Table>

        {groupedVisibleRows.map(({ group, rows, sectionCollapsed }) => {
          const isNoSection = group.section.isDefault || group.section.name.toLowerCase() === 'no section';
          return (
          <SectionDropTarget key={group.section.id} sectionId={group.section.id}>
            {!isNoSection ? (
              <header className="flex items-center justify-between border-b border-[#eceff2] bg-[#f7f8f9] px-4 py-3.5 dark:border-border/50 dark:bg-muted/20">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-5 w-5 items-center justify-center rounded hover:bg-muted/70"
                    data-testid={`section-collapse-${group.section.id}`}
                    onClick={() =>
                      setCollapsedSectionIds((current) => {
                        const next = new Set(current);
                        if (next.has(group.section.id)) next.delete(group.section.id);
                        else next.add(group.section.id);
                        return next;
                      })
                    }
                    aria-label={sectionCollapsed ? `Expand ${group.section.name}` : `Collapse ${group.section.name}`}
                  >
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', sectionCollapsed && '-rotate-90')} />
                  </button>
                  {editingSectionId === group.section.id ? (
                    <Input
                      autoFocus
                      value={sectionNameDraft}
                      data-testid={`section-name-input-${group.section.id}`}
                      className="h-7 max-w-xs border-0 bg-transparent px-1 text-[11px] uppercase tracking-wider text-muted-foreground shadow-none focus-visible:bg-muted/40 focus-visible:ring-0"
                      onChange={(event) => setSectionNameDraft(event.target.value)}
                      onBlur={() => {
                        const next = sectionNameDraft.trim();
                        if (!next || next === group.section.name) {
                          setEditingSectionId(null);
                          setSectionNameDraft('');
                          return;
                        }
                        patchSection.mutate({ sectionId: group.section.id, name: next });
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          const next = sectionNameDraft.trim();
                          if (!next || next === group.section.name) {
                            setEditingSectionId(null);
                            setSectionNameDraft('');
                            return;
                          }
                          patchSection.mutate({ sectionId: group.section.id, name: next });
                        }
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          setEditingSectionId(null);
                          setSectionNameDraft('');
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                      data-testid={`section-name-label-${group.section.id}`}
                      onClick={() => {
                        setEditingSectionId(group.section.id);
                        setSectionNameDraft(group.section.name);
                      }}
                    >
                      {group.section.name}
                    </button>
                  )}
                </div>
                <Badge>{group.tasks.length}</Badge>
              </header>
            ) : null}

            {!sectionCollapsed ? (
              <>
                <Table
                  className="w-max min-w-full table-fixed"
                  containerRef={registerSectionScrollRef(group.section.id)}
                  onContainerScroll={(event) => syncHorizontalScroll(event.currentTarget)}
                >
                  {renderColumnGroup()}
                  <TableBody>
                    <SortableContext items={rows.map((row) => row.task.id)} strategy={verticalListSortingStrategy}>
                      {rows.map((row) => (
                        <TaskRow
                          key={row.task.id}
                          task={row.task}
                          sectionId={group.section.id}
                          onEdit={onEdit}
                          onToggleDone={(task) =>
                            completeTask.mutate({
                              taskId: task.id,
                              done: task.status !== 'DONE',
                              version: task.version,
                            })
                          }
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

                {!group.tasks.length && !isNoSection ? (
                  <div className="px-4 py-3 text-sm text-muted-foreground" data-testid={`empty-section-${group.section.id}`}>
                    {t('noTasksInSection')}
                  </div>
                ) : null}

                <div className={cn('px-4 py-2', !isNoSection && 'border-t border-border/50')}>
                  <QuickAddTask
                    sectionId={group.section.id}
                    onCreate={async (sectionId, title) => {
                      await createTask.mutateAsync({ sectionId, title });
                    }}
                    openSignal={quickAddIntent?.sectionId === group.section.id ? quickAddIntent.nonce : null}
                    showClosedTrigger={!isNoSection}
                    {...(onQuickAddIntentHandled ? { onOpenSignalHandled: onQuickAddIntentHandled } : {})}
                  />
                </div>
              </>
            ) : null}
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
