'use client';

import { CheckCircle2, Circle, Diamond, Stamp } from 'lucide-react';
import type {
  CustomFieldDefinition,
  ProjectMember,
  SectionTaskGroup,
  Task,
  TaskCustomFieldValue,
} from '@/lib/types';
import type { CustomFieldFilter } from '@/lib/project-filters';
import { cn } from '@/lib/utils';

function sortByPosition(tasks: Task[]) {
  return [...tasks].sort((a, b) => a.position - b.position);
}

export function renderTaskTypeCompletionIcon(task: Task, isDone: boolean) {
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

export function removeTaskFromGroups(groups: SectionTaskGroup[], taskId: string) {
  return groups.map((group) => ({
    ...group,
    tasks: group.tasks.filter((task) => task.id !== taskId),
  }));
}

export function upsertTaskInSection(groups: SectionTaskGroup[], sectionId: string, task: Task) {
  return groups.map((group) => {
    if (group.section.id !== sectionId) return group;
    const nextTasks = sortByPosition([task, ...group.tasks.filter((item) => item.id !== task.id)]);
    return { ...group, tasks: nextTasks };
  });
}

export function resolveAssigneeLabel(task: Task, members: ProjectMember[]) {
  if (!task.assigneeUserId) return 'unassigned';
  const member = members.find((item) => item.userId === task.assigneeUserId);
  if (!member) return task.assigneeUserId;
  return member.user.displayName || member.user.email || member.userId;
}

export function initials(label: string) {
  const pieces = label.trim().split(/\s+/).slice(0, 2);
  return pieces.map((piece) => piece.charAt(0).toUpperCase()).join('') || 'U';
}

export function customFieldColumnKey(fieldId: string) {
  return `cf:${fieldId}`;
}

export function findTaskCustomFieldValue(task: Task, fieldId: string): TaskCustomFieldValue | null {
  return task.customFieldValues?.find((value) => value.fieldId === fieldId) ?? null;
}

export function taskMatchesCustomFieldFilter(task: Task, filter: CustomFieldFilter): boolean {
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

export function optimisticCustomFieldValues(
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
