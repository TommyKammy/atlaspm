export const NOTIFICATION_TYPE_MENTION = 'mention';
export const NOTIFICATION_TYPE_ASSIGNMENT = 'assignment';
export const NOTIFICATION_TYPE_DUE_DATE = 'due_date';
export const NOTIFICATION_TYPE_STATUS = 'status';
export const NOTIFICATION_TYPE_COMMENT = 'comment';
export const NOTIFICATION_TYPE_APPROVAL_REQUESTED = 'approval_requested';
export const NOTIFICATION_TYPE_APPROVAL_APPROVED = 'approval_approved';
export const NOTIFICATION_TYPE_APPROVAL_REJECTED = 'approval_rejected';
export const NOTIFICATION_TYPE_UNKNOWN = 'unknown';

export const INBOX_NOTIFICATION_TYPES = [
  NOTIFICATION_TYPE_MENTION,
  NOTIFICATION_TYPE_ASSIGNMENT,
  NOTIFICATION_TYPE_DUE_DATE,
  NOTIFICATION_TYPE_STATUS,
  NOTIFICATION_TYPE_COMMENT,
  NOTIFICATION_TYPE_APPROVAL_REQUESTED,
  NOTIFICATION_TYPE_APPROVAL_APPROVED,
  NOTIFICATION_TYPE_APPROVAL_REJECTED,
] as const;

export type InboxNotificationType = (typeof INBOX_NOTIFICATION_TYPES)[number];
export type NormalizedInboxNotificationType = InboxNotificationType | typeof NOTIFICATION_TYPE_UNKNOWN;

const LEGACY_NOTIFICATION_TYPE_ALIASES: Record<string, InboxNotificationType> = {
  APPROVAL_REQUESTED: NOTIFICATION_TYPE_APPROVAL_REQUESTED,
  APPROVAL_APPROVED: NOTIFICATION_TYPE_APPROVAL_APPROVED,
  APPROVAL_REJECTED: NOTIFICATION_TYPE_APPROVAL_REJECTED,
};

export function normalizeInboxNotificationType(type: string): NormalizedInboxNotificationType {
  const normalizedFromAlias = LEGACY_NOTIFICATION_TYPE_ALIASES[type];
  if (normalizedFromAlias) {
    return normalizedFromAlias;
  }

  const normalizedFromList = INBOX_NOTIFICATION_TYPES.find((candidate) => candidate === type);
  if (normalizedFromList) {
    return normalizedFromList;
  }

  process.emitWarning(`Unrecognized inbox notification type "${type}"`, {
    code: 'ATLASPM_UNKNOWN_INBOX_NOTIFICATION_TYPE',
    type: 'AtlasPMNotificationTaxonomyWarning',
  });
  return NOTIFICATION_TYPE_UNKNOWN;
}
