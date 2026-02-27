export type Project = { id: string; workspaceId: string; name: string };

export type Workspace = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  role: 'WS_ADMIN' | 'WS_MEMBER';
};

export type WorkspaceUserRow = {
  id: string;
  email?: string | null;
  displayName?: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'INVITED';
  lastSeenAt?: string | null;
  createdAt: string;
  workspaceRole: 'WS_ADMIN' | 'WS_MEMBER';
  invitationStatus?: 'PENDING' | null;
  invitationId?: string;
  invitationExpiresAt?: string;
};

export type Invitation = {
  id: string;
  email: string;
  role: 'WS_ADMIN' | 'WS_MEMBER';
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
};

export type Section = {
  id: string;
  projectId: string;
  name: string;
  position: number;
  isDefault: boolean;
};

export type CustomFieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT' | 'BOOLEAN';

export type CustomFieldOption = {
  id: string;
  label: string;
  value: string;
  color?: string | null;
  position: number;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type CustomFieldDefinition = {
  id: string;
  projectId: string;
  name: string;
  type: CustomFieldType;
  description?: string | null;
  required: boolean;
  position: number;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  options: CustomFieldOption[];
};

export type TaskCustomFieldValue = {
  id: string;
  taskId: string;
  fieldId: string;
  optionId?: string | null;
  valueText?: string | null;
  valueNumber?: number | null;
  valueDate?: string | null;
  valueBoolean?: boolean | null;
  field?: {
    id: string;
    name: string;
    type: CustomFieldType;
    required?: boolean;
    position?: number;
  } | null;
  option?: {
    id: string;
    label: string;
    value: string;
    color?: string | null;
  } | null;
};

export type Task = {
  id: string;
  projectId: string;
  sectionId: string;
  parentId?: string | null;
  title: string;
  description?: string | null;
  descriptionDoc?: Record<string, unknown> | null;
  descriptionText?: string | null;
  descriptionUpdatedAt?: string | null;
  descriptionVersion?: number;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
  progressPercent: number;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | null;
  assigneeUserId?: string | null;
  dueAt?: string | null;
  startAt?: string | null;
  completedAt?: string | null;
  deletedAt?: string | null;
  deletedByUserId?: string | null;
  version: number;
  position: number;
  customFieldValues?: TaskCustomFieldValue[];
};

export type TaskComment = {
  id: string;
  taskId: string;
  authorUserId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  author?: {
    id: string;
    displayName?: string | null;
    email?: string | null;
  };
};

export type TaskMention = {
  id: string;
  taskId: string;
  mentionedUserId: string;
  sourceType: 'description' | 'comment';
  sourceId: string;
  createdAt: string;
  user?: {
    id: string;
    displayName?: string | null;
    email?: string | null;
  } | null;
};

export type TaskAttachment = {
  id: string;
  taskId: string;
  uploaderUserId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  createdAt: string;
  completedAt?: string | null;
  deletedAt?: string | null;
};

export type TaskReminder = {
  id: string;
  taskId: string;
  userId: string;
  remindAt: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  sentAt?: string | null;
};

export type InboxNotification = {
  id: string;
  userId: string;
  projectId: string;
  taskId: string;
  type: 'mention' | string;
  sourceType: 'description' | 'comment' | string;
  sourceId: string;
  readAt?: string | null;
  createdAt: string;
  updatedAt: string;
  project: {
    id: string;
    name: string;
  };
  task: {
    id: string;
    title: string;
    deletedAt?: string | null;
  };
  triggeredBy?: {
    id: string;
    displayName?: string | null;
    email?: string | null;
  } | null;
};

export type AuditEvent = {
  id: string;
  actor: string;
  entityType: string;
  entityId: string;
  action: string;
  beforeJson?: Record<string, unknown> | null;
  afterJson?: Record<string, unknown> | null;
  correlationId: string;
  createdAt: string;
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
    avatarUrl?: string | null;
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


// Subtask types
export type Subtask = Task & {
  parentId: string | null;
  depth: number;
};

export type TaskBreadcrumb = {
  id: string;
  title: string;
  depth: number;
};

export type TaskTree = Task & {
  parentId: string | null;
  children: TaskTree[];
};

// Dependency types
export type DependencyType = 'BLOCKS' | 'BLOCKED_BY' | 'RELATES_TO';

export type TaskDependency = {
  id: string;
  taskId: string;
  dependsOnId: string;
  type: DependencyType;
  createdAt: string;
  dependsOnTask?: Task;
};

export type BlockedStatus = {
  isBlocked: boolean;
  blockers: TaskDependency[];
};

export type DependencyGraphNode = {
  id: string;
  title: string;
  status: Task['status'];
  x?: number;
  y?: number;
};

export type DependencyGraphEdge = {
  source: string;
  target: string;
  type: DependencyType;
};

export type DependencyGraph = {
  nodes: DependencyGraphNode[];
  edges: DependencyGraphEdge[];
};



// Search types
export type TaskSearchHit = {
  objectID: string;
  title: string;
  description?: string | null;
  projectId: string;
  assigneeId?: string | null;
  status: Task['status'];
  priority?: Task['priority'];
  dueAt?: string | null;
  startAt?: string | null;
  tags: string[];
  parentId?: string | null;
  depth: number;
  createdAt: string;
  updatedAt: string;
  _highlightResult?: {
    title?: { value: string };
    description?: { value: string };
  };
};
