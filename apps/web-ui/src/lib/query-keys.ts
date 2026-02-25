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
  projectTasksDeletedGrouped: (projectId: string) =>
    ['project', projectId, 'tasks', { groupBy: 'section', deleted: true }] as const,
  projectRules: (projectId: string) => ['project', projectId, 'rules'] as const,
  projectMembers: (projectId: string) => ['project', projectId, 'members'] as const,
  taskDetail: (taskId: string) => ['task', taskId] as const,
  taskComments: (taskId: string) => ['task', taskId, 'comments'] as const,
  taskAudit: (taskId: string) => ['task', taskId, 'audit'] as const,
  taskMentions: (taskId: string) => ['task', taskId, 'mentions'] as const,
  taskAttachments: (taskId: string, options?: { includeDeleted?: boolean }) =>
    ['task', taskId, 'attachments', options?.includeDeleted ? 'all' : 'active'] as const,

  // Subtask keys
  taskSubtasks: (taskId: string) => ['task', taskId, 'subtasks'] as const,
  taskSubtaskTree: (taskId: string) => ['task', taskId, 'subtasks', 'tree'] as const,
  taskBreadcrumbs: (taskId: string) => ['task', taskId, 'breadcrumbs'] as const,

  // Dependency keys
  taskDependencies: (taskId: string) => ['task', taskId, 'dependencies'] as const,
  taskDependents: (taskId: string) => ['task', taskId, 'dependents'] as const,
  taskBlocked: (taskId: string) => ['task', taskId, 'blocked'] as const,
  projectDependencyGraph: (projectId: string) => ['project', projectId, 'dependency-graph'] as const,
};
