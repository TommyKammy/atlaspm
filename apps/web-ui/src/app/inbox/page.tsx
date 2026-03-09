'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { notificationSummary } from '@/lib/notification-copy';
import { queryKeys } from '@/lib/query-keys';
import { replaceSerializedStatusUpdateMentions } from '@/lib/status-update-mentions';
import type { InboxNotification, NotificationDeliveryFailure } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type UnreadCountResponse = { count: number };
type NotificationBatch = {
  key: string;
  items: InboxNotification[];
  latest: InboxNotification;
  unreadCount: number;
  targetHref: string;
  targetLabel: string;
  actionLabel: string;
};
type NotificationSection = {
  key: string;
  label: string;
  batches: NotificationBatch[];
};

function invalidateNotificationQueries(queryClient: ReturnType<typeof useQueryClient>) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications('all') }),
    queryClient.invalidateQueries({ queryKey: queryKeys.notifications('unread') }),
    queryClient.invalidateQueries({ queryKey: queryKeys.notificationsUnreadCount }),
  ]);
}

function targetLabel(notification: InboxNotification, untitledTaskLabel: string) {
  return replaceSerializedStatusUpdateMentions(
    notification.statusUpdate?.summary?.trim() || notification.task?.title?.trim() || untitledTaskLabel,
  );
}

function targetHref(notification: InboxNotification) {
  return notification.statusUpdate
    ? `/projects/${notification.project.id}?statusUpdate=${notification.statusUpdate.id}`
    : `/projects/${notification.project.id}?task=${notification.task?.id ?? ''}`;
}

function batchLabel(count: number, template: string) {
  return template.replace('{count}', String(count));
}

function localDayKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sectionLabel(date: Date, t: (key: string) => string) {
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);
  if (diffDays === 0) return t('today');
  if (diffDays === 1) return t('yesterday');
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function isLaterNotification(candidate: InboxNotification, current: InboxNotification) {
  return new Date(candidate.createdAt).getTime() > new Date(current.createdAt).getTime();
}

async function processInBatches<T>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<void>,
) {
  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    await Promise.all(batch.map((item) => fn(item)));
  }
}

function groupNotifications(notifications: InboxNotification[], t: (key: string) => string): NotificationSection[] {
  const sections = new Map<string, NotificationSection>();

  for (const notification of notifications) {
    const createdAt = new Date(notification.createdAt);
    const dayKey = localDayKey(createdAt);
    const batchKey = notification.statusUpdate
      ? `status-update:${notification.statusUpdate.id}`
      : notification.task?.id
        ? `task:${notification.task.id}`
        : `notification:${notification.id}`;
    let section = sections.get(dayKey);
    if (!section) {
      section = {
        key: dayKey,
        label: sectionLabel(createdAt, t),
        batches: [],
      };
      sections.set(dayKey, section);
    }

    let batch = section.batches.find((item) => item.key === batchKey);
    if (!batch) {
      batch = {
        key: batchKey,
        items: [],
        latest: notification,
        unreadCount: 0,
        targetHref: targetHref(notification),
        targetLabel: targetLabel(notification, t('untitledTask')),
        actionLabel: notification.statusUpdate ? t('openUpdate') : t('openTask'),
      };
      section.batches.push(batch);
    }

    batch.items.push(notification);
    if (!notification.readAt) {
      batch.unreadCount += 1;
    }
    if (isLaterNotification(notification, batch.latest)) {
      batch.latest = notification;
      batch.targetHref = targetHref(notification);
      batch.targetLabel = targetLabel(notification, t('untitledTask'));
      batch.actionLabel = notification.statusUpdate ? t('openUpdate') : t('openTask');
    }
  }

  return [...sections.values()];
}

export default function InboxPage() {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const notificationsQuery = useQuery<InboxNotification[]>({
    queryKey: queryKeys.notifications(filter),
    queryFn: () => api(`/notifications?status=${filter}&take=100`),
  });

  const unreadCountQuery = useQuery<UnreadCountResponse>({
    queryKey: queryKeys.notificationsUnreadCount,
    queryFn: () => api('/notifications/unread-count'),
  });

  const deliveryFailuresQuery = useQuery<NotificationDeliveryFailure[]>({
    queryKey: queryKeys.notificationDeliveryFailures,
    queryFn: () => api('/notifications/delivery-failures?take=25'),
  });

  const setBatchRead = useMutation({
    mutationFn: async (input: { ids: string[]; read: boolean }) => {
      await processInBatches(input.ids, 10, (id) =>
        api(`/notifications/${id}/read`, { method: 'POST', body: { read: input.read } }),
      );
    },
    onSuccess: async () => {
      await invalidateNotificationQueries(queryClient);
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: async () => {
      await invalidateNotificationQueries(queryClient);
    },
  });

  const retryDelivery = useMutation({
    mutationFn: (input: { eventId: string; projectId: string }) =>
      api(`/webhooks/dlq/${input.eventId}/retry`, {
        method: 'POST',
        body: { projectId: input.projectId },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.notificationDeliveryFailures });
    },
  });

  const notifications = notificationsQuery.data ?? [];
  const sections = groupNotifications(notifications, t);
  const unreadCount = unreadCountQuery.data?.count ?? 0;
  const deliveryFailures = deliveryFailuresQuery.data ?? [];

  const openBatch = async (batch: NotificationBatch) => {
    const unreadIds = batch.items.filter((item) => !item.readAt).map((item) => item.id);
    if (unreadIds.length) {
      await setBatchRead.mutateAsync({ ids: unreadIds, read: true });
    }
    router.push(batch.targetHref);
  };

  return (
    <div className="space-y-4" data-testid="inbox-page">
      {deliveryFailures.length ? (
        <Card data-testid="inbox-delivery-issues">
          <CardHeader>
            <CardTitle className="text-base">{t('deliveryIssues')}</CardTitle>
            <CardDescription>{t('deliveryIssuesDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {deliveryFailures.map((failure) => (
              <div
                key={failure.eventId}
                className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3"
                data-testid={`inbox-delivery-issue-${failure.eventId}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{failure.project.name}</p>
                      <Badge variant="secondary">
                        {failure.status === 'dead_lettered' ? t('deadLettered') : t('retryScheduled')}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{failure.type}</p>
                  </div>
                  {failure.retryable ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => retryDelivery.mutate({ eventId: failure.eventId, projectId: failure.project.id })}
                      disabled={retryDelivery.isPending}
                      data-testid={`inbox-retry-delivery-${failure.eventId}`}
                    >
                      {t('retryDelivery')}
                    </Button>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-2">
                  <p>
                    {t('deliveryAttemptsLabel')}: {failure.deliveryAttempts}
                  </p>
                  <p>
                    {failure.status === 'dead_lettered' ? t('failedAtLabel') : t('nextRetryLabel')}:{' '}
                    {formatTimestamp(failure.deadLetteredAt ?? failure.nextRetryAt) ?? 'n/a'}
                  </p>
                </div>
                {failure.lastError ? (
                  <p className="mt-2 rounded-md bg-background/70 px-2 py-1 text-xs text-muted-foreground">
                    {t('deliveryErrorLabel')}: {failure.lastError}
                  </p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">{t('inbox')}</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant={filter === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('all')}
              data-testid="inbox-filter-all"
            >
              {t('all')}
            </Button>
            <Button
              variant={filter === 'unread' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('unread')}
              data-testid="inbox-filter-unread"
            >
              {t('unread')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllRead.mutate()}
              disabled={!unreadCount || markAllRead.isPending}
              data-testid="inbox-mark-all-read"
            >
              {t('markAllRead')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {!sections.length ? (
            <p className="text-sm text-muted-foreground" data-testid="inbox-empty">{t('noNotificationsYet')}</p>
          ) : (
            sections.map((section) => (
              <section key={section.key} className="space-y-2" data-testid={`inbox-section-${section.key}`}>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {section.label}
                  </p>
                </div>
                <div className="space-y-2">
                  {section.batches.map((batch) => (
                    <div
                      key={batch.key}
                      className="rounded-lg border px-4 py-3"
                      data-testid={`inbox-notification-${batch.latest.id}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {batch.unreadCount ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
                            <p className="truncate text-sm font-medium">
                              {notificationSummary(batch.latest, t)}
                            </p>
                            {batch.unreadCount ? <Badge variant="secondary">{batch.unreadCount} {t('unread')}</Badge> : null}
                            {batch.items.length > 1 ? (
                              <Badge>{batchLabel(batch.items.length, t('eventsCount'))}</Badge>
                            ) : null}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {batch.latest.project.name} · {batch.targetLabel}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setBatchRead.mutate({
                                ids: batch.items.map((item) => item.id),
                                read: batch.unreadCount > 0,
                              })
                            }
                            data-testid={`inbox-toggle-read-${batch.latest.id}`}
                          >
                            {batch.unreadCount ? t('markAllRead') : t('markUnread')}
                          </Button>
                          <Button
                            size="sm"
                            data-testid={`inbox-open-task-${batch.latest.id}`}
                            onClick={() => {
                              void openBatch(batch);
                            }}
                          >
                            {batch.actionLabel}
                          </Button>
                        </div>
                      </div>
                      <div className="mt-3 space-y-2 border-t pt-3">
                        {batch.items.slice(0, 3).map((item) => (
                          <div key={item.id} className="flex items-start justify-between gap-3 text-xs">
                            <div className="min-w-0">
                              <p className="truncate">{notificationSummary(item, t)}</p>
                            </div>
                            <p className="shrink-0 text-muted-foreground">{formatTimestamp(item.createdAt)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
