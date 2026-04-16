import { describe, expect, test } from 'vitest';
import {
  normalizeComposerMentions,
  parseCommentBody,
  parseReminderInputToIso,
  serializeCommentMentions,
} from '@/components/task-detail/task-detail-utils';
import type { ProjectMember } from '@/lib/types';

const members: ProjectMember[] = [
  {
    id: 'member-1',
    userId: 'user.name:123',
    role: 'MEMBER',
    user: {
      id: 'user.name:123',
      displayName: 'Alice Example',
      email: 'alice@example.com',
    },
  },
];

describe('task detail utils', () => {
  test('round-trips mention ids that include dots and colons', () => {
    const serialized = serializeCommentMentions('Hi @user.name:123', members);

    expect(serialized).toBe('Hi @[user.name:123|Alice Example]');
    expect(normalizeComposerMentions(serialized)).toBe('Hi @user.name:123');
    expect(parseCommentBody(serialized)).toEqual([
      { type: 'text', value: 'Hi ' },
      { type: 'mention', userId: 'user.name:123', value: '@Alice Example' },
    ]);
  });

  test('returns null for invalid reminder input values', () => {
    expect(parseReminderInputToIso('not-a-date')).toBeNull();
  });

  test('serializes valid reminder input values to ISO strings', () => {
    expect(parseReminderInputToIso('2026-04-16T09:30')).toBe(new Date('2026-04-16T09:30').toISOString());
  });
});
