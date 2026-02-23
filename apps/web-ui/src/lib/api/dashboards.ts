'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_URL = process.env.NEXT_PUBLIC_CORE_API_URL || 'http://localhost:3001';

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
  const res = await fetch(`${API_URL}/dashboards`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch dashboards');
  return res.json();
}

async function fetchDashboard(dashboardId: string): Promise<Dashboard> {
  const res = await fetch(`${API_URL}/dashboards/${dashboardId}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch dashboard');
  return res.json();
}

async function createDashboard(data: { name: string; layout?: Record<string, unknown> }): Promise<Dashboard> {
  const res = await fetch(`${API_URL}/dashboards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create dashboard');
  return res.json();
}

async function updateDashboard(dashboardId: string, data: { name?: string; layout?: Record<string, unknown> }): Promise<Dashboard> {
  const res = await fetch(`${API_URL}/dashboards/${dashboardId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update dashboard');
  return res.json();
}

async function deleteDashboard(dashboardId: string): Promise<void> {
  const res = await fetch(`${API_URL}/dashboards/${dashboardId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to delete dashboard');
}

async function createWidget(dashboardId: string, data: { type: string; config?: Record<string, unknown>; position: { x: number; y: number; w: number; h: number } }): Promise<Widget> {
  const res = await fetch(`${API_URL}/dashboards/${dashboardId}/widgets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create widget');
  return res.json();
}

async function updateWidget(dashboardId: string, widgetId: string, data: { config?: Record<string, unknown>; position?: { x: number; y: number; w: number; h: number } }): Promise<Widget> {
  const res = await fetch(`${API_URL}/dashboards/${dashboardId}/widgets/${widgetId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update widget');
  return res.json();
}

async function deleteWidget(dashboardId: string, widgetId: string): Promise<void> {
  const res = await fetch(`${API_URL}/dashboards/${dashboardId}/widgets/${widgetId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to delete widget');
}

async function updateLayout(dashboardId: string, layout: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${API_URL}/dashboards/${dashboardId}/layout`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ layout }),
  });
  if (!res.ok) throw new Error('Failed to update layout');
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
