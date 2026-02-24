'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import ProjectBoard from '@/components/project-board';
import { ProjectBoardView, ProjectCalendarView, ProjectFilesView } from '@/components/project-alt-views';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Project, Section, SectionTaskGroup, Task } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [newSection, setNewSection] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | Task['status']>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | NonNullable<Task['priority']>>('ALL');
  const [view, setView] = useState<'List' | 'Board' | 'Calendar' | 'Files'>('List');
  const [showAddSectionInput, setShowAddSectionInput] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const addSectionInputRef = useRef<HTMLInputElement | null>(null);
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

  if (!projectId) return <div>Loading...</div>;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isInputLike = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (event.key === '/' && !isInputLike) {
        event.preventDefault();
        searchInputRef.current?.focus();
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

  return (
    <div className="space-y-4">
      <header className="rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{project?.name ?? 'Project'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Task list grouped by sections with manual ordering.</p>
            <div className="mt-3 flex items-center gap-1">
              {(['List', 'Board', 'Calendar', 'Files'] as const).map((tab) => (
                <Button
                  key={tab}
                  variant={view === tab ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setView(tab)}
                  className="h-8 px-3"
                  data-testid={`project-view-${tab.toLowerCase()}`}
                >
                  {tab}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge>{sectionsQuery.data?.length ?? 0} sections</Badge>
            <Link href={`/projects/${projectId}/members`}>
              <Button variant="outline" size="sm" data-testid="project-members-page-link">Members</Button>
            </Link>
            <Link href={`/projects/${projectId}/rules`} data-testid="rules-page-link">
              <Button variant="outline" size="sm">Rules</Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="rounded-lg border bg-card p-4">
        <div className="grid gap-2 md:grid-cols-6">
          <Input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks..."
            className="md:col-span-2"
            data-testid="project-search-input"
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
            onChange={(e) => setView(e.target.value as 'List' | 'Board' | 'Calendar' | 'Files')}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option>List</option>
            <option>Board</option>
          </select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="md:justify-self-end" data-testid="add-new-trigger">
                <Plus className="mr-1 h-4 w-4" />
                Add new
                <ChevronDown className="ml-1 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
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
                Add task
              </DropdownMenuItem>
              <DropdownMenuItem
                data-testid="add-new-section"
                onClick={() => {
                  setShowAddSectionInput(true);
                  setTimeout(() => addSectionInputRef.current?.focus(), 0);
                }}
              >
                Add section
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {showAddSectionInput ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
            <Input
              ref={addSectionInputRef}
              value={newSection}
              onChange={(e) => setNewSection(e.target.value)}
              placeholder="Section name"
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
              {createSection.isPending ? 'Adding...' : 'Add Section'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowAddSectionInput(false);
                setNewSection('');
              }}
            >
              Cancel
            </Button>
          </div>
        ) : null}
      </section>

      {view === 'List' ? (
        <ProjectBoard
          projectId={projectId}
          projectName={project?.name ?? 'Project'}
          search={search}
          statusFilter={statusFilter}
          priorityFilter={priorityFilter}
        />
      ) : view === 'Board' ? (
        <ProjectBoardView
          projectId={projectId}
          search={search}
          statusFilter={statusFilter}
          priorityFilter={priorityFilter}
        />
      ) : view === 'Calendar' ? (
        <ProjectCalendarView
          projectId={projectId}
          search={search}
          statusFilter={statusFilter}
          priorityFilter={priorityFilter}
        />
      ) : view === 'Files' ? (
        <ProjectFilesView
          projectId={projectId}
          search={search}
          statusFilter={statusFilter}
          priorityFilter={priorityFilter}
        />
      ) : (
        <section className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          {view} view is planned. Use List view for full editing and ordering.
        </section>
      )}
    </div>
  );
}
