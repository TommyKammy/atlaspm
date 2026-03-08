import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  NOTIFICATION_TYPE_APPROVAL_REQUESTED,
  NOTIFICATION_TYPE_UNKNOWN,
  normalizeInboxNotificationType,
} from '../src/notifications/notification-taxonomy';

describe('notification taxonomy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('normalizes legacy approval aliases', () => {
    expect(normalizeInboxNotificationType('APPROVAL_REQUESTED')).toBe(NOTIFICATION_TYPE_APPROVAL_REQUESTED);
  });

  test('preserves canonical notification types', () => {
    expect(normalizeInboxNotificationType('comment')).toBe('comment');
  });

  test('returns unknown and emits a warning for unmapped types', () => {
    const warningSpy = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined);

    expect(normalizeInboxNotificationType('new_notification_type')).toBe(NOTIFICATION_TYPE_UNKNOWN);
    expect(warningSpy).toHaveBeenCalledWith('Unrecognized inbox notification type "new_notification_type"', {
      code: 'ATLASPM_UNKNOWN_INBOX_NOTIFICATION_TYPE',
      type: 'AtlasPMNotificationTaxonomyWarning',
    });
  });
});
