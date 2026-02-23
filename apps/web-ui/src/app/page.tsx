'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Project } from '@/lib/types';

export default function HomePage() {
  const [name, setName] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const queryClient = useQueryClient();

  const { data: workspaces = [] } = useQuery<any[]>({
    queryKey: queryKeys.workspaces,
    queryFn: () => api('/workspaces'),
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: queryKeys.projects,
    queryFn: () => api('/projects'),
  });

  const createProject = useMutation({
    mutationFn: (payload: { workspaceId: string; name: string }) =>
      api('/projects', { method: 'POST', body: payload }) as Promise<Project>,
    onSuccess: (project) => {
      queryClient.setQueryData<Project[]>(queryKeys.projects, (prev = []) => [...prev, project]);
      setName('');
    },
  });

  const activeWorkspaceId = workspaceId || workspaces[0]?.id || '';

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-slate-200 bg-white p-5">
        <h1 className="text-3xl font-semibold text-slate-900">AtlasPM</h1>
        <p className="mt-2 text-sm text-slate-500">Asana-like list planning powered by AtlasPM core APIs.</p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">Create Project</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <input
            className="rounded-md border border-slate-300 px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
          />
          <select
            className="rounded-md border border-slate-300 px-3 py-2"
            value={activeWorkspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <button
            className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => createProject.mutate({ workspaceId: activeWorkspaceId, name })}
            disabled={!name.trim() || !activeWorkspaceId || createProject.isPending}
            data-testid="create-project-btn"
          >
            {createProject.isPending ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">Project Board</h2>
        {projects.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No projects yet. Create one to start planning.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {projects.map((p) => (
              <li key={p.id}>
                <Link className="text-sm font-medium text-sky-700 hover:text-sky-900" href={`/projects/${p.id}`}>
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link className="text-xs text-slate-500 hover:text-slate-700" href="/login">
        Switch login identity
      </Link>
    </div>
  );
}
