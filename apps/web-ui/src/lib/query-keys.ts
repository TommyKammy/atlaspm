export const queryKeys = {
  me: ['me'] as const,
  reminderPreferences: ['me', 'reminder-preferences'] as const,
  workspaces: ['workspaces'] as const,
  workspaceUsers: (workspaceId: string, params: { query?: string; status?: string }) =>
    ['workspace', workspaceId, 'users', params] as const,
  workspaceInvitations: (workspaceId: string) => ['workspace', workspaceId, 'invitations'] as const,
  projects: ['projects'] as const,
  myTasks: (userId: string, projectIds: string[]) => ['my-tasks', userId, projectIds] as const,
  projectSections: (projectId: string) => ['project', projectId, 'sections'] as const,
  projectTasksGrouped: (projectId: string) =>
    ['project', projectId, 'tasks', { groupBy: 'section' }] as const,
  projectTasksDeletedGrouped: (projectId: string) =>
    ['project', projectId, 'tasks', { groupBy: 'section', deleted: true }] as const,
  projectRules: (projectId: string) => ['project', projectId, 'rules'] as const,
  projectRecurringRules: (projectId: string, options?: { includeInactive?: boolean }) =>
    ['project', projectId, 'recurring-rules', options?.includeInactive ? 'all' : 'active'] as const,
  projectMembers: (projectId: string) => ['project', projectId, 'members'] as const,
  projectStatusUpdates: (projectId: string) => ['project', projectId, 'status-updates'] as const,
  projectTimelinePreferences: (projectId: string) => ['project', projectId, 'timeline', 'preferences'] as const,
  projectCustomFields: (projectId: string) => ['project', projectId, 'custom-fields'] as const,
  notifications: (status: 'all' | 'unread' = 'all') => ['notifications', { status }] as const,
  notificationsUnreadCount: ['notifications', 'unread-count'] as const,
  notificationDeliveryFailures: ['notifications', 'delivery-failures'] as const,
  taskDetail: (taskId: string) => ['task', taskId] as const,
  taskComments: (taskId: string) => ['task', taskId, 'comments'] as const,
  taskAudit: (taskId: string) => ['task', taskId, 'audit'] as const,
  taskMentions: (taskId: string) => ['task', taskId, 'mentions'] as const,
  taskAttachments: (taskId: string, options?: { includeDeleted?: boolean }) =>
    ['task', taskId, 'attachments', options?.includeDeleted ? 'all' : 'active'] as const,
  taskReminder: (taskId: string) => ['task', taskId, 'reminder'] as const,

  // Subtask keys
  taskSubtasks: (taskId: string) => ['task', taskId, 'subtasks'] as const,
  taskSubtaskTree: (taskId: string) => ['task', taskId, 'subtasks', 'tree'] as const,
  taskBreadcrumbs: (taskId: string) => ['task', taskId, 'breadcrumbs'] as const,

  // Dependency keys
  taskDependencies: (taskId: string) => ['task', taskId, 'dependencies'] as const,
  taskDependents: (taskId: string) => ['task', taskId, 'dependents'] as const,
  taskBlocked: (taskId: string) => ['task', taskId, 'blocked'] as const,
  projectDependencyGraph: (projectId: string) => ['project', projectId, 'dependency-graph'] as const,

  // Form keys
  projectForms: (projectId: string) => ['project', projectId, 'forms'] as const,
  formDetail: (formId: string) => ['form', formId] as const,
  formQuestions: (formId: string) => ['form', formId, 'questions'] as const,
  formSubmissions: (formId: string) => ['form', formId, 'submissions'] as const,
  taskApproval: (taskId: string) => ['task', taskId, 'approval'] as const,
};
