'use client';

import { normalizeDateOnlyUtcIso } from '@atlaspm/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Flag,
  Folder,
  Gauge,
  Paperclip,
  Tag,
  UserCircle2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { api, apiBaseUrl, useProjects } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { queryKeys } from '@/lib/query-keys';
import { DEFAULT_REMINDER_PREFERENCES } from '@/lib/reminder-preferences';
import type {
  ProjectMember,
  RecurringFrequency,
  RecurringRule,
  ReminderPreferences,
  Task,
  TaskAttachment,
  TaskDependency,
  TaskReminder,
  TaskTree,
} from '@/lib/types';
import { ApprovalSection } from '@/components/task-approval-section';
import { DependencyManager } from '@/components/dependency-manager';
import TaskDescriptionEditor from '@/components/editor/TaskDescriptionEditor';
import { FollowerToggle } from '@/components/follower-toggle';
import { ProjectSelector } from '@/components/project-selector';
import { SubtaskList } from '@/components/subtask-list';
import {
  assigneeLabel,
  buildDefaultReminderInputValue,
  createRecurrenceDraft,
  initials,
  MetadataRow,
  RECURRENCE_WEEKDAY_KEYS,
  recurrenceSummary,
  statusLabel,
  toDateInputValue,
  toDatetimeLocalInputValue,
  type RecurrenceDraft,
} from '@/components/task-detail/task-detail-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type FollowerState = Pick<Task, 'followerCount' | 'isFollowedByCurrentUser'>;

function toFollowerState(response: {
  followerCount: number;
  isFollowedByCurrentUser: boolean;
}) {
  return {
    followerCount: response.followerCount,
    isFollowedByCurrentUser: response.isFollowedByCurrentUser,
  } satisfies FollowerState;
}

function updateGroupedTaskFollowerState(
  projectId: string,
  queryClient: ReturnType<typeof useQueryClient>,
  taskId: string,
  followerState: FollowerState,
) {
  queryClient.setQueryData(queryKeys.projectTasksGrouped(projectId), (current: unknown) => {
    if (!Array.isArray(current)) return current;
    return current.map((group) => {
      if (!group || typeof group !== 'object' || !('tasks' in group) || !Array.isArray(group.tasks)) {
        return group;
      }
      return {
        ...group,
        tasks: group.tasks.map((task: Task) => (task.id === taskId ? { ...task, ...followerState } : task)),
      };
    });
  });
}

export function TaskDetailDetailsTab({
  taskId,
  projectId,
  currentTask,
  attachmentsSectionRef,
  onTaskUpdated,
}: {
  taskId: string;
  projectId: string;
  currentTask: Task | undefined;
  attachmentsSectionRef: RefObject<HTMLElement | null>;
  onTaskUpdated: (updated: Task) => Promise<void> | void;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [reminderAtInput, setReminderAtInput] = useState('');
  const [progressInput, setProgressInput] = useState('0');
  const [startDateInput, setStartDateInput] = useState('');
  const [dueDateInput, setDueDateInput] = useState('');
  const [assigneeInput, setAssigneeInput] = useState<string>('unassigned');
  const [statusInput, setStatusInput] = useState<Task['status']>('TODO');
  const [recurrenceDraft, setRecurrenceDraft] = useState<RecurrenceDraft>(createRecurrenceDraft(undefined, null));
  const [isRecurrenceEditing, setIsRecurrenceEditing] = useState(false);
  const [recurrenceError, setRecurrenceError] = useState<string | null>(null);
  const pendingScheduleDraftRef = useRef<{ startDate: string; dueDate: string } | null>(null);

  const membersQuery = useQuery<ProjectMember[]>({
    queryKey: queryKeys.projectMembers(projectId),
    queryFn: () => api(`/projects/${projectId}/members`),
  });

  const attachmentsQuery = useQuery<TaskAttachment[]>({
    queryKey: queryKeys.taskAttachments(taskId),
    queryFn: () => api(`/tasks/${taskId}/attachments`),
  });

  const reminderQuery = useQuery<TaskReminder | null>({
    queryKey: queryKeys.taskReminder(taskId),
    queryFn: () => api(`/tasks/${taskId}/reminder`),
  });

  const reminderPreferencesQuery = useQuery<ReminderPreferences>({
    queryKey: queryKeys.reminderPreferences,
    queryFn: () => api('/me/reminder-preferences'),
  });

  const dependenciesQuery = useQuery<TaskDependency[]>({
    queryKey: queryKeys.taskDependencies(taskId),
    queryFn: () => api(`/tasks/${taskId}/dependencies`),
  });

  const subtasksTreeQuery = useQuery<TaskTree[]>({
    queryKey: queryKeys.taskSubtaskTree(taskId),
    queryFn: () => api(`/tasks/${taskId}/subtasks/tree`),
  });

  const meQuery = useQuery<{ id: string }>({
    queryKey: queryKeys.me,
    queryFn: () => api('/me'),
  });

  const projectQuery = useQuery<{ id: string; workspaceId: string; name: string }>({
    queryKey: ['project', projectId],
    queryFn: () => api(`/projects/${projectId}`),
    enabled: !!projectId,
  });

  const recurringRulesQuery = useQuery<RecurringRule[]>({
    queryKey: queryKeys.projectRecurringRules(projectId, { includeInactive: true }),
    queryFn: () => api(`/projects/${projectId}/recurring-rules?includeInactive=true`),
  });

  const projectsQuery = useProjects(projectQuery.data?.workspaceId ?? '');
  const members = membersQuery.data ?? [];
  const attachments = attachmentsQuery.data ?? [];
  const dependencies = dependenciesQuery.data ?? [];
  const blockingCount = dependencies.filter((dep) => dep.dependsOnTask && dep.dependsOnTask.status !== 'DONE').length;
  const reminderPreferences = reminderPreferencesQuery.data ?? DEFAULT_REMINDER_PREFERENCES;
  const reminderLocal = reminderQuery.data?.remindAt
    ? toDatetimeLocalInputValue(new Date(reminderQuery.data.remindAt))
    : '';
  const defaultReminderInput =
    !reminderQuery.data?.id && reminderPreferences.enabled
      ? buildDefaultReminderInputValue(currentTask?.dueAt, reminderPreferences.defaultLeadTimeMinutes)
      : '';
  const reminderInput = reminderAtInput || reminderLocal || defaultReminderInput;
  const currentAssignee = assigneeLabel(currentTask, members, t);
  const isProjectAdmin = members.some((member) => member.userId === meQuery.data?.id && member.role === 'ADMIN');

  const subtaskProgress = useMemo(() => {
    const walk = (nodes: TaskTree[]): { total: number; done: number } =>
      nodes.reduce(
        (acc, node) => {
          const child = walk(node.children ?? []);
          return {
            total: acc.total + 1 + child.total,
            done: acc.done + (node.status === 'DONE' ? 1 : 0) + child.done,
          };
        },
        { total: 0, done: 0 },
      );
    const counted = walk(subtasksTreeQuery.data ?? []);
    const percent = counted.total ? Math.round((counted.done / counted.total) * 100) : 0;
    return { ...counted, percent };
  }, [subtasksTreeQuery.data]);

  const currentRecurringRule = useMemo(() => {
    if (!currentTask) return null;
    const rules = recurringRulesQuery.data ?? [];
    if (currentTask.recurringRuleId) {
      const generatedRule = rules.find((rule) => rule.id === currentTask.recurringRuleId);
      if (generatedRule) return generatedRule;
    }
    return rules.find((rule) => rule.sourceTaskId === currentTask.id) ?? null;
  }, [currentTask, recurringRulesQuery.data]);

  useEffect(() => {
    if (!currentTask) return;
    setProgressInput(String(currentTask.progressPercent ?? 0));
    setStartDateInput(toDateInputValue(currentTask.startAt));
    setDueDateInput(toDateInputValue(currentTask.dueAt));
    setAssigneeInput(currentTask.assigneeUserId ?? 'unassigned');
    setStatusInput(currentTask.status);
  }, [currentTask]);

  useEffect(() => {
    setRecurrenceDraft(createRecurrenceDraft(currentTask, currentRecurringRule));
    setRecurrenceError(null);
    setIsRecurrenceEditing(false);
  }, [currentRecurringRule?.id, currentRecurringRule?.updatedAt, currentTask?.id]);

  const invalidateAudit = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.taskAudit(taskId) });
  };

  const patchTask = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`/tasks/${taskId}`, { method: 'PATCH', body }) as Promise<Task>,
    onSuccess: async (updated) => {
      await onTaskUpdated(updated);
      await invalidateAudit();
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
    },
  });

  const patchSchedule = useMutation({
    mutationFn: ({
      version,
      startDate,
      dueDate,
    }: {
      version: number;
      startDate: string;
      dueDate: string;
    }) =>
      api(`/tasks/${taskId}`, {
        method: 'PATCH',
        body: {
          version,
          startAt: normalizeDateOnlyUtcIso(startDate),
          dueAt: normalizeDateOnlyUtcIso(dueDate),
        },
      }) as Promise<Task>,
    onSuccess: async (updated) => {
      await onTaskUpdated(updated);
      const pending = pendingScheduleDraftRef.current;
      const persistedStartDate = toDateInputValue(updated.startAt);
      const persistedDueDate = toDateInputValue(updated.dueAt);
      if (pending && (pending.startDate !== persistedStartDate || pending.dueDate !== persistedDueDate)) {
        pendingScheduleDraftRef.current = null;
        patchSchedule.mutate({
          version: updated.version,
          startDate: pending.startDate,
          dueDate: pending.dueDate,
        });
      }
      await invalidateAudit();
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
    },
  });

  const followTask = useMutation({
    mutationFn: () =>
      api(`/tasks/${taskId}/followers`, { method: 'POST' }) as Promise<{
        followerCount: number;
        isFollowedByCurrentUser: boolean;
      }>,
    onSuccess: (updated) => {
      const followerState = toFollowerState(updated);
      queryClient.setQueryData<Task | undefined>(queryKeys.taskDetail(taskId), (current) =>
        current ? { ...current, ...followerState } : current,
      );
      updateGroupedTaskFollowerState(projectId, queryClient, taskId, followerState);
    },
  });

  const unfollowTask = useMutation({
    mutationFn: () =>
      api(`/tasks/${taskId}/followers/me`, { method: 'DELETE' }) as Promise<{
        followerCount: number;
        isFollowedByCurrentUser: boolean;
      }>,
    onSuccess: (updated) => {
      const followerState = toFollowerState(updated);
      queryClient.setQueryData<Task | undefined>(queryKeys.taskDetail(taskId), (current) =>
        current ? { ...current, ...followerState } : current,
      );
      updateGroupedTaskFollowerState(projectId, queryClient, taskId, followerState);
    },
  });

  const deleteAttachment = useMutation({
    mutationFn: (id: string) => api(`/attachments/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskAttachments(taskId) });
      await invalidateAudit();
    },
  });

  const setReminder = useMutation({
    mutationFn: (remindAt: string) => api(`/tasks/${taskId}/reminder`, { method: 'PUT', body: { remindAt } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskReminder(taskId) });
      await invalidateAudit();
    },
  });

  const clearReminder = useMutation({
    mutationFn: () => api(`/tasks/${taskId}/reminder`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskReminder(taskId) });
      await invalidateAudit();
    },
  });

  const createRecurrence = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/projects/${projectId}/recurring-rules`, {
        method: 'POST',
        body,
      }) as Promise<RecurringRule>,
    onSuccess: async (created) => {
      setRecurrenceError(null);
      setIsRecurrenceEditing(false);
      queryClient.setQueryData<RecurringRule[]>(
        queryKeys.projectRecurringRules(projectId, { includeInactive: true }),
        (current = []) => [created, ...current.filter((rule) => rule.id !== created.id)],
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectRecurringRules(projectId, { includeInactive: true }) });
      await invalidateAudit();
    },
    onError: (error) => {
      setRecurrenceError(error instanceof Error ? error.message : t('recurrenceSaveFailed'));
    },
  });

  const updateRecurrence = useMutation({
    mutationFn: ({ ruleId, body }: { ruleId: string; body: Record<string, unknown> }) =>
      api(`/recurring-rules/${ruleId}`, {
        method: 'PUT',
        body,
      }) as Promise<RecurringRule>,
    onSuccess: async (updated) => {
      setRecurrenceError(null);
      setIsRecurrenceEditing(false);
      queryClient.setQueryData<RecurringRule[]>(
        queryKeys.projectRecurringRules(projectId, { includeInactive: true }),
        (current = []) => {
          if (!current.some((rule) => rule.id === updated.id)) {
            return [updated, ...current];
          }
          return current.map((rule) => (rule.id === updated.id ? { ...rule, ...updated } : rule));
        },
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectRecurringRules(projectId, { includeInactive: true }) });
      await invalidateAudit();
    },
    onError: (error) => {
      setRecurrenceError(error instanceof Error ? error.message : t('recurrenceSaveFailed'));
    },
  });

  const commitProgress = () => {
    if (!currentTask) return;
    const parsed = Number(progressInput);
    if (Number.isNaN(parsed)) {
      setProgressInput(String(currentTask.progressPercent));
      return;
    }
    const normalized = Math.max(0, Math.min(100, Math.round(parsed)));
    if (normalized === currentTask.progressPercent) return;
    patchTask.mutate({ progressPercent: normalized, version: currentTask.version });
  };

  const commitSchedule = (nextStartDate: string, nextDueDate: string) => {
    if (!currentTask) return;
    const currentStartAt = toDateInputValue(currentTask.startAt);
    const currentDueAt = toDateInputValue(currentTask.dueAt);
    if (currentStartAt === nextStartDate && currentDueAt === nextDueDate) return;
    pendingScheduleDraftRef.current = { startDate: nextStartDate, dueDate: nextDueDate };
    if (patchSchedule.isPending) return;
    pendingScheduleDraftRef.current = null;
    patchSchedule.mutate({
      version: currentTask.version,
      startDate: nextStartDate,
      dueDate: nextDueDate,
    });
  };

  const commitStatus = (nextStatus: Task['status']) => {
    if (!currentTask || currentTask.status === nextStatus) return;
    patchTask.mutate({ status: nextStatus, version: currentTask.version });
  };

  const commitAssignee = (nextAssignee: string) => {
    if (!currentTask) return;
    const assigneeUserId = nextAssignee === 'unassigned' ? null : nextAssignee;
    if ((currentTask.assigneeUserId ?? null) === assigneeUserId) return;
    patchTask.mutate({ assigneeUserId, version: currentTask.version });
  };

  const toggleRecurrenceWeekday = (day: number) => {
    setRecurrenceDraft((current) => ({
      ...current,
      daysOfWeek: current.daysOfWeek.includes(day)
        ? current.daysOfWeek.filter((item) => item !== day)
        : [...current.daysOfWeek, day].sort((left, right) => left - right),
    }));
  };

  const saveRecurrence = () => {
    if (!currentTask) return;

    const parsedInterval = Number.parseInt(recurrenceDraft.interval, 10);
    if (!Number.isFinite(parsedInterval) || parsedInterval < 1 || !recurrenceDraft.startDate) {
      setRecurrenceError(t('recurrenceSaveFailed'));
      return;
    }

    if (recurrenceDraft.frequency === 'WEEKLY' && recurrenceDraft.daysOfWeek.length === 0) {
      setRecurrenceError(t('recurrenceWeeklyValidation'));
      return;
    }

    const parsedDayOfMonth = Number.parseInt(recurrenceDraft.dayOfMonth, 10);
    if (
      recurrenceDraft.frequency === 'MONTHLY'
      && (!Number.isFinite(parsedDayOfMonth) || parsedDayOfMonth < 1 || parsedDayOfMonth > 31)
    ) {
      setRecurrenceError(t('recurrenceMonthlyValidation'));
      return;
    }

    const body = {
      frequency: recurrenceDraft.frequency,
      interval: parsedInterval,
      daysOfWeek: recurrenceDraft.frequency === 'WEEKLY' ? recurrenceDraft.daysOfWeek : [],
      dayOfMonth: recurrenceDraft.frequency === 'MONTHLY' ? parsedDayOfMonth : null,
      startDate: normalizeDateOnlyUtcIso(recurrenceDraft.startDate),
      endDate: recurrenceDraft.endDate ? normalizeDateOnlyUtcIso(recurrenceDraft.endDate) : null,
    };

    if (currentRecurringRule) {
      updateRecurrence.mutate({ ruleId: currentRecurringRule.id, body });
      return;
    }

    createRecurrence.mutate({
      ...body,
      title: currentTask.title.trim() || t('untitledTask'),
      description: currentTask.descriptionText ?? currentTask.description ?? '',
      sectionId: currentTask.sectionId,
      sourceTaskId: currentTask.id,
      assigneeUserId: currentTask.assigneeUserId ?? undefined,
      priority: currentTask.priority ?? undefined,
      tags: currentTask.tags ?? [],
    });
  };

  const toggleRecurrenceActive = (nextActive: boolean) => {
    if (!currentRecurringRule) return;
    updateRecurrence.mutate({
      ruleId: currentRecurringRule.id,
      body: { isActive: nextActive },
    });
  };

  return (
    <div className="space-y-5">
      <section className="space-y-1 border-b border-border/50 pb-4">
        <MetadataRow icon={<UserCircle2 className="h-3.5 w-3.5" />} label={t('assignee')}>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/60 bg-muted/30 text-[11px] font-medium">
              {initials(currentAssignee)}
            </span>
            <select
              value={assigneeInput}
              onChange={(event) => {
                const next = event.target.value;
                setAssigneeInput(next);
                commitAssignee(next);
              }}
              className="h-8 rounded-md border border-transparent bg-transparent px-2 text-sm hover:bg-muted/30 focus:border-border focus:outline-none"
            >
              <option value="unassigned">{t('unassigned')}</option>
              {members.map((member) => {
                const label = member.user.displayName || member.user.email || member.user.id;
                return (
                  <option key={member.userId} value={member.userId}>
                    {label}
                  </option>
                );
              })}
            </select>
          </div>
        </MetadataRow>

        <MetadataRow icon={<CalendarDays className="h-3.5 w-3.5" />} label={t('startDate')}>
          <Input
            type="date"
            value={startDateInput}
            onChange={(event) => {
              setStartDateInput(event.target.value);
              commitSchedule(event.target.value, dueDateInput);
            }}
            onBlur={() => commitSchedule(startDateInput, dueDateInput)}
            className="h-8 w-[220px] border-transparent bg-transparent px-2 shadow-none hover:bg-muted/30 focus-visible:border-border"
            data-testid="task-detail-start-date"
          />
        </MetadataRow>

        <MetadataRow icon={<CalendarDays className="h-3.5 w-3.5" />} label={t('endDate')}>
          <Input
            type="date"
            value={dueDateInput}
            onChange={(event) => {
              setDueDateInput(event.target.value);
              commitSchedule(startDateInput, event.target.value);
            }}
            onBlur={() => commitSchedule(startDateInput, dueDateInput)}
            className="h-8 w-[220px] border-transparent bg-transparent px-2 shadow-none hover:bg-muted/30 focus-visible:border-border"
            data-testid="task-detail-due-date"
          />
        </MetadataRow>

        <MetadataRow icon={<Gauge className="h-3.5 w-3.5" />} label={t('progress')}>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={0}
              max={100}
              value={progressInput}
              onChange={(event) => setProgressInput(event.target.value)}
              onBlur={commitProgress}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
              className="h-8 w-[88px] border-transparent bg-transparent px-2 shadow-none hover:bg-muted/30 focus-visible:border-border"
            />
            <div className="h-[4px] w-40 overflow-hidden rounded bg-muted">
              <div
                className={cn('h-full rounded transition-all', (currentTask?.progressPercent ?? 0) >= 100 ? 'bg-emerald-500' : 'bg-primary')}
                style={{ width: `${Math.max(0, Math.min(100, currentTask?.progressPercent ?? 0))}%` }}
              />
            </div>
          </div>
        </MetadataRow>

        <MetadataRow icon={<CheckCircle2 className="h-3.5 w-3.5" />} label={t('status')}>
          <select
            value={statusInput}
            onChange={(event) => {
              const next = event.target.value as Task['status'];
              setStatusInput(next);
              commitStatus(next);
            }}
            className="h-8 min-w-[200px] rounded-full border border-transparent bg-transparent px-3 text-sm hover:bg-muted/30 focus:border-border focus:outline-none"
          >
            {(['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'] as const).map((status) => (
              <option key={status} value={status}>
                {statusLabel(status, t)}
              </option>
            ))}
          </select>
        </MetadataRow>

        <MetadataRow icon={<Tag className="h-3.5 w-3.5" />} label={t('taskType')}>
          <select
            value={currentTask?.type ?? 'TASK'}
            onChange={(event) => {
              const nextType = event.target.value as Task['type'];
              if (!currentTask) return;
              patchTask.mutate({ type: nextType, version: currentTask.version });
            }}
            disabled={!currentTask || patchTask.isPending}
            className="h-8 min-w-[200px] rounded-full border border-transparent bg-transparent px-3 text-sm hover:bg-muted/30 focus:border-border focus:outline-none disabled:opacity-50"
            data-testid="task-detail-type"
          >
            {(['TASK', 'MILESTONE', 'APPROVAL'] as const).map((type) => (
              <option key={type} value={type}>
                {type === 'TASK' ? t('taskTypeTask') : type === 'MILESTONE' ? t('taskTypeMilestone') : t('taskTypeApproval')}
              </option>
            ))}
          </select>
        </MetadataRow>

        <MetadataRow icon={<Folder className="h-3.5 w-3.5" />} label={t('projects')}>
          <ProjectSelector
            taskId={taskId}
            workspaceId={projectQuery.data?.workspaceId ?? ''}
            availableProjects={projectsQuery.data ?? []}
          />
        </MetadataRow>

        {currentTask ? (
          <MetadataRow icon={<UserCircle2 className="h-3.5 w-3.5" />} label={t('followers')}>
            <FollowerToggle
              compact
              count={currentTask.followerCount ?? 0}
              isFollowed={currentTask.isFollowedByCurrentUser ?? false}
              isPending={followTask.isPending || unfollowTask.isPending}
              onToggle={() => {
                if (followTask.isPending || unfollowTask.isPending) return;
                if (currentTask.isFollowedByCurrentUser) {
                  unfollowTask.mutate();
                  return;
                }
                followTask.mutate();
              }}
              buttonTestId="task-follow-toggle"
              countTestId="task-follower-count"
              followLabel={t('follow')}
              followingLabel={t('following')}
              followerLabel={t('follower')}
              followersLabel={t('followers')}
            />
          </MetadataRow>
        ) : null}

        {currentTask?.type === 'MILESTONE' && (
          <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
            <Flag className="h-4 w-4" />
            {t('milestoneProgressFixed')}
          </div>
        )}

        {currentTask?.type === 'APPROVAL' && meQuery.data?.id ? (
          <ApprovalSection
            task={currentTask}
            currentUserId={meQuery.data.id}
            isProjectAdmin={isProjectAdmin}
          />
        ) : null}

        <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-muted/30 px-2 py-1.5">
          <div className="text-xs text-muted-foreground" data-testid="subtask-rollup">
            {t('subtasks')}: {subtaskProgress.done}/{subtaskProgress.total} ({subtaskProgress.percent}%)
          </div>
          <Badge variant={blockingCount > 0 ? 'destructive' : 'secondary'} data-testid="dependency-blocked-indicator">
            {blockingCount > 0 ? `${t('blockedBy')} ${blockingCount}` : t('dependenciesClear')}
          </Badge>
        </div>
      </section>

      <section className="space-y-2 pb-4">
        <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">{t('dueReminder')}</div>
        <div className="flex flex-wrap items-center gap-2 rounded-md px-1 py-1 transition-colors hover:bg-muted/25">
          <Input
            type="datetime-local"
            value={reminderInput}
            onChange={(event) => setReminderAtInput(event.target.value)}
            className="h-8 w-[250px] border-transparent bg-transparent shadow-none hover:bg-muted/30 focus-visible:border-border"
            disabled={!reminderPreferences.enabled}
            data-testid="task-reminder-input"
          />
          <Button
            size="sm"
            onClick={() => {
              const iso = new Date(reminderInput).toISOString();
              setReminder.mutate(iso);
              setReminderAtInput('');
            }}
            disabled={!reminderInput || setReminder.isPending || !reminderPreferences.enabled}
            data-testid="task-reminder-save"
          >
            {setReminder.isPending ? t('saving') : t('saveReminder')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              clearReminder.mutate();
              setReminderAtInput('');
            }}
            disabled={!reminderQuery.data?.id || clearReminder.isPending}
            data-testid="task-reminder-clear"
          >
            <Clock3 className="mr-1 h-4 w-4" />
            {t('clearReminder')}
          </Button>
        </div>
        {!reminderPreferences.enabled ? (
          <p className="px-1 text-xs text-muted-foreground" data-testid="task-reminder-disabled-note">
            {t('taskReminderDeliveryPaused')}
          </p>
        ) : (
          !reminderQuery.data?.id
          && defaultReminderInput && (
            <p className="px-1 text-xs text-muted-foreground" data-testid="task-reminder-default-note">
              {t('taskReminderDefaultTimingHint')}
            </p>
          )
        )}
      </section>

      <section
        className="space-y-3 rounded-lg border border-border/60 bg-card/50 p-3"
        data-testid="task-detail-recurrence-section"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {t('recurrence')}
            </div>
            <p className="text-sm text-muted-foreground">
              {currentTask?.recurringRuleId ? t('recurrenceGeneratedHint') : t('recurrenceHelp')}
            </p>
          </div>
          {currentRecurringRule ? (
            <Badge variant="secondary">
              {currentRecurringRule.isActive ? t('recurrenceActive') : t('recurrenceDisabled')}
            </Badge>
          ) : null}
        </div>

        {recurrenceError ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {recurrenceError}
          </div>
        ) : null}

        {!isRecurrenceEditing ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-foreground" data-testid="task-detail-recurrence-summary">
              {currentRecurringRule ? recurrenceSummary(currentRecurringRule, locale, t) : t('recurrenceEmpty')}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {currentRecurringRule ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="task-detail-recurrence-edit"
                    onClick={() => {
                      setRecurrenceDraft(createRecurrenceDraft(currentTask, currentRecurringRule));
                      setRecurrenceError(null);
                      setIsRecurrenceEditing(true);
                    }}
                  >
                    {t('recurrenceEdit')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    data-testid="task-detail-recurrence-disable"
                    disabled={updateRecurrence.isPending}
                    onClick={() => toggleRecurrenceActive(!currentRecurringRule.isActive)}
                  >
                    {currentRecurringRule.isActive ? t('recurrenceDisable') : t('recurrenceEnable')}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  data-testid="task-detail-recurrence-create"
                  onClick={() => {
                    setRecurrenceDraft(createRecurrenceDraft(currentTask, null));
                    setRecurrenceError(null);
                    setIsRecurrenceEditing(true);
                  }}
                >
                  {t('recurrenceCreate')}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">{t('recurrenceFrequency')}</span>
                <select
                  value={recurrenceDraft.frequency}
                  onChange={(event) =>
                    setRecurrenceDraft((current) => ({
                      ...current,
                      frequency: event.target.value as RecurringFrequency,
                    }))
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  data-testid="task-detail-recurrence-frequency"
                >
                  <option value="DAILY">{t('recurrenceDaily')}</option>
                  <option value="WEEKLY">{t('recurrenceWeekly')}</option>
                  <option value="MONTHLY">{t('recurrenceMonthly')}</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">{t('recurrenceInterval')}</span>
                <Input
                  type="number"
                  min={1}
                  value={recurrenceDraft.interval}
                  onChange={(event) => setRecurrenceDraft((current) => ({ ...current, interval: event.target.value }))}
                  data-testid="task-detail-recurrence-interval"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">{t('recurrenceStartDate')}</span>
                <Input
                  type="date"
                  value={recurrenceDraft.startDate}
                  onChange={(event) => setRecurrenceDraft((current) => ({ ...current, startDate: event.target.value }))}
                  data-testid="task-detail-recurrence-start-date"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">{t('recurrenceEndDate')}</span>
                <Input
                  type="date"
                  value={recurrenceDraft.endDate}
                  onChange={(event) => setRecurrenceDraft((current) => ({ ...current, endDate: event.target.value }))}
                  data-testid="task-detail-recurrence-end-date"
                />
              </label>
            </div>

            {recurrenceDraft.frequency === 'WEEKLY' ? (
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">{t('recurrenceDays')}</div>
                <div className="flex flex-wrap gap-2">
                  {RECURRENCE_WEEKDAY_KEYS.map((labelKey, day) => (
                    <Button
                      key={labelKey}
                      type="button"
                      size="sm"
                      variant={recurrenceDraft.daysOfWeek.includes(day) ? 'default' : 'outline'}
                      data-testid={`task-detail-recurrence-weekday-${day}`}
                      onClick={() => toggleRecurrenceWeekday(day)}
                    >
                      {t(labelKey)}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}

            {recurrenceDraft.frequency === 'MONTHLY' ? (
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">{t('recurrenceDayOfMonth')}</span>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={recurrenceDraft.dayOfMonth}
                  onChange={(event) => setRecurrenceDraft((current) => ({ ...current, dayOfMonth: event.target.value }))}
                  data-testid="task-detail-recurrence-day-of-month"
                />
              </label>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                data-testid="task-detail-recurrence-save"
                disabled={createRecurrence.isPending || updateRecurrence.isPending}
                onClick={saveRecurrence}
              >
                {createRecurrence.isPending || updateRecurrence.isPending ? t('saving') : t('recurrenceSave')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setRecurrenceDraft(createRecurrenceDraft(currentTask, currentRecurringRule));
                  setRecurrenceError(null);
                  setIsRecurrenceEditing(false);
                }}
              >
                {t('cancel')}
              </Button>
            </div>
          </div>
        )}
      </section>

      <TaskDescriptionEditor
        taskId={taskId}
        descriptionDoc={currentTask?.descriptionDoc ?? null}
        descriptionVersion={currentTask?.descriptionVersion ?? 0}
        members={members}
        onSaved={async (updated) => {
          await onTaskUpdated(updated);
          await invalidateAudit();
        }}
        onReloadLatest={async () => {
          await queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(taskId) });
        }}
        onAttachmentChanged={() => {
          void queryClient.invalidateQueries({ queryKey: queryKeys.taskAttachments(taskId) });
          void invalidateAudit();
        }}
      />

      {attachments.length ? (
        <section ref={attachmentsSectionRef} className="space-y-2 border-b border-border/50 pb-4">
          <div className="mb-1 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <Paperclip className="h-4 w-4" /> {t('attachments')}
          </div>
          <div className="space-y-1">
            {attachments.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-1 py-1 text-sm" data-testid={`attachment-${item.id}`}>
                <a href={`${apiBaseUrl}${item.url}`} target="_blank" rel="noreferrer" className="truncate hover:underline">
                  {item.fileName}
                </a>
                <Button size="sm" variant="ghost" onClick={() => deleteAttachment.mutate(item.id)}>
                  {t('delete')}
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <>
        <SubtaskList
          taskId={taskId}
          projectId={projectId}
          canCreateSubtask={!currentTask?.parentId}
          onTaskClick={(newTaskId) => {
            void queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(newTaskId) });
            const next = new URLSearchParams(searchParams.toString());
            next.set('task', newTaskId);
            router.push(`${pathname}?${next.toString()}`, { scroll: false });
          }}
        />
        <DependencyManager taskId={taskId} />
      </>
    </div>
  );
}
