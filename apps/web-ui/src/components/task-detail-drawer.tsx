'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, List, MessageSquare, Paperclip, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { AuditEvent, ProjectMember, Section, SectionTaskGroup, Task, TaskTree } from '@/lib/types';
import { AuditActivityList } from '@/components/audit-activity-list';
import { TaskDetailCommentsTab } from '@/components/task-detail/task-detail-comments-tab';
import { TaskDetailDetailsTab } from '@/components/task-detail/task-detail-details-tab';
import { renderTaskTypeCompletionIcon } from '@/components/task-presentation-utils';
import {
  compactSnapshotActivity,
  countOpenSubtasks,
} from '@/components/task-detail/task-detail-utils';
import { Button } from '@/components/ui/button';
import {
  Dialog as UiDialog,
  DialogContent as UiDialogContent,
  DialogFooter as UiDialogFooter,
  DialogHeader as UiDialogHeader,
  DialogTitle as UiDialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

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
  const [titleInput, setTitleInput] = useState('');
  const [undoComplete, setUndoComplete] = useState<{
    taskId: string;
    title: string;
    previousStatus: Task['status'];
    previousProgressPercent: number;
  } | null>(null);
  const [pendingCompleteWarningCount, setPendingCompleteWarningCount] = useState<number | null>(null);
  const attachmentsSectionRef = useRef<HTMLElement | null>(null);
  const undoCompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enabled = Boolean(taskId && open);

  const taskQuery = useQuery<Task>({
    queryKey: taskId ? queryKeys.taskDetail(taskId) : ['task', 'none'],
    queryFn: () => api(`/tasks/${taskId}`),
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

  const sectionsQuery = useQuery<Section[]>({
    queryKey: queryKeys.projectSections(projectId),
    queryFn: () => api(`/projects/${projectId}/sections`),
    enabled,
  });

  const subtasksTreeQuery = useQuery<TaskTree[]>({
    queryKey: taskId ? queryKeys.taskSubtaskTree(taskId) : ['task', 'none', 'subtasks', 'tree'],
    queryFn: () => api(`/tasks/${taskId}/subtasks/tree`),
    enabled,
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
    mutationFn: ({ done, version, force }: { done: boolean; version: number; force?: boolean }) =>
      api(`/tasks/${taskId}/complete`, {
        method: 'POST',
        body: { done, version, ...(force ? { force: true } : {}) },
      }) as Promise<Task>,
    onSuccess: async (updated) => {
      syncTaskCaches(updated);
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskAudit(updated.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
    },
  });

  const restoreComplete = useMutation({
    mutationFn: ({
      version,
      status,
      progressPercent,
    }: {
      version: number;
      status: Task['status'];
      progressPercent: number;
    }) =>
      api(`/tasks/${taskId}`, {
        method: 'PATCH',
        body: { version, status, progressPercent },
      }) as Promise<Task>,
    onSuccess: async (updated) => {
      setUndoComplete(null);
      syncTaskCaches(updated);
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskAudit(updated.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
    },
  });

  const currentTask = taskQuery.data;
  const members = membersQuery.data ?? [];
  const activity = useMemo(
    () => compactSnapshotActivity((activityQuery.data ?? []).slice().reverse()),
    [activityQuery.data],
  );
  const isDone = currentTask?.status === 'DONE';
  const openSubtaskCount = useMemo(
    () => countOpenSubtasks(subtasksTreeQuery.data ?? []),
    [subtasksTreeQuery.data],
  );

  useEffect(() => {
    return () => {
      if (undoCompleteTimerRef.current) clearTimeout(undoCompleteTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!taskQuery.data) return;
    setTitleInput(taskQuery.data.title);
  }, [taskQuery.data]);

  useEffect(() => {
    if (open) return;
    setPendingCompleteWarningCount(null);
    if (undoCompleteTimerRef.current) clearTimeout(undoCompleteTimerRef.current);
    setUndoComplete(null);
  }, [open]);

  const runToggleComplete = (done: boolean, force: boolean = false) => {
    if (!currentTask || toggleComplete.isPending) return;
    toggleComplete.mutate(
      { done, version: currentTask.version, force },
      {
        onSuccess: () => {
          if (!done) return;
          if (undoCompleteTimerRef.current) clearTimeout(undoCompleteTimerRef.current);
          setUndoComplete({
            taskId: currentTask.id,
            title: currentTask.title || t('untitledTask'),
            previousStatus: currentTask.status,
            previousProgressPercent: currentTask.progressPercent,
          });
          undoCompleteTimerRef.current = setTimeout(() => {
            setUndoComplete(null);
          }, 7000);
        },
      },
    );
  };

  const handleToggleCompleteClick = () => {
    if (!currentTask || toggleComplete.isPending) return;
    const done = currentTask.status !== 'DONE';
    if (!done) {
      runToggleComplete(false);
      return;
    }
    if (openSubtaskCount > 0) {
      setPendingCompleteWarningCount(openSubtaskCount);
      return;
    }
    runToggleComplete(true);
  };

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

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 flex h-dvh w-[760px] max-w-full flex-col border-l bg-background shadow-2xl">
          <Dialog.Title className="sr-only">{t('taskDetail')}</Dialog.Title>
          <div className="flex min-h-0 flex-1 flex-col p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <Button
                variant={isDone ? 'default' : 'outline'}
                size="sm"
                className={cn(
                  'min-w-[152px] justify-center whitespace-nowrap px-3 text-xs sm:text-sm',
                  isDone
                    ? 'bg-emerald-600 text-white hover:bg-emerald-600/90'
                    : 'border-border/70 text-foreground hover:bg-muted/40',
                )}
                onClick={handleToggleCompleteClick}
                disabled={!currentTask || toggleComplete.isPending}
              >
                {renderTaskTypeCompletionIcon(currentTask ?? null, isDone, {
                  className: 'mr-1 h-4 w-4 shrink-0',
                  milestoneDoneClassName: 'text-emerald-600',
                  milestonePendingClassName: 'text-muted-foreground',
                  approvalDoneClassName: 'text-emerald-600',
                  approvalPendingClassName: 'text-muted-foreground',
                })}
                {isDone ? t('markIncomplete') : t('markComplete')}
              </Button>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  aria-label={t('attachments')}
                  data-testid="task-detail-tab-attachments"
                  onClick={() => {
                    setTab('details');
                    requestAnimationFrame(() => {
                      attachmentsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    });
                  }}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    'h-8 w-8 rounded-none border-b-2',
                    tab === 'comments'
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                  )}
                  aria-label={t('comments')}
                  data-testid="task-detail-tab-comments"
                  onClick={() => setTab('comments')}
                >
                  <MessageSquare className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    'h-8 w-8 rounded-none border-b-2',
                    tab === 'activity'
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                  )}
                  aria-label={t('activity')}
                  data-testid="task-detail-tab-activity"
                  onClick={() => setTab('activity')}
                >
                  <Activity className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className={cn(
                    'h-8 w-8 rounded-none border-b-2',
                    tab === 'details'
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                  )}
                  aria-label={t('details')}
                  data-testid="task-detail-tab-details"
                  onClick={() => setTab('details')}
                >
                  <List className="h-4 w-4" />
                </Button>
                <Dialog.Close asChild>
                  <Button variant="ghost" size="icon" aria-label={t('closeTaskDetail')}>
                    <X className="h-4 w-4" />
                  </Button>
                </Dialog.Close>
              </div>
            </div>

            <div className="mb-4">
              <Input
                value={titleInput}
                onChange={(event) => setTitleInput(event.target.value)}
                onBlur={commitTitle}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
                className="h-auto w-full border-transparent bg-transparent px-1 py-0 text-2xl font-semibold shadow-none hover:bg-muted/20 focus-visible:border-border/50 focus-visible:bg-background"
                data-testid="task-detail-title-input"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {tab === 'details' && taskId ? (
                <TaskDetailDetailsTab
                  taskId={taskId}
                  projectId={projectId}
                  currentTask={currentTask}
                  attachmentsSectionRef={attachmentsSectionRef}
                  onTaskUpdated={async (updated) => {
                    syncTaskCaches(updated);
                    await queryClient.invalidateQueries({ queryKey: queryKeys.taskAudit(updated.id) });
                    await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
                  }}
                />
              ) : null}

              {tab === 'comments' && taskId ? (
                <TaskDetailCommentsTab taskId={taskId} members={members} />
              ) : null}

              {tab === 'activity' ? (
                <AuditActivityList
                  events={activity}
                  members={members}
                  sections={sectionsQuery.data ?? []}
                />
              ) : null}
            </div>
          </div>

          {undoComplete ? (
            <div
              className="fixed bottom-4 left-4 z-[60] flex items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm shadow-md"
              data-testid="task-detail-complete-undo-banner"
            >
              <span>
                {t('taskCompletedLabel')}: {undoComplete.title}
              </span>
              <Button
                size="sm"
                variant="outline"
                data-testid="task-detail-complete-undo-action"
                disabled={restoreComplete.isPending}
                onClick={() => {
                  if (undoCompleteTimerRef.current) clearTimeout(undoCompleteTimerRef.current);
                  const latest = queryClient.getQueryData<Task>(queryKeys.taskDetail(undoComplete.taskId));
                  if (!latest) {
                    setUndoComplete(null);
                    return;
                  }
                  restoreComplete.mutate({
                    version: latest.version,
                    status: undoComplete.previousStatus,
                    progressPercent: undoComplete.previousProgressPercent,
                  });
                }}
              >
                {restoreComplete.isPending ? t('restoring') : t('undo')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (undoCompleteTimerRef.current) clearTimeout(undoCompleteTimerRef.current);
                  setUndoComplete(null);
                }}
              >
                {t('dismiss')}
              </Button>
            </div>
          ) : null}

          <UiDialog
            open={pendingCompleteWarningCount !== null}
            onOpenChange={(nextOpen: boolean) => {
              if (!nextOpen) setPendingCompleteWarningCount(null);
            }}
          >
            <UiDialogContent className="max-w-md" data-testid="task-detail-complete-warning-dialog">
              <UiDialogHeader>
                <UiDialogTitle>{t('incompleteSubtasksWarningTitle')}</UiDialogTitle>
              </UiDialogHeader>
              <p className="text-sm text-muted-foreground">
                {t('incompleteSubtasksWarningDescription').replace(
                  '{count}',
                  String(pendingCompleteWarningCount ?? 0),
                )}
              </p>
              <UiDialogFooter>
                <Button variant="outline" onClick={() => setPendingCompleteWarningCount(null)}>
                  {t('cancel')}
                </Button>
                <Button
                  data-testid="task-detail-complete-warning-confirm"
                  onClick={() => {
                    setPendingCompleteWarningCount(null);
                    runToggleComplete(true, true);
                  }}
                >
                  {t('completeAnyway')}
                </Button>
              </UiDialogFooter>
            </UiDialogContent>
          </UiDialog>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
