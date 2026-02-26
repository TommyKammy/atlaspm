'use client';

import * as Dialog from '@radix-ui/react-dialog';
import type { JSONContent } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { EditorContent, useEditor } from '@tiptap/react';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, apiBaseUrl } from '@/lib/api';
import type { ProjectMember, Task } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import SlashMenu, { type SlashItem } from './SlashMenu';
import { createTaskDescriptionExtensions, defaultTaskDoc } from './extensions/base';

type Props = {
  taskId: string;
  descriptionDoc?: Record<string, unknown> | null;
  descriptionVersion?: number;
  members: ProjectMember[];
  onSaved: (task: Task) => void;
  onReloadLatest: () => void;
  onAttachmentChanged: () => void;
};

type CollabTokenResponse = {
  url: string;
  token: string;
  roomId: string;
  mode: 'readonly' | 'readwrite';
  user: { id: string; name: string; color: string };
};

function normalizeDoc(value?: Record<string, unknown> | null) {
  if (!value || typeof value !== 'object') return defaultTaskDoc;
  return value as JSONContent;
}

function parseApiPayload(error: unknown) {
  if (!(error instanceof Error)) return null;
  const message = error.message;
  const firstBrace = message.indexOf('{');
  if (firstBrace < 0) return null;
  try {
    return JSON.parse(message.slice(firstBrace));
  } catch {
    return null;
  }
}

function validLink(url: string) {
  return /^(https?:|mailto:)/i.test(url);
}

const collabEnabled = process.env.NEXT_PUBLIC_COLLAB_ENABLED === 'true';

export default function TaskDescriptionEditor({
  taskId,
  descriptionDoc,
  descriptionVersion = 0,
  members,
  onSaved,
  onReloadLatest,
  onAttachmentChanged,
}: Props) {
  const initialDoc = useMemo(() => normalizeDoc(descriptionDoc), [descriptionDoc]);
  const [currentVersion, setCurrentVersion] = useState(descriptionVersion);
  const [lastSavedJson, setLastSavedJson] = useState(JSON.stringify(initialDoc));
  const [isSaving, setIsSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');
  const [collabSession, setCollabSession] = useState<CollabTokenResponse | null>(null);
  const [collabUnavailable, setCollabUnavailable] = useState(false);
  const [collabStatus, setCollabStatus] = useState<'idle' | 'connecting' | 'connected' | 'disconnected'>('idle');
  const [presenceCount, setPresenceCount] = useState(1);
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null);
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!collabEnabled) return;
    let cancelled = false;
    setCollabUnavailable(false);
    setCollabSession(null);

    void api(`/tasks/${taskId}/collab-token`, { method: 'POST' })
      .then((session) => {
        if (cancelled) return;
        setCollabSession(session as CollabTokenResponse);
      })
      .catch(() => {
        if (cancelled) return;
        setCollabUnavailable(true);
      });

    return () => {
      cancelled = true;
    };
  }, [taskId]);

  useEffect(() => {
    if (!collabEnabled || collabUnavailable || !collabSession) return;
    const localYdoc = new Y.Doc();
    const nextProvider = new HocuspocusProvider({
      url: collabSession.url,
      name: collabSession.roomId,
      token: collabSession.token,
      document: localYdoc,
    });

    setYdoc(localYdoc);
    setProvider(nextProvider);
    setCollabStatus('connecting');

    const timeout = setTimeout(() => {
      if (nextProvider.status !== 'connected') {
        setCollabUnavailable(true);
        setCollabStatus('disconnected');
        nextProvider.destroy();
      }
    }, 6000);

    const onStatus = (event: { status: 'connected' | 'connecting' | 'disconnected' }) => {
      setCollabStatus(event.status);
      if (event.status === 'connected') {
        const states = nextProvider.awareness
          ? Array.from(nextProvider.awareness.getStates().values())
          : [];
        setPresenceCount(Math.max(states.length, 1));
      }
    };

    const onAwareness = () => {
      const states = nextProvider.awareness
        ? Array.from(nextProvider.awareness.getStates().values())
        : [];
      setPresenceCount(Math.max(states.length, 1));
    };

    nextProvider.on('status', onStatus);
    nextProvider.on('awarenessUpdate', onAwareness);

    return () => {
      clearTimeout(timeout);
      nextProvider.off('status', onStatus);
      nextProvider.off('awarenessUpdate', onAwareness);
      nextProvider.destroy();
      localYdoc.destroy();
      setProvider(null);
      setYdoc(null);
    };
  }, [collabSession, collabUnavailable]);

  const isCollabActive = Boolean(collabEnabled && collabSession && !collabUnavailable && provider && ydoc);
  const isReadOnly = isCollabActive && collabSession?.mode === 'readonly';

  const editor = useEditor(
    {
      extensions: [
        ...createTaskDescriptionExtensions(),
        ...(isCollabActive
          ? [
              Collaboration.configure({ document: ydoc!, field: 'default' }),
              CollaborationCursor.configure({
                provider: provider!,
                user: {
                  name: collabSession?.user.name ?? 'User',
                  color: collabSession?.user.color ?? '#5B8CFF',
                },
              }),
            ]
          : []),
      ],
      ...(!isCollabActive ? { content: initialDoc } : {}),
      editable: !isReadOnly,
      editorProps: {
        attributes: {
          'data-testid': 'task-description-content',
          class:
            'prose prose-sm dark:prose-invert min-h-[220px] max-w-none rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none',
        },
        handleKeyDown: (_view, event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            if (!isReadOnly) setLinkOpen(true);
            return true;
          }
          if (event.key === '/' && !isReadOnly) {
            setSlashQuery('');
            setSlashOpen(true);
          }
          if (event.key === '@' && !isReadOnly) {
            setMentionQuery('');
            setMentionOpen(true);
          }
          if (event.key === 'Escape') {
            setSlashOpen(false);
            setMentionOpen(false);
          }
          return false;
        },
      },
      onUpdate: ({ editor: current }) => {
        const from = current.state.selection.from;
        const textBefore = current.state.doc.textBetween(Math.max(0, from - 80), from, ' ', ' ');
        const slashMatch = textBefore.match(/(?:^|\s)\/([a-zA-Z0-9_-]*)$/);
        const mentionMatch = textBefore.match(/(?:^|\s)@([a-zA-Z0-9._-]*)$/);

        if (!isReadOnly && slashMatch) {
          setSlashQuery((slashMatch[1] ?? '').toLowerCase());
          setSlashOpen(true);
        } else {
          setSlashOpen(false);
        }

        if (!isReadOnly && mentionMatch) {
          setMentionQuery((mentionMatch[1] ?? '').toLowerCase());
          setMentionOpen(true);
        } else {
          setMentionOpen(false);
        }
      },
    },
    [isCollabActive, isReadOnly, taskId, descriptionVersion, provider, ydoc, collabSession?.token],
  );

  const removeCommandTrigger = (char: '/' | '@') => {
    if (!editor) return;
    const from = editor.state.selection.from;
    const textBefore = editor.state.doc.textBetween(Math.max(0, from - 80), from, ' ', ' ');
    const match =
      char === '/'
        ? textBefore.match(/(?:^|\s)\/([a-zA-Z0-9_-]*)$/)
        : textBefore.match(/(?:^|\s)@([a-zA-Z0-9._-]*)$/);
    if (!match) return;
    const token = `${char}${match[1] ?? ''}`;
    editor.chain().focus().deleteRange({ from: from - token.length, to: from }).run();
  };

  const uploadImage = async (file: File) => {
    const initiated = (await api(`/tasks/${taskId}/attachments/initiate`, {
      method: 'POST',
      body: { fileName: file.name, mimeType: file.type, sizeBytes: file.size },
    })) as { attachmentId: string; uploadUrl: string };

    const formData = new FormData();
    formData.append('file', file);
    await api(initiated.uploadUrl, { method: 'POST', body: formData });

    const completed = (await api(`/tasks/${taskId}/attachments/complete`, {
      method: 'POST',
      body: { attachmentId: initiated.attachmentId },
    })) as { url: string };

    editor?.chain().focus().setImage({ src: `${apiBaseUrl}${completed.url}`, alt: file.name }).run();
    onAttachmentChanged();
  };

  const slashItems: SlashItem[] = [
    { id: 'h1', label: 'Heading 1', action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run() },
    { id: 'h2', label: 'Heading 2', action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run() },
    { id: 'h3', label: 'Heading 3', action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run() },
    { id: 'bullet', label: 'Bulleted list', action: () => editor?.chain().focus().toggleBulletList().run() },
    { id: 'ordered', label: 'Numbered list', action: () => editor?.chain().focus().toggleOrderedList().run() },
    { id: 'check', label: 'Checklist', action: () => editor?.chain().focus().toggleTaskList().run() },
    { id: 'quote', label: 'Quote', action: () => editor?.chain().focus().toggleBlockquote().run() },
    { id: 'code', label: 'Code block', action: () => editor?.chain().focus().toggleCodeBlock().run() },
    { id: 'divider', label: 'Divider', action: () => editor?.chain().focus().setHorizontalRule().run() },
    {
      id: 'image',
      label: 'Image upload',
      action: () => {
        fileInputRef.current?.click();
      },
    },
    {
      id: 'table',
      label: 'Table (2x2)',
      action: () => editor?.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run(),
    },
  ]
    .filter((item) => !slashQuery || item.label.toLowerCase().includes(slashQuery))
    .map((item) => ({
      ...item,
      action: () => {
        removeCommandTrigger('/');
        item.action();
        setSlashOpen(false);
      },
    }));

  const mentionCandidates = members
    .filter((member) => {
      const label = (member.user.displayName ?? member.user.email ?? member.user.id).toLowerCase();
      const email = (member.user.email ?? '').toLowerCase();
      return !mentionQuery || label.includes(mentionQuery) || email.includes(mentionQuery);
    })
    .slice(0, 8);

  useEffect(() => {
    setCurrentVersion(descriptionVersion);
    const normalized = normalizeDoc(descriptionDoc);
    const nextJson = JSON.stringify(normalized);
    setLastSavedJson(nextJson);
    setConflict(false);
    if (!isCollabActive && editor && JSON.stringify(editor.getJSON()) !== nextJson) {
      editor.commands.setContent(normalized, false);
    }
  }, [descriptionDoc, descriptionVersion, editor, isCollabActive]);

  useEffect(() => {
    if (!editor || isCollabActive) return;
    const timeout = setTimeout(async () => {
      const json = editor.getJSON();
      const serialized = JSON.stringify(json);
      if (serialized === lastSavedJson) return;
      setIsSaving(true);
      try {
        const updated = (await api(`/tasks/${taskId}/description`, {
          method: 'PATCH',
          body: { descriptionDoc: json, expectedVersion: currentVersion },
        })) as Task;
        setCurrentVersion(updated.descriptionVersion ?? currentVersion + 1);
        setLastSavedJson(serialized);
        setConflict(false);
        onSaved(updated);
      } catch (error) {
        const payload = parseApiPayload(error);
        if (payload?.latest) {
          setConflict(true);
        }
      } finally {
        setIsSaving(false);
      }
    }, 900);
    return () => clearTimeout(timeout);
  }, [editor, taskId, currentVersion, lastSavedJson, onSaved, isCollabActive]);

  if (!editor) return null;

  return (
    <div className="relative space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={isReadOnly} onClick={() => editor.chain().focus().toggleBold().run()}>B</Button>
        <Button size="sm" variant="outline" disabled={isReadOnly} onClick={() => editor.chain().focus().toggleItalic().run()}>I</Button>
        <Button size="sm" variant="outline" disabled={isReadOnly} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</Button>
        <Button size="sm" variant="outline" disabled={isReadOnly} onClick={() => editor.chain().focus().toggleBulletList().run()}>Bullet</Button>
        <Button size="sm" variant="outline" disabled={isReadOnly} onClick={() => editor.chain().focus().toggleOrderedList().run()}>Number</Button>
        <Button size="sm" variant="outline" disabled={isReadOnly} onClick={() => editor.chain().focus().toggleTaskList().run()}>Check</Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isReadOnly}
          onClick={() => setLinkOpen(true)}
          data-testid="link-toolbar-open"
        >
          Link
        </Button>
        <Button size="sm" variant="outline" disabled={isReadOnly} onClick={() => fileInputRef.current?.click()}>Image</Button>
        {isCollabActive ? (
          <Badge data-testid="collab-presence-badge">
            {presenceCount} users
          </Badge>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground">
          {isCollabActive
            ? collabStatus === 'connected'
              ? 'Live'
              : 'Connecting…'
            : isSaving
              ? 'Saving…'
              : 'Saved'}
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        data-testid="description-image-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file || isReadOnly) return;
          void uploadImage(file);
          event.currentTarget.value = '';
        }}
      />

      {collabUnavailable && collabEnabled ? (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground" data-testid="collab-fallback-banner">
          Collaboration unavailable; using snapshot.
        </div>
      ) : null}

      {isReadOnly ? (
        <div className="rounded-md border border-muted bg-muted/40 px-3 py-2 text-xs text-muted-foreground" data-testid="collab-readonly-banner">
          Read-only: your role allows viewing collaborative updates but not editing.
        </div>
      ) : null}

      {conflict ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          This task was updated elsewhere. Reload latest.
          <Button
            size="sm"
            variant="outline"
            className="ml-2"
            onClick={() => {
              setConflict(false);
              onReloadLatest();
            }}
          >
            Reload latest
          </Button>
        </div>
      ) : null}

      <SlashMenu open={slashOpen && !isReadOnly} items={slashItems} />

      {mentionOpen && mentionCandidates.length && !isReadOnly ? (
        <div className="absolute left-2 top-14 z-30 w-72 rounded-md border bg-popover shadow-md" data-testid="mention-menu">
          <div className="max-h-56 overflow-auto p-1">
            {mentionCandidates.map((member) => {
              const label = member.user.displayName ?? member.user.email ?? member.user.id;
              return (
                <button
                  key={member.userId}
                  type="button"
                  className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-muted"
                  data-testid={`mention-option-${member.userId}`}
                  onClick={() => {
                    removeCommandTrigger('@');
                    editor
                      .chain()
                      .focus()
                      .insertContent([
                        {
                          type: 'mention',
                          attrs: {
                            id: member.userId,
                            label,
                          },
                        },
                        { type: 'text', text: ' ' },
                      ])
                      .run();
                    setMentionOpen(false);
                  }}
                >
                  <span className="truncate">{label}</span>
                  <span className="text-xs text-muted-foreground">{member.user.email ?? ''}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <EditorContent editor={editor} />

      <Dialog.Root open={linkOpen} onOpenChange={setLinkOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] w-[420px] max-w-[95vw] -translate-x-1/2 -translate-y-1/2 rounded-md border bg-background p-4">
            <Dialog.Title className="text-sm font-semibold">Add link</Dialog.Title>
            <div className="mt-3 space-y-3">
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com"
                data-testid="link-dialog-input"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setLinkOpen(false)} data-testid="link-dialog-cancel">Cancel</Button>
                <Button
                  data-testid="link-dialog-save"
                  onClick={() => {
                    if (!validLink(linkUrl)) return;
                    const isSelectionEmpty = editor.state.selection.empty;
                    if (isSelectionEmpty) {
                      editor
                        .chain()
                        .focus()
                        .insertContent({
                          type: 'text',
                          text: linkUrl,
                          marks: [{ type: 'link', attrs: { href: linkUrl } }],
                        })
                        .run();
                    } else {
                      editor.chain().focus().setLink({ href: linkUrl }).run();
                    }
                    setLinkOpen(false);
                  }}
                >
                  Save
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
