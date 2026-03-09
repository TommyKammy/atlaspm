'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { AuditActivityList } from '@/components/audit-activity-list';
import { queryKeys } from '@/lib/query-keys';
import type { AuditEvent, Project, ProjectMember, Workspace, WorkspaceUserRow } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useI18n } from '@/lib/i18n';

export default function ProjectMembersPage() {
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<'ADMIN' | 'MEMBER' | 'VIEWER'>('MEMBER');

  const projectsQuery = useQuery<Project[]>({
    queryKey: queryKeys.projects,
    queryFn: () => api('/projects'),
  });
  const workspacesQuery = useQuery<Workspace[]>({
    queryKey: queryKeys.workspaces,
    queryFn: () => api('/workspaces'),
  });
  const membersQuery = useQuery<ProjectMember[]>({
    queryKey: queryKeys.projectMembers(projectId),
    queryFn: () => api(`/projects/${projectId}/members`),
    enabled: Boolean(projectId),
  });
  const auditQuery = useQuery<AuditEvent[]>({
    queryKey: queryKeys.projectAudit(projectId),
    queryFn: () => api(`/projects/${projectId}/audit`),
    enabled: Boolean(projectId),
  });

  const project = useMemo(() => projectsQuery.data?.find((item) => item.id === projectId), [projectsQuery.data, projectId]);
  const workspace = useMemo(
    () => workspacesQuery.data?.find((item) => item.id === project?.workspaceId),
    [workspacesQuery.data, project?.workspaceId],
  );

  const usersQuery = useQuery<WorkspaceUserRow[]>({
    queryKey: queryKeys.workspaceUsers(workspace?.id ?? 'none', { query: '', status: 'ACTIVE' }),
    queryFn: () => api(`/workspaces/${workspace!.id}/users?status=ACTIVE`),
    enabled: Boolean(workspace?.id),
  });

  const addMember = useMutation({
    mutationFn: (payload: { userId: string; role: 'ADMIN' | 'MEMBER' | 'VIEWER' }) =>
      api(`/projects/${projectId}/members`, { method: 'POST', body: payload }),
    onSuccess: () => {
      setAddOpen(false);
      setSelectedUserId('');
      queryClient.invalidateQueries({ queryKey: queryKeys.projectMembers(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectAudit(projectId) });
    },
  });

  const updateRole = useMutation({
    mutationFn: (payload: { userId: string; role: 'ADMIN' | 'MEMBER' | 'VIEWER' }) =>
      api(`/projects/${projectId}/members/${payload.userId}`, { method: 'PATCH', body: { role: payload.role } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectMembers(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectAudit(projectId) });
    },
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => api(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectMembers(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectAudit(projectId) });
    },
  });

  const memberUserIds = new Set((membersQuery.data ?? []).map((member) => member.userId));
  const candidates = (usersQuery.data ?? []).filter((user) => user.status === 'ACTIVE' && !String(user.id).startsWith('invite:'));

  return (
    <div className="space-y-4">
      <header className="rounded-lg border bg-card p-4">
        <h2 className="text-base font-semibold">{t('projectMembers')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('projectMembersDescription')} {project?.name ?? t('project').toLowerCase()}.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {t('projectMembersWorkspaceHint')}{' '}
          {workspace?.id ? (
            <Link href="/admin/users" className="underline hover:text-foreground" data-testid="project-members-admin-users-link">
              {t('inviteUser')}
            </Link>
          ) : null}
        </p>
      </header>

      <section className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex justify-end">
          <Dialog.Root open={addOpen} onOpenChange={setAddOpen}>
            <Dialog.Trigger asChild>
              <Button data-testid="project-members-add-open">{t('addMember')}</Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/50" />
              <Dialog.Content className="fixed left-1/2 top-1/2 z-[80] w-[520px] max-w-[95vw] -translate-x-1/2 -translate-y-1/2 rounded-md border bg-background p-4">
                <Dialog.Title className="text-sm font-semibold">{t('addProjectMember')}</Dialog.Title>
                <div className="mt-3 space-y-3">
                  <Command className="rounded-md border" data-testid="project-members-combobox">
                    <CommandInput placeholder={t('searchWorkspaceUsers')} />
                    <CommandList>
                      <CommandEmpty>{t('noUsersFound')}</CommandEmpty>
                      <CommandGroup>
                        {candidates.map((candidate) => {
                          const id = String(candidate.id);
                          const label = candidate.displayName ?? candidate.email ?? id;
                          return (
                            <CommandItem
                              key={id}
                              data-testid={`project-members-option-${id}`}
                              value={`${label} ${candidate.email ?? ''}`}
                              onSelect={() => setSelectedUserId(id)}
                            >
                              <span className="flex-1 truncate">{label}</span>
                              {selectedUserId === id ? <Check className="h-4 w-4" /> : null}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>

                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value as 'ADMIN' | 'MEMBER' | 'VIEWER')}
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    data-testid="project-members-role-select"
                  >
                    <option value="ADMIN">ADMIN</option>
                    <option value="MEMBER">MEMBER</option>
                    <option value="VIEWER">VIEWER</option>
                  </select>

                  <Button
                    onClick={() => addMember.mutate({ userId: selectedUserId, role: selectedRole })}
                    disabled={!selectedUserId || memberUserIds.has(selectedUserId) || addMember.isPending}
                    data-testid="project-members-add-submit"
                  >
                    {t('add')}
                  </Button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('users')}</TableHead>
              <TableHead>{t('email')}</TableHead>
              <TableHead>{t('role')}</TableHead>
              <TableHead>{t('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(membersQuery.data ?? []).map((member) => {
              const label = member.user.displayName ?? member.user.email ?? member.user.id;
              return (
                <TableRow key={member.userId} data-testid={`project-member-row-${member.userId}`}>
                  <TableCell>{label}</TableCell>
                  <TableCell>{member.user.email ?? '—'}</TableCell>
                  <TableCell>
                    <select
                      value={member.role}
                      onChange={(e) =>
                        updateRole.mutate({
                          userId: member.userId,
                          role: e.target.value as 'ADMIN' | 'MEMBER' | 'VIEWER',
                        })
                      }
                      className="h-8 rounded-md border bg-background px-2 text-xs"
                      data-testid={`project-member-role-${member.userId}`}
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="MEMBER">MEMBER</option>
                      <option value="VIEWER">VIEWER</option>
                    </select>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => removeMember.mutate(member.userId)}
                      data-testid={`project-member-remove-${member.userId}`}
                    >
                      {t('remove')}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-base font-semibold">{t('activity')}</h2>
        <div className="mt-3">
          <AuditActivityList events={auditQuery.data ?? []} members={membersQuery.data ?? []} />
        </div>
      </section>
    </div>
  );
}
