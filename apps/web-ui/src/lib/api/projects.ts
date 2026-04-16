'use client';

import { useQuery } from '@tanstack/react-query';
import type { Project } from '@atlaspm/shared-types';
import { api } from '@/lib/api';

export async function listProjects(): Promise<Project[]> {
  const data = await api('/projects');
  return Array.isArray(data) ? (data as Project[]) : [];
}

export function useProjects(workspaceId: string) {
  return useQuery({
    queryKey: ['workspace', workspaceId, 'projects'],
    queryFn: async () => {
      const projects = await listProjects();
      return projects.filter((project) => project.workspaceId === workspaceId);
    },
    enabled: !!workspaceId,
  });
}
