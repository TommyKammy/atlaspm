'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Project, Workspace } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function HomePage() {
  const [name, setName] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const queryClient = useQueryClient();

  const { data: workspaces = [] } = useQuery<Workspace[]>({
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
    <div className="space-y-4">
      <header className="rounded-lg border bg-card p-4">
        <h1 className="text-xl font-semibold">AtlasPM</h1>
        <p className="mt-1 text-sm text-muted-foreground">Asana-like list planning powered by AtlasPM core APIs.</p>
      </header>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-muted-foreground">Create Project</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
          />
          <select
            className="h-9 rounded-md border bg-background px-3 text-sm"
            value={activeWorkspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <Button
            onClick={() => createProject.mutate({ workspaceId: activeWorkspaceId, name })}
            disabled={!name.trim() || !activeWorkspaceId || createProject.isPending}
            data-testid="create-project-btn"
          >
            {createProject.isPending ? 'Creating...' : 'Create Project'}
          </Button>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.1em] text-muted-foreground">Project Board</h2>
        {projects.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No projects yet. Create one to start planning.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {projects.map((p) => (
              <li key={p.id}>
                <Link className="text-sm font-medium hover:text-primary" href={`/projects/${p.id}`}>
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link className="text-xs text-muted-foreground hover:text-foreground" href="/login">
        Switch login identity
      </Link>
    </div>
  );
}
