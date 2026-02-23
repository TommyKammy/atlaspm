'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import ProjectBoard from '@/components/project-board';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Project, Section, SectionTaskGroup } from '@/lib/types';

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [newSection, setNewSection] = useState('');
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
    },
  });

  if (!projectId) return <div>Loading...</div>;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{project?.name ?? 'Project'}</h1>
          <p className="mt-1 text-sm text-slate-500">Manage sections, tasks, assignees, and rules in one list view.</p>
        </div>
        <Link
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          href={`/projects/${projectId}/rules`}
          data-testid="rules-page-link"
        >
          Open Rules
        </Link>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="min-w-64 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
            placeholder="Section name"
            data-testid="new-section-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newSection.trim() && !createSection.isPending) {
                void createSection.mutateAsync(newSection.trim());
              }
            }}
          />
          <button
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            data-testid="create-section-btn"
            onClick={() => void createSection.mutateAsync(newSection.trim())}
            disabled={!newSection.trim() || createSection.isPending}
          >
            {createSection.isPending ? 'Adding...' : 'Add Section'}
          </button>
          <span className="text-xs text-slate-500">
            {sectionsQuery.data?.length ?? 0} sections
          </span>
        </div>
      </section>

      <ProjectBoard projectId={projectId} />
    </div>
  );
}
