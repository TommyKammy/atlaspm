'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Widget {
  id: string;
  type: 'TASK_COMPLETION' | 'PROGRESS_CHART' | 'TEAM_LOAD' | 'OVERDUE_ALERTS' | 'RECENT_ACTIVITY';
  config: Record<string, unknown>;
  position: { x: number; y: number; w: number; h: number };
  createdAt: string;
  updatedAt: string;
}

export interface Dashboard {
  id: string;
  name: string;
  layout: Record<string, unknown>;
  widgets: Widget[];
  createdAt: string;
  updatedAt: string;
}

async function fetchDashboards(): Promise<Dashboard[]> {
  return (await api('/dashboards')) as Dashboard[];
}

async function fetchDashboard(dashboardId: string): Promise<Dashboard> {
  return (await api(`/dashboards/${dashboardId}`)) as Dashboard;
}

async function createDashboard(data: { name: string; layout?: Record<string, unknown> }): Promise<Dashboard> {
  return (await api('/dashboards', {
    method: 'POST',
    body: data,
  })) as Dashboard;
}

async function updateDashboard(dashboardId: string, data: { name?: string; layout?: Record<string, unknown> }): Promise<Dashboard> {
  return (await api(`/dashboards/${dashboardId}`, {
    method: 'PATCH',
    body: data,
  })) as Dashboard;
}

async function deleteDashboard(dashboardId: string): Promise<void> {
  await api(`/dashboards/${dashboardId}`, {
    method: 'DELETE',
  });
}

async function createWidget(dashboardId: string, data: { type: string; config?: Record<string, unknown>; position: { x: number; y: number; w: number; h: number } }): Promise<Widget> {
  return (await api(`/dashboards/${dashboardId}/widgets`, {
    method: 'POST',
    body: data,
  })) as Widget;
}

async function updateWidget(dashboardId: string, widgetId: string, data: { config?: Record<string, unknown>; position?: { x: number; y: number; w: number; h: number } }): Promise<Widget> {
  return (await api(`/dashboards/${dashboardId}/widgets/${widgetId}`, {
    method: 'PATCH',
    body: data,
  })) as Widget;
}

async function deleteWidget(dashboardId: string, widgetId: string): Promise<void> {
  await api(`/dashboards/${dashboardId}/widgets/${widgetId}`, {
    method: 'DELETE',
  });
}

async function updateLayout(dashboardId: string, layout: Record<string, unknown>): Promise<void> {
  await api(`/dashboards/${dashboardId}/layout`, {
    method: 'PATCH',
    body: { layout },
  });
}

export function useDashboards() {
  return useQuery({
    queryKey: ['dashboards'],
    queryFn: fetchDashboards,
  });
}

export function useDashboard(dashboardId: string) {
  return useQuery({
    queryKey: ['dashboards', dashboardId],
    queryFn: () => fetchDashboard(dashboardId),
    enabled: !!dashboardId,
  });
}

export function useCreateDashboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createDashboard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    },
  });
}

export function useUpdateDashboard(dashboardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name?: string; layout?: Record<string, unknown> }) => updateDashboard(dashboardId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
      queryClient.invalidateQueries({ queryKey: ['dashboards', dashboardId] });
    },
  });
}

export function useDeleteDashboard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteDashboard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards'] });
    },
  });
}

export function useCreateWidget(dashboardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { type: string; config?: Record<string, unknown>; position: { x: number; y: number; w: number; h: number } }) => createWidget(dashboardId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards', dashboardId] });
    },
  });
}

export function useUpdateWidget(dashboardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ widgetId, data }: { widgetId: string; data: { config?: Record<string, unknown>; position?: { x: number; y: number; w: number; h: number } } }) => updateWidget(dashboardId, widgetId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards', dashboardId] });
    },
  });
}

export function useDeleteWidget(dashboardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (widgetId: string) => deleteWidget(dashboardId, widgetId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards', dashboardId] });
    },
  });
}

export function useUpdateLayout(dashboardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (layout: Record<string, unknown>) => updateLayout(dashboardId, layout),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboards', dashboardId] });
    },
  });
}
