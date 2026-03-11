'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { IntegrationConfig, IntegrationSyncJobResult } from '@/lib/types';

export type ConnectGithubIntegrationInput = {
  key: string;
  displayName: string;
  owner: string;
  repo: string;
  projectId: string;
  credentials: {
    accessToken: string;
  };
};

export async function listWorkspaceIntegrations(workspaceId: string): Promise<IntegrationConfig[]> {
  return (await api(`/workspaces/${workspaceId}/integrations`)) as IntegrationConfig[];
}

export async function connectGithubIntegration(
  workspaceId: string,
  input: ConnectGithubIntegrationInput,
): Promise<IntegrationConfig> {
  return (await api(`/workspaces/${workspaceId}/integrations/github`, {
    method: 'POST',
    body: input,
  })) as IntegrationConfig;
}

export async function triggerIntegrationSync(
  workspaceId: string,
  providerConfigId: string,
  scope = 'issues',
): Promise<IntegrationSyncJobResult> {
  return (await api(`/workspaces/${workspaceId}/integrations/${providerConfigId}/sync`, {
    method: 'POST',
    body: { scope },
  })) as IntegrationSyncJobResult;
}

export function useWorkspaceIntegrations(workspaceId: string) {
  return useQuery({
    queryKey: queryKeys.workspaceIntegrations(workspaceId),
    queryFn: () => listWorkspaceIntegrations(workspaceId),
    enabled: !!workspaceId,
  });
}

export function useConnectGithubIntegration(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConnectGithubIntegrationInput) => connectGithubIntegration(workspaceId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceIntegrations(workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects });
    },
  });
}

export function useTriggerIntegrationSync(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { providerConfigId: string; scope?: string }) =>
      triggerIntegrationSync(workspaceId, input.providerConfigId, input.scope),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceIntegrations(workspaceId) });
    },
  });
}
