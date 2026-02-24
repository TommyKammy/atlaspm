'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api, apiBaseUrl } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { AuditEvent, ProjectMember, SectionTaskGroup, Task, TaskAttachment, TaskComment } from '@/lib/types';
import { SubtaskList } from '@/components/subtask-list';
import { DependencyManager } from '@/components/dependency-manager';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import TaskDescriptionEditor from '@/components/editor/TaskDescriptionEditor';
import { Textarea } from '@/components/ui/textarea';

function formatAuditEvent(event: AuditEvent) {
  const action = event.action;
  if (action === 'task.description.updated') return 'updated description';
  if (action === 'task.description.snapshot_saved') return 'updated description';
  if (action === 'task.comment.created') return 'added a comment';
  if (action === 'task.comment.updated') return 'edited a comment';
  if (action === 'task.comment.deleted') return 'deleted a comment';
  if (action === 'task.reordered') return 'reordered task';
  if (action === 'task.updated') return 'updated task';
  if (action === 'task.mention.created') return 'added a mention';
  if (action === 'task.mention.deleted') return 'removed a mention';
  if (action === 'task.attachment.created') return 'added an attachment';
  if (action === 'task.attachment.deleted') return 'deleted an attachment';
  if (action === 'rule.applied') return 'applied rule';
  return action;
}

function parseCommentBody(body: string) {
  const regex = /@\[(?<id>[a-zA-Z0-9:_-]+)\|(?<label>[^\]]+)\]/g;
  const output: Array<{ type: 'text' | 'mention'; value: string; userId?: string }> = [];
  let cursor = 0;
  let match = regex.exec(body);
  while (match) {
    if (match.index > cursor) {
      output.push({ type: 'text', value: body.slice(cursor, match.index) });
    }
    output.push({
      type: 'mention',
      userId: match.groups?.id ?? '',
      value: `@${match.groups?.label ?? match.groups?.id ?? ''}`,
    });
    cursor = match.index + match[0].length;
    match = regex.exec(body);
  }
  if (cursor < body.length) output.push({ type: 'text', value: body.slice(cursor) });
  return output;
}

export default function TaskDetailDrawer({
  taskId,
  open,
  onOpenChange,
  projectId,
}: {
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'details' | 'comments' | 'activity'>('details');
  const [newComment, setNewComment] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [commentMentionQuery, setCommentMentionQuery] = useState('');

  const enabled = Boolean(taskId && open);

  const taskQuery = useQuery<Task>({
    queryKey: taskId ? queryKeys.taskDetail(taskId) : ['task', 'none'],
    queryFn: () => api(`/tasks/${taskId}`),
    enabled,
  });

  const commentsQuery = useQuery<TaskComment[]>({
    queryKey: taskId ? queryKeys.taskComments(taskId) : ['task', 'none', 'comments'],
    queryFn: () => api(`/tasks/${taskId}/comments`),
    enabled,
  });

  const attachmentsQuery = useQuery<TaskAttachment[]>({
    queryKey: taskId ? queryKeys.taskAttachments(taskId) : ['task', 'none', 'attachments'],
    queryFn: () => api(`/tasks/${taskId}/attachments`),
    enabled,
  });

  const activityQuery = useQuery<AuditEvent[]>({
    queryKey: taskId ? queryKeys.taskAudit(taskId) : ['task', 'none', 'audit'],
    queryFn: () => api(`/tasks/${taskId}/audit`),
    enabled,
  });

  const membersQuery = useQuery<ProjectMember[]>({
    queryKey: queryKeys.projectMembers(projectId),
    queryFn: () => api(`/projects/${projectId}/members`),
    enabled,
  });

  const meQuery = useQuery<{ id: string }>({
    queryKey: queryKeys.me,
    queryFn: () => api('/me'),
  });

  const createComment = useMutation({
    mutationFn: (body: string) => api(`/tasks/${taskId}/comments`, { method: 'POST', body: { body } }) as Promise<TaskComment>,
    onSuccess: async () => {
      setNewComment('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskComments(taskId!) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskAudit(taskId!) });
    },
  });

  const updateComment = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => api(`/comments/${id}`, { method: 'PATCH', body: { body } }) as Promise<TaskComment>,
    onSuccess: async () => {
      setEditingCommentId(null);
      setEditingBody('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskComments(taskId!) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskAudit(taskId!) });
    },
  });

  const deleteComment = useMutation({
    mutationFn: (id: string) => api(`/comments/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskComments(taskId!) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskAudit(taskId!) });
    },
  });

  const deleteAttachment = useMutation({
    mutationFn: (id: string) => api(`/attachments/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskAttachments(taskId!) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.taskAudit(taskId!) });
    },
  });

  const members = membersQuery.data ?? [];
  const mentionCandidates = members.filter((member) => {
    const name = (member.user.displayName ?? member.user.email ?? member.user.id).toLowerCase();
    return !commentMentionQuery || name.includes(commentMentionQuery.toLowerCase());
  });

  const comments = commentsQuery.data ?? [];
  const attachments = attachmentsQuery.data ?? [];
  const activity = useMemo(() => (activityQuery.data ?? []).slice().reverse(), [activityQuery.data]);

  const tryCommentMentionLookup = (text: string) => {
    const match = text.match(/(?:^|\s)@([a-zA-Z0-9._-]*)$/);
    if (!match) {
      setCommentMentionQuery('');
      return;
    }
    setCommentMentionQuery(match[1] ?? '');
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-50 w-[760px] max-w-full border-l bg-background p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-base font-semibold">{taskQuery.data?.title ?? 'Task detail'}</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close task detail">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="mb-4 flex gap-2">
            <Button variant={tab === 'details' ? 'default' : 'outline'} size="sm" onClick={() => setTab('details')}>Details</Button>
            <Button variant={tab === 'comments' ? 'default' : 'outline'} size="sm" onClick={() => setTab('comments')}>Comments</Button>
            <Button variant={tab === 'activity' ? 'default' : 'outline'} size="sm" onClick={() => setTab('activity')}>Activity</Button>
          </div>

          {tab === 'details' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 rounded-lg border bg-card p-3 text-sm">
                <div>Status: {taskQuery.data?.status}</div>
                <div>Progress: {taskQuery.data?.progressPercent ?? 0}%</div>
                <div>Assignee: {taskQuery.data?.assigneeUserId ?? 'Unassigned'}</div>
                <div>Due: {taskQuery.data?.dueAt ? String(taskQuery.data.dueAt).slice(0, 10) : '—'}</div>
              </div>
              {taskId ? (
                <TaskDescriptionEditor
                  taskId={taskId}
                  descriptionDoc={taskQuery.data?.descriptionDoc ?? null}
                  descriptionVersion={taskQuery.data?.descriptionVersion ?? 0}
                  members={members}
                  onSaved={async (updated) => {
                    queryClient.setQueryData(queryKeys.taskDetail(taskId), updated);
                    queryClient.setQueryData<SectionTaskGroup[]>(queryKeys.projectTasksGrouped(projectId), (current = []) =>
                      current.map((group) => ({
                        ...group,
                        tasks: group.tasks.map((task) => (task.id === updated.id ? { ...task, ...updated } : task)),
                      })),
                    );
                    await queryClient.invalidateQueries({ queryKey: queryKeys.taskAudit(taskId) });
                    await queryClient.invalidateQueries({ queryKey: queryKeys.projectTasksGrouped(projectId) });
                  }}
                  onReloadLatest={async () => {
                    await queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(taskId) });
                  }}
                  onAttachmentChanged={() => {
                    void queryClient.invalidateQueries({ queryKey: queryKeys.taskAttachments(taskId) });
                    void queryClient.invalidateQueries({ queryKey: queryKeys.taskAudit(taskId) });
                  }}
                />
              ) : null}

              <section className="rounded-lg border bg-card p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Paperclip className="h-4 w-4" /> Attachments
                </div>
                {!attachments.length ? <p className="text-xs text-muted-foreground">No attachments yet.</p> : null}
                <div className="space-y-2">
                  {attachments.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded border px-2 py-1 text-sm" data-testid={`attachment-${item.id}`}>
                      <a
                        href={`${apiBaseUrl}${item.url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate hover:underline"
                      >
                        {item.fileName}
                      </a>
                      <Button size="sm" variant="ghost" onClick={() => deleteAttachment.mutate(item.id)}>Delete</Button>
                    </div>
                  ))}
                </div>
              </section>

              {taskId && (
                <>
                  <SubtaskList
                    taskId={taskId}
                    projectId={projectId}
                    onTaskClick={(newTaskId) => {
                      queryClient.invalidateQueries({ queryKey: queryKeys.taskDetail(newTaskId) });
                      window.location.href = `/projects/${projectId}?task=${newTaskId}`;
                    }}
                  />
                  <DependencyManager taskId={taskId} />
                </>
              )}
            </div>
          ) : null}

          {tab === 'comments' ? (
            <div className="space-y-3">
              <div className="relative flex gap-2">
                <Textarea
                  value={newComment}
                  onChange={(e) => {
                    setNewComment(e.target.value);
                    tryCommentMentionLookup(e.target.value);
                  }}
                  placeholder="Add a comment (use @ to mention)"
                  className="min-h-[80px]"
                  data-testid="comment-composer"
                />
                <Button
                  onClick={() => createComment.mutate(newComment)}
                  disabled={!newComment.trim() || createComment.isPending}
                  data-testid="add-comment-btn"
                >
                  Comment
                </Button>

                {commentMentionQuery && mentionCandidates.length ? (
                  <div className="absolute left-2 top-[78px] z-20 w-72 rounded-md border bg-popover p-1 shadow" data-testid="comment-mention-menu">
                    {mentionCandidates.slice(0, 6).map((member) => {
                      const label = member.user.displayName ?? member.user.email ?? member.user.id;
                      return (
                        <button
                          key={member.userId}
                          type="button"
                          className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-muted"
                          data-testid={`comment-mention-option-${member.userId}`}
                          onClick={() => {
                            setNewComment((prev) => prev.replace(/(?:^|\s)@[a-zA-Z0-9._-]*$/, ` @[${member.userId}|${label}] `));
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
                    <div key={comment.id} className="rounded-md border bg-card p-3" data-testid={`comment-${comment.id}`}>
                      <div className="mb-1 text-xs text-muted-foreground">
                        {comment.author?.displayName ?? comment.authorUserId} • {new Date(comment.createdAt).toLocaleString()}
                      </div>
                      {editingCommentId === comment.id ? (
                        <div className="space-y-2">
                          <Input value={editingBody} onChange={(e) => setEditingBody(e.target.value)} />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => updateComment.mutate({ id: comment.id, body: editingBody })}>Save</Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingCommentId(null)}>Cancel</Button>
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
                            Edit
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => deleteComment.mutate(comment.id)}>Delete</Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {!comments.length ? <div className="text-sm text-muted-foreground">No comments yet.</div> : null}
              </div>
            </div>
          ) : null}

          {tab === 'activity' ? (
            <div className="space-y-3">
              {activity.map((event) => (
                <div key={event.id} className="rounded-md border bg-card p-3" data-testid={`activity-${event.id}`}>
                  <div className="text-sm font-medium">{event.actor} {formatAuditEvent(event)}</div>
                  <div className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</div>
                </div>
              ))}
              {!activity.length ? <div className="text-sm text-muted-foreground">No activity yet.</div> : null}
            </div>
          ) : null}

          <Separator className="mt-4" />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
