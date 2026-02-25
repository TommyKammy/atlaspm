'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { InboxNotification } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type UnreadCountResponse = { count: number };

function actorLabel(notification: InboxNotification) {
  return (
    notification.triggeredBy?.displayName ??
    notification.triggeredBy?.email ??
    notification.triggeredBy?.id ??
    'Someone'
  );
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

  const markRead = useMutation({
    mutationFn: (input: { id: string; read: boolean }) =>
      api(`/notifications/${input.id}/read`, { method: 'POST', body: { read: input.read } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.notifications('all') });
      await queryClient.invalidateQueries({ queryKey: queryKeys.notifications('unread') });
      await queryClient.invalidateQueries({ queryKey: queryKeys.notificationsUnreadCount });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.notifications('all') });
      await queryClient.invalidateQueries({ queryKey: queryKeys.notifications('unread') });
      await queryClient.invalidateQueries({ queryKey: queryKeys.notificationsUnreadCount });
    },
  });

  const notifications = notificationsQuery.data ?? [];
  const unreadCount = unreadCountQuery.data?.count ?? 0;

  return (
    <div className="space-y-4" data-testid="inbox-page">
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
        <CardContent className="space-y-2">
          {!notifications.length ? (
            <p className="text-sm text-muted-foreground" data-testid="inbox-empty">{t('noNotificationsYet')}</p>
          ) : (
            notifications.map((item) => {
              const unread = !item.readAt;
              return (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2"
                  data-testid={`inbox-notification-${item.id}`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      {unread ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
                      <p className="truncate text-sm font-medium">
                        {actorLabel(item)} {t('mentionedYou')}
                      </p>
                      {unread ? <Badge variant="secondary">{t('unread')}</Badge> : null}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.project.name} · {item.task.title.trim() || t('untitledTask')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => markRead.mutate({ id: item.id, read: !unread })}
                      data-testid={`inbox-toggle-read-${item.id}`}
                    >
                      {unread ? t('markRead') : t('markUnread')}
                    </Button>
                    <Button
                      size="sm"
                      data-testid={`inbox-open-task-${item.id}`}
                      onClick={() => {
                        if (unread) {
                          markRead.mutate({ id: item.id, read: true });
                        }
                        router.push(`/projects/${item.project.id}?task=${item.task.id}`);
                      }}
                    >
                      {t('openTask')}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
