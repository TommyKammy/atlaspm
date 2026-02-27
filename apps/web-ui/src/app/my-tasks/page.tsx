'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, ExternalLink } from 'lucide-react';
import TaskDetailDrawer from '@/components/task-detail-drawer';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { queryKeys } from '@/lib/query-keys';
import type { Project, Task } from '@/lib/types';

type MeResponse = {
  id: string;
  email?: string | null;
  displayName?: string | null;
};

type MyTaskRow = {
  task: Task;
  project: Project;
};

type SelectedTask = {
  taskId: string;
  projectId: string;
};

function statusBadgeClass(status: Task['status']) {
  if (status === 'DONE') return 'bg-emerald-100 text-emerald-800';
  if (status === 'IN_PROGRESS') return 'bg-sky-100 text-sky-800';
  if (status === 'BLOCKED') return 'bg-rose-100 text-rose-800';
  return 'bg-slate-100 text-slate-700';
}

function statusLabel(status: Task['status'], t: (key: string) => string) {
  if (status === 'DONE') return t('statusDone');
  if (status === 'IN_PROGRESS') return t('statusInProgress');
  if (status === 'BLOCKED') return t('statusBlocked');
  return t('statusTodo');
}

function formatCompactDate(dateValue: string | null | undefined, locale: 'ja' | 'en') {
  if (!dateValue) return '-';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '-';
  const now = new Date();
  const includeYear = date.getFullYear() !== now.getFullYear();
  return new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : 'en-US', includeYear
    ? { year: 'numeric', month: '2-digit', day: '2-digit' }
    : { month: '2-digit', day: '2-digit' }).format(date);
}

export default function MyTasksPage() {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | Task['status']>('ALL');
  const [selectedTask, setSelectedTask] = useState<SelectedTask | null>(null);

  const meQuery = useQuery<MeResponse>({
    queryKey: queryKeys.me,
    queryFn: () => api('/me'),
  });

  const projectsQuery = useQuery<Project[]>({
    queryKey: queryKeys.projects,
    queryFn: () => api('/projects'),
  });

  const projectIds = useMemo(
    () => (projectsQuery.data ?? []).map((project) => project.id).sort(),
    [projectsQuery.data],
  );

  const myTasksQuery = useQuery<MyTaskRow[]>({
    queryKey: queryKeys.myTasks(meQuery.data?.id ?? '', projectIds),
    enabled: Boolean(meQuery.data?.id) && projectIds.length > 0,
    queryFn: async () => {
      const userId = meQuery.data?.id;
      const projects = projectsQuery.data ?? [];
      if (!userId || !projects.length) return [];

      const all = await Promise.all(
        projects.map(async (project) => {
          const tasks = (await api(
            `/projects/${project.id}/tasks?assignee=${encodeURIComponent(userId)}`,
          )) as Task[];
          return tasks
            .filter((task) => !task.deletedAt)
            .map((task) => ({ task, project }));
        }),
      );

      return all.flat();
    },
  });

  const toggleComplete = useMutation({
    mutationFn: (input: { taskId: string; done: boolean; version: number }) =>
      api(`/tasks/${input.taskId}/complete`, {
        method: 'POST',
        body: { done: input.done, version: input.version },
      }) as Promise<Task>,
    onSuccess: async (updatedTask) => {
      queryClient.setQueryData<MyTaskRow[]>(
        queryKeys.myTasks(meQuery.data?.id ?? '', projectIds),
        (current = []) =>
          current.map((entry) =>
            entry.task.id === updatedTask.id
              ? { ...entry, task: updatedTask }
              : entry,
          ),
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(updatedTask.projectId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(updatedTask.id) });
    },
  });

  const rows = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return (myTasksQuery.data ?? [])
      .filter((entry) => {
        const bySearch =
          !normalized ||
          entry.task.title.toLowerCase().includes(normalized) ||
          entry.project.name.toLowerCase().includes(normalized);
        const byStatus = statusFilter === 'ALL' || entry.task.status === statusFilter;
        return bySearch && byStatus;
      })
      .sort((left, right) => {
        const leftDone = left.task.status === 'DONE';
        const rightDone = right.task.status === 'DONE';
        if (leftDone !== rightDone) return leftDone ? 1 : -1;
        const leftDue = left.task.dueAt ? new Date(left.task.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
        const rightDue = right.task.dueAt ? new Date(right.task.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
        if (leftDue !== rightDue) return leftDue - rightDue;
        return left.task.title.localeCompare(right.task.title);
      });
  }, [myTasksQuery.data, search, statusFilter]);

  const loading = meQuery.isLoading || projectsQuery.isLoading || myTasksQuery.isLoading;

  return (
    <div className="space-y-4" data-testid="my-tasks-page">
      <Card>
        <CardHeader className="space-y-2">
          <CardTitle>{t('myTasks')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('myTasksSubtitle')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('searchTasks')}
              className="h-9 w-full max-w-sm"
              data-testid="my-tasks-search"
            />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'ALL' | Task['status'])}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              data-testid="my-tasks-status-filter"
            >
              <option value="ALL">{t('allStatus')}</option>
              <option value="TODO">{t('statusTodo')}</option>
              <option value="IN_PROGRESS">{t('statusInProgress')}</option>
              <option value="DONE">{t('statusDone')}</option>
              <option value="BLOCKED">{t('statusBlocked')}</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-muted-foreground">{t('loadingTasks')}</p> : null}
          {!loading && !rows.length ? (
            <p className="text-sm text-muted-foreground" data-testid="my-tasks-empty">
              {t('myTasksEmpty')}
            </p>
          ) : null}
          {!loading && rows.length ? (
            <Table className="table-fixed" data-testid="my-tasks-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[36%]">{t('name')}</TableHead>
                  <TableHead className="w-[20%]">{t('project')}</TableHead>
                  <TableHead className="w-[18%]">{t('startDate')} / {t('endDate')}</TableHead>
                  <TableHead className="w-[14%]">{t('status')}</TableHead>
                  <TableHead className="w-[12%]">{t('progress')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((entry) => {
                  const done = entry.task.status === 'DONE';
                  return (
                    <TableRow key={entry.task.id} data-testid={`my-task-row-${entry.task.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted"
                            data-testid={`my-task-complete-${entry.task.id}`}
                            onClick={() =>
                              toggleComplete.mutate({
                                taskId: entry.task.id,
                                done: !done,
                                version: entry.task.version,
                              })
                            }
                          >
                            {done ? (
                              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                            ) : (
                              <Circle className="h-5 w-5 text-muted-foreground" />
                            )}
                          </button>
                          <button
                            type="button"
                            data-testid={`my-task-open-${entry.task.id}`}
                            className={`truncate text-left text-sm font-medium hover:underline ${done ? 'text-muted-foreground line-through opacity-60' : ''}`}
                            onClick={() =>
                              setSelectedTask({
                                taskId: entry.task.id,
                                projectId: entry.task.projectId,
                              })
                            }
                          >
                            {entry.task.title.trim() || t('untitledTask')}
                          </button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/projects/${entry.project.id}`}
                          className="inline-flex items-center gap-1 truncate text-sm text-muted-foreground hover:text-foreground"
                          data-testid={`my-task-project-${entry.task.id}`}
                        >
                          <span className="truncate">{entry.project.name}</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <span>
                          {formatCompactDate(entry.task.startAt, locale)}
                          {' / '}
                          {formatCompactDate(entry.task.dueAt, locale)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className={`rounded-full border-transparent ${statusBadgeClass(entry.task.status)}`}>
                          {statusLabel(entry.task.status, t)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <span className="text-sm">{entry.task.progressPercent}</span>
                          <div className="h-1.5 w-full rounded bg-muted">
                            <div
                              className={`h-full rounded ${entry.task.progressPercent >= 100 ? 'bg-emerald-500' : 'bg-primary'}`}
                              style={{ width: `${Math.max(0, Math.min(100, entry.task.progressPercent))}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : null}
        </CardContent>
      </Card>

      {selectedTask ? (
        <TaskDetailDrawer
          taskId={selectedTask.taskId}
          projectId={selectedTask.projectId}
          open
          onOpenChange={(open) => {
            if (!open) {
              setSelectedTask(null);
              void queryClient.invalidateQueries({
                queryKey: queryKeys.myTasks(meQuery.data?.id ?? '', projectIds),
              });
            }
          }}
        />
      ) : null}
    </div>
  );
}
