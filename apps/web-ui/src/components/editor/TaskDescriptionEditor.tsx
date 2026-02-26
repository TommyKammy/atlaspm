'use client';

import * as Dialog from '@radix-ui/react-dialog';
import type { JSONContent } from '@tiptap/core';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import { EditorContent, useEditor } from '@tiptap/react';
import { HocuspocusProvider } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { Columns3, Minus, Plus, Rows3, Table2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, apiBaseUrl } from '@/lib/api';
import type { ProjectMember, Task } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
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

function containsTableNode(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false;
  const typed = node as { type?: string; content?: unknown[] };
  if (typed.type === 'table') return true;
  if (!Array.isArray(typed.content)) return false;
  return typed.content.some((child) => containsTableNode(child));
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
  const { t } = useI18n();
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
  const [editorFocused, setEditorFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const editorContainerRef = useRef<HTMLDivElement | null>(null);

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
        ...createTaskDescriptionExtensions(t('descriptionPlaceholder')),
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
            'prose prose-sm dark:prose-invert min-h-[220px] max-w-none rounded-md px-3 py-2 text-sm focus-visible:outline-none hover:bg-muted/20',
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
    { id: 'h1', label: t('heading1'), action: () => editor?.chain().focus().toggleHeading({ level: 1 }).run() },
    { id: 'h2', label: t('heading2'), action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run() },
    { id: 'h3', label: t('heading3'), action: () => editor?.chain().focus().toggleHeading({ level: 3 }).run() },
    { id: 'bullet', label: t('bulletedList'), action: () => editor?.chain().focus().toggleBulletList().run() },
    { id: 'ordered', label: t('numberedList'), action: () => editor?.chain().focus().toggleOrderedList().run() },
    { id: 'check', label: t('checklist'), action: () => editor?.chain().focus().toggleTaskList().run() },
    { id: 'quote', label: t('quote'), action: () => editor?.chain().focus().toggleBlockquote().run() },
    { id: 'code', label: t('codeBlock'), action: () => editor?.chain().focus().toggleCodeBlock().run() },
    { id: 'divider', label: t('divider'), action: () => editor?.chain().focus().setHorizontalRule().run() },
    {
      id: 'image',
      label: t('imageUpload'),
      action: () => {
        fileInputRef.current?.click();
      },
    },
    {
      id: 'table',
      label: t('table2x2'),
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

  useEffect(() => {
    const container = editorContainerRef.current;
    if (!container) return;
    const handleFocusIn = () => setEditorFocused(true);
    const handleFocusOut = () => {
      window.setTimeout(() => {
        const active = document.activeElement;
        if (!active || !container.contains(active)) {
          setEditorFocused(false);
        }
      }, 0);
    };
    container.addEventListener('focusin', handleFocusIn);
    container.addEventListener('focusout', handleFocusOut);
    return () => {
      container.removeEventListener('focusin', handleFocusIn);
      container.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  if (!editor) return null;

  const shouldShowToolbar = editorFocused || editor.isFocused;
  const isTableActive = editor.isActive('table');
  const hasTableInDoc = containsTableNode(editor.getJSON());
  const showTableControls = !isReadOnly && (shouldShowToolbar || hasTableInDoc);

  return (
    <div ref={editorContainerRef} className="group/editor relative space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('description')}</span>
        {isCollabActive ? (
          <Badge data-testid="collab-presence-badge">
            {presenceCount} {t('collabUsers')}
          </Badge>
        ) : null}
        <span className="ml-auto text-xs text-muted-foreground">
          {isCollabActive
            ? collabStatus === 'connected'
              ? t('live')
              : t('connecting')
            : isSaving
              ? t('saving')
              : t('saved')}
        </span>
      </div>

      <div
        className={cn(
          'flex flex-wrap items-center gap-2 overflow-hidden transition-all duration-150 ease-in-out',
          shouldShowToolbar ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <Button size="sm" variant="outline" disabled={isReadOnly} onClick={() => editor.chain().focus().toggleBold().run()}>B</Button>
        <Button size="sm" variant="outline" disabled={isReadOnly} onClick={() => editor.chain().focus().toggleItalic().run()}>I</Button>
        <Button size="sm" variant="outline" disabled={isReadOnly} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</Button>
        <Button size="sm" variant="outline" disabled={isReadOnly} onClick={() => editor.chain().focus().toggleBulletList().run()}>{t('bulletedList')}</Button>
        <Button size="sm" variant="outline" disabled={isReadOnly} onClick={() => editor.chain().focus().toggleOrderedList().run()}>{t('numberedList')}</Button>
        <Button size="sm" variant="outline" disabled={isReadOnly} onClick={() => editor.chain().focus().toggleTaskList().run()}>{t('checklist')}</Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isReadOnly}
          onClick={() => setLinkOpen(true)}
          data-testid="link-toolbar-open"
        >
          {t('addLink')}
        </Button>
        <Button size="sm" variant="outline" disabled={isReadOnly} onClick={() => fileInputRef.current?.click()}>{t('imageUpload')}</Button>
      </div>

      {showTableControls ? (
        <div
          className="absolute right-2 top-16 z-20 flex items-center gap-1 rounded-md border bg-background/95 p-1 shadow-sm backdrop-blur-sm"
          data-testid="table-controls"
        >
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => editor.chain().focus().addColumnBefore().run()}
            aria-label={t('tableAddColumnLeft')}
            data-testid="table-add-column-left"
            disabled={!isTableActive}
          >
            <Plus className="h-2.5 w-2.5" />
            <Columns3 className="-ml-0.5 h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            aria-label={t('tableAddColumn')}
            data-testid="table-add-column-right"
            disabled={!isTableActive}
          >
            <Columns3 className="h-3.5 w-3.5" />
            <Plus className="-ml-0.5 h-2.5 w-2.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => editor.chain().focus().deleteColumn().run()}
            aria-label={t('tableDeleteColumn')}
            data-testid="table-delete-column"
            disabled={!isTableActive}
          >
            <Columns3 className="h-3.5 w-3.5" />
            <Minus className="-ml-0.5 h-2.5 w-2.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => editor.chain().focus().addRowBefore().run()}
            aria-label={t('tableAddRowAbove')}
            data-testid="table-add-row-above"
            disabled={!isTableActive}
          >
            <Plus className="h-2.5 w-2.5" />
            <Rows3 className="-ml-0.5 h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => editor.chain().focus().addRowAfter().run()}
            aria-label={t('tableAddRow')}
            data-testid="table-add-row-below"
            disabled={!isTableActive}
          >
            <Rows3 className="h-3.5 w-3.5" />
            <Plus className="-ml-0.5 h-2.5 w-2.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => editor.chain().focus().deleteRow().run()}
            aria-label={t('tableDeleteRow')}
            data-testid="table-delete-row"
            disabled={!isTableActive}
          >
            <Rows3 className="h-3.5 w-3.5" />
            <Minus className="-ml-0.5 h-2.5 w-2.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => editor.chain().focus().deleteTable().run()}
            aria-label={t('tableDelete')}
            data-testid="table-delete"
            disabled={!isTableActive}
          >
            <Table2 className="h-3.5 w-3.5" />
            <Minus className="-ml-0.5 h-2.5 w-2.5" />
          </Button>
        </div>
      ) : null}

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
          {t('collabUnavailableUsingSnapshot')}
        </div>
      ) : null}

      {isReadOnly ? (
        <div className="rounded-md border border-muted bg-muted/40 px-3 py-2 text-xs text-muted-foreground" data-testid="collab-readonly-banner">
          {t('collabReadonlyBanner')}
        </div>
      ) : null}

      {conflict ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {t('taskUpdatedElsewhere')}
          <Button
            size="sm"
            variant="outline"
            className="ml-2"
            onClick={() => {
              setConflict(false);
              onReloadLatest();
            }}
          >
            {t('reloadLatest')}
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

      <div className="tiptap-editor-surface group/editor rounded-md border border-transparent transition-colors hover:border-border/30 focus-within:border-border/60">
        <EditorContent editor={editor} />
      </div>

      <Dialog.Root open={linkOpen} onOpenChange={setLinkOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] w-[420px] max-w-[95vw] -translate-x-1/2 -translate-y-1/2 rounded-md border bg-background p-4">
            <Dialog.Title className="text-sm font-semibold">{t('addLink')}</Dialog.Title>
            <div className="mt-3 space-y-3">
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder={t('linkPlaceholder')}
                data-testid="link-dialog-input"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setLinkOpen(false)} data-testid="link-dialog-cancel">{t('cancel')}</Button>
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
                  {t('save')}
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
