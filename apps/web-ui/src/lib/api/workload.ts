'use client';

import { useQuery } from '@tanstack/react-query';

const API_URL = process.env.NEXT_PUBLIC_CORE_API_URL || 'http://localhost:3001';

export interface WeeklyLoad {
  week: string;
  startDate: string;
  endDate: string;
  taskCount: number;
  tasks: Array<{
    id: string;
    title: string;
    dueAt: string | null;
    priority: string;
    status: string;
  }>;
}

export interface OverloadAlert {
  week: string;
  taskCount: number;
  capacity: number;
  excess: number;
}

export interface UserWorkload {
  userId: string;
  userName: string;
  email: string;
  totalTasks: number;
  weeklyBreakdown: WeeklyLoad[];
  overloadAlerts: OverloadAlert[];
}

interface WorkloadFilters {
  startDate?: string;
  endDate?: string;
  projectId?: string;
}

async function fetchMyWorkload(workspaceId: string, filters?: WorkloadFilters): Promise<UserWorkload> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.projectId) params.append('projectId', filters.projectId);

  const res = await fetch(`${API_URL}/workload/me?${params}`, {
    credentials: 'include',
    headers: {
      'x-workspace-id': workspaceId,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch workload');
  return res.json();
}

async function fetchUserWorkload(workspaceId: string, userId: string, filters?: WorkloadFilters): Promise<UserWorkload> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.projectId) params.append('projectId', filters.projectId);

  const res = await fetch(`${API_URL}/workload/users/${userId}?${params}`, {
    credentials: 'include',
    headers: {
      'x-workspace-id': workspaceId,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch user workload');
  return res.json();
}

async function fetchTeamWorkload(workspaceId: string, filters?: WorkloadFilters): Promise<UserWorkload[]> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.projectId) params.append('projectId', filters.projectId);

  const res = await fetch(`${API_URL}/workload/team?${params}`, {
    credentials: 'include',
    headers: {
      'x-workspace-id': workspaceId,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch team workload');
  return res.json();
}

async function fetchProjectWorkload(workspaceId: string, projectId: string, filters?: WorkloadFilters): Promise<UserWorkload[]> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);

  const res = await fetch(`${API_URL}/workload/projects/${projectId}?${params}`, {
    credentials: 'include',
    headers: {
      'x-workspace-id': workspaceId,
    },
  });
  if (!res.ok) throw new Error('Failed to fetch project workload');
  return res.json();
}

export function useMyWorkload(workspaceId: string, filters?: WorkloadFilters) {
  return useQuery({
    queryKey: ['workload', 'me', workspaceId, filters],
    queryFn: () => fetchMyWorkload(workspaceId, filters),
    enabled: !!workspaceId,
  });
}

export function useUserWorkload(workspaceId: string, userId: string, filters?: WorkloadFilters) {
  return useQuery({
    queryKey: ['workload', 'user', workspaceId, userId, filters],
    queryFn: () => fetchUserWorkload(workspaceId, userId, filters),
    enabled: !!workspaceId && !!userId,
  });
}

export function useTeamWorkload(workspaceId: string, filters?: WorkloadFilters) {
  return useQuery({
    queryKey: ['workload', 'team', workspaceId, filters],
    queryFn: () => fetchTeamWorkload(workspaceId, filters),
    enabled: !!workspaceId,
  });
}

export function useProjectWorkload(workspaceId: string, projectId: string, filters?: WorkloadFilters) {
  return useQuery({
    queryKey: ['workload', 'project', workspaceId, projectId, filters],
    queryFn: () => fetchProjectWorkload(workspaceId, projectId, filters),
    enabled: !!workspaceId && !!projectId,
  });
}
