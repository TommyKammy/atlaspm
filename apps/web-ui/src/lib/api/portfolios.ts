'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_CORE_API_URL || 'http://localhost:3001';

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

export interface PortfolioDetail extends Portfolio {
  progress: PortfolioProgress[];
}

async function fetchPortfolios(workspaceId: string): Promise<Portfolio[]> {
  const res = await fetch(`${API_URL}/workspaces/${workspaceId}/portfolios`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch portfolios');
  return res.json();
}

async function fetchPortfolio(workspaceId: string, portfolioId: string): Promise<PortfolioDetail> {
  const res = await fetch(`${API_URL}/workspaces/${workspaceId}/portfolios/${portfolioId}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch portfolio');
  return res.json();
}

async function createPortfolio(workspaceId: string, data: { name: string; description?: string; projectIds?: string[] }): Promise<Portfolio> {
  const res = await fetch(`${API_URL}/workspaces/${workspaceId}/portfolios`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create portfolio');
  return res.json();
}

async function updatePortfolio(workspaceId: string, portfolioId: string, data: { name?: string; description?: string }): Promise<Portfolio> {
  const res = await fetch(`${API_URL}/workspaces/${workspaceId}/portfolios/${portfolioId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update portfolio');
  return res.json();
}

async function deletePortfolio(workspaceId: string, portfolioId: string): Promise<void> {
  const res = await fetch(`${API_URL}/workspaces/${workspaceId}/portfolios/${portfolioId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to delete portfolio');
}

async function addProjectToPortfolio(workspaceId: string, portfolioId: string, projectId: string): Promise<void> {
  const res = await fetch(`${API_URL}/workspaces/${workspaceId}/portfolios/${portfolioId}/projects/${projectId}`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to add project to portfolio');
}

async function removeProjectFromPortfolio(workspaceId: string, portfolioId: string, projectId: string): Promise<void> {
  const res = await fetch(`${API_URL}/workspaces/${workspaceId}/portfolios/${portfolioId}/projects/${projectId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to remove project from portfolio');
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
