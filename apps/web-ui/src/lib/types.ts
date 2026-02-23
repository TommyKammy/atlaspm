export type Project = { id: string; workspaceId: string; name: string };

export type Section = {
  id: string;
  projectId: string;
  name: string;
  position: number;
  isDefault: boolean;
};

export type Task = {
  id: string;
  projectId: string;
  sectionId: string;
  title: string;
  description?: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
  progressPercent: number;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | null;
  assigneeUserId?: string | null;
  dueAt?: string | null;
  startAt?: string | null;
  completedAt?: string | null;
  version: number;
  position: number;
};

export type SectionTaskGroup = {
  section: Section;
  tasks: Task[];
};

export type ProjectMember = {
  id: string;
  userId: string;
  role: 'ADMIN' | 'MEMBER' | 'VIEWER';
  user: {
    id: string;
    email?: string | null;
    displayName?: string | null;
  };
};

export type RuleCondition = {
  field: 'progressPercent';
  op: 'eq' | 'lt' | 'lte' | 'gt' | 'gte' | 'between';
  value?: number;
  min?: number;
  max?: number;
};

export type RuleAction =
  | { type: 'setStatus'; status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED' }
  | { type: 'setCompletedAtNow' }
  | { type: 'setCompletedAtNull' };

export type RuleDefinition = {
  trigger: 'task.progress.changed';
  conditions: RuleCondition[];
  actions: RuleAction[];
};

export type Rule = {
  id: string;
  projectId: string;
  name: string;
  templateKey: string;
  enabled: boolean;
  cooldownSec: number;
  definition?: RuleDefinition;
};
