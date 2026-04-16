'use client';

import { normalizeDateOnlyUtcIso } from '@atlaspm/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CheckCircle2,
  Flag,
  Folder,
  Gauge,
  Tag,
  UserCircle2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, useProjects } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { queryKeys } from '@/lib/query-keys';
import type {
  ProjectMember,
  Task,
  TaskDependency,
  TaskTree,
} from '@/lib/types';
import { ApprovalSection } from '@/components/task-approval-section';
import { FollowerToggle } from '@/components/follower-toggle';
import { ProjectSelector } from '@/components/project-selector';
import { initials } from '@/components/task-presentation-utils';
import {
  assigneeLabel,
  MetadataRow,
  statusLabel,
  toDateInputValue,
} from '@/components/task-detail/task-detail-utils';
import { Badge } from '@/components/ui/badge';
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

export function TaskDetailOverviewSection({
  taskId,
  projectId,
  currentTask,
  members,
  onTaskUpdated,
  onAuditChanged,
}: {
  taskId: string;
  projectId: string;
  currentTask: Task | undefined;
  members: ProjectMember[];
  onTaskUpdated: (updated: Task) => Promise<void> | void;
  onAuditChanged: () => Promise<void>;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [progressInput, setProgressInput] = useState('0');
  const [startDateInput, setStartDateInput] = useState('');
  const [dueDateInput, setDueDateInput] = useState('');
  const [assigneeInput, setAssigneeInput] = useState<string>('unassigned');
  const [statusInput, setStatusInput] = useState<Task['status']>('TODO');
  const pendingScheduleDraftRef = useRef<{ startDate: string; dueDate: string } | null>(null);

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

  const projectsQuery = useProjects(projectQuery.data?.workspaceId ?? '');
  const dependencies = dependenciesQuery.data ?? [];
  const blockingCount = dependencies.filter((dep) => dep.dependsOnTask && dep.dependsOnTask.status !== 'DONE').length;
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

  useEffect(() => {
    if (!currentTask) return;
    setProgressInput(String(currentTask.progressPercent ?? 0));
    setStartDateInput(toDateInputValue(currentTask.startAt));
    setDueDateInput(toDateInputValue(currentTask.dueAt));
    setAssigneeInput(currentTask.assigneeUserId ?? 'unassigned');
    setStatusInput(currentTask.status);
  }, [currentTask]);

  const patchTask = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`/tasks/${taskId}`, { method: 'PATCH', body }) as Promise<Task>,
    onSuccess: async (updated) => {
      await onTaskUpdated(updated);
      await onAuditChanged();
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
      await onAuditChanged();
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

  return (
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
  );
}
