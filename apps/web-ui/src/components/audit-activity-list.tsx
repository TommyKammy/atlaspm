'use client';

import { dateOnlyInputToLocalDate } from '@atlaspm/domain';
import { useMemo } from 'react';
import { useI18n } from '@/lib/i18n';
import type { AuditEvent, ProjectMember, Section, Task, RuleCondition, RuleAction } from '@/lib/types';

const AUDIT_DIFF_IGNORED_KEYS = new Set([
  'createdAt',
  'updatedAt',
  'version',
  'descriptionVersion',
  'correlationId',
]);

const AUDIT_DIFF_PREFERRED_KEYS = new Set([
  'title',
  'name',
  'status',
  'progressPercent',
  'priority',
  'assigneeUserId',
  'startAt',
  'dueAt',
  'sectionId',
  'completedAt',
  'parentId',
  'deletedAt',
  'role',
  'userId',
  'enabled',
  'cooldownSec',
  'templateKey',
  'definition',
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPrimitive(value: unknown) {
  return (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function humanizeKey(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusLabel(status: Task['status'], t: (key: string) => string) {
  if (status === 'TODO') return t('statusTodo');
  if (status === 'IN_PROGRESS') return t('statusInProgress');
  if (status === 'DONE') return t('statusDone');
  return t('statusBlocked');
}

function auditFieldLabel(key: string, t: (key: string) => string) {
  if (key === 'title' || key === 'name') return t('name');
  if (key === 'status') return t('status');
  if (key === 'progressPercent') return t('progress');
  if (key === 'priority') return t('priorityAll').replace(':', '');
  if (key === 'assigneeUserId') return t('assignee');
  if (key === 'startAt') return t('startDate');
  if (key === 'dueAt') return t('dueDate');
  if (key === 'sectionId') return t('section');
  if (key === 'completedAt') return t('statusDone');
  if (key === 'parentId') return t('subtasks');
  if (key === 'deletedAt') return t('delete');
  if (key === 'userId') return t('members');
  return humanizeKey(key);
}

function formatCondition(condition: RuleCondition, t: (key: string) => string) {
  const field = condition.field === 'customFieldNumber'
    ? t('auditCustomFieldLabel').replace('{{fieldId}}', condition.fieldId)
    : t('progress').toLowerCase();
  const op = condition.op;
  if (op === 'between') {
    return `${field} ${condition.min ?? 0}-${condition.max ?? 0}`;
  }
  return `${field} ${op} ${condition.value ?? 0}`;
}

function formatAction(action: RuleAction, t: (key: string) => string) {
  if (action.type === 'setStatus') return `${t('status')} -> ${statusLabel(action.status, t)}`;
  if (action.type === 'setCompletedAtNow') return t('auditMarkComplete');
  if (action.type === 'setCompletedAtNull') return t('auditClearCompletion');
  return t('auditUpdateTask');
}

function describeRuleDefinition(
  value: unknown,
  t: (key: string) => string,
) {
  if (!isPlainRecord(value)) return '';
  const trigger = typeof value.trigger === 'string' ? value.trigger : t('auditRuleTriggerFallback');
  const conditions = Array.isArray(value.conditions)
    ? value.conditions
        .filter((item): item is RuleCondition => isPlainRecord(item) && typeof item.field === 'string' && typeof item.op === 'string')
        .map((item) => formatCondition(item, t))
    : [];
  const actions = Array.isArray(value.actions)
    ? value.actions
        .filter((item): item is RuleAction => isPlainRecord(item) && typeof item.type === 'string')
        .map((item) => formatAction(item, t))
    : [];

  const conditionSummary = conditions.length ? conditions.join(` ${t('auditJoinAnd')} `) : t('auditAlways');
  const actionSummary = actions.length ? actions.join(', ') : t('auditNoActions');
  return `${trigger}: ${conditionSummary} -> ${actionSummary}`;
}

function extractAuditDiff(event: AuditEvent) {
  const before = isPlainRecord(event.beforeJson) ? event.beforeJson : {};
  const after = isPlainRecord(event.afterJson) ? event.afterJson : {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  const changed = [...keys].filter((key) => {
    if (AUDIT_DIFF_IGNORED_KEYS.has(key)) return false;
    const left = before[key];
    const right = after[key];
    if (JSON.stringify(left) === JSON.stringify(right)) return false;
    if (AUDIT_DIFF_PREFERRED_KEYS.has(key)) return true;
    return isPrimitive(left) && isPrimitive(right);
  });

  return { before, after, changed };
}

function formatAuditEvent(action: string, t: (key: string) => string) {
  if (action === 'task.description.updated') return t('activityUpdatedDescription');
  if (action === 'task.description.snapshot_saved') return t('activityUpdatedDescription');
  if (action === 'task.comment.created') return t('activityAddedComment');
  if (action === 'task.comment.updated') return t('activityEditedComment');
  if (action === 'task.comment.deleted') return t('activityDeletedComment');
  if (action === 'task.reordered') return t('activityReorderedTask');
  if (action === 'task.updated') return t('activityUpdatedTask');
  if (action === 'task.mention.created') return t('activityAddedMention');
  if (action === 'task.mention.deleted') return t('activityRemovedMention');
  if (action === 'task.attachment.created') return t('activityAddedAttachment');
  if (action === 'task.attachment.deleted') return t('activityDeletedAttachment');
  if (action === 'task.reminder.set') return t('activitySetReminder');
  if (action === 'task.reminder.cleared') return t('activityClearedReminder');
  if (action === 'task.reminder.sent') return t('activitySentReminder');
  if (action === 'rule.applied') return t('activityAppliedRule');
  if (action === 'project.created') return t('activityCreatedProject');
  if (action === 'project.member.added') return t('activityAddedProjectMember');
  if (action === 'project.member.role_changed') return t('activityChangedProjectMemberRole');
  if (action === 'project.member.removed') return t('activityRemovedProjectMember');
  if (action === 'rule.created') return t('activityCreatedRule');
  if (action === 'rule.updated') return t('activityUpdatedRule');
  if (action === 'rule.enabled') return t('activityEnabledRule');
  if (action === 'rule.disabled') return t('activityDisabledRule');
  if (action === 'rule.deleted') return t('activityDeletedRule');
  if (action === 'rule.ensure_template') return t('activityEnsuredTemplateRule');
  if (action === 'project.view_default.updated') return t('activityUpdatedDefaultView');
  if (action === 'project.saved_view.created') return t('activityCreatedSavedView');
  if (action === 'project.saved_view.updated') return t('activityUpdatedSavedView');
  if (action === 'project.saved_view.deleted') return t('activityDeletedSavedView');
  return action;
}

function actorLabel(actor: string, memberLabels: Map<string, string>) {
  return memberLabels.get(actor) ?? actor;
}

export function AuditActivityList({
  events,
  members = [],
  sections = [],
}: {
  events: AuditEvent[];
  members?: ProjectMember[];
  sections?: Section[];
}) {
  const { t, locale } = useI18n();
  const memberLabels = useMemo(
    () =>
      new Map(
        members.map((member) => [
          member.userId,
          member.user.displayName ?? member.user.email ?? member.userId,
        ]),
      ),
    [members],
  );
  const sectionLabels = useMemo(
    () => new Map(sections.map((section) => [section.id, section.name])),
    [sections],
  );

  const resolveMemberLabel = (value: string) => memberLabels.get(value) ?? value;

  const formatAuditValue = (value: unknown, field: string) => {
    if (value === null || value === undefined || value === '') return t('noValue');
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return field === 'progressPercent' ? `${value}%` : String(value);
    if (typeof value === 'string') {
      if (field === 'status') return statusLabel(value as Task['status'], t);
      if (field === 'assigneeUserId' || field === 'userId' || field === 'deletedByUserId') return resolveMemberLabel(value);
      if (field === 'sectionId') return sectionLabels.get(value) ?? value;
      if (field === 'startAt' || field === 'dueAt' || field === 'baselineStartAt' || field === 'baselineDueAt') {
        const date = dateOnlyInputToLocalDate(value);
        if (date) {
          return date.toLocaleDateString(locale === 'ja' ? 'ja-JP' : 'en-US');
        }
      }
      if (field.endsWith('At')) {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
          return date.toLocaleString(locale === 'ja' ? 'ja-JP' : 'en-US');
        }
      }
      return value;
    }
    if (field === 'definition') {
      return describeRuleDefinition(value, t);
    }
    const serialized = JSON.stringify(value);
    return serialized.length > 120 ? `${serialized.slice(0, 120)}...` : serialized;
  };

  return (
    <div className="space-y-2">
      {events.map((event) => {
        const diff = extractAuditDiff(event);
        return (
          <div key={event.id} className="border-b border-border/60 pb-2 last:border-b-0" data-testid={`activity-${event.id}`}>
            <div className="text-sm font-medium">
              {actorLabel(event.actor, memberLabels)} {formatAuditEvent(event.action, t)}
            </div>
            <div className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</div>
            {diff.changed.length ? (
              <div className="mt-2 space-y-1 rounded-md border border-border/60 bg-muted/20 p-2">
                <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t('changes')}
                </div>
                {diff.changed.slice(0, 8).map((field) => (
                  <div key={`${event.id}-${field}`} className="grid grid-cols-[132px_1fr_1fr] gap-2 text-xs">
                    <div className="text-muted-foreground">{auditFieldLabel(field, t)}</div>
                    <div>
                      <span className="font-medium">{t('before')}:</span>{' '}
                      {formatAuditValue(diff.before[field], field)}
                    </div>
                    <div>
                      <span className="font-medium">{t('after')}:</span>{' '}
                      {formatAuditValue(diff.after[field], field)}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
      {!events.length ? <div className="text-sm text-muted-foreground">{t('noActivityYet')}</div> : null}
    </div>
  );
}
