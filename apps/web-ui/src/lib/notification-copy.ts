import type { InboxNotification, NotificationDeliveryIssue } from './types';

export function actorLabel(notification: InboxNotification) {
  return (
    notification.triggeredBy?.displayName ??
    notification.triggeredBy?.email ??
    notification.triggeredBy?.id ??
    'Someone'
  );
}

export function notificationSummary(notification: InboxNotification, t: (key: string) => string) {
  const actor = actorLabel(notification);

  switch (notification.type) {
    case 'assignment':
      return `${actor} ${t('notificationAssignedTask')}`;
    case 'due_date':
      return `${actor} ${t('notificationUpdatedDueDate')}`;
    case 'status':
      return `${actor} ${t('notificationChangedStatus')}`;
    case 'comment':
      return `${actor} ${t('notificationCommentedOnTask')}`;
    case 'approval_requested':
      return `${actor} ${t('notificationRequestedApproval')}`;
    case 'approval_approved':
      return `${actor} ${t('notificationApprovedTask')}`;
    case 'approval_rejected':
      return `${actor} ${t('notificationRejectedTask')}`;
    case 'unknown':
      return `${actor} ${t('notificationPerformedAction')}`;
    case 'mention':
      if (notification.sourceType === 'project_status_update') {
        return `${actor} ${t('mentionedYouInProjectUpdate')}`;
      }
      return `${actor} ${t('mentionedYou')}`;
    default:
      return `${actor} ${t('mentionedYou')}`;
  }
}

export function formatNotificationTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatBatchActorSummary(
  actors: Array<{
    id: string;
    label: string;
  }>,
) {
  if (!actors.length) return 'Someone';
  if (actors.length === 1) return actors[0]?.label ?? 'Someone';
  return `${actors[0]?.label ?? 'Someone'} +${actors.length - 1}`;
}

export function deliveryIssueEventLabel(issue: NotificationDeliveryIssue) {
  switch (issue.eventType) {
    case 'notification.created':
      return 'notification created';
    case 'notification.reopened':
      return 'notification reopened';
    case 'notification.read':
      return 'notification read';
    case 'notification.read_all':
      return 'notifications marked read';
    case 'task.reminder.sent':
      return 'reminder delivery';
    default:
      return issue.eventType.replace(/\./g, ' ');
  }
}
