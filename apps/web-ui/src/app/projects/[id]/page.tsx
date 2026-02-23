'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import ProjectBoard from '@/components/project-board';
import CalendarView from '@/components/calendar-view';
import TimelineView from '@/components/timeline-view';
import CustomFieldsDialog from '@/components/custom-fields-dialog';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Project, ProjectMember, Section, SectionTaskGroup, Task } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [newSection, setNewSection] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | Task['status']>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | NonNullable<Task['priority']>>('ALL');
  const [view, setView] = useState<'List' | 'Board' | 'Calendar' | 'Timeline'>('List');
  const [, setSelectedTaskId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const queryClient = useQueryClient();

  const projectsQuery = useQuery<Project[]>({
    queryKey: queryKeys.projects,
    queryFn: () => api('/projects'),
  });

  const sectionsQuery = useQuery<Section[]>({
    queryKey: queryKeys.projectSections(projectId),
    queryFn: () => api(`/projects/${projectId}/sections`),
    enabled: Boolean(projectId),
  });

  const project = useMemo(
    () => projectsQuery.data?.find((item) => item.id === projectId) ?? null,
    [projectId, projectsQuery.data],
  );

  const allTasksQuery = useQuery<Task[]>({
    queryKey: queryKeys.projectTasks(projectId),
    queryFn: () => api(`/projects/${projectId}/tasks`),
    enabled: Boolean(projectId) && (view === 'Calendar' || view === 'Timeline'),
  });

  const membersQuery = useQuery<ProjectMember[]>({
    queryKey: queryKeys.projectMembers(projectId),
    queryFn: () => api(`/projects/${projectId}/members`),
    enabled: Boolean(projectId),
  });

  const meQuery = useQuery<{ id: string }>({
    queryKey: queryKeys.me,
    queryFn: () => api('/me'),
  });

  const projectProgress = useMemo(() => {
    if (!allTasksQuery.data?.length) return 0;
    const totalProgress = allTasksQuery.data.reduce((sum, task) => sum + task.progressPercent, 0);
    return Math.round(totalProgress / allTasksQuery.data.length);
  }, [allTasksQuery.data]);

  const taskStats = useMemo(() => {
    if (!allTasksQuery.data) return { todo: 0, inProgress: 0, done: 0, blocked: 0, total: 0 };
    return {
      todo: allTasksQuery.data.filter(t => t.status === 'TODO').length,
      inProgress: allTasksQuery.data.filter(t => t.status === 'IN_PROGRESS').length,
      done: allTasksQuery.data.filter(t => t.status === 'DONE').length,
      blocked: allTasksQuery.data.filter(t => t.status === 'BLOCKED').length,
      total: allTasksQuery.data.length,
    };
  }, [allTasksQuery.data]);

  useMemo(() => {
    if (membersQuery.data && meQuery.data) {
      const myMembership = membersQuery.data.find(m => m.userId === meQuery.data.id);
      setIsAdmin(myMembership?.role === 'ADMIN');
    }
  }, [membersQuery.data, meQuery.data]);

  const createSection = useMutation({
    mutationFn: (name: string) =>
      api(`/projects/${projectId}/sections`, { method: 'POST', body: { name } }) as Promise<Section>,
    onSuccess: (created) => {
      queryClient.setQueryData<Section[]>(queryKeys.projectSections(projectId), (current = []) => {
        if (current.some((item) => item.id === created.id)) return current;
        return [...current, created].sort((a, b) => a.position - b.position);
      });
      queryClient.setQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId), (current = []) => {
        if (current.some((group) => group.section.id === created.id)) return current;
        return [...current, { section: created, tasks: [] }].sort(
          (a, b) => a.section.position - b.section.position,
        );
      });
      setNewSection('');
    },
  });

  if (!projectId) return <div>Loading...</div>;

  return (
    <div className="space-y-4">
      <header className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{project?.name ?? 'Project'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Task list grouped by sections with manual ordering.</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <Badge>{sectionsQuery.data?.length ?? 0} sections</Badge>
              <Badge variant="secondary">{taskStats.total} tasks</Badge>
              <Link href={`/projects/${projectId}/members`}>
                <Button variant="outline" size="sm" data-testid="project-members-page-link">Members</Button>
              </Link>
              <Link href={`/projects/${projectId}/rules`} data-testid="rules-page-link">
                <Button variant="outline" size="sm">Rules</Button>
              </Link>
              <CustomFieldsDialog projectId={projectId} isAdmin={isAdmin} />
            </div>
            {allTasksQuery.data && allTasksQuery.data.length > 0 && (
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <Progress value={projectProgress} className="w-24 h-1.5" />
                  <span className="text-muted-foreground">{projectProgress}%</span>
                </div>
                <div className="flex gap-2">
                  {taskStats.todo > 0 && <span className="text-gray-500">● {taskStats.todo} todo</span>}
                  {taskStats.inProgress > 0 && <span className="text-blue-500">● {taskStats.inProgress} in progress</span>}
                  {taskStats.done > 0 && <span className="text-green-500">● {taskStats.done} done</span>}
                  {taskStats.blocked > 0 && <span className="text-red-500">● {taskStats.blocked} blocked</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="rounded-lg border bg-card p-4">
        <div className="grid gap-2 md:grid-cols-6">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="md:col-span-2"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'ALL' | Task['status'])}
            className="h-9 rounded-md border bg-background px-3 text-sm"
            data-testid="status-filter"
          >
            <option value="ALL">Status: All</option>
            <option value="TODO">TODO</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="DONE">DONE</option>
            <option value="BLOCKED">BLOCKED</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as 'ALL' | NonNullable<Task['priority']>)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
            data-testid="priority-filter"
          >
            <option value="ALL">Priority: All</option>
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
            <option value="URGENT">URGENT</option>
          </select>
          <select
            value={view}
            onChange={(e) => setView(e.target.value as typeof view)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="List">List</option>
            <option value="Board">Board</option>
            <option value="Calendar">Calendar</option>
            <option value="Timeline">Timeline</option>
          </select>
          <Button
            className="md:justify-self-end"
            onClick={() => {
              const el = sectionsQuery.data?.[0]?.id
                ? document.querySelector(`[data-testid="quick-add-open-${sectionsQuery.data[0].id}"]`) as HTMLButtonElement | null
                : null;
              el?.click();
            }}
          >
            Add Task
          </Button>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
            placeholder="Section name"
            data-testid="new-section-input"
            className="min-w-56 flex-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newSection.trim() && !createSection.isPending) {
                void createSection.mutateAsync(newSection.trim());
              }
            }}
          />
          <Button
            data-testid="create-section-btn"
            onClick={() => void createSection.mutateAsync(newSection.trim())}
            disabled={!newSection.trim() || createSection.isPending}
          >
            {createSection.isPending ? 'Adding...' : 'Add Section'}
          </Button>
        </div>
      </section>

      {view === 'List' || view === 'Board' ? (
        <ProjectBoard
          projectId={projectId}
          search={search}
          statusFilter={statusFilter}
          priorityFilter={priorityFilter}
        />
      ) : view === 'Calendar' ? (
        <CalendarView
          tasks={allTasksQuery.data ?? []}
          onTaskClick={setSelectedTaskId}
        />
      ) : (
        <TimelineView
          tasks={allTasksQuery.data ?? []}
          sections={sectionsQuery.data ?? []}
          onTaskClick={setSelectedTaskId}
        />
      )}
    </div>
  );
}
