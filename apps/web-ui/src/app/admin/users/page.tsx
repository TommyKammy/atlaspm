'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Workspace, WorkspaceUserRow } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function AdminUsersPage() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED' | 'INVITED'>('ALL');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'WS_ADMIN' | 'WS_MEMBER'>('WS_MEMBER');
  const [inviteLink, setInviteLink] = useState('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const queryClient = useQueryClient();

  const workspacesQuery = useQuery<Workspace[]>({
    queryKey: queryKeys.workspaces,
    queryFn: () => api('/workspaces'),
  });

  const workspaceId = useMemo(
    () => workspacesQuery.data?.find((workspace) => workspace.role === 'WS_ADMIN')?.id ?? workspacesQuery.data?.[0]?.id,
    [workspacesQuery.data],
  );

  const usersQuery = useQuery<WorkspaceUserRow[]>({
    queryKey: queryKeys.workspaceUsers(workspaceId ?? 'none', { query, status }),
    queryFn: () =>
      api(
        `/workspaces/${workspaceId}/users?query=${encodeURIComponent(query)}${
          status === 'ALL' ? '' : `&status=${status}`
        }`,
      ),
    enabled: Boolean(workspaceId),
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      api(`/workspaces/${workspaceId}/invitations`, {
        method: 'POST',
        body: { email: inviteEmail, role: inviteRole },
      }) as Promise<{ invitationId: string; inviteLink: string }>,
    onSuccess: (data) => {
      setInviteLink(data.inviteLink);
      setInviteEmail('');
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceUsers(workspaceId!, { query, status }) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceInvitations(workspaceId!) });
    },
  });

  const patchUserMutation = useMutation({
    mutationFn: (payload: { userId: string; displayName?: string; status?: 'ACTIVE' | 'SUSPENDED' }) =>
      api(`/users/${payload.userId}`, {
        method: 'PATCH',
        body: {
          workspaceId,
          ...(payload.displayName !== undefined ? { displayName: payload.displayName } : {}),
          ...(payload.status ? { status: payload.status } : {}),
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceUsers(workspaceId!, { query, status }) });
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (invitationId: string) => api(`/invitations/${invitationId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceUsers(workspaceId!, { query, status }) });
      queryClient.invalidateQueries({ queryKey: queryKeys.workspaceInvitations(workspaceId!) });
    },
  });

  if (!workspaceId) {
    return <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">No workspace found.</div>;
  }

  return (
    <div className="space-y-4">
      <header className="rounded-lg border bg-card p-4">
        <h2 className="text-base font-semibold">Admin Users</h2>
        <p className="mt-1 text-sm text-muted-foreground">Manage workspace users, invitations, and account status.</p>
      </header>

      <section className="rounded-lg border bg-card p-4">
        <div className="grid gap-2 md:grid-cols-4">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or email"
            data-testid="admin-users-search"
            className="md:col-span-2"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as 'ALL' | 'ACTIVE' | 'SUSPENDED' | 'INVITED')}
            className="h-9 rounded-md border bg-background px-3 text-sm"
            data-testid="admin-users-status-filter"
          >
            <option value="ALL">All status</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="INVITED">Invited</option>
          </select>

          <Dialog.Root>
            <Dialog.Trigger asChild>
              <Button data-testid="invite-user-open">Invite user</Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/50" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] w-[480px] max-w-[95vw] -translate-x-1/2 -translate-y-1/2 rounded-md border bg-background p-4">
                <Dialog.Title className="text-sm font-semibold">Invite user</Dialog.Title>
                <div className="mt-3 space-y-3">
                  <Input
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="name@example.com"
                    data-testid="invite-email-input"
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as 'WS_ADMIN' | 'WS_MEMBER')}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    data-testid="invite-role-select"
                  >
                    <option value="WS_MEMBER">Workspace Member</option>
                    <option value="WS_ADMIN">Workspace Admin</option>
                  </select>
                  <Button
                    onClick={() => inviteMutation.mutate()}
                    disabled={!inviteEmail.trim() || inviteMutation.isPending}
                    data-testid="invite-submit"
                  >
                    {inviteMutation.isPending ? 'Inviting...' : 'Create invite'}
                  </Button>

                  {inviteLink ? (
                    <div className="rounded-md border bg-muted/30 p-2">
                      <p className="text-xs text-muted-foreground">Invite link</p>
                      <p className="break-all text-xs" data-testid="invite-link-value">{inviteLink}</p>
                      <Button
                        className="mt-2"
                        size="sm"
                        variant="outline"
                        data-testid="invite-link-copy"
                        onClick={async () => {
                          await navigator.clipboard.writeText(inviteLink);
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                  ) : null}
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Seen</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(usersQuery.data ?? []).map((row) => {
              const label = row.displayName ?? row.email ?? row.id;
              const isInvited = row.status === 'INVITED';
              return (
                <TableRow key={row.id} data-testid={`admin-user-row-${row.id}`}>
                  <TableCell>{label}</TableCell>
                  <TableCell>{row.email ?? '—'}</TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell>{row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString() : '—'}</TableCell>
                  <TableCell>{new Date(row.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      {!isInvited ? (
                        <Dialog.Root
                          open={editingUserId === row.id}
                          onOpenChange={(nextOpen) => {
                            setEditingUserId(nextOpen ? row.id : null);
                            setDisplayName(row.displayName ?? '');
                          }}
                        >
                          <Dialog.Trigger asChild>
                            <Button size="sm" variant="outline" data-testid={`admin-user-edit-${row.id}`}>Edit</Button>
                          </Dialog.Trigger>
                          <Dialog.Portal>
                            <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/50" />
                            <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] w-[420px] max-w-[95vw] -translate-x-1/2 -translate-y-1/2 rounded-md border bg-background p-4">
                              <Dialog.Title className="text-sm font-semibold">Edit user</Dialog.Title>
                              <div className="mt-3 space-y-3">
                                <Input
                                  value={displayName}
                                  onChange={(e) => setDisplayName(e.target.value)}
                                  placeholder="Display name"
                                  data-testid={`admin-user-display-name-${row.id}`}
                                />
                                <Button
                                  onClick={() => {
                                    patchUserMutation.mutate({ userId: row.id, displayName });
                                    setEditingUserId(null);
                                  }}
                                  data-testid={`admin-user-save-${row.id}`}
                                >
                                  Save
                                </Button>
                              </div>
                            </Dialog.Content>
                          </Dialog.Portal>
                        </Dialog.Root>
                      ) : null}

                      {!isInvited ? (
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`admin-user-toggle-status-${row.id}`}
                          onClick={() =>
                            patchUserMutation.mutate({
                              userId: row.id,
                              status: row.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED',
                            })
                          }
                        >
                          {row.status === 'SUSPENDED' ? 'Unsuspend' : 'Suspend'}
                        </Button>
                      ) : null}

                      {isInvited && row.invitationId ? (
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`admin-invite-revoke-${row.invitationId}`}
                          onClick={() => revokeInviteMutation.mutate(row.invitationId!)}
                        >
                          Revoke
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
