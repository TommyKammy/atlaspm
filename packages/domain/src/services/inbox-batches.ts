export type InboxBatchActor = {
  id: string;
  displayName?: string | null;
  email?: string | null;
};

export type InboxBatchableNotification = {
  id: string;
  type: string;
  sourceType: string;
  sourceId: string;
  createdAt: string;
  readAt?: string | null;
  project: {
    id: string;
    name: string;
  };
  taskId?: string | null;
  statusUpdateId?: string | null;
  triggeredBy?: InboxBatchActor | null;
};

export type InboxNotificationBatch<T extends InboxBatchableNotification = InboxBatchableNotification> = {
  batchKey: string;
  targetKey: string;
  unread: boolean;
  notificationCount: number;
  actorCount: number;
  actors: Array<{
    id: string;
    label: string;
  }>;
  types: string[];
  latestCreatedAt: string;
  latestNotification: T;
  notifications: T[];
};

function actorLabel(actor: InboxBatchActor | null | undefined) {
  return actor?.displayName ?? actor?.email ?? actor?.id ?? 'Someone';
}

function targetKey(notification: InboxBatchableNotification) {
  if (notification.statusUpdateId) return `status-update:${notification.statusUpdateId}`;
  if (notification.taskId) return `task:${notification.taskId}`;
  return `${notification.sourceType}:${notification.sourceId}`;
}

export function buildInboxNotificationBatches<T extends InboxBatchableNotification>(
  notifications: T[],
): InboxNotificationBatch<T>[] {
  const groups = new Map<string, InboxNotificationBatch<T>>();

  for (const notification of notifications) {
    const unread = !notification.readAt;
    const notificationTargetKey = targetKey(notification);
    const batchKey = `${unread ? 'unread' : 'read'}:${notification.project.id}:${notificationTargetKey}`;
    const existing = groups.get(batchKey);

    if (!existing) {
      groups.set(batchKey, {
        batchKey,
        targetKey: notificationTargetKey,
        unread,
        notificationCount: 1,
        actorCount: notification.triggeredBy ? 1 : 0,
        actors: notification.triggeredBy
          ? [{ id: notification.triggeredBy.id, label: actorLabel(notification.triggeredBy) }]
          : [],
        types: [notification.type],
        latestCreatedAt: notification.createdAt,
        latestNotification: notification,
        notifications: [notification],
      });
      continue;
    }

    existing.notificationCount += 1;
    existing.notifications.push(notification);

    if (!existing.types.includes(notification.type)) {
      existing.types.push(notification.type);
    }

    if (
      notification.triggeredBy &&
      !existing.actors.some((actor) => actor.id === notification.triggeredBy?.id)
    ) {
      existing.actors.push({
        id: notification.triggeredBy.id,
        label: actorLabel(notification.triggeredBy),
      });
      existing.actorCount = existing.actors.length;
    }
  }

  return [...groups.values()];
}
