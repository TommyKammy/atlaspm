'use client';

import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import ProjectBoard from '@/components/project-board';
import { ProjectBoardView, ProjectCalendarView, ProjectFilesView } from '@/components/project-alt-views';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Project, Section, SectionTaskGroup, Task } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const TASK_STATUSES: Task['status'][] = ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'];

function parseListParam(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function ProjectPage() {
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = params.id;
  const openTaskId = searchParams.get('task');
  const [newSection, setNewSection] = useState('');
  const [showAddSectionInput, setShowAddSectionInput] = useState(false);
  const addSectionInputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();
  const viewParam = (searchParams.get('view') ?? 'list').toLowerCase();
  const view: 'list' | 'board' | 'calendar' | 'files' =
    viewParam === 'board' || viewParam === 'calendar' || viewParam === 'files' ? viewParam : 'list';
  const trashOpen = searchParams.get('trash') === '1';
  const search = searchParams.get('q') ?? '';
  const statusFilters = useMemo(
    () =>
      parseListParam(searchParams.get('statuses')).filter(
        (value): value is Task['status'] => TASK_STATUSES.includes(value as Task['status']),
      ),
    [searchParams],
  );
  const assigneeFilters = useMemo(() => parseListParam(searchParams.get('assignees')), [searchParams]);
  const statusFilter: 'ALL' | Task['status'] = 'ALL';
  const priorityFilter: 'ALL' | NonNullable<Task['priority']> = 'ALL';

  const setProjectQueryParam = useCallback((key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (!value) next.delete(key);
    else next.set(key, value);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

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
      setShowAddSectionInput(false);
    },
  });

  const deletedTasksQuery = useQuery<SectionTaskGroup[]>({
    queryKey: queryKeys.projectTasksDeletedGrouped(projectId),
    queryFn: () => api(`/projects/${projectId}/tasks?groupBy=section&deleted=true`),
    enabled: Boolean(projectId) && trashOpen,
  });

  const restoreTask = useMutation({
    mutationFn: (taskId: string) => api(`/tasks/${taskId}/restore`, { method: 'POST' }) as Promise<Task>,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksDeletedGrouped(projectId) });
    },
  });

  if (!projectId) return <div>Loading...</div>;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isInputLike = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (event.key === '/' && !isInputLike) {
        event.preventDefault();
        const searchInput = (document.querySelector('[data-testid="project-search-input"]')
          ?? document.querySelector('[data-testid="global-search-input"]')) as HTMLInputElement | null;
        searchInput?.focus();
      }
      if ((event.key === 'c' || event.key === 'C') && !isInputLike) {
        const quickAddSectionId = sectionsQuery.data?.[0]?.id;
        if (!quickAddSectionId) return;
        event.preventDefault();
        const trigger = document.querySelector(`[data-testid="quick-add-open-${quickAddSectionId}"]`) as HTMLButtonElement | null;
        trigger?.click();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sectionsQuery.data]);

  useEffect(() => {
    if (openTaskId && view !== 'list') {
      setProjectQueryParam('view', 'list');
    }
  }, [openTaskId, setProjectQueryParam, view]);

  return (
    <div className="space-y-4">
      <Dialog open={trashOpen} onOpenChange={(open) => setProjectQueryParam('trash', open ? '1' : null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('deletedTasks')}</DialogTitle>
            <DialogDescription>{t('trash')}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            {deletedTasksQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">{t('loadingTasks')}</p>
            ) : null}
            {!deletedTasksQuery.isLoading && !(deletedTasksQuery.data ?? []).some((group) => group.tasks.length) ? (
              <p className="text-sm text-muted-foreground">{t('noDeletedTasks')}</p>
            ) : null}
            {(deletedTasksQuery.data ?? []).map((group) => {
              if (!group.tasks.length) return null;
              return (
                <div key={group.section.id} className="mb-4">
                  <h4 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                    {group.section.name}
                  </h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('name')}</TableHead>
                        <TableHead>{t('deletedAt')}</TableHead>
                        <TableHead>{t('actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.tasks.map((task) => (
                        <TableRow key={task.id}>
                          <TableCell>{task.title.trim() || t('untitledTask')}</TableCell>
                          <TableCell>
                            {task.deletedAt ? new Date(task.deletedAt).toLocaleString() : '-'}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              onClick={() => restoreTask.mutate(task.id)}
                              disabled={restoreTask.isPending}
                              data-testid={`restore-task-${task.id}`}
                            >
                              {restoreTask.isPending ? t('restoring') : t('restore')}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {view === 'list' ? (
        <>
          <section className="pb-1">
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" data-testid="add-new-trigger">
                    <Plus className="mr-1 h-4 w-4" />
                    {t('addNew')}
                    <ChevronDown className="ml-1 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    data-testid="add-new-task"
                    onClick={() => {
                      const sectionId = sectionsQuery.data?.find((section) => !section.isDefault)?.id ?? sectionsQuery.data?.[0]?.id;
                      const el = sectionId
                        ? (document.querySelector(`[data-testid="quick-add-open-${sectionId}"]`) as HTMLButtonElement | null)
                        : null;
                      el?.click();
                    }}
                  >
                    {t('addTask')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-testid="add-new-section"
                    onClick={() => {
                      setShowAddSectionInput(true);
                      setTimeout(() => addSectionInputRef.current?.focus(), 0);
                    }}
                  >
                    {t('addSection')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {showAddSectionInput ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Input
                  ref={addSectionInputRef}
                  value={newSection}
                  onChange={(e) => setNewSection(e.target.value)}
                  placeholder={t('sectionName')}
                  data-testid="new-section-input"
                  className="min-w-56 flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newSection.trim() && !createSection.isPending) {
                      void createSection.mutateAsync(newSection.trim());
                    }
                    if (e.key === 'Escape') {
                      setShowAddSectionInput(false);
                      setNewSection('');
                    }
                  }}
                />
                <Button
                  data-testid="create-section-btn"
                  onClick={() => void createSection.mutateAsync(newSection.trim())}
                  disabled={!newSection.trim() || createSection.isPending}
                >
                  {createSection.isPending ? t('adding') : t('addSection')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowAddSectionInput(false);
                    setNewSection('');
                  }}
                >
                  {t('cancel')}
                </Button>
              </div>
            ) : null}
          </section>
          <ProjectBoard
            projectId={projectId}
            projectName={project?.name ?? 'Project'}
            search={search}
            statusFilter={statusFilter}
            priorityFilter={priorityFilter}
            statusFilters={statusFilters}
            assigneeFilters={assigneeFilters}
            initialTaskId={openTaskId}
          />
        </>
      ) : view === 'board' ? (
        <ProjectBoardView
          projectId={projectId}
          search={search}
          statusFilter={statusFilter}
          priorityFilter={priorityFilter}
        />
      ) : view === 'calendar' ? (
        <ProjectCalendarView
          projectId={projectId}
          search={search}
          statusFilter={statusFilter}
          priorityFilter={priorityFilter}
        />
      ) : view === 'files' ? (
        <ProjectFilesView
          projectId={projectId}
          search={search}
          statusFilter={statusFilter}
          priorityFilter={priorityFilter}
        />
      ) : (
        <section className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          {view} {t('listViewIsPlanned')}
        </section>
      )}
    </div>
  );
}
