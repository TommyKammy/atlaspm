import type { InboxNotification } from './types';

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
    case 'mention':
    default:
      return `${actor} ${t('mentionedYou')}`;
  }
}
