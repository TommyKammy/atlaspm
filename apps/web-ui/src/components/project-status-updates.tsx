'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { queryKeys } from '@/lib/query-keys';
import { parseStatusUpdateMentionText, serializeStatusUpdateMentions } from '@/lib/status-update-mentions';
import type { ProjectMember, ProjectStatusHealth, ProjectStatusUpdate, ProjectStatusUpdateList } from '@/lib/types';
import { cn } from '@/lib/utils';

const HEALTH_OPTIONS: ProjectStatusHealth[] = ['ON_TRACK', 'AT_RISK', 'OFF_TRACK'];

function healthLabel(health: ProjectStatusHealth, t: (key: string) => string) {
  switch (health) {
    case 'ON_TRACK':
      return t('statusUpdateHealthOnTrack');
    case 'AT_RISK':
      return t('statusUpdateHealthAtRisk');
    case 'OFF_TRACK':
      return t('statusUpdateHealthOffTrack');
    default:
      return health;
  }
}

function healthBadgeClasses(health: ProjectStatusHealth) {
  switch (health) {
    case 'ON_TRACK':
      return 'border-border bg-secondary text-secondary-foreground';
    case 'AT_RISK':
      return 'border-border bg-muted text-foreground';
    case 'OFF_TRACK':
      return 'border-destructive bg-destructive text-destructive-foreground';
    default:
      return '';
  }
}

function splitListInput(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message.replace(/^API \d+:\s*/, '') || fallback;
  }
  return fallback;
}

function authorLabel(statusUpdate: ProjectStatusUpdate) {
  return statusUpdate.author?.displayName ?? statusUpdate.author?.email ?? statusUpdate.authorUserId;
}

function MentionText({ value }: { value: string }) {
  return parseStatusUpdateMentionText(value).map((chunk, index) =>
    chunk.type === 'mention' ? (
      <span
        key={`${chunk.id ?? 'mention'}-${index}`}
        className="rounded bg-muted px-1 py-0.5 text-foreground"
      >
        {chunk.value}
      </span>
    ) : (
      <span key={`text-${index}`}>{chunk.value}</span>
    ),
  );
}

export function ProjectStatusUpdates({
  projectId,
  workspaceId,
  canEdit,
  members,
  highlightedStatusUpdateId,
}: {
  projectId: string;
  workspaceId: string | undefined;
  canEdit: boolean;
  members: ProjectMember[];
  highlightedStatusUpdateId?: string | null;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const highlightedStatusUpdateRef = useRef<HTMLElement | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [health, setHealth] = useState<ProjectStatusHealth>('ON_TRACK');
  const [summary, setSummary] = useState('');
  const [blockers, setBlockers] = useState('');
  const [nextSteps, setNextSteps] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const statusUpdatesQuery = useQuery<ProjectStatusUpdateList>({
    queryKey: queryKeys.projectStatusUpdates(projectId),
    queryFn: () => api(`/projects/${projectId}/status-updates`) as Promise<ProjectStatusUpdateList>,
    enabled: Boolean(projectId),
  });

  const hasUpdates = (statusUpdatesQuery.data?.items.length ?? 0) > 0;
  const shouldShowComposer = canEdit && composerOpen;

  useEffect(() => {
    if (!highlightedStatusUpdateId || !highlightedStatusUpdateRef.current) return;
    highlightedStatusUpdateRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightedStatusUpdateId, statusUpdatesQuery.data?.items]);

  const createStatusUpdate = useMutation({
    mutationFn: () =>
      api(`/projects/${projectId}/status-updates`, {
        method: 'POST',
        body: {
          health,
          summary: serializeStatusUpdateMentions(summary.trim(), members),
          blockers: splitListInput(serializeStatusUpdateMentions(blockers, members)),
          nextSteps: splitListInput(serializeStatusUpdateMentions(nextSteps, members)),
        },
      }) as Promise<ProjectStatusUpdate>,
    onSuccess: (created) => {
      queryClient.setQueryData<ProjectStatusUpdateList>(queryKeys.projectStatusUpdates(projectId), (current) => ({
        items: [created, ...(current?.items ?? []).filter((item) => item.id !== created.id)],
        nextCursor: current?.nextCursor ?? null,
        hasNextPage: current?.hasNextPage ?? false,
      }));
      queryClient.invalidateQueries({ queryKey: ['goal'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.projectGoals(projectId) });
      if (workspaceId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.workspaceGoals(workspaceId) });
        queryClient.invalidateQueries({
          queryKey: queryKeys.workspaceGoals(workspaceId, { includeArchived: true }),
        });
      }
      setHealth('ON_TRACK');
      setSummary('');
      setBlockers('');
      setNextSteps('');
      setSubmitError(null);
      setComposerOpen(false);
    },
    onError: (error) => {
      setSubmitError(errorMessage(error, t('statusUpdateCreateFailed')));
    },
  });

  const statusUpdateCards = useMemo(
    () =>
      (statusUpdatesQuery.data?.items ?? []).map((statusUpdate) => (
        <article
          key={statusUpdate.id}
          ref={(node) => {
            if (highlightedStatusUpdateId === statusUpdate.id) {
              highlightedStatusUpdateRef.current = node;
            }
          }}
          className={cn(
            'rounded-lg border bg-background/80 p-3 transition-colors',
            highlightedStatusUpdateId === statusUpdate.id && 'border-primary bg-primary/5',
          )}
          data-testid={`status-update-item-${statusUpdate.id}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-1">
              <Badge className={cn('border px-2.5 py-1 text-[11px]', healthBadgeClasses(statusUpdate.health))}>
                {healthLabel(statusUpdate.health, t)}
              </Badge>
              <p className="text-sm font-medium leading-6">
                <MentionText value={statusUpdate.summary} />
              </p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>{authorLabel(statusUpdate)}</p>
              <time dateTime={statusUpdate.createdAt}>{new Date(statusUpdate.createdAt).toLocaleString()}</time>
            </div>
          </div>
          {statusUpdate.blockers.length ? (
            <div className="mt-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t('statusUpdateBlockers')}
              </p>
              <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                {statusUpdate.blockers.map((item, index) => (
                  <li key={`${statusUpdate.id}-blocker-${index}`}>
                    • <MentionText value={item} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {statusUpdate.nextSteps.length ? (
            <div className="mt-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {t('statusUpdateNextSteps')}
              </p>
              <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                {statusUpdate.nextSteps.map((item, index) => (
                  <li key={`${statusUpdate.id}-next-${index}`}>
                    • <MentionText value={item} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </article>
      )),
    [highlightedStatusUpdateId, statusUpdatesQuery.data?.items, t],
  );

  return (
    <section
      className="rounded-xl border bg-card/70 p-4 shadow-sm"
      data-testid="project-status-updates"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {t('statusUpdatesEyebrow')}
          </p>
          <h2 className="text-lg font-semibold leading-none">{t('statusUpdates')}</h2>
          <p className="text-sm text-muted-foreground">{t('statusUpdatesDescription')}</p>
        </div>
        {canEdit ? (
          <Button
            type="button"
            size="sm"
            variant={shouldShowComposer ? 'ghost' : 'outline'}
            onClick={() => {
              setComposerOpen((current) => !current);
              setSubmitError(null);
            }}
            data-testid="status-update-compose-trigger"
          >
            {shouldShowComposer ? t('cancel') : t('newUpdate')}
          </Button>
        ) : null}
      </div>

      <div className={cn('mt-4 grid gap-4', shouldShowComposer ? 'xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]' : '')}>
        <div className="space-y-3">
          {statusUpdatesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">{t('loading')}</p>
          ) : null}
          {statusUpdatesQuery.isError ? (
            <p className="text-sm text-destructive">
              {errorMessage(statusUpdatesQuery.error, t('statusUpdateLoadFailed'))}
            </p>
          ) : null}
          {statusUpdatesQuery.isSuccess && !hasUpdates ? (
            <div className="rounded-lg border border-dashed bg-background/70 px-4 py-6 text-sm text-muted-foreground">
              {t('statusUpdateEmpty')}
            </div>
          ) : null}
          {hasUpdates ? (
            <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
              {statusUpdateCards}
            </div>
          ) : null}
        </div>

        {shouldShowComposer ? (
          <Card className="border-dashed shadow-none">
            <CardHeader className="space-y-1 px-4 pb-4 pt-4">
              <CardTitle className="text-base">{t('newUpdate')}</CardTitle>
              <p className="text-sm text-muted-foreground">{t('statusUpdateComposerDescription')}</p>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4">
              <div className="space-y-1.5">
                <label htmlFor="status-update-health" className="text-xs font-medium text-muted-foreground">
                  {t('statusUpdateHealth')}
                </label>
                <select
                  id="status-update-health"
                  className="flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  value={health}
                  onChange={(event) => setHealth(event.target.value as ProjectStatusHealth)}
                  data-testid="status-update-health-select"
                >
                  {HEALTH_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {healthLabel(option, t)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="status-update-summary" className="text-xs font-medium text-muted-foreground">
                  {t('statusUpdateSummary')}
                </label>
                <Textarea
                  id="status-update-summary"
                  className="min-h-[104px]"
                  value={summary}
                  onChange={(event) => setSummary(event.target.value)}
                  placeholder={t('statusUpdateSummaryPlaceholder')}
                  data-testid="status-update-summary-input"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="status-update-blockers" className="text-xs font-medium text-muted-foreground">
                  {t('statusUpdateBlockers')}
                </label>
                <Textarea
                  id="status-update-blockers"
                  className="min-h-[88px]"
                  value={blockers}
                  onChange={(event) => setBlockers(event.target.value)}
                  placeholder={t('statusUpdateBlockersPlaceholder')}
                  data-testid="status-update-blockers-input"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="status-update-next-steps" className="text-xs font-medium text-muted-foreground">
                  {t('statusUpdateNextSteps')}
                </label>
                <Textarea
                  id="status-update-next-steps"
                  className="min-h-[88px]"
                  value={nextSteps}
                  onChange={(event) => setNextSteps(event.target.value)}
                  placeholder={t('statusUpdateNextStepsPlaceholder')}
                  data-testid="status-update-next-steps-input"
                />
              </div>

              {submitError ? <p className="text-sm text-destructive">{submitError}</p> : null}

              <Button
                type="button"
                className="w-full"
                onClick={() => createStatusUpdate.mutate()}
                disabled={createStatusUpdate.isPending || !summary.trim()}
                data-testid="status-update-submit"
              >
                {createStatusUpdate.isPending ? t('creating') : t('create')}
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </section>
  );
}
