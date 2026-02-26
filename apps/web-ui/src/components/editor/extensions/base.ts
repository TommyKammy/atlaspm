import type { JSONContent } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import Table from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import StarterKit from '@tiptap/starter-kit';

export type MentionOption = {
  id: string;
  label: string;
};

export const defaultTaskDoc: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

export function createTaskDescriptionExtensions(placeholderText = 'Type / for blocks, @ for mentions...') {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      history: false,
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      validate: (href: string) => /^(https?:|mailto:)/i.test(href),
    }),
    Mention.configure({
      HTMLAttributes: {
        class: 'rounded bg-muted px-1 py-0.5 text-xs font-medium text-foreground',
      },
      suggestion: {
        char: '@',
        items: () => [],
        render: () => ({
          onStart: () => undefined,
          onUpdate: () => undefined,
          onExit: () => undefined,
          onKeyDown: () => false,
        }),
      },
      renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.id}`,
    }),
    Image.configure({
      allowBase64: false,
      HTMLAttributes: { class: 'my-2 max-h-96 rounded border' },
    }),
    Table.configure({
      resizable: false,
    }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: placeholderText }),
  ];
}
