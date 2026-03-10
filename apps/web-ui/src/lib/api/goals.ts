'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type {
  Goal,
  GoalHistoryItem,
  GoalProjectLink,
  GoalProjectLinkWithProject,
  GoalStatus,
} from '@/lib/types';

type GoalListOptions = {
  includeArchived?: boolean;
};

type GoalHistoryOptions = {
  take?: number;
};

export type CreateGoalInput = {
  workspaceId: string;
  title: string;
  description?: string;
  ownerUserId?: string;
  status?: GoalStatus;
  progressPercent?: number;
};

export type UpdateGoalInput = {
  title?: string;
  description?: string | null;
  ownerUserId?: string;
  status?: GoalStatus;
  progressPercent?: number;
};

export type ApiOkResponse = {
  ok: true;
};

function buildGoalListPath(workspaceId: string, options?: GoalListOptions) {
  const params = new URLSearchParams();
  if (options?.includeArchived) {
    params.set('includeArchived', 'true');
  }
  const query = params.toString();
  return query ? `/workspaces/${workspaceId}/goals?${query}` : `/workspaces/${workspaceId}/goals`;
}

function buildGoalHistoryPath(goalId: string, options?: GoalHistoryOptions) {
  const params = new URLSearchParams();
  if (options?.take) {
    params.set('take', options.take.toString());
  }
  const query = params.toString();
  return query ? `/goals/${goalId}/history?${query}` : `/goals/${goalId}/history`;
}

export async function listGoals(workspaceId: string, options?: GoalListOptions): Promise<Goal[]> {
  return (await api(buildGoalListPath(workspaceId, options))) as Goal[];
}

export async function getGoal(goalId: string): Promise<Goal> {
  return (await api(`/goals/${goalId}`)) as Goal;
}

export async function getGoalHistory(
  goalId: string,
  options?: GoalHistoryOptions,
): Promise<GoalHistoryItem[]> {
  return (await api(buildGoalHistoryPath(goalId, options))) as GoalHistoryItem[];
}

export async function getGoalProjects(goalId: string): Promise<GoalProjectLinkWithProject[]> {
  return (await api(`/goals/${goalId}/projects`)) as GoalProjectLinkWithProject[];
}

export async function getProjectGoals(projectId: string): Promise<Goal[]> {
  return (await api(`/projects/${projectId}/goals`)) as Goal[];
}

export async function createGoal(input: CreateGoalInput): Promise<Goal> {
  return (await api('/goals', {
    method: 'POST',
    body: input,
  })) as Goal;
}

export async function updateGoal(goalId: string, input: UpdateGoalInput): Promise<Goal> {
  return (await api(`/goals/${goalId}`, {
    method: 'PATCH',
    body: input,
  })) as Goal;
}

export async function archiveGoal(goalId: string): Promise<ApiOkResponse> {
  return (await api(`/goals/${goalId}`, {
    method: 'DELETE',
  })) as ApiOkResponse;
}

export async function linkGoalProject(goalId: string, projectId: string): Promise<GoalProjectLink> {
  return (await api(`/goals/${goalId}/projects`, {
    method: 'POST',
    body: { projectId },
  })) as GoalProjectLink;
}

export async function unlinkGoalProject(goalId: string, projectId: string): Promise<ApiOkResponse> {
  return (await api(`/goals/${goalId}/projects/${projectId}`, {
    method: 'DELETE',
  })) as ApiOkResponse;
}

export function useGoals(workspaceId: string, options?: GoalListOptions) {
  return useQuery({
    queryKey: queryKeys.workspaceGoals(workspaceId, options),
    queryFn: () => listGoals(workspaceId, options),
    enabled: !!workspaceId,
  });
}

export function useGoal(goalId: string) {
  return useQuery({
    queryKey: queryKeys.goal(goalId),
    queryFn: () => getGoal(goalId),
    enabled: !!goalId,
  });
}

export function useGoalHistory(goalId: string, options?: GoalHistoryOptions) {
  return useQuery({
    queryKey: queryKeys.goalHistory(goalId, options?.take),
    queryFn: () => getGoalHistory(goalId, options),
    enabled: !!goalId,
  });
}

export function useGoalProjects(goalId: string) {
  return useQuery({
    queryKey: queryKeys.goalProjects(goalId),
    queryFn: () => getGoalProjects(goalId),
    enabled: !!goalId,
  });
}

export function useProjectGoals(projectId: string) {
  return useQuery({
    queryKey: queryKeys.projectGoals(projectId),
    queryFn: () => getProjectGoals(projectId),
    enabled: !!projectId,
  });
}

export function useCreateGoal(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<CreateGoalInput, 'workspaceId'> & { workspaceId?: string }) =>
      createGoal({ ...input, workspaceId: input.workspaceId ?? workspaceId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceGoals(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceGoals(workspaceId, { includeArchived: true }) });
    },
  });
}

export function useUpdateGoal(goalId: string, workspaceId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateGoalInput) => updateGoal(goalId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.goal(goalId) });
      queryClient.invalidateQueries({ queryKey: ['goal', goalId, 'history'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.goalProjects(goalId) });
      if (workspaceId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaceGoals(workspaceId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaceGoals(workspaceId, { includeArchived: true }) });
      }
    },
  });
}

export function useArchiveGoal(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (goalId: string) => archiveGoal(goalId),
    onSuccess: (_, goalId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceGoals(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceGoals(workspaceId, { includeArchived: true }) });
      queryClient.invalidateQueries({ queryKey: queryKeys.goal(goalId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.goalProjects(goalId) });
      queryClient.invalidateQueries({ queryKey: ['goal', goalId, 'history'] });
    },
  });
}

export function useLinkGoalProject(goalId: string, workspaceId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => linkGoalProject(goalId, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.goal(goalId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.goalProjects(goalId) });
      queryClient.invalidateQueries({ queryKey: ['goal', goalId, 'history'] });
      if (workspaceId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaceGoals(workspaceId) });
      }
    },
  });
}

export function useUnlinkGoalProject(goalId: string, workspaceId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => unlinkGoalProject(goalId, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.goal(goalId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.goalProjects(goalId) });
      queryClient.invalidateQueries({ queryKey: ['goal', goalId, 'history'] });
      if (workspaceId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaceGoals(workspaceId) });
      }
    },
  });
}
