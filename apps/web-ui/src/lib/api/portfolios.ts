'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Portfolio {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  progress: number;
  projects: PortfolioProject[];
}

export interface PortfolioProject {
  id: string;
  projectId: string;
  project: {
    id: string;
    name: string;
  };
}

export interface PortfolioProgress {
  projectId: string;
  projectName: string;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  todoTasks: number;
  progress: number;
}

export interface PortfolioDetail {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  projects: PortfolioProject[];
  progress: PortfolioProgress[];
}

async function fetchPortfolios(workspaceId: string): Promise<Portfolio[]> {
  return (await api(`/workspaces/${workspaceId}/portfolios`)) as Portfolio[];
}

async function fetchPortfolio(workspaceId: string, portfolioId: string): Promise<PortfolioDetail> {
  return (await api(`/workspaces/${workspaceId}/portfolios/${portfolioId}`)) as PortfolioDetail;
}

async function createPortfolio(workspaceId: string, data: { name: string; description?: string; projectIds?: string[] }): Promise<Portfolio> {
  return (await api(`/workspaces/${workspaceId}/portfolios`, {
    method: 'POST',
    body: data,
  })) as Portfolio;
}

async function updatePortfolio(workspaceId: string, portfolioId: string, data: { name?: string; description?: string }): Promise<Portfolio> {
  return (await api(`/workspaces/${workspaceId}/portfolios/${portfolioId}`, {
    method: 'PATCH',
    body: data,
  })) as Portfolio;
}

async function deletePortfolio(workspaceId: string, portfolioId: string): Promise<void> {
  await api(`/workspaces/${workspaceId}/portfolios/${portfolioId}`, {
    method: 'DELETE',
  });
}

async function addProjectToPortfolio(workspaceId: string, portfolioId: string, projectId: string): Promise<void> {
  await api(`/workspaces/${workspaceId}/portfolios/${portfolioId}/projects/${projectId}`, {
    method: 'POST',
  });
}

async function removeProjectFromPortfolio(workspaceId: string, portfolioId: string, projectId: string): Promise<void> {
  await api(`/workspaces/${workspaceId}/portfolios/${portfolioId}/projects/${projectId}`, {
    method: 'DELETE',
  });
}

export function usePortfolios(workspaceId: string) {
  return useQuery({
    queryKey: ['workspace', workspaceId, 'portfolios'],
    queryFn: () => fetchPortfolios(workspaceId),
    enabled: !!workspaceId,
  });
}

export function usePortfolio(workspaceId: string, portfolioId: string) {
  return useQuery({
    queryKey: ['workspace', workspaceId, 'portfolios', portfolioId],
    queryFn: () => fetchPortfolio(workspaceId, portfolioId),
    enabled: !!workspaceId && !!portfolioId,
  });
}

export function useCreatePortfolio(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string; projectIds?: string[] }) =>
      createPortfolio(workspaceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId, 'portfolios'] });
    },
  });
}

export function useUpdatePortfolio(workspaceId: string, portfolioId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name?: string; description?: string }) => updatePortfolio(workspaceId, portfolioId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId, 'portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId, 'portfolios', portfolioId] });
    },
  });
}

export function useDeletePortfolio(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (portfolioId: string) => deletePortfolio(workspaceId, portfolioId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId, 'portfolios'] });
    },
  });
}

export function useAddProjectToPortfolio(workspaceId: string, portfolioId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => addProjectToPortfolio(workspaceId, portfolioId, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId, 'portfolios', portfolioId] });
    },
  });
}

export function useRemoveProjectFromPortfolio(workspaceId: string, portfolioId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => removeProjectFromPortfolio(workspaceId, portfolioId, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId, 'portfolios', portfolioId] });
    },
  });
}
