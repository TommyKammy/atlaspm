import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Project, TaskProjectLink } from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_CORE_API_URL ?? 'http://localhost:3001';
export const apiBaseUrl = API_URL;

export type ApiOptions = {
  method?: string;
  body?: unknown | FormData;
  token?: string;
  headers?: Record<string, string>;
};

export function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('atlaspm_token') ?? '';
}

export function setToken(token: string) {
  if (typeof window !== 'undefined') localStorage.setItem('atlaspm_token', token);
}

export async function api(path: string, options: ApiOptions = {}) {
  const token = options.token ?? getToken();
  const isFormData = options.body instanceof FormData;
  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(isFormData ? {} : { 'content-type': 'application/json' }),
      ...(options.headers ?? {}),
    },
    cache: 'no-store',
  };
  if (options.body !== undefined) {
    init.body = isFormData ? (options.body as FormData) : JSON.stringify(options.body);
  }

  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return null;
  return res.json();
}



// Project API
export function useProjects(workspaceId: string) {
  return useQuery({
    queryKey: ['workspace', workspaceId, 'projects'],
    queryFn: async () => {
      const projects = (await api('/projects')) as Project[];
      return projects.filter((project) => project.workspaceId === workspaceId);
    },
    enabled: !!workspaceId,
  });
}

// Task Project Links API
export function useTaskProjectLinks(taskId: string) {
  return useQuery({
    queryKey: ['task', taskId, 'projects'],
    queryFn: async () => {
      return api(`/tasks/${taskId}/projects`) as Promise<TaskProjectLink[]>;
    },
    enabled: !!taskId,
  });
}

export async function addTaskToProject(taskId: string, projectId: string) {
  return api(`/tasks/${taskId}/projects`, {
    method: 'POST',
    body: { projectId },
  }) as Promise<TaskProjectLink>;
}

export async function removeTaskFromProject(taskId: string, projectId: string) {
  return api(`/tasks/${taskId}/projects/${projectId}`, {
    method: 'DELETE',
  }) as Promise<TaskProjectLink>;
}

export async function setPrimaryProject(taskId: string, projectId: string) {
  return api(`/tasks/${taskId}/projects/${projectId}/primary`, {
    method: 'POST',
  }) as Promise<TaskProjectLink>;
}

// Task Project Links Mutations
export function useAddTaskToProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, projectId }: { taskId: string; projectId: string }) => {
      return addTaskToProject(taskId, projectId);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['task', variables.taskId, 'projects'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useRemoveTaskFromProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, projectId }: { taskId: string; projectId: string }) => {
      return removeTaskFromProject(taskId, projectId);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['task', variables.taskId, 'projects'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useSetPrimaryProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, projectId }: { taskId: string; projectId: string }) => {
      return setPrimaryProject(taskId, projectId);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['task', variables.taskId, 'projects'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
