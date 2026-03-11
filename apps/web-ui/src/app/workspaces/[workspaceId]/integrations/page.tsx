'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, GitBranch, RefreshCcw } from 'lucide-react';
import { useProjects } from '@/lib/api';
import {
  useConnectGithubIntegration,
  useTriggerIntegrationSync,
  useWorkspaceIntegrations,
} from '@/lib/api/integrations';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n';

function formatTimestamp(value?: string | null) {
  if (!value) {
    return 'Never';
  }
  return new Date(value).toLocaleString();
}

export default function WorkspaceIntegrationsPage() {
  const { t } = useI18n();
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = params.workspaceId;
  const integrationsQuery = useWorkspaceIntegrations(workspaceId);
  const projectsQuery = useProjects(workspaceId);
  const connectGithub = useConnectGithubIntegration(workspaceId);
  const triggerSync = useTriggerIntegrationSync(workspaceId);
  const [draft, setDraft] = useState({
    key: 'github-atlaspm',
    displayName: 'AtlasPM GitHub',
    owner: '',
    repo: '',
    projectId: '',
    accessToken: '',
  });
  const [lastSyncMessage, setLastSyncMessage] = useState<string | null>(null);

  const projectOptions = useMemo(
    () => (projectsQuery.data ?? []).filter((project) => project.workspaceId === workspaceId),
    [projectsQuery.data, workspaceId],
  );

  const handleConnect = async () => {
    await connectGithub.mutateAsync({
      key: draft.key.trim(),
      displayName: draft.displayName.trim(),
      owner: draft.owner.trim(),
      repo: draft.repo.trim(),
      projectId: draft.projectId,
      credentials: {
        accessToken: draft.accessToken.trim(),
      },
    });
    setDraft((current) => ({ ...current, accessToken: '' }));
  };

  const handleSync = async (providerConfigId: string) => {
    const result = await triggerSync.mutateAsync({ providerConfigId, scope: 'issues' });
    setLastSyncMessage(
      result.message ??
        `Imported ${result.importedCount ?? 0} issues and updated ${result.updatedCount ?? 0}.`,
    );
  };

  return (
    <div className="container mx-auto space-y-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t('integrations')}</h1>
          <p className="mt-1 text-muted-foreground">
            Connect GitHub issues to an AtlasPM project through the shared integration runtime.
          </p>
        </div>
        {lastSyncMessage ? (
          <Badge variant="secondary" className="px-3 py-1 text-xs">
            {lastSyncMessage}
          </Badge>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            GitHub Issues
          </CardTitle>
          <CardDescription>
            Validate one repository token, bind it to a project, then import issues on demand.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="integration-key">Connection key</Label>
            <Input
              id="integration-key"
              value={draft.key}
              onChange={(event) => setDraft((current) => ({ ...current, key: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="integration-display-name">Display name</Label>
            <Input
              id="integration-display-name"
              value={draft.displayName}
              onChange={(event) =>
                setDraft((current) => ({ ...current, displayName: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="integration-owner">GitHub owner</Label>
            <Input
              id="integration-owner"
              placeholder="atlaspm"
              value={draft.owner}
              onChange={(event) => setDraft((current) => ({ ...current, owner: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="integration-repo">Repository</Label>
            <Input
              id="integration-repo"
              placeholder="repo"
              value={draft.repo}
              onChange={(event) => setDraft((current) => ({ ...current, repo: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="integration-project">AtlasPM project</Label>
            <select
              id="integration-project"
              className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none"
              value={draft.projectId}
              onChange={(event) => setDraft((current) => ({ ...current, projectId: event.target.value }))}
            >
              <option value="">Select a project</option>
              {projectOptions.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="integration-access-token">Personal access token</Label>
            <Input
              id="integration-access-token"
              type="password"
              value={draft.accessToken}
              onChange={(event) =>
                setDraft((current) => ({ ...current, accessToken: event.target.value }))
              }
            />
          </div>
          <div className="md:col-span-2">
            <Button
              onClick={handleConnect}
              disabled={
                connectGithub.isPending ||
                !draft.key.trim() ||
                !draft.displayName.trim() ||
                !draft.owner.trim() ||
                !draft.repo.trim() ||
                !draft.projectId ||
                !draft.accessToken.trim()
              }
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {connectGithub.isPending ? 'Connecting...' : 'Connect GitHub'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {(integrationsQuery.data ?? []).map((integration) => {
          const latestSync = integration.syncStates[0];
          const settings = integration.settings ?? {};
          const accessTokenPreview = integration.credentials.find(
            (credential) => credential.kind === 'ACCESS_TOKEN',
          )?.redactedValue;

          return (
            <Card key={integration.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>{integration.displayName}</CardTitle>
                  <CardDescription>
                    {String(settings.owner ?? 'unknown')}/{String(settings.repo ?? 'unknown')}
                    {' -> '}
                    {projectOptions.find((project) => project.id === settings.projectId)?.name ?? 'Unknown project'}
                  </CardDescription>
                </div>
                <Badge variant={integration.status === 'ACTIVE' ? 'default' : 'secondary'}>
                  {integration.status}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 text-sm">
                <div className="space-y-1 text-muted-foreground">
                  <p>Token: {accessTokenPreview ?? 'Not stored'}</p>
                  <p>Last sync: {formatTimestamp(latestSync?.lastSyncedAt)}</p>
                  <p>Sync status: {latestSync?.status ?? 'Never run'}</p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => void handleSync(integration.id)}
                  disabled={triggerSync.isPending}
                >
                  <RefreshCcw className="mr-2 h-4 w-4" />
                  {triggerSync.isPending ? 'Syncing...' : 'Import issues'}
                </Button>
              </CardContent>
            </Card>
          );
        })}

        {!integrationsQuery.isLoading && (integrationsQuery.data?.length ?? 0) === 0 ? (
          <Card className="py-10">
            <CardContent className="text-center text-sm text-muted-foreground">
              No integrations connected yet.
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
