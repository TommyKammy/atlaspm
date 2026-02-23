export const queryKeys = {
  me: ['me'] as const,
  workspaces: ['workspaces'] as const,
  workspaceUsers: (workspaceId: string, params: { query?: string; status?: string }) =>
    ['workspace', workspaceId, 'users', params] as const,
  workspaceInvitations: (workspaceId: string) => ['workspace', workspaceId, 'invitations'] as const,
  projects: ['projects'] as const,
  projectSections: (projectId: string) => ['project', projectId, 'sections'] as const,
  projectTasksGrouped: (projectId: string) =>
    ['project', projectId, 'tasks', { groupBy: 'section' }] as const,
  projectRules: (projectId: string) => ['project', projectId, 'rules'] as const,
  projectMembers: (projectId: string) => ['project', projectId, 'members'] as const,
  taskDetail: (taskId: string) => ['task', taskId] as const,
  taskComments: (taskId: string) => ['task', taskId, 'comments'] as const,
  taskAudit: (taskId: string) => ['task', taskId, 'audit'] as const,
  taskMentions: (taskId: string) => ['task', taskId, 'mentions'] as const,
  taskAttachments: (taskId: string) => ['task', taskId, 'attachments'] as const,
};
