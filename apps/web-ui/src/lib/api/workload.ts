'use client';

import { useQuery } from '@tanstack/react-query';
import type { OverloadAlert, UserWorkload, WeeklyLoad, WorkloadViewMode } from '@atlaspm/shared-types';
import { api } from '@/lib/api';

interface WorkloadFilters {
  startDate?: string;
  endDate?: string;
  projectId?: string;
  viewMode?: WorkloadViewMode;
  periodWeeks?: number;
}

export type { OverloadAlert, UserWorkload, WeeklyLoad, WorkloadFilters };

async function fetchMyWorkload(workspaceId: string, filters?: WorkloadFilters): Promise<UserWorkload> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.projectId) params.append('projectId', filters.projectId);
  if (filters?.viewMode) params.append('viewMode', filters.viewMode);
  if (filters?.periodWeeks) params.append('periodWeeks', filters.periodWeeks.toString());

  return (await api(`/workload/me?${params.toString()}`, {
    headers: { 'x-workspace-id': workspaceId },
  })) as UserWorkload;
}

async function fetchUserWorkload(workspaceId: string, userId: string, filters?: WorkloadFilters): Promise<UserWorkload> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.projectId) params.append('projectId', filters.projectId);
  if (filters?.viewMode) params.append('viewMode', filters.viewMode);
  if (filters?.periodWeeks) params.append('periodWeeks', filters.periodWeeks.toString());

  return (await api(`/workload/users/${userId}?${params.toString()}`, {
    headers: { 'x-workspace-id': workspaceId },
  })) as UserWorkload;
}

async function fetchTeamWorkload(workspaceId: string, filters?: WorkloadFilters): Promise<UserWorkload[]> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.projectId) params.append('projectId', filters.projectId);
  if (filters?.viewMode) params.append('viewMode', filters.viewMode);
  if (filters?.periodWeeks) params.append('periodWeeks', filters.periodWeeks.toString());

  return (await api(`/workload/team?${params.toString()}`, {
    headers: { 'x-workspace-id': workspaceId },
  })) as UserWorkload[];
}

async function fetchProjectWorkload(workspaceId: string, projectId: string, filters?: WorkloadFilters): Promise<UserWorkload[]> {
  const params = new URLSearchParams();
  if (filters?.startDate) params.append('startDate', filters.startDate);
  if (filters?.endDate) params.append('endDate', filters.endDate);
  if (filters?.viewMode) params.append('viewMode', filters.viewMode);
  if (filters?.periodWeeks) params.append('periodWeeks', filters.periodWeeks.toString());

  return (await api(`/workload/projects/${projectId}?${params.toString()}`, {
    headers: { 'x-workspace-id': workspaceId },
  })) as UserWorkload[];
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
