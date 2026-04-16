'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TaskProjectLink, TaskProjectLinkMutationResult } from '@atlaspm/shared-types';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

export async function listTaskProjectLinks(taskId: string): Promise<TaskProjectLink[]> {
  const data = await api(`/tasks/${taskId}/projects`);
  return Array.isArray(data) ? (data as TaskProjectLink[]) : [];
}

export async function addTaskToProject(taskId: string, projectId: string): Promise<TaskProjectLinkMutationResult> {
  return (await api(`/tasks/${taskId}/projects`, {
    method: 'POST',
    body: { projectId },
  })) as TaskProjectLinkMutationResult;
}

export async function removeTaskFromProject(
  taskId: string,
  projectId: string,
): Promise<TaskProjectLinkMutationResult> {
  return (await api(`/tasks/${taskId}/projects/${projectId}`, {
    method: 'DELETE',
  })) as TaskProjectLinkMutationResult;
}

export async function setPrimaryProject(taskId: string, projectId: string): Promise<TaskProjectLinkMutationResult> {
  return (await api(`/tasks/${taskId}/projects/${projectId}/primary`, {
    method: 'POST',
  })) as TaskProjectLinkMutationResult;
}

export function useTaskProjectLinks(taskId: string) {
  return useQuery({
    queryKey: ['task', taskId, 'projects'],
    queryFn: () => listTaskProjectLinks(taskId),
    enabled: !!taskId,
  });
}

export function useAddTaskToProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, projectId }: { taskId: string; projectId: string }) => addTaskToProject(taskId, projectId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['task', variables.taskId, 'projects'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(variables.projectId) });
    },
  });
}

export function useRemoveTaskFromProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, projectId }: { taskId: string; projectId: string }) =>
      removeTaskFromProject(taskId, projectId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['task', variables.taskId, 'projects'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(variables.projectId) });
    },
  });
}

export function useSetPrimaryProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, projectId }: { taskId: string; projectId: string }) => setPrimaryProject(taskId, projectId),
    onSuccess: async (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['task', variables.taskId, 'projects'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(variables.taskId) });

      const taskDetail = queryClient.getQueryData<{ projectId: string }>(queryKeys.taskDetail(variables.taskId));
      if (taskDetail) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(taskDetail.projectId) });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(variables.projectId) });
    },
  });
}
