'use client';

import { Bell } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { notificationSummary } from '@/lib/notification-copy';
import { queryKeys } from '@/lib/query-keys';
import type { InboxNotification } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';

type UnreadCountResponse = { count: number };

function renderTargetLabel(value: string) {
  return value.replace(/@\[(?<id>[a-zA-Z0-9:_-]+)\|(?<label>[^\]]+)\]/g, (_whole, _id: string, label: string) => {
    return `@${label}`;
  });
}

export function NotificationCenter() {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const notificationsQuery = useQuery<InboxNotification[]>({
    queryKey: queryKeys.notifications('unread'),
    queryFn: () => api('/notifications?status=unread&take=8'),
    refetchInterval: 30_000,
  });

  const unreadCountQuery = useQuery<UnreadCountResponse>({
    queryKey: queryKeys.notificationsUnreadCount,
    queryFn: () => api('/notifications/unread-count'),
    refetchInterval: 30_000,
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

  const unreadCount = unreadCountQuery.data?.count ?? 0;
  const notifications = notificationsQuery.data ?? [];

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          void notificationsQuery.refetch();
          void unreadCountQuery.refetch();
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 rounded-full hover:bg-muted/50"
          data-testid="notification-center-trigger"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
          <span className="sr-only">{t('notifications')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">{t('notifications')}</p>
          <div className="flex items-center gap-2">
            {unreadCount > 0 ? <Badge variant="secondary">{unreadCount} {t('unread')}</Badge> : null}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => markAllRead.mutate()}
              disabled={!unreadCount || markAllRead.isPending}
              data-testid="notification-mark-all-read"
            >
              {t('markAllRead')}
            </Button>
          </div>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {!notifications.length ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground" data-testid="notification-empty">
              {t('noNotificationsYet')}
            </div>
          ) : (
            notifications.map((item) => {
              const unread = !item.readAt;
              const targetHref = item.statusUpdate
                ? `/projects/${item.project.id}?statusUpdate=${item.statusUpdate.id}`
                : `/projects/${item.project.id}?task=${item.task?.id ?? ''}`;
              const targetLabel = renderTargetLabel(
                item.statusUpdate?.summary?.trim() || item.task?.title?.trim() || t('untitledTask'),
              );
              return (
                <DropdownMenuItem
                  key={item.id}
                  className="cursor-pointer items-start gap-2 p-3"
                  data-testid={`notification-item-${item.id}`}
                  onClick={() => {
                    setOpen(false);
                    if (unread) markRead.mutate({ id: item.id, read: true });
                    router.push(targetHref);
                  }}
                >
                  <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" style={{ opacity: unread ? 1 : 0 }} />
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-xs font-medium">
                      {notificationSummary(item, t)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.project.name} · {targetLabel}
                    </p>
                  </div>
                </DropdownMenuItem>
              );
            })
          )}
        </div>

        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center"
            data-testid="notification-view-inbox"
            onClick={() => {
              setOpen(false);
              router.push('/inbox');
            }}
          >
            {t('viewInbox')}
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
