export const queryKeys = {
  me: ['me'] as const,
  workspaces: ['workspaces'] as const,
  projects: ['projects'] as const,
  projectSections: (projectId: string) => ['projects', projectId, 'sections'] as const,
  projectTasksGrouped: (projectId: string) => ['projects', projectId, 'tasks', 'grouped'] as const,
  projectRules: (projectId: string) => ['projects', projectId, 'rules'] as const,
  projectMembers: (projectId: string) => ['projects', projectId, 'members'] as const,
};
