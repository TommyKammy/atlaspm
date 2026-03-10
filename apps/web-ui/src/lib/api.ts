import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import type { Project, TaskProjectLink } from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_CORE_API_URL ?? 'http://localhost:3001';
export const apiBaseUrl = API_URL;

// Raw link response from mutations (without included project relation)
type TaskProjectLinkResponse = {
  id: string;
  taskId: string;
  projectId: string;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type ApiOptions = {
  method?: string;
  body?: unknown | FormData;
  token?: string;
  headers?: Record<string, string>;
};

function isUnsafeMethod(method: string) {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

function readCookie(name: string) {
  if (typeof document === 'undefined') return '';
  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!cookie) return '';
  return decodeURIComponent(cookie.slice(name.length + 1));
}

function getCsrfToken() {
  return readCookie('__Host-atlaspm_csrf') || readCookie('atlaspm_csrf');
}

export async function api(path: string, options: ApiOptions = {}) {
  const method = options.method ?? 'GET';
  const isFormData = options.body instanceof FormData;
  const csrfToken = isUnsafeMethod(method) ? getCsrfToken() : '';
  const url = path.startsWith('http://') || path.startsWith('https://') ? path : `${API_URL}${path}`;
  const init: RequestInit = {
    method,
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(isFormData ? {} : { 'content-type': 'application/json' }),
      ...(csrfToken ? { 'x-atlaspm-csrf': csrfToken } : {}),
      ...(options.headers ?? {}),
    },
    cache: 'no-store',
    credentials: 'include',
  };
  if (options.body !== undefined) {
    init.body = isFormData ? (options.body as FormData) : JSON.stringify(options.body);
  }

  const res = await fetch(url, init);
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
  }) as Promise<TaskProjectLinkResponse>;
}

export async function removeTaskFromProject(taskId: string, projectId: string) {
  return api(`/tasks/${taskId}/projects/${projectId}`, {
    method: 'DELETE',
  }) as Promise<TaskProjectLinkResponse>;
}

export async function setPrimaryProject(taskId: string, projectId: string) {
  return api(`/tasks/${taskId}/projects/${projectId}/primary`, {
    method: 'POST',
  }) as Promise<TaskProjectLinkResponse>;
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
      queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(variables.projectId) });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(variables.projectId) });
    },
  });
}

export function useSetPrimaryProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, projectId }: { taskId: string; projectId: string }) => {
      return setPrimaryProject(taskId, projectId);
    },
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
