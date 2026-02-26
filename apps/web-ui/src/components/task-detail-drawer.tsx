'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock3,
  Gauge,
  MessageSquare,
  Paperclip,
  UserCircle2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, apiBaseUrl } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type {
  AuditEvent,
  ProjectMember,
  SectionTaskGroup,
  Task,
  TaskAttachment,
  TaskComment,
  TaskDependency,
  TaskReminder,
  TaskTree,
} from '@/lib/types';
import { DependencyManager } from '@/components/dependency-manager';
import TaskDescriptionEditor from '@/components/editor/TaskDescriptionEditor';
import { SubtaskList } from '@/components/subtask-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

function formatAuditEvent(event: AuditEvent, t: (key: string) => string) {
  const action = event.action;
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
  return action;
}

function parseCommentBody(body: string) {
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

function statusLabel(status: Task['status'], t: (key: string) => string) {
  if (status === 'TODO') return t('statusTodo');
  if (status === 'IN_PROGRESS') return t('statusInProgress');
  if (status === 'DONE') return t('statusDone');
  if (status === 'BLOCKED') return t('statusBlocked');
  return status;
}

function assigneeLabel(task: Task | undefined, members: ProjectMember[], t: (key: string) => string) {
  if (!task?.assigneeUserId) return t('unassigned');
  const member = members.find((item) => item.userId === task.assigneeUserId);
  if (!member) return task.assigneeUserId;
  return member.user.displayName || member.user.email || member.user.id;
}

function initials(value: string) {
  const pieces = value.trim().split(/\s+/).slice(0, 2);
  return pieces.map((piece) => piece.charAt(0).toUpperCase()).join('') || 'U';
}

function toDateInputValue(value?: string | null) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function MetadataRow({
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

export default function TaskDetailDrawer({
  taskId,
  open,
  onOpenChange,
  projectId,
}: {
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'details' | 'comments' | 'activity'>('details');
  const [newComment, setNewComment] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [commentMentionQuery, setCommentMentionQuery] = useState('');
  const [reminderAtInput, setReminderAtInput] = useState('');
  const [titleInput, setTitleInput] = useState('');
  const [progressInput, setProgressInput] = useState('0');
  const [dueDateInput, setDueDateInput] = useState('');
  const [assigneeInput, setAssigneeInput] = useState<string>('unassigned');
  const [statusInput, setStatusInput] = useState<Task['status']>('TODO');

  const enabled = Boolean(taskId && open);

  const taskQuery = useQuery<Task>({
    queryKey: taskId ? queryKeys.taskDetail(taskId) : ['task', 'none'],
    queryFn: () => api(`/tasks/${taskId}`),
    enabled,
  });

  const commentsQuery = useQuery<TaskComment[]>({
    queryKey: taskId ? queryKeys.taskComments(taskId) : ['task', 'none', 'comments'],
    queryFn: () => api(`/tasks/${taskId}/comments`),
    enabled,
  });

  const attachmentsQuery = useQuery<TaskAttachment[]>({
    queryKey: taskId ? queryKeys.taskAttachments(taskId) : ['task', 'none', 'attachments'],
    queryFn: () => api(`/tasks/${taskId}/attachments`),
    enabled,
  });

  const reminderQuery = useQuery<TaskReminder | null>({
    queryKey: taskId ? queryKeys.taskReminder(taskId) : ['task', 'none', 'reminder'],
    queryFn: () => api(`/tasks/${taskId}/reminder`),
    enabled,
  });

  const activityQuery = useQuery<AuditEvent[]>({
    queryKey: taskId ? queryKeys.taskAudit(taskId) : ['task', 'none', 'audit'],
    queryFn: () => api(`/tasks/${taskId}/audit`),
    enabled,
  });

  const membersQuery = useQuery<ProjectMember[]>({
    queryKey: queryKeys.projectMembers(projectId),
    queryFn: () => api(`/projects/${projectId}/members`),
    enabled,
  });

  const dependenciesQuery = useQuery<TaskDependency[]>({
    queryKey: taskId ? queryKeys.taskDependencies(taskId) : ['task', 'none', 'dependencies'],
    queryFn: () => api(`/tasks/${taskId}/dependencies`),
    enabled,
  });

  const subtasksTreeQuery = useQuery<TaskTree[]>({
    queryKey: taskId ? queryKeys.taskSubtaskTree(taskId) : ['task', 'none', 'subtasks', 'tree'],
    queryFn: () => api(`/tasks/${taskId}/subtasks/tree`),
    enabled,
  });

  const meQuery = useQuery<{ id: string }>({
    queryKey: queryKeys.me,
    queryFn: () => api('/me'),
  });

  const syncTaskCaches = (updated: Task) => {
    queryClient.setQueryData(queryKeys.taskDetail(updated.id), updated);
    queryClient.setQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId), (current = []) =>
      current.map((group) => ({
        ...group,
        tasks: group.tasks.map((task) => (task.id === updated.id ? { ...task, ...updated } : task)),
      })),
    );
  };

  const patchTask = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`/tasks/${taskId}`, { method: 'PATCH', body }) as Promise<Task>,
    onSuccess: async (updated) => {
      syncTaskCaches(updated);
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskAudit(updated.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
    },
  });

  const toggleComplete = useMutation({
    mutationFn: (done: boolean) =>
      api(`/tasks/${taskId}/complete`, {
        method: 'POST',
        body: { done, version: taskQuery.data?.version },
      }) as Promise<Task>,
    onSuccess: async (updated) => {
      syncTaskCaches(updated);
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskAudit(updated.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
    },
  });

  const createComment = useMutation({
    mutationFn: (body: string) => api(`/tasks/${taskId}/comments`, { method: 'POST', body: { body } }) as Promise<TaskComment>,
    onSuccess: async () => {
      setNewComment('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskComments(taskId!) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskAudit(taskId!) });
    },
  });

  const updateComment = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => api(`/comments/${id}`, { method: 'PATCH', body: { body } }) as Promise<TaskComment>,
    onSuccess: async () => {
      setEditingCommentId(null);
      setEditingBody('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskComments(taskId!) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskAudit(taskId!) });
    },
  });

  const deleteComment = useMutation({
    mutationFn: (id: string) => api(`/comments/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskComments(taskId!) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskAudit(taskId!) });
    },
  });

  const deleteAttachment = useMutation({
    mutationFn: (id: string) => api(`/attachments/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskAttachments(taskId!) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskAudit(taskId!) });
    },
  });

  const setReminder = useMutation({
    mutationFn: (remindAt: string) => api(`/tasks/${taskId}/reminder`, { method: 'PUT', body: { remindAt } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskReminder(taskId!) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskAudit(taskId!) });
    },
  });

  const clearReminder = useMutation({
    mutationFn: () => api(`/tasks/${taskId}/reminder`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskReminder(taskId!) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskAudit(taskId!) });
    },
  });

  const members = membersQuery.data ?? [];
  const mentionCandidates = members.filter((member) => {
    const name = (member.user.displayName ?? member.user.email ?? member.user.id).toLowerCase();
    return !commentMentionQuery || name.includes(commentMentionQuery.toLowerCase());
  });

  const comments = commentsQuery.data ?? [];
  const attachments = attachmentsQuery.data ?? [];
  const activity = useMemo(() => (activityQuery.data ?? []).slice().reverse(), [activityQuery.data]);
  const dependencies = dependenciesQuery.data ?? [];
  const blockingCount = dependencies.filter((dep) => dep.dependsOnTask && dep.dependsOnTask.status !== 'DONE').length;

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
    if (!taskQuery.data) return;
    setTitleInput(taskQuery.data.title);
    setProgressInput(String(taskQuery.data.progressPercent ?? 0));
    setDueDateInput(toDateInputValue(taskQuery.data.dueAt));
    setAssigneeInput(taskQuery.data.assigneeUserId ?? 'unassigned');
    setStatusInput(taskQuery.data.status);
  }, [taskQuery.data]);

  const tryCommentMentionLookup = (text: string) => {
    const match = text.match(/(?:^|\s)@([a-zA-Z0-9._-]*)$/);
    if (!match) {
      setCommentMentionQuery('');
      return;
    }
    setCommentMentionQuery(match[1] ?? '');
  };

  const reminderLocal = reminderQuery.data?.remindAt
    ? new Date(reminderQuery.data.remindAt).toISOString().slice(0, 16)
    : '';
  const reminderInput = reminderAtInput || reminderLocal;
  const currentTask = taskQuery.data;
  const currentAssignee = assigneeLabel(currentTask, members, t);
  const isDone = currentTask?.status === 'DONE';

  const commitTitle = () => {
    if (!currentTask) return;
    const nextTitle = titleInput.trim();
    if (!nextTitle) {
      setTitleInput(currentTask.title);
      return;
    }
    if (nextTitle === currentTask.title) return;
    patchTask.mutate({ title: nextTitle, version: currentTask.version });
  };

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

  const commitDueDate = () => {
    if (!currentTask) return;
    const nextDueAt = dueDateInput ? `${dueDateInput}T00:00:00.000Z` : null;
    const currentDueAt = currentTask.dueAt ? String(currentTask.dueAt).slice(0, 10) : '';
    if (currentDueAt === dueDateInput) return;
    patchTask.mutate({ dueAt: nextDueAt, version: currentTask.version });
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
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex h-dvh w-[760px] max-w-full flex-col border-l bg-background shadow-2xl">
          <Dialog.Title className="sr-only">{t('taskDetail')}</Dialog.Title>
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <Button
                  variant={isDone ? 'default' : 'outline'}
                  size="sm"
                  className={cn(
                    'min-w-[152px] justify-center whitespace-nowrap px-3 text-xs sm:text-sm',
                    isDone
                      ? 'bg-emerald-600 text-white hover:bg-emerald-600/90'
                      : 'border-border/70 text-foreground hover:bg-muted/40',
                  )}
                  onClick={() => {
                    if (!currentTask || toggleComplete.isPending) return;
                    toggleComplete.mutate(!isDone);
                  }}
                  disabled={!currentTask || toggleComplete.isPending}
                >
                  {isDone ? <CheckCircle2 className="mr-1 h-4 w-4 shrink-0" /> : <Circle className="mr-1 h-4 w-4 shrink-0" />}
                  {isDone ? t('markIncomplete') : t('markComplete')}
                </Button>
                <Input
                  value={titleInput}
                  onChange={(event) => setTitleInput(event.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                  className="h-auto border-transparent bg-transparent px-1 py-0 text-2xl font-semibold shadow-none hover:bg-muted/20 focus-visible:border-border/50 focus-visible:bg-background"
                  data-testid="task-detail-title-input"
                />
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  aria-label={t('details')}
                  onClick={() => setTab('details')}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  aria-label={t('comments')}
                  onClick={() => setTab('comments')}
                >
                  <MessageSquare className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  aria-label={t('activity')}
                  onClick={() => setTab('activity')}
                >
                  <Activity className="h-4 w-4" />
                </Button>
                <Dialog.Close asChild>
                  <Button variant="ghost" size="icon" aria-label={t('closeTaskDetail')}>
                    <X className="h-4 w-4" />
                  </Button>
                </Dialog.Close>
              </div>
            </div>

            <div className="mb-4 flex items-center gap-5 border-b border-border/60">
              {(['details', 'comments', 'activity'] as const).map((item) => (
                <Button
                  key={item}
                  variant="ghost"
                  size="sm"
                  onClick={() => setTab(item)}
                  className={cn(
                    'h-9 rounded-none border-b-2 px-0 text-sm',
                    tab === item
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                  )}
                >
                  {t(item)}
                </Button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {tab === 'details' ? (
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

                    <MetadataRow icon={<CalendarDays className="h-3.5 w-3.5" />} label={t('dueDate')}>
                      <Input
                        type="date"
                        value={dueDateInput}
                        onChange={(event) => setDueDateInput(event.target.value)}
                        onBlur={commitDueDate}
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

                    <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-muted/30 px-2 py-1.5">
                      <div className="text-xs text-muted-foreground" data-testid="subtask-rollup">
                        {t('subtasks')}: {subtaskProgress.done}/{subtaskProgress.total} ({subtaskProgress.percent}%)
                      </div>
                      <Badge variant={blockingCount > 0 ? 'destructive' : 'secondary'} data-testid="dependency-blocked-indicator">
                        {blockingCount > 0 ? `${t('blockedBy')} ${blockingCount}` : t('dependenciesClear')}
                      </Badge>
                    </div>
                  </section>

                  <section className="space-y-2 border-b border-border/50 pb-4">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('dueReminder')}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="datetime-local"
                        value={reminderInput}
                        onChange={(event) => setReminderAtInput(event.target.value)}
                        className="h-8 w-[250px] border-transparent bg-transparent shadow-none hover:bg-muted/30 focus-visible:border-border"
                        data-testid="task-reminder-input"
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          const iso = new Date(reminderInput).toISOString();
                          setReminder.mutate(iso);
                          setReminderAtInput('');
                        }}
                        disabled={!reminderInput || setReminder.isPending}
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
                  </section>

                  {taskId ? (
                    <TaskDescriptionEditor
                      taskId={taskId}
                      descriptionDoc={taskQuery.data?.descriptionDoc ?? null}
                      descriptionVersion={taskQuery.data?.descriptionVersion ?? 0}
                      members={members}
                      onSaved={async (updated) => {
                        syncTaskCaches(updated);
                        await queryClient.invalidateQueries({ queryKey: queryKeys.taskAudit(updated.id) });
                      }}
                      onReloadLatest={async () => {
                        await queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(taskId) });
                      }}
                      onAttachmentChanged={() => {
                        void queryClient.invalidateQueries({ queryKey: queryKeys.taskAttachments(taskId) });
                        void queryClient.invalidateQueries({ queryKey: queryKeys.taskAudit(taskId) });
                      }}
                    />
                  ) : null}

                  <section className="space-y-2 border-b border-border/50 pb-4">
                    <div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <Paperclip className="h-4 w-4" /> {t('attachments')}
                    </div>
                    {!attachments.length ? <p className="text-sm text-muted-foreground">{t('noAttachmentsYet')}</p> : null}
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

                  {taskId && (
                    <>
                      <SubtaskList
                        taskId={taskId}
                        projectId={projectId}
                        onTaskClick={(newTaskId) => {
                          queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(newTaskId) });
                          window.location.href = `/projects/${projectId}?task=${newTaskId}`;
                        }}
                      />
                      <DependencyManager taskId={taskId} />
                    </>
                  )}
                </div>
              ) : null}

              {tab === 'comments' ? (
                <div className="space-y-3">
                  <div className="relative flex gap-2">
                    <Textarea
                      value={newComment}
                      onChange={(event) => {
                        setNewComment(event.target.value);
                        tryCommentMentionLookup(event.target.value);
                      }}
                      placeholder={t('addCommentPlaceholder')}
                      className="min-h-[88px] border-border/60"
                      data-testid="comment-composer"
                    />
                    <Button
                      onClick={() => createComment.mutate(newComment)}
                      disabled={!newComment.trim() || createComment.isPending}
                      data-testid="add-comment-btn"
                    >
                      {t('comment')}
                    </Button>

                    {commentMentionQuery && mentionCandidates.length ? (
                      <div className="absolute left-2 top-[86px] z-20 w-72 rounded-md border bg-popover p-1 shadow" data-testid="comment-mention-menu">
                        {mentionCandidates.slice(0, 6).map((member) => {
                          const label = member.user.displayName ?? member.user.email ?? member.user.id;
                          return (
                            <button
                              key={member.userId}
                              type="button"
                              className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-muted"
                              data-testid={`comment-mention-option-${member.userId}`}
                              onClick={() => {
                                setNewComment((prev) => prev.replace(/(?:^|\s)@[a-zA-Z0-9._-]*$/, ` @[${member.userId}|${label}] `));
                                setCommentMentionQuery('');
                              }}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    {comments.map((comment) => {
                      const mine = comment.authorUserId === meQuery.data?.id;
                      return (
                        <div key={comment.id} className="border-b border-border/60 pb-3" data-testid={`comment-${comment.id}`}>
                          <div className="mb-1 text-xs text-muted-foreground">
                            {comment.author?.displayName ?? comment.authorUserId} • {new Date(comment.createdAt).toLocaleString()}
                          </div>
                          {editingCommentId === comment.id ? (
                            <div className="space-y-2">
                              <Input value={editingBody} onChange={(event) => setEditingBody(event.target.value)} />
                              <div className="flex gap-2">
                                <Button size="sm" onClick={() => updateComment.mutate({ id: comment.id, body: editingBody })}>
                                  {t('save')}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setEditingCommentId(null)}>
                                  {t('cancel')}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="text-sm">
                              {parseCommentBody(comment.body).map((chunk, index) =>
                                chunk.type === 'mention' ? (
                                  <span
                                    key={`${comment.id}-m-${index}`}
                                    className="mr-1 inline-flex rounded bg-muted px-1 py-0.5 text-xs font-medium"
                                    data-testid={`comment-mention-pill-${comment.id}`}
                                  >
                                    {chunk.value}
                                  </span>
                                ) : (
                                  <span key={`${comment.id}-t-${index}`}>{chunk.value}</span>
                                ),
                              )}
                            </div>
                          )}
                          {mine && editingCommentId !== comment.id ? (
                            <div className="mt-2 flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingCommentId(comment.id);
                                  setEditingBody(comment.body);
                                }}
                              >
                                {t('edit')}
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => deleteComment.mutate(comment.id)}>
                                {t('delete')}
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                    {!comments.length ? <div className="text-sm text-muted-foreground">{t('noCommentsYet')}</div> : null}
                  </div>
                </div>
              ) : null}

              {tab === 'activity' ? (
                <div className="space-y-2">
                  {activity.map((event) => (
                    <div key={event.id} className="border-b border-border/60 pb-2" data-testid={`activity-${event.id}`}>
                      <div className="text-sm font-medium">
                        {event.actor} {formatAuditEvent(event, t)}
                      </div>
                      <div className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</div>
                    </div>
                  ))}
                  {!activity.length ? <div className="text-sm text-muted-foreground">{t('noActivityYet')}</div> : null}
                </div>
              ) : null}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
