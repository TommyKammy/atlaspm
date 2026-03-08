import type { ProjectMember } from './types';

export type StatusUpdateMentionChunk =
  | { type: 'text'; value: string }
  | { type: 'mention'; value: string; id: string };

const MENTION_ID_PATTERN = '[-a-zA-Z0-9._:]+';

function serializedMentionRegex() {
  return new RegExp(`@\\[(?<id>${MENTION_ID_PATTERN})\\|(?<label>[^\\]]+)\\]`, 'g');
}

function plainMentionRegex() {
  return new RegExp(`(^|\\s)@(${MENTION_ID_PATTERN})`, 'g');
}

export function serializeStatusUpdateMentions(value: string, members: ProjectMember[]) {
  if (!value.trim()) return value;
  const idToLabel = new Map<string, string>();
  for (const member of members) {
    const label = member.user.displayName ?? member.user.email ?? member.user.id;
    idToLabel.set(member.userId.toLowerCase(), label);
  }
  return value.replace(plainMentionRegex(), (whole, prefix: string, mentionId: string) => {
    const label = idToLabel.get(mentionId.toLowerCase());
    if (!label) return whole;
    return `${prefix}@[${mentionId}|${label}]`;
  });
}

export function parseStatusUpdateMentionText(value: string): StatusUpdateMentionChunk[] {
  const regex = serializedMentionRegex();
  const output: StatusUpdateMentionChunk[] = [];
  let cursor = 0;
  let match = regex.exec(value);
  while (match) {
    if (match.index > cursor) {
      output.push({ type: 'text', value: value.slice(cursor, match.index) });
    }
    output.push({
      type: 'mention',
      id: match.groups?.id ?? '',
      value: `@${match.groups?.label ?? match.groups?.id ?? ''}`,
    });
    cursor = match.index + match[0].length;
    match = regex.exec(value);
  }
  if (cursor < value.length) {
    output.push({ type: 'text', value: value.slice(cursor) });
  }
  return output;
}

export function replaceSerializedStatusUpdateMentions(value: string) {
  return value.replace(serializedMentionRegex(), (_whole, _id: string, label: string) => `@${label}`);
}
