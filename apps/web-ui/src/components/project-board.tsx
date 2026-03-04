'use client';

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type DragOverEvent,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Calendar, Check, CheckCircle2, ChevronDown, ChevronRight, Circle, Diamond, ExternalLink, Folder, Plus, Stamp, Trash2, User } from 'lucide-react';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type {
  CustomFieldDefinition,
  CustomFieldType,
  ProjectMember,
  Section,
  SectionTaskGroup,
  Task,
  TaskTree,
  TaskCustomFieldValue,
} from '@/lib/types';
import type { CustomFieldFilter } from '@/lib/project-filters';
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
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import TaskDetailDrawer from '@/components/task-detail-drawer';
import { useI18n } from '@/lib/i18n';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function sortByPosition(tasks: Task[]) {
  return [...tasks].sort((a, b) => a.position - b.position);
}

const EMPTY_CUSTOM_FIELDS: CustomFieldDefinition[] = [];

function renderTaskTypeCompletionIcon(task: Task, isDone: boolean) {
  if (task.type === 'MILESTONE') {
    return (
      <Diamond
        className={cn('h-5 w-5', isDone ? 'fill-current text-emerald-600' : 'text-muted-foreground')}
      />
    );
  }
  if (task.type === 'APPROVAL') {
    return <Stamp className={cn('h-5 w-5', isDone ? 'text-emerald-600' : 'text-muted-foreground')} />;
  }
  return isDone ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />;
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

function customFieldColumnKey(fieldId: string) {
  return `cf:${fieldId}`;
}

function findTaskCustomFieldValue(task: Task, fieldId: string): TaskCustomFieldValue | null {
  return task.customFieldValues?.find((value) => value.fieldId === fieldId) ?? null;
}

function taskMatchesCustomFieldFilter(task: Task, filter: CustomFieldFilter): boolean {
  const value = findTaskCustomFieldValue(task, filter.fieldId);
  if (!value) return false;

  if (filter.type === 'SELECT') {
    if (!filter.optionIds?.length) return true;
    return Boolean(value.optionId && filter.optionIds.includes(value.optionId));
  }

  if (filter.type === 'BOOLEAN') {
    if (typeof filter.booleanValue !== 'boolean') return true;
    return value.valueBoolean === filter.booleanValue;
  }

  if (filter.type === 'NUMBER') {
    if (typeof value.valueNumber !== 'number') return false;
    if (typeof filter.numberMin === 'number' && value.valueNumber < filter.numberMin) return false;
    if (typeof filter.numberMax === 'number' && value.valueNumber > filter.numberMax) return false;
    return true;
  }

  const valueDate = value.valueDate ? String(value.valueDate).slice(0, 10) : '';
  if (!valueDate) return false;
  if (filter.dateFrom && valueDate < filter.dateFrom) return false;
  if (filter.dateTo && valueDate > filter.dateTo) return false;
  return true;
}

function optimisticCustomFieldValues(
  task: Task,
  field: CustomFieldDefinition,
  rawValue: unknown,
): TaskCustomFieldValue[] {
  const current = [...(task.customFieldValues ?? [])];
  const index = current.findIndex((item) => item.fieldId === field.id);
  if (rawValue === null || typeof rawValue === 'undefined' || rawValue === '') {
    if (index >= 0) current.splice(index, 1);
    return current;
  }

  const next: TaskCustomFieldValue = {
    id: current[index]?.id ?? `temp-${task.id}-${field.id}`,
    taskId: task.id,
    fieldId: field.id,
    field: {
      id: field.id,
      name: field.name,
      type: field.type,
      required: field.required,
      position: field.position,
    },
    optionId: null,
    option: null,
    valueText: null,
    valueNumber: null,
    valueDate: null,
    valueBoolean: null,
  };

  if (field.type === 'TEXT') {
    next.valueText = String(rawValue);
  } else if (field.type === 'NUMBER') {
    next.valueNumber = Number(rawValue);
  } else if (field.type === 'DATE') {
    next.valueDate = String(rawValue);
  } else if (field.type === 'BOOLEAN') {
    next.valueBoolean = Boolean(rawValue);
  } else if (field.type === 'SELECT') {
    const optionId = String(rawValue);
    const option = field.options.find((candidate) => candidate.id === optionId) ?? null;
    next.optionId = optionId;
    next.option = option
      ? { id: option.id, label: option.label, value: option.value, color: option.color ?? null }
      : null;
    next.valueText = option?.value ?? null;
  }

  if (index >= 0) current[index] = next;
  else current.push(next);
  return current;
}

type CustomFieldEditorDraft = {
  name: string;
  optionsText: string;
};

function serializeSelectFieldOptions(field: CustomFieldDefinition) {
  return field.options
    .filter((option) => !option.archivedAt)
    .map((option) => `${option.label}|${option.value}`)
    .join('\n');
}

function normalizeOptionValueLabel(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function parseSelectFieldOptionsInput(optionsText: string) {
  const lines = optionsText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const options = lines.map((line, index) => {
    const [leftRaw = '', rightRaw = ''] = line.split('|').map((part) => part.trim());
    const label = leftRaw || rightRaw;
    const candidate = rightRaw || normalizeOptionValueLabel(label);
    const value = candidate || `option_${index + 1}`;
    return {
      label,
      value,
      position: (index + 1) * 1000,
    };
  });
  return options.filter((option) => option.label && option.value);
}

type TaskTreeNode = {
  task: Task;
  children: TaskTreeNode[];
};

type UndoDeleteState = {
  taskId: string;
  title: string;
};

type UndoCompleteState = {
  taskId: string;
  title: string;
  previousStatus: Task['status'];
  previousProgressPercent: number;
};

type PendingCompleteWarningState = {
  task: Task;
  openSubtaskCount: number;
};

type DeleteTaskResponse = {
  success: boolean;
  deletedCount: number;
  taskIds: string[];
};

function countOpenDescendants(taskId: string, tasks: Task[]) {
  const childrenByParent = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.parentId) continue;
    const current = childrenByParent.get(task.parentId) ?? [];
    current.push(task);
    childrenByParent.set(task.parentId, current);
  }

  let openCount = 0;
  const queue = [...(childrenByParent.get(taskId) ?? [])];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (current.status !== 'DONE') openCount += 1;
    const descendants = childrenByParent.get(current.id);
    if (descendants?.length) queue.push(...descendants);
  }
  return openCount;
}

function countOpenSubtasksInTree(nodes: TaskTree[]) {
  let count = 0;
  const queue = [...nodes];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    if (current.status !== 'DONE') count += 1;
    if (current.children?.length) queue.push(...current.children);
  }
  return count;
}

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

  const compareTasksByDueDate = (left: Task, right: Task) => {
    const leftDue = toDateInputValue(left.dueAt);
    const rightDue = toDateInputValue(right.dueAt);

    if (leftDue && rightDue) {
      if (leftDue !== rightDue) return leftDue.localeCompare(rightDue);
    } else if (leftDue || rightDue) {
      return leftDue ? -1 : 1;
    }

    return left.position - right.position;
  };

  const sortNodes = (nodes: TaskTreeNode[]) => {
    nodes.sort((a, b) => compareTasksByDueDate(a.task, b.task));
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

const BOARD_BASE_COLUMNS = [
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

type BaseBoardColumnKey = (typeof BOARD_BASE_COLUMNS)[number]['key'];
type BoardColumnWidths = Record<string, number>;
type BoardColumnConfig = {
  key: string;
  defaultWidth: number;
  minWidth: number;
  label: string;
  customField?: CustomFieldDefinition;
};

function getColumnDragId(key: string) {
  return `column:${key}`;
}

function parseColumnDragId(id: string): string | null {
  if (!id.startsWith('column:')) return null;
  return id.slice('column:'.length);
}

const BOARD_BASE_COLUMN_WIDTHS: Record<BaseBoardColumnKey, number> = BOARD_BASE_COLUMNS.reduce((acc, column) => {
  acc[column.key] = column.defaultWidth;
  return acc;
}, {} as Record<BaseBoardColumnKey, number>);

const BOARD_BASE_MIN_COLUMN_WIDTHS: Record<BaseBoardColumnKey, number> = BOARD_BASE_COLUMNS.reduce((acc, column) => {
  acc[column.key] = column.minWidth;
  return acc;
}, {} as Record<BaseBoardColumnKey, number>);

function SortableColumnHead({
  column,
  index,
  activeColumnKey,
  overColumnKey,
  startColumnResize,
}: {
  column: BoardColumnConfig;
  index: number;
  activeColumnKey: string | null;
  overColumnKey: string | null;
  startColumnResize: (key: string, event: ReactPointerEvent<HTMLElement>) => void;
}) {
  const isFixed = column.key === 'name';
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: getColumnDragId(column.key),
    disabled: isFixed,
  });
  const isActive = activeColumnKey === column.key;
  const isOver = overColumnKey === column.key;

  return (
    <th
      className={cn(
        'relative px-3 text-[11px] font-medium normal-case tracking-normal text-[#6d6e6f] dark:text-muted-foreground',
        index > 0 && 'border-l border-[#f0f0f0] dark:border-border/40',
        isOver && !isActive && 'bg-muted/30',
      )}
      data-testid={`column-head-${column.key}`}
    >
      <div
        ref={setNodeRef as never}
        className={cn(
          'h-full w-full py-3 touch-none select-none',
          !isFixed && 'cursor-grab active:cursor-grabbing hover:bg-muted/30',
          (isActive || isDragging) && 'opacity-50',
        )}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        {...(!isFixed ? attributes : {})}
        {...(!isFixed ? listeners : {})}
      >
        <span>{column.label}</span>
      </div>
      <button
        type="button"
        className="absolute right-0 top-0 h-full w-3 touch-none cursor-col-resize bg-transparent transition-colors hover:bg-muted/35"
        onPointerDown={(event) => {
          event.stopPropagation();
          startColumnResize(column.key, event);
        }}
        aria-label={`Resize ${column.label} column`}
        data-testid={`column-resize-${column.key}`}
      >
        <span className="absolute inset-y-2 left-1/2 w-px -translate-x-1/2 bg-[#e4e7eb] dark:bg-border/60" />
      </button>
    </th>
  );
}

function AssigneeCombobox({
  task,
  members,
  onSelect,
  disabled = false,
}: {
  task: Task;
  members: ProjectMember[];
  onSelect: (assigneeUserId: string | null) => void;
  disabled?: boolean;
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
                disabled={disabled}
                title={disabled ? t('projectReadOnlyHint') : undefined}
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
  disabled = false,
}: {
  value?: string | null | undefined;
  onCommit: (next: string | null) => void;
  testId: string;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const { t } = useI18n();
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
        disabled={disabled}
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
      disabled={disabled}
      title={disabled ? t('projectReadOnlyHint') : undefined}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        if (disabled) return;
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
  boardColumns,
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
  canEdit,
  onDelete,
  onEditCustomField,
}: {
  task: Task;
  sectionId: string;
  boardColumns: BoardColumnConfig[];
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
  canEdit: boolean;
  onDelete: (taskId: string) => void;
  onEditCustomField: (task: Task, field: CustomFieldDefinition, value: unknown) => void;
}) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: task.id,
    data: { sectionId },
    disabled: !draggable || !canEdit,
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
    if (!canEdit) {
      setIsEditingTitle(false);
      return;
    }
    const next = titleDraft;
    if (next === task.title) {
      setIsEditingTitle(false);
      return;
    }
    onEdit(task.id, { title: next, version: task.version });
    setIsEditingTitle(false);
  };

  const renderCellContent = (column: BoardColumnConfig) => {
    if (column.key === 'name') {
      return (
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
                'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-muted',
                isDone ? 'text-emerald-600' : 'text-muted-foreground',
              )}
              data-testid={`task-complete-${task.id}`}
              aria-label={isDone ? `Reopen ${task.title}` : `Complete ${task.title}`}
              disabled={!canEdit}
              title={!canEdit ? t('projectReadOnlyHint') : undefined}
              onClick={() => {
                if (!canEdit) return;
                onToggleDone(task);
              }}
            >
              {renderTaskTypeCompletionIcon(task, isDone)}
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
                  if (!canEdit) return;
                  setIsEditingTitle(true);
                }}
                data-testid={`task-title-label-${task.id}`}
                title={!canEdit ? t('projectReadOnlyHint') : undefined}
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
      );
    }

    if (column.key === 'assignee') {
      return (
        <AssigneeCombobox
          task={task}
          members={members}
          disabled={!canEdit}
          onSelect={(assigneeUserId) => onEdit(task.id, { assigneeUserId, version: task.version })}
        />
      );
    }

    if (column.key === 'dueDate') {
      return (
        <div className="grid grid-cols-2 gap-1">
          <CompactDateField
            value={task.startAt}
            ariaLabel={`${t('startDate')} ${task.title}`}
            testId={`task-start-date-${task.id}`}
            disabled={!canEdit}
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
            disabled={!canEdit}
            onCommit={(dueAt) =>
              onEdit(task.id, {
                dueAt,
                version: task.version,
              })
            }
          />
        </div>
      );
    }

    if (column.key === 'progress') {
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={100}
              value={task.progressPercent}
              disabled={!canEdit}
              title={!canEdit ? t('projectReadOnlyHint') : undefined}
              onChange={(e) => onEdit(task.id, { progressPercent: Number(e.target.value), version: task.version })}
              className="h-6 w-14 border-0 bg-transparent px-1 shadow-none hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-0"
            />
            <span className="text-[11px] text-muted-foreground">{task.progressPercent}%</span>
          </div>
          <ProgressBar value={task.progressPercent} />
        </div>
      );
    }

    if (column.key === 'status') {
      return (
        <select
          className={cn(
            'h-7 w-full rounded-full border-0 bg-transparent px-2 text-[11px] font-medium',
            'hover:bg-muted/40 focus:bg-muted/40',
            statusBadgeClass[task.status],
          )}
          value={task.status}
          disabled={!canEdit}
          title={!canEdit ? t('projectReadOnlyHint') : undefined}
          onChange={(e) => onEdit(task.id, { status: e.target.value as Task['status'], version: task.version })}
        >
          <option value="TODO">TODO</option>
          <option value="IN_PROGRESS">IN_PROGRESS</option>
          <option value="DONE">DONE</option>
          <option value="BLOCKED">BLOCKED</option>
        </select>
      );
    }

    if (column.customField) {
      const field = column.customField;
      const customValue = findTaskCustomFieldValue(task, field.id);
      const textValue = customValue?.valueText ?? '';
      const numberValue =
        customValue?.valueNumber === null || customValue?.valueNumber === undefined
          ? ''
          : String(customValue.valueNumber);
      const dateValue = customValue?.valueDate ?? null;
      const selectValue = customValue?.optionId ?? '';
      const boolValue = Boolean(customValue?.valueBoolean);

      if (field.type === 'TEXT') {
        return (
          <Input
            key={`task-${task.id}-field-${field.id}-${textValue}`}
            defaultValue={textValue}
            data-no-dnd="true"
            data-testid={`task-custom-text-${task.id}-${field.id}`}
            className="h-7 border-0 bg-transparent px-2 text-[11px] shadow-none hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-0"
            disabled={!canEdit}
            title={!canEdit ? t('projectReadOnlyHint') : undefined}
            onPointerDown={(event) => event.stopPropagation()}
            onBlur={(event) => {
              if (!canEdit) return;
              const next = event.currentTarget.value.trim();
              if (next !== textValue) onEditCustomField(task, field, next || null);
            }}
            onKeyDown={(event) => {
              if (!canEdit) return;
              if (event.key === 'Enter') {
                event.preventDefault();
                const next = (event.currentTarget as HTMLInputElement).value.trim();
                if (next !== textValue) onEditCustomField(task, field, next || null);
                (event.currentTarget as HTMLInputElement).blur();
              }
            }}
          />
        );
      }

      if (field.type === 'NUMBER') {
        return (
          <Input
            key={`task-${task.id}-field-${field.id}-${numberValue}`}
            type="number"
            defaultValue={numberValue}
            data-no-dnd="true"
            data-testid={`task-custom-number-${task.id}-${field.id}`}
            className="h-7 border-0 bg-transparent px-2 text-[11px] shadow-none hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-0"
            disabled={!canEdit}
            title={!canEdit ? t('projectReadOnlyHint') : undefined}
            onPointerDown={(event) => event.stopPropagation()}
            onBlur={(event) => {
              if (!canEdit) return;
              const raw = event.currentTarget.value.trim();
              if (!raw && numberValue) {
                onEditCustomField(task, field, null);
                return;
              }
              if (!raw) return;
              const parsed = Number(raw);
              if (!Number.isFinite(parsed)) return;
              if (parsed !== Number(numberValue || '0')) onEditCustomField(task, field, parsed);
            }}
          />
        );
      }

      if (field.type === 'DATE') {
        return (
          <CompactDateField
            value={dateValue}
            ariaLabel={`${field.name} ${task.title}`}
            testId={`task-custom-date-${task.id}-${field.id}`}
            disabled={!canEdit}
            onCommit={(next) => onEditCustomField(task, field, next)}
          />
        );
      }

      if (field.type === 'SELECT') {
        return (
          <select
            className="h-7 w-full rounded-md border-0 bg-transparent px-2 text-[11px] hover:bg-muted/40 focus:bg-muted/40"
            value={selectValue}
            data-testid={`task-custom-select-${task.id}-${field.id}`}
            disabled={!canEdit}
            title={!canEdit ? t('projectReadOnlyHint') : undefined}
            onChange={(event) => onEditCustomField(task, field, event.target.value || null)}
          >
            <option value="">{t('noneOption')}</option>
            {field.options
              .filter((option) => !option.archivedAt)
              .map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
          </select>
        );
      }

      return (
        <button
          type="button"
          data-no-dnd="true"
          data-testid={`task-custom-boolean-${task.id}-${field.id}`}
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-muted',
            boolValue ? 'text-emerald-600' : 'text-muted-foreground',
          )}
          disabled={!canEdit}
          title={!canEdit ? t('projectReadOnlyHint') : undefined}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            if (!canEdit) return;
            onEditCustomField(task, field, !boolValue);
          }}
          aria-label={`${field.name} ${task.title}`}
        >
          {boolValue ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
        </button>
      );
    }

    if (column.key === 'projects') {
      return (
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary" className="text-[10px]">
            <Folder className="mr-1 h-3 w-3" />
            {projectName}
          </Badge>
        </div>
      );
    }

    if (column.key === 'dependencies') {
      return <span className="text-[11px] text-muted-foreground">-</span>;
    }

    if (column.key === 'visibility') {
      return <span className="text-[11px] text-muted-foreground">{t('private')}</span>;
    }

    if (column.key === 'collaborators') {
      return task.assigneeUserId ? (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border text-[10px]">
          {initials(resolveAssigneeLabel(task, members))}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">-</span>
      );
    }

    if (column.key === 'actions') {
      return (
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          data-testid={`delete-task-${task.id}`}
          disabled={!canEdit}
          title={!canEdit ? t('projectReadOnlyHint') : undefined}
          onClick={(event) => {
            event.stopPropagation();
            if (!canEdit) return;
            onDelete(task.id);
          }}
          aria-label={t('deleteTask')}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      );
    }

    return null;
  };

  return (
    <tr
      ref={setNodeRef as never}
      style={{ transform: CSS.Transform.toString(transform), transition: transition || 'transform 150ms ease' }}
      className={cn(
        'group h-9 border-b border-[#f0f0f0] transition-colors hover:bg-muted/35 dark:border-border/40',
        draggable && canEdit && 'cursor-grab active:cursor-grabbing',
        isDone && 'opacity-50',
      )}
      data-testid={`task-${task.id}`}
      data-task-title={task.title}
      {...(draggable && canEdit ? attributes : {})}
      {...(draggable && canEdit ? listeners : {})}
      onPointerDownCapture={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('button,input,select,textarea,a,[data-no-dnd="true"]')) {
          event.stopPropagation();
        }
      }}
    >
      {boardColumns.map((column, index) => (
        <TableCell
          key={`task-${task.id}-column-${column.key}`}
          className={cn(index > 0 && 'border-l border-[#f0f0f0] dark:border-border/40')}
        >
          {renderCellContent(column)}
        </TableCell>
      ))}
    </tr>
  );
}

function QuickAddTask({
  sectionId,
  onCreate,
  openSignal,
  onOpenSignalHandled,
  showClosedTrigger = true,
  canEdit = true,
}: {
  sectionId: string;
  onCreate: (sectionId: string, title: string) => Promise<void>;
  openSignal?: number | null;
  onOpenSignalHandled?: (signal: number) => void;
  showClosedTrigger?: boolean;
  canEdit?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const ignoreNextBlurRef = useRef(false);

  useEffect(() => {
    if (!canEdit) return;
    if (openSignal === null || openSignal === undefined) return;
    setOpen(true);
    ignoreNextBlurRef.current = true;
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 120);
    onOpenSignalHandled?.(openSignal);
  }, [canEdit, onOpenSignalHandled, openSignal]);

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    await onCreate(sectionId, trimmed);
    setTitle((current) => (current.trim() === trimmed ? '' : current));
    inputRef.current?.focus();
  };

  if (!open) {
    if (!showClosedTrigger) return null;
    return (
      <button
        type="button"
        data-testid={`quick-add-open-${sectionId}`}
        className="flex h-8 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        disabled={!canEdit}
        title={!canEdit ? t('projectReadOnlyHint') : undefined}
        onClick={() => {
          if (!canEdit) return;
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
        disabled={!canEdit}
        title={!canEdit ? t('projectReadOnlyHint') : undefined}
        onKeyDown={(e) => {
          if (!canEdit) return;
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
  highlighted = false,
}: {
  sectionId: string;
  children: ReactNode;
  frameless?: boolean;
  highlighted?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `section-drop-${sectionId}`, data: { sectionId } });

  return (
    <section
      ref={setNodeRef}
      data-testid={`section-${sectionId}`}
      data-highlighted={highlighted ? 'true' : 'false'}
      className={cn(
        frameless ? 'bg-transparent' : 'rounded-lg bg-card',
        isOver && 'ring-1 ring-ring',
        highlighted && 'ring-1 ring-primary/60',
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
  customFieldFilters = [],
  initialTaskId,
  quickAddIntent,
  onQuickAddIntentHandled,
  canEdit = true,
}: {
  projectId: string;
  projectName?: string;
  search: string;
  statusFilter: 'ALL' | Task['status'];
  priorityFilter: 'ALL' | NonNullable<Task['priority']>;
  statusFilters?: Task['status'][];
  assigneeFilters?: string[];
  customFieldFilters?: CustomFieldFilter[];
  initialTaskId?: string | null;
  quickAddIntent?: { sectionId: string; nonce: number } | null;
  onQuickAddIntentHandled?: (nonce: number) => void;
  canEdit?: boolean;
}) {
  const { t } = useI18n();
  const taskSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );
  const columnSensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 2 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 8 },
    }),
  );
  const queryClient = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<Set<string>>(new Set());
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<Set<string>>(new Set());
  const [highlightedSectionId, setHighlightedSectionId] = useState<string | null>(null);
  const [undoDelete, setUndoDelete] = useState<UndoDeleteState | null>(null);
  const [undoComplete, setUndoComplete] = useState<UndoCompleteState | null>(null);
  const [pendingCompleteWarning, setPendingCompleteWarning] = useState<PendingCompleteWarningState | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionNameDraft, setSectionNameDraft] = useState('');
  const [columnWidths, setColumnWidths] = useState<BoardColumnWidths>(BOARD_BASE_COLUMN_WIDTHS);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [activeColumnKey, setActiveColumnKey] = useState<string | null>(null);
  const [overColumnKey, setOverColumnKey] = useState<string | null>(null);
  const [columnWidthsLoaded, setColumnWidthsLoaded] = useState(false);
  const [hasStoredColumnWidths, setHasStoredColumnWidths] = useState(false);
  const [createFieldDialogOpen, setCreateFieldDialogOpen] = useState(false);
  const [manageFieldsDialogOpen, setManageFieldsDialogOpen] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<CustomFieldType>('TEXT');
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, CustomFieldEditorDraft>>({});
  const [customFieldError, setCustomFieldError] = useState<string | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoCompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeStateRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);
  const scrollSyncLockRef = useRef(false);
  const headerScrollRef = useRef<HTMLDivElement | null>(null);
  const sectionScrollRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const autoSizedColumnsRef = useRef(false);
  const textMeasureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastColumnOverRef = useRef<string | null>(null);
  const columnStorageKey = useMemo(
    () => `atlaspm:project-board-column-widths:${projectId}`,
    [projectId],
  );
  const columnOrderStorageKey = useMemo(
    () => `atlaspm:project-board-column-order:${projectId}`,
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

  const groupsQuery = useQuery<SectionTaskGroup[]>({
    queryKey: queryKeys.projectTasksGrouped(projectId),
    queryFn: () => api(`/projects/${projectId}/tasks?groupBy=section`),
  });

  const membersQuery = useQuery<ProjectMember[]>({
    queryKey: queryKeys.projectMembers(projectId),
    queryFn: () => api(`/projects/${projectId}/members`),
  });

  const customFieldsQuery = useQuery<CustomFieldDefinition[]>({
    queryKey: queryKeys.projectCustomFields(projectId),
    queryFn: () => api(`/projects/${projectId}/custom-fields`),
  });
  const customFields = customFieldsQuery.data ?? EMPTY_CUSTOM_FIELDS;
  const activeCustomFieldFilters = useMemo(
    () => customFieldFilters.filter((filter) => customFields.some((field) => field.id === filter.fieldId && !field.archivedAt)),
    [customFieldFilters, customFields],
  );
  const allTasks = useMemo(() => (groupsQuery.data ?? []).flatMap((group) => group.tasks), [groupsQuery.data]);

  const lookupTaskById = useCallback(
    (taskId: string) =>
      queryClient
        .getQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId))
        ?.flatMap((group) => group.tasks)
        .find((task) => task.id === taskId) ?? null,
    [projectId, queryClient],
  );

  useEffect(() => {
    if (!manageFieldsDialogOpen) return;
    setFieldDrafts((current) => {
      const next = { ...current };
      for (const field of customFields) {
        if (field.archivedAt) continue;
        if (!next[field.id]) {
          next[field.id] = {
            name: field.name,
            optionsText: field.type === 'SELECT' ? serializeSelectFieldOptions(field) : '',
          };
        }
      }
      return next;
    });
  }, [customFields, manageFieldsDialogOpen]);

  const boardColumns = useMemo<BoardColumnConfig[]>(() => {
    const baseColumns = BOARD_BASE_COLUMNS.map((column) => ({
      key: column.key,
      defaultWidth: column.defaultWidth,
      minWidth: column.minWidth,
      label: boardColumnLabels[column.key],
    }));
    const customColumns = customFields
      .filter((field) => !field.archivedAt)
      .sort((a, b) => a.position - b.position)
      .map((field) => ({
        key: customFieldColumnKey(field.id),
        defaultWidth: 190,
        minWidth: 140,
        label: field.name,
        customField: field,
      }));
    const insertBeforeProjectsAt = baseColumns.findIndex((column) => column.key === 'projects');
    if (insertBeforeProjectsAt < 0) return [...baseColumns, ...customColumns];
    return [
      ...baseColumns.slice(0, insertBeforeProjectsAt),
      ...customColumns,
      ...baseColumns.slice(insertBeforeProjectsAt),
    ];
  }, [boardColumnLabels, customFields]);

  useEffect(() => {
    const reorderableKeys = boardColumns.filter((column) => column.key !== 'name').map((column) => column.key);
    if (typeof window === 'undefined') {
      setColumnOrder(reorderableKeys);
      return;
    }

    const raw = window.localStorage.getItem(columnOrderStorageKey);
    if (!raw) {
      setColumnOrder(reorderableKeys);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setColumnOrder(reorderableKeys);
        return;
      }
      const uniqueParsed = parsed
        .map((value) => String(value))
        .filter((key, index, list) => reorderableKeys.includes(key) && list.indexOf(key) === index);
      const merged = [...uniqueParsed, ...reorderableKeys.filter((key) => !uniqueParsed.includes(key))];
      setColumnOrder(merged);
    } catch {
      setColumnOrder(reorderableKeys);
    }
  }, [boardColumns, columnOrderStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(columnOrderStorageKey, JSON.stringify(columnOrder));
  }, [columnOrder, columnOrderStorageKey]);

  const orderedBoardColumns = useMemo(() => {
    const reorderableColumns = boardColumns.filter((column) => column.key !== 'name');
    const fixedName = boardColumns.find((column) => column.key === 'name');
    const fallbackOrder = reorderableColumns.map((column) => column.key);
    const mergedOrder = [
      ...columnOrder.filter((key) => fallbackOrder.includes(key)),
      ...fallbackOrder.filter((key) => !columnOrder.includes(key)),
    ];
    const indexByKey = new Map(
      mergedOrder.map((key, index) => [key, index]),
    );
    const ordered = [...reorderableColumns].sort(
      (a, b) => (indexByKey.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (indexByKey.get(b.key) ?? Number.MAX_SAFE_INTEGER),
    );
    return fixedName ? [fixedName, ...ordered] : ordered;
  }, [boardColumns, columnOrder]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
      if (undoCompleteTimerRef.current) {
        clearTimeout(undoCompleteTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setColumnWidthsLoaded(false);
    setHasStoredColumnWidths(false);
    autoSizedColumnsRef.current = false;
    const defaultWidths = boardColumns.reduce<BoardColumnWidths>((acc, column) => {
      acc[column.key] = column.defaultWidth;
      return acc;
    }, {});
    const raw = window.localStorage.getItem(columnStorageKey);
    if (!raw) {
      setColumnWidths(defaultWidths);
      setColumnWidthsLoaded(true);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, number>;
      setColumnWidths(
        boardColumns.reduce<BoardColumnWidths>((acc, column) => {
          const value = Number(parsed[column.key]);
          const normalized = Number.isFinite(value) ? value : column.defaultWidth;
          acc[column.key] = Math.max(column.minWidth, Math.round(normalized));
          return acc;
        }, {}),
      );
      setHasStoredColumnWidths(true);
    } catch {
      setColumnWidths(defaultWidths);
      setHasStoredColumnWidths(false);
    }
    setColumnWidthsLoaded(true);
  }, [boardColumns, columnStorageKey]);

  useEffect(() => {
    if (typeof window === 'undefined' || !columnWidthsLoaded) return;
    window.localStorage.setItem(columnStorageKey, JSON.stringify(columnWidths));
  }, [columnStorageKey, columnWidths, columnWidthsLoaded]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) return;
      const delta = event.clientX - resizeState.startX;
      const minWidth = boardColumns.find((column) => column.key === resizeState.key)?.minWidth ?? 120;
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
  }, [boardColumns]);

  const beginColumnResize = (key: string, startX: number) => {
    const fallback = boardColumns.find((column) => column.key === key)?.defaultWidth ?? 160;
    resizeStateRef.current = {
      key,
      startX,
      startWidth: columnWidths[key] ?? fallback,
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const startColumnResize = (key: string, event: ReactPointerEvent<HTMLElement>) => {
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

  useEffect(() => {
    const onFocusSection = (event: Event) => {
      const detail = (event as CustomEvent<{ sectionId?: string }>).detail;
      const sectionId = detail?.sectionId;
      if (!sectionId) return;

      setCollapsedSectionIds((current) => {
        if (!current.has(sectionId)) return current;
        const next = new Set(current);
        next.delete(sectionId);
        return next;
      });

      requestAnimationFrame(() => {
        const element = document.querySelector<HTMLElement>(`[data-testid="section-${sectionId}"]`);
        element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      setHighlightedSectionId(sectionId);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => {
        setHighlightedSectionId((current) => (current === sectionId ? null : current));
      }, 1600);
    };

    window.addEventListener('atlaspm:focus-section', onFocusSection as EventListener);
    return () => {
      window.removeEventListener('atlaspm:focus-section', onFocusSection as EventListener);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!canEdit) return;
    const onOpenCreateField = () => setCreateFieldDialogOpen(true);
    const onOpenManageFields = () => setManageFieldsDialogOpen(true);
    window.addEventListener('atlaspm:open-create-custom-field', onOpenCreateField);
    window.addEventListener('atlaspm:open-manage-custom-fields', onOpenManageFields);
    return () => {
      window.removeEventListener('atlaspm:open-create-custom-field', onOpenCreateField);
      window.removeEventListener('atlaspm:open-manage-custom-fields', onOpenManageFields);
    };
  }, [canEdit]);

  const createCustomField = useMutation({
    mutationFn: ({
      name,
      type,
    }: {
      name: string;
      type: CustomFieldType;
    }) =>
      api(`/projects/${projectId}/custom-fields`, {
        method: 'POST',
        body:
          type === 'SELECT'
            ? {
                name,
                type,
                options: [{ label: t('optionDefaultLabel'), value: 'option_default' }],
              }
            : { name, type },
      }) as Promise<CustomFieldDefinition>,
    onSuccess: (created) => {
      queryClient.setQueryData<CustomFieldDefinition[]>(
        queryKeys.projectCustomFields(projectId),
        (current = []) => [...current.filter((field) => field.id !== created.id), created].sort((a, b) => a.position - b.position),
      );
      setCreateFieldDialogOpen(false);
      setNewFieldName('');
      setNewFieldType('TEXT');
      setCustomFieldError(null);
    },
    onError: (error) => {
      setCustomFieldError(error instanceof Error ? error.message : t('customFieldCreateFailed'));
    },
  });

  const patchCustomField = useMutation({
    mutationFn: ({
      fieldId,
      name,
      optionsText,
      type,
    }: {
      fieldId: string;
      name: string;
      optionsText: string;
      type: CustomFieldType;
    }) =>
      api(`/custom-fields/${fieldId}`, {
        method: 'PATCH',
        body:
          type === 'SELECT'
            ? {
                name,
                options: parseSelectFieldOptionsInput(optionsText),
              }
            : { name },
      }) as Promise<CustomFieldDefinition>,
    onSuccess: (updated) => {
      queryClient.setQueryData<CustomFieldDefinition[]>(
        queryKeys.projectCustomFields(projectId),
        (current = []) =>
          current
            .map((field) => (field.id === updated.id ? updated : field))
            .sort((a, b) => a.position - b.position),
      );
      setFieldDrafts((current) => ({
        ...current,
        [updated.id]: {
          name: updated.name,
          optionsText: updated.type === 'SELECT' ? serializeSelectFieldOptions(updated) : '',
        },
      }));
      setCustomFieldError(null);
    },
    onError: (error) => {
      setCustomFieldError(error instanceof Error ? error.message : t('customFieldUpdateFailed'));
    },
  });

  const archiveCustomField = useMutation({
    mutationFn: (fieldId: string) =>
      api(`/custom-fields/${fieldId}`, { method: 'DELETE' }) as Promise<{ ok: boolean }>,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectCustomFields(projectId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
      setCustomFieldError(null);
    },
    onError: (error) => {
      setCustomFieldError(error instanceof Error ? error.message : t('customFieldUpdateFailed'));
    },
  });

  const patchTaskCustomFields = useMutation({
    mutationFn: ({
      taskId,
      version,
      fieldId,
      value,
    }: {
      taskId: string;
      version: number;
      fieldId: string;
      value: unknown;
    }) =>
      api(`/tasks/${taskId}/custom-fields`, {
        method: 'PATCH',
        body: { version, values: [{ fieldId, value }] },
      }) as Promise<{
        id: string;
        version: number;
        status?: Task['status'];
        progressPercent?: number;
        completedAt?: string | null;
        customFieldValues: TaskCustomFieldValue[];
      }>,
    onMutate: async ({ taskId, fieldId, value }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
      const previous = queryClient.getQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId));
      const field = customFields.find((item) => item.id === fieldId);
      if (!field) return { previous };
      queryClient.setQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId), (current = []) =>
        current.map((group) => ({
          ...group,
          tasks: group.tasks.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  version: task.version + 1,
                  customFieldValues: optimisticCustomFieldValues(task, field, value),
                }
              : task,
          ),
        })),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.projectTasksGrouped(projectId), context.previous);
      }
      setCustomFieldError(t('customFieldUpdateFailed'));
    },
    onSuccess: (updatedTask) => {
      queryClient.setQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId), (current = []) =>
        current.map((group) => ({
          ...group,
          tasks: group.tasks.map((task) =>
            task.id === updatedTask.id
              ? (() => {
                  const nextCompletedAt = (updatedTask as Partial<Task>).completedAt;
                  return {
                    ...task,
                    version: updatedTask.version,
                    status: (updatedTask as Partial<Task>).status ?? task.status,
                    progressPercent:
                      (updatedTask as Partial<Task>).progressPercent ?? task.progressPercent,
                    ...(nextCompletedAt !== undefined ? { completedAt: nextCompletedAt } : {}),
                    customFieldValues: updatedTask.customFieldValues,
                  };
                })()
              : task,
          ),
        })),
      );
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
    },
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
    mutationFn: ({
      taskId,
      done,
      version,
      force,
    }: {
      taskId: string;
      done: boolean;
      version: number;
      force?: boolean;
    }) =>
      api(`/tasks/${taskId}/complete`, {
        method: 'POST',
        body: { done, version, ...(force ? { force: true } : {}) },
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

  const restoreTaskCompletion = useMutation({
    mutationFn: ({
      taskId,
      status,
      progressPercent,
      version,
    }: {
      taskId: string;
      status: Task['status'];
      progressPercent: number;
      version: number;
    }) =>
      api(`/tasks/${taskId}`, {
        method: 'PATCH',
        body: { status, progressPercent, version },
      }) as Promise<Task>,
    onSuccess: (updated) => {
      queryClient.setQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId), (current = []) => {
        const removed = removeTaskFromGroups(current, updated.id);
        return upsertTaskInSection(removed, updated.sectionId, updated);
      });
      setUndoComplete(null);
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
    },
  });

  const runToggleDone = useCallback(
    (task: Task, done: boolean, force: boolean = false) => {
      completeTask.mutate(
        {
          taskId: task.id,
          done,
          version: task.version,
          force,
        },
        {
          onSuccess: () => {
            if (!done) return;
            if (undoCompleteTimerRef.current) {
              clearTimeout(undoCompleteTimerRef.current);
            }
            setUndoComplete({
              taskId: task.id,
              title: task.title || t('untitledTask'),
              previousStatus: task.status,
              previousProgressPercent: task.progressPercent,
            });
            undoCompleteTimerRef.current = setTimeout(() => {
              setUndoComplete(null);
            }, 7000);
          },
        },
      );
    },
    [completeTask, t],
  );

  const onToggleDoneWithWarning = useCallback(
    (task: Task) => {
      if (!canEdit) return;
      const done = task.status !== 'DONE';
      if (!done) {
        runToggleDone(task, false);
        return;
      }
      const localOpenSubtaskCount = countOpenDescendants(task.id, allTasks);
      if (localOpenSubtaskCount > 0) {
        setPendingCompleteWarning({ task, openSubtaskCount: localOpenSubtaskCount });
        return;
      }

      void (async () => {
        try {
          const subtaskTree = (await api(`/tasks/${task.id}/subtasks/tree`)) as TaskTree[];
          const remoteOpenSubtaskCount = countOpenSubtasksInTree(subtaskTree);
          if (remoteOpenSubtaskCount > 0) {
            setPendingCompleteWarning({ task, openSubtaskCount: remoteOpenSubtaskCount });
            return;
          }
        } catch {
          // If subtask lookup fails, preserve existing completion behavior.
        }
        runToggleDone(task, true);
      })();
    },
    [allTasks, canEdit, runToggleDone],
  );

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
    (groupsValue: SectionTaskGroup[], membersValue: ProjectMember[]): Record<BaseBoardColumnKey, number> => {
      const allTasks = groupsValue.flatMap((group) => group.tasks);
      const currentYear = new Date().getFullYear();
      const clamp = (key: BaseBoardColumnKey, value: number) => {
        const maxWidthByKey: Partial<Record<BaseBoardColumnKey, number>> = {
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
        const min = BOARD_BASE_MIN_COLUMN_WIDTHS[key];
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

      const next: Record<BaseBoardColumnKey, number> = {
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
    const customDefaults = boardColumns.reduce<BoardColumnWidths>((acc, column) => {
      if (!(column.key in autoWidths)) {
        acc[column.key] = column.defaultWidth;
      }
      return acc;
    }, {});
    setColumnWidths({
      ...autoWidths,
      ...customDefaults,
    });
    autoSizedColumnsRef.current = true;
  }, [
    boardColumns,
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
        const byCustomFields =
          activeCustomFieldFilters.length === 0 ||
          activeCustomFieldFilters.every((filter) => taskMatchesCustomFieldFilter(task, filter));
        return bySearch && byStatus && byPriority && byAssignee && byCustomFields;
      }),
    }));
  }, [activeCustomFieldFilters, assigneeFilters, groups, priorityFilter, projectName, search, statusFilter, statusFilters]);

  const groupedVisibleRows = useMemo(() => {
    return filteredGroups.map((group) => {
      const sectionCollapsed = collapsedSectionIds.has(group.section.id);
      const tree = buildSectionTaskTree(group.tasks);
      const rows = sectionCollapsed ? [] : flattenVisibleTasks(tree, collapsedTaskIds);
      return { group, rows, sectionCollapsed };
    });
  }, [collapsedSectionIds, filteredGroups, collapsedTaskIds]);

  const reorderableColumnKeys = useMemo(
    () => orderedBoardColumns.filter((column) => column.key !== 'name').map((column) => column.key),
    [orderedBoardColumns],
  );

  const reorderColumnOrder = useCallback((activeKey: string, overKey: string) => {
    if (!activeKey || !overKey || activeKey === overKey || activeKey === 'name' || overKey === 'name') return;
    setColumnOrder((current) => {
      const working = current.length ? [...current] : [...reorderableColumnKeys];
      const from = working.indexOf(activeKey);
      const to = working.indexOf(overKey);
      if (from < 0 || to < 0 || from === to) return current.length ? current : working;
      return arrayMove(working, from, to);
    });
  }, [reorderableColumnKeys]);

  const onColumnDragStart = (event: DragStartEvent) => {
    const key = parseColumnDragId(String(event.active.id));
    if (!key || key === 'name') return;
    setActiveColumnKey(key);
    setOverColumnKey(key);
    lastColumnOverRef.current = key;
  };

  const onColumnDragOver = (event: DragOverEvent) => {
    const activeKey = parseColumnDragId(String(event.active.id));
    if (!activeKey || activeKey === 'name') return;
    if (!event.over) return;
    const overKey = parseColumnDragId(String(event.over.id));
    if (!overKey || overKey === 'name' || overKey === activeKey) return;
    if (lastColumnOverRef.current === overKey) return;
    reorderColumnOrder(activeKey, overKey);
    setOverColumnKey(overKey);
    lastColumnOverRef.current = overKey;
  };

  const onColumnDragEnd = (event?: DragEndEvent) => {
    if (event?.over) {
      const activeKey = parseColumnDragId(String(event.active.id));
      const overKey = parseColumnDragId(String(event.over.id));
      if (activeKey && overKey) {
        reorderColumnOrder(activeKey, overKey);
      }
    }
    setActiveColumnKey(null);
    setOverColumnKey(null);
    lastColumnOverRef.current = null;
  };

  const onTaskDragEnd = (event: DragEndEvent) => {
    if (!canEdit) return;
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
    if (!canEdit) return;
    const groupsSnapshot = queryClient.getQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId)) ?? [];
    const cachedTask = groupsSnapshot.flatMap((group) => group.tasks).find((task) => task.id === taskId);
    const nextPatch = { ...patch, version: cachedTask?.version ?? patch.version };
    patchTask.mutate({ taskId, patch: nextPatch });
  };

  const onEditCustomField = (task: Task, field: CustomFieldDefinition, value: unknown) => {
    if (!canEdit) return;
    setCustomFieldError(null);
    patchTaskCustomFields.mutate({
      taskId: task.id,
      version: task.version,
      fieldId: field.id,
      value,
    });
  };

  const renderColumnGroup = () => (
    <colgroup>
      {orderedBoardColumns.map((column) => (
        <col key={column.key} style={{ width: `${columnWidths[column.key] ?? column.defaultWidth}px` }} />
      ))}
    </colgroup>
  );

  if (groupsQuery.isLoading) {
    return <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">{t('loadingTasks')}</div>;
  }

  return (
      <div className="space-y-4">
        {customFieldError ? (
          <p className="text-xs text-destructive" data-testid="custom-field-error">
            {customFieldError}
          </p>
        ) : null}

        <Dialog open={createFieldDialogOpen} onOpenChange={(open) => setCreateFieldDialogOpen(canEdit ? open : false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('createCustomField')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                value={newFieldName}
                onChange={(event) => {
                  if (!canEdit) return;
                  setNewFieldName(event.target.value);
                }}
                placeholder={t('customFieldName')}
                data-testid="custom-field-name-input"
                disabled={!canEdit}
              />
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={newFieldType}
                onChange={(event) => {
                  if (!canEdit) return;
                  setNewFieldType(event.target.value as CustomFieldType);
                }}
                data-testid="custom-field-type-select"
                disabled={!canEdit}
              >
                <option value="TEXT">{t('customFieldTypeText')}</option>
                <option value="NUMBER">{t('customFieldTypeNumber')}</option>
                <option value="DATE">{t('customFieldTypeDate')}</option>
                <option value="SELECT">{t('customFieldTypeSelect')}</option>
                <option value="BOOLEAN">{t('customFieldTypeBoolean')}</option>
              </select>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setCreateFieldDialogOpen(false);
                  setNewFieldName('');
                  setNewFieldType('TEXT');
                }}
              >
                {t('cancel')}
              </Button>
              <Button
                data-testid="create-custom-field-btn"
                disabled={!canEdit || !newFieldName.trim() || createCustomField.isPending}
                onClick={() => {
                  if (!canEdit) return;
                  void createCustomField.mutateAsync({
                    name: newFieldName.trim(),
                    type: newFieldType,
                  });
                }}
              >
                {createCustomField.isPending ? t('saving') : t('create')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={manageFieldsDialogOpen} onOpenChange={(open) => setManageFieldsDialogOpen(canEdit ? open : false)}>
          <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t('customFields')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {customFields.filter((field) => !field.archivedAt).map((field) => {
                const draft = fieldDrafts[field.id] ?? {
                  name: field.name,
                  optionsText: field.type === 'SELECT' ? serializeSelectFieldOptions(field) : '',
                };
                const parsedOptions = field.type === 'SELECT'
                  ? parseSelectFieldOptionsInput(draft.optionsText)
                  : [];
                return (
                  <div key={field.id} className="space-y-3 rounded-md border p-3" data-testid={`custom-field-manage-${field.id}`}>
                    <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">{t('name')}</p>
                        <Input
                          value={draft.name}
                          data-testid={`custom-field-name-edit-${field.id}`}
                          onChange={(event) =>
                            canEdit ? setFieldDrafts((current) => ({
                              ...current,
                              [field.id]: {
                                ...draft,
                                name: event.target.value,
                              },
                            })) : undefined
                          }
                          disabled={!canEdit}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">{field.type}</span>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`custom-field-save-${field.id}`}
                          disabled={
                            !canEdit ||
                            patchCustomField.isPending ||
                            !draft.name.trim() ||
                            (field.type === 'SELECT' && parsedOptions.length === 0)
                          }
                          onClick={() =>
                            canEdit ? patchCustomField.mutate({
                              fieldId: field.id,
                              name: draft.name.trim(),
                              optionsText: draft.optionsText,
                              type: field.type,
                            }) : undefined
                          }
                        >
                          {patchCustomField.isPending ? t('saving') : t('save')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          data-testid={`custom-field-delete-${field.id}`}
                          disabled={archiveCustomField.isPending}
                          onClick={() => {
                            if (!canEdit) return;
                            archiveCustomField.mutate(field.id);
                          }}
                        >
                          {t('delete')}
                        </Button>
                      </div>
                    </div>
                    {field.type === 'SELECT' ? (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Options (label|value, one per line)</p>
                        <textarea
                          className="min-h-[120px] w-full rounded-md border bg-background p-2 text-sm"
                          data-testid={`custom-field-options-edit-${field.id}`}
                          value={draft.optionsText}
                          onChange={(event) =>
                            canEdit ? setFieldDrafts((current) => ({
                              ...current,
                              [field.id]: {
                                ...draft,
                                optionsText: event.target.value,
                              },
                            })) : undefined
                          }
                          disabled={!canEdit}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {!customFields.filter((field) => !field.archivedAt).length ? (
                <p className="text-sm text-muted-foreground">{t('noFilterableCustomFields')}</p>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>

        <DndContext
          sensors={columnSensors}
          collisionDetection={pointerWithin}
          onDragStart={onColumnDragStart}
          onDragOver={onColumnDragOver}
          onDragEnd={onColumnDragEnd}
          onDragCancel={onColumnDragEnd}
        >
          <div className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <Table
              className="w-max min-w-full table-fixed"
              containerRef={headerScrollRef}
              onContainerScroll={(event) => syncHorizontalScroll(event.currentTarget)}
            >
              {renderColumnGroup()}
              <TableHeader className="border-b border-[#f0f0f0] bg-transparent dark:border-border/40">
                <SortableContext
                  items={orderedBoardColumns.filter((column) => column.key !== 'name').map((column) => getColumnDragId(column.key))}
                  strategy={horizontalListSortingStrategy}
                >
                  <TableRow className="h-11 hover:bg-transparent">
                    {orderedBoardColumns.map((column, index) => (
                      <SortableColumnHead
                        key={column.key}
                        column={column}
                        index={index}
                        activeColumnKey={activeColumnKey}
                        overColumnKey={overColumnKey}
                        startColumnResize={startColumnResize}
                      />
                    ))}
                  </TableRow>
                </SortableContext>
              </TableHeader>
            </Table>
          </div>
          <DragOverlay>
            {activeColumnKey ? (
              <div className="pointer-events-none rounded-md border bg-background/90 px-3 py-2 text-[11px] font-medium text-foreground shadow-sm opacity-75">
                {orderedBoardColumns.find((column) => column.key === activeColumnKey)?.label ?? ''}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        <DndContext sensors={taskSensors} collisionDetection={closestCenter} onDragEnd={onTaskDragEnd}>
          {groupedVisibleRows.map(({ group, rows, sectionCollapsed }) => {
            const isNoSection = group.section.isDefault || group.section.name.toLowerCase() === 'no section';
            return (
            <SectionDropTarget
              key={group.section.id}
              sectionId={group.section.id}
              highlighted={highlightedSectionId === group.section.id}
            >
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
                          if (!canEdit) {
                            setEditingSectionId(null);
                            setSectionNameDraft('');
                            return;
                          }
                          const next = sectionNameDraft.trim();
                          if (!next || next === group.section.name) {
                            setEditingSectionId(null);
                            setSectionNameDraft('');
                            return;
                          }
                          patchSection.mutate({ sectionId: group.section.id, name: next });
                        }}
                        onKeyDown={(event) => {
                          if (!canEdit) {
                            if (event.key === 'Escape' || event.key === 'Enter') {
                              event.preventDefault();
                              setEditingSectionId(null);
                              setSectionNameDraft('');
                            }
                            return;
                          }
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
                        title={!canEdit ? t('projectReadOnlyHint') : undefined}
                        onClick={() => {
                          if (!canEdit) return;
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
                            onToggleDone={(task) => onToggleDoneWithWarning(task)}
                            members={members}
                            onOpen={setSelectedTaskId}
                            projectName={projectName}
                            boardColumns={orderedBoardColumns}
                            canEdit={canEdit}
                            depth={row.depth}
                            hasChildren={row.hasChildren}
                            collapsed={collapsedTaskIds.has(row.task.id)}
                            draggable={!row.task.parentId && !row.hasChildren}
                            onDelete={(taskId) => deleteTask.mutate(taskId)}
                            onEditCustomField={onEditCustomField}
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
                        if (!canEdit) return;
                        await createTask.mutateAsync({ sectionId, title });
                      }}
                      openSignal={quickAddIntent?.sectionId === group.section.id ? quickAddIntent.nonce : null}
                      showClosedTrigger={!isNoSection}
                      canEdit={canEdit}
                      {...(onQuickAddIntentHandled ? { onOpenSignalHandled: onQuickAddIntentHandled } : {})}
                    />
                  </div>
                </>
              ) : null}
            </SectionDropTarget>
          );})}
        </DndContext>

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

        {undoComplete ? (
          <div
            className="fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm shadow-md"
            data-testid="complete-undo-banner"
          >
            <span>
              {t('taskCompletedLabel')}: {undoComplete.title}
            </span>
            <Button
              size="sm"
              variant="outline"
              data-testid="complete-undo-action"
              disabled={restoreTaskCompletion.isPending}
              onClick={() => {
                if (undoCompleteTimerRef.current) {
                  clearTimeout(undoCompleteTimerRef.current);
                }
                const latest = lookupTaskById(undoComplete.taskId);
                if (!latest) {
                  setUndoComplete(null);
                  return;
                }
                restoreTaskCompletion.mutate({
                  taskId: undoComplete.taskId,
                  status: undoComplete.previousStatus,
                  progressPercent: undoComplete.previousProgressPercent,
                  version: latest.version,
                });
              }}
            >
              {restoreTaskCompletion.isPending ? t('restoring') : t('undo')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              data-testid="complete-undo-dismiss"
              onClick={() => {
                if (undoCompleteTimerRef.current) {
                  clearTimeout(undoCompleteTimerRef.current);
                }
                setUndoComplete(null);
              }}
            >
              {t('dismiss')}
            </Button>
          </div>
        ) : null}

        <Dialog
          open={Boolean(pendingCompleteWarning)}
          onOpenChange={(open) => {
            if (!open) setPendingCompleteWarning(null);
          }}
        >
          <DialogContent className="max-w-md" data-testid="complete-parent-warning-dialog">
            <DialogHeader>
              <DialogTitle>{t('incompleteSubtasksWarningTitle')}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {t('incompleteSubtasksWarningDescription').replace(
                '{count}',
                String(pendingCompleteWarning?.openSubtaskCount ?? 0),
              )}
            </p>
            <DialogFooter>
              <Button
                variant="outline"
                data-testid="complete-parent-warning-cancel"
                onClick={() => setPendingCompleteWarning(null)}
              >
                {t('cancel')}
              </Button>
              <Button
                data-testid="complete-parent-warning-confirm"
                onClick={() => {
                  if (!pendingCompleteWarning) return;
                  runToggleDone(pendingCompleteWarning.task, true, true);
                  setPendingCompleteWarning(null);
                }}
              >
                {t('completeAnyway')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
