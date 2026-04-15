'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { queryKeys } from '@/lib/query-keys';
import type { ProjectMember, TaskComment } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  normalizeComposerMentions,
  parseCommentBody,
  serializeCommentMentions,
} from '@/components/task-detail/task-detail-utils';

export function TaskDetailCommentsTab({
  taskId,
  members,
}: {
  taskId: string;
  members: ProjectMember[];
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [commentMentionQuery, setCommentMentionQuery] = useState('');

  const commentsQuery = useQuery<TaskComment[]>({
    queryKey: queryKeys.taskComments(taskId),
    queryFn: () => api(`/tasks/${taskId}/comments`),
  });

  const meQuery = useQuery<{ id: string }>({
    queryKey: queryKeys.me,
    queryFn: () => api('/me'),
  });

  const createComment = useMutation({
    mutationFn: (body: string) =>
      api(`/tasks/${taskId}/comments`, {
        method: 'POST',
        body: { body: serializeCommentMentions(body, members) },
      }) as Promise<TaskComment>,
    onSuccess: async () => {
      setNewComment('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskComments(taskId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskAudit(taskId) });
    },
  });

  const updateComment = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => api(`/comments/${id}`, { method: 'PATCH', body: { body } }) as Promise<TaskComment>,
    onSuccess: async () => {
      setEditingCommentId(null);
      setEditingBody('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskComments(taskId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskAudit(taskId) });
    },
  });

  const deleteComment = useMutation({
    mutationFn: (id: string) => api(`/comments/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskComments(taskId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskAudit(taskId) });
    },
  });

  const mentionCandidates = useMemo(
    () =>
      members.filter((member) => {
        const name = (member.user.displayName ?? member.user.email ?? member.user.id).toLowerCase();
        return !commentMentionQuery || name.includes(commentMentionQuery.toLowerCase());
      }),
    [commentMentionQuery, members],
  );

  const comments = commentsQuery.data ?? [];

  const tryCommentMentionLookup = (text: string) => {
    const match = text.match(/(?:^|\s)@([a-zA-Z0-9._-]*)$/);
    if (!match) {
      setCommentMentionQuery('');
      return;
    }
    setCommentMentionQuery(match[1] ?? '');
  };

  return (
    <div className="space-y-3">
      <div className="relative flex gap-2">
        <Textarea
          value={newComment}
          onChange={(event) => {
            const normalized = normalizeComposerMentions(event.target.value);
            setNewComment(normalized);
            tryCommentMentionLookup(normalized);
          }}
          placeholder={t('addCommentPlaceholder')}
          className="min-h-[88px] border-border/60"
          data-testid="comment-composer"
        />
        <Button
          className="min-w-[96px] shrink-0 self-start whitespace-nowrap px-3"
          onClick={() => createComment.mutate(newComment)}
          disabled={!newComment.trim() || createComment.isPending}
          data-testid="add-comment-btn"
        >
          {t('comment')}
        </Button>

        {commentMentionQuery && mentionCandidates.length ? (
          <div className="absolute left-2 top-[86px] z-20 w-72 rounded-md border bg-popover p-1 shadow" data-testid="comment-mention-menu">
            {mentionCandidates.slice(0, 6).map((member) => {
              const label = member.user.displayName ?? member.user.email ?? member.user.id;
              return (
                <button
                  key={member.userId}
                  type="button"
                  className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-muted"
                  data-testid={`comment-mention-option-${member.userId}`}
                  onClick={() => {
                    setNewComment((prev) => prev.replace(/(?:^|\s)@[a-zA-Z0-9._-]*$/, ` @${member.userId} `));
                    setCommentMentionQuery('');
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        {comments.map((comment) => {
          const mine = comment.authorUserId === meQuery.data?.id;
          return (
            <div key={comment.id} className="border-b border-border/60 pb-3" data-testid={`comment-${comment.id}`}>
              <div className="mb-1 text-xs text-muted-foreground">
                {comment.author?.displayName ?? comment.authorUserId} • {new Date(comment.createdAt).toLocaleString()}
              </div>
              {editingCommentId === comment.id ? (
                <div className="space-y-2">
                  <Input value={editingBody} onChange={(event) => setEditingBody(event.target.value)} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => updateComment.mutate({ id: comment.id, body: editingBody })}>
                      {t('save')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingCommentId(null)}>
                      {t('cancel')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-sm">
                  {parseCommentBody(comment.body).map((chunk, index) =>
                    chunk.type === 'mention' ? (
                      <span
                        key={`${comment.id}-m-${index}`}
                        className="mr-1 inline-flex rounded bg-muted px-1 py-0.5 text-xs font-medium"
                        data-testid={`comment-mention-pill-${comment.id}`}
                      >
                        {chunk.value}
                      </span>
                    ) : (
                      <span key={`${comment.id}-t-${index}`}>{chunk.value}</span>
                    ),
                  )}
                </div>
              )}
              {mine && editingCommentId !== comment.id ? (
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingCommentId(comment.id);
                      setEditingBody(comment.body);
                    }}
                  >
                    {t('edit')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => deleteComment.mutate(comment.id)}>
                    {t('delete')}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
        {!comments.length ? <div className="text-sm text-muted-foreground">{t('noCommentsYet')}</div> : null}
      </div>
    </div>
  );
}
