'use client';

import { dateOnlyInputToLocalDate, dateOnlyInputValue } from '@atlaspm/domain';
import { CheckCircle2, Circle, Diamond, Stamp } from 'lucide-react';
import { type ReactNode } from 'react';
import type { AuditEvent, ProjectMember, RecurringFrequency, RecurringRule, Task, TaskTree } from '@/lib/types';
import { cn } from '@/lib/utils';

export function getAuditDescriptionText(event: AuditEvent) {
  const beforeRaw = event.beforeJson?.descriptionText;
  const afterRaw = event.afterJson?.descriptionText;
  return {
    before: typeof beforeRaw === 'string' ? beforeRaw : '',
    after: typeof afterRaw === 'string' ? afterRaw : '',
  };
}

export function compactSnapshotActivity(events: AuditEvent[]) {
  const compacted: AuditEvent[] = [];
  for (const event of events) {
    const prev = compacted[compacted.length - 1];
    if (!prev) {
      compacted.push(event);
      continue;
    }

    const bothSnapshotSaves =
      prev.action === 'task.description.snapshot_saved'
      && event.action === 'task.description.snapshot_saved'
      && prev.actor === 'collab-server'
      && event.actor === 'collab-server';
    if (!bothSnapshotSaves) {
      compacted.push(event);
      continue;
    }

    const prevText = getAuditDescriptionText(prev);
    const currentText = getAuditDescriptionText(event);
    const elapsedMs = Math.abs(new Date(event.createdAt).getTime() - new Date(prev.createdAt).getTime());
    const looksDuplicate =
      prevText.after === currentText.after
      && prevText.before !== prevText.after
      && currentText.before === currentText.after
      && elapsedMs <= 2_500;

    if (looksDuplicate) continue;
    compacted.push(event);
  }
  return compacted;
}

export function renderTaskTypeCompletionIcon(task: Task | null | undefined, isDone: boolean) {
  if (task?.type === 'MILESTONE') {
    return <Diamond className={cn('mr-1 h-4 w-4 shrink-0', isDone ? 'fill-current text-emerald-600' : 'text-muted-foreground')} />;
  }
  if (task?.type === 'APPROVAL') {
    return <Stamp className={cn('mr-1 h-4 w-4 shrink-0', isDone ? 'text-emerald-600' : 'text-muted-foreground')} />;
  }
  return isDone ? <CheckCircle2 className="mr-1 h-4 w-4 shrink-0" /> : <Circle className="mr-1 h-4 w-4 shrink-0" />;
}

export function parseCommentBody(body: string) {
  const regex = /@\[(?<id>[a-zA-Z0-9:_-]+)\|(?<label>[^\]]+)\]/g;
  const output: Array<{ type: 'text' | 'mention'; value: string; userId?: string }> = [];
  let cursor = 0;
  let match = regex.exec(body);
  while (match) {
    if (match.index > cursor) {
      output.push({ type: 'text', value: body.slice(cursor, match.index) });
    }
    output.push({
      type: 'mention',
      userId: match.groups?.id ?? '',
      value: `@${match.groups?.label ?? match.groups?.id ?? ''}`,
    });
    cursor = match.index + match[0].length;
    match = regex.exec(body);
  }
  if (cursor < body.length) output.push({ type: 'text', value: body.slice(cursor) });
  return output;
}

export function serializeCommentMentions(body: string, members: ProjectMember[]) {
  if (!body.trim()) return body;
  const idToLabel = new Map<string, string>();
  for (const member of members) {
    const label = member.user.displayName ?? member.user.email ?? member.user.id;
    idToLabel.set(member.userId.toLowerCase(), label);
  }
  return body.replace(/(^|\s)@([a-zA-Z0-9._:|-]+)/g, (whole, prefix: string, mentionId: string) => {
    const label = idToLabel.get(mentionId.toLowerCase());
    if (!label) return whole;
    return `${prefix}@[${mentionId}|${label}]`;
  });
}

export function normalizeComposerMentions(body: string) {
  return body.replace(/@\[(?<id>[a-zA-Z0-9:_-]+)\|[^\]]+\]/g, (_whole, mentionId: string) => `@${mentionId}`);
}

export function statusLabel(status: Task['status'], t: (key: string) => string) {
  if (status === 'TODO') return t('statusTodo');
  if (status === 'IN_PROGRESS') return t('statusInProgress');
  if (status === 'DONE') return t('statusDone');
  if (status === 'BLOCKED') return t('statusBlocked');
  return status;
}

export function assigneeLabel(task: Task | undefined, members: ProjectMember[], t: (key: string) => string) {
  if (!task?.assigneeUserId) return t('unassigned');
  const member = members.find((item) => item.userId === task.assigneeUserId);
  if (!member) return task.assigneeUserId;
  return member.user.displayName || member.user.email || member.user.id;
}

export function initials(value: string) {
  const pieces = value.trim().split(/\s+/).slice(0, 2);
  return pieces.map((piece) => piece.charAt(0).toUpperCase()).join('') || 'U';
}

export function toDateInputValue(value?: string | null) {
  return dateOnlyInputValue(value);
}

export function toDatetimeLocalInputValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function buildDefaultReminderInputValue(dueAt: string | null | undefined, leadTimeMinutes: number) {
  const dueDate = dateOnlyInputToLocalDate(dueAt);
  if (!dueDate) return '';
  const dueMorning = new Date(dueDate);
  dueMorning.setHours(9, 0, 0, 0);
  return toDatetimeLocalInputValue(new Date(dueMorning.getTime() - leadTimeMinutes * 60_000));
}

export function countOpenSubtasks(nodes: TaskTree[]) {
  let count = 0;
  const queue = [...nodes];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) continue;
    if (node.status !== 'DONE') count += 1;
    if (node.children?.length) queue.push(...node.children);
  }
  return count;
}

export function MetadataRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-center gap-2 py-1">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

export type RecurrenceDraft = {
  frequency: RecurringFrequency;
  interval: string;
  daysOfWeek: number[];
  dayOfMonth: string;
  startDate: string;
  endDate: string;
};

export const RECURRENCE_WEEKDAY_KEYS = [
  'weekdaySunShort',
  'weekdayMonShort',
  'weekdayTueShort',
  'weekdayWedShort',
  'weekdayThuShort',
  'weekdayFriShort',
  'weekdaySatShort',
] as const;

export function recurrenceIntervalLabel(interval: number, frequency: RecurringFrequency, t: (key: string) => string) {
  if (frequency === 'DAILY') {
    return interval === 1
      ? t('recurrenceEveryDay')
      : t('recurrenceEveryDays').replace('{count}', String(interval));
  }
  if (frequency === 'WEEKLY') {
    return interval === 1
      ? t('recurrenceEveryWeek')
      : t('recurrenceEveryWeeks').replace('{count}', String(interval));
  }
  return interval === 1
    ? t('recurrenceEveryMonth')
    : t('recurrenceEveryMonths').replace('{count}', String(interval));
}

export function recurrenceSummary(rule: RecurringRule, locale: 'en' | 'ja', t: (key: string) => string) {
  const parts = [recurrenceIntervalLabel(rule.interval, rule.frequency, t)];
  if (rule.frequency === 'WEEKLY' && rule.daysOfWeek.length) {
    parts.push(rule.daysOfWeek
      .slice()
      .sort((left, right) => left - right)
      .map((day) => t(RECURRENCE_WEEKDAY_KEYS[day] ?? RECURRENCE_WEEKDAY_KEYS[0]))
      .join(', '));
  }
  if (rule.frequency === 'MONTHLY' && rule.dayOfMonth) {
    parts.push(t('recurrenceDayNumber').replace('{day}', String(rule.dayOfMonth)));
  }
  const startDate = dateOnlyInputToLocalDate(rule.startDate);
  if (startDate) {
    parts.push(startDate.toLocaleDateString(locale === 'ja' ? 'ja-JP' : 'en-US'));
  }
  if (!rule.isActive) {
    parts.unshift(t('recurrenceDisabled'));
  }
  return parts.join(' • ');
}

export function localDateInputToday() {
  const now = new Date();
  const localDateAsUtc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  return localDateAsUtc.toISOString().slice(0, 10);
}

export function createRecurrenceDraft(task: Task | undefined, rule: RecurringRule | null): RecurrenceDraft {
  const fallbackStartDate = dateOnlyInputValue(task?.startAt) || dateOnlyInputValue(task?.dueAt) || localDateInputToday();
  return {
    frequency: rule?.frequency ?? 'DAILY',
    interval: String(rule?.interval ?? 1),
    daysOfWeek: rule?.daysOfWeek ?? [],
    dayOfMonth: rule?.dayOfMonth ? String(rule.dayOfMonth) : '',
    startDate: dateOnlyInputValue(rule?.startDate) || fallbackStartDate,
    endDate: dateOnlyInputValue(rule?.endDate) || '',
  };
}
